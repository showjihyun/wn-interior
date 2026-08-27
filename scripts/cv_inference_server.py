"""로컬 CubiCasa 벽 분할 서버. CUDA 우선, 실패하거나 없으면 CPU 자동 폴백."""

from __future__ import annotations

import base64
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as functional


REPO = Path(__file__).resolve().parents[1]
WORKSPACE = REPO.parent
HOST = os.environ.get("CV_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("CV_SERVER_PORT", "8976"))
MAX_DIM = int(os.environ.get("CV_SERVER_MAX_DIM", "1024"))
DEVICE_PREF = os.environ.get("CV_DEVICE", "auto").lower()
MAX_BODY = 16 * 1024 * 1024


def runtime_paths() -> tuple[Path, Path]:
    explicit_code = os.environ.get("CUBICASA_CODE")
    explicit_weights = os.environ.get("CUBICASA_WEIGHTS")
    candidates = [
        Path(explicit_code).resolve() if explicit_code else None,
        WORKSPACE / ".cv-runtime" / "CubiCasa5k",
        WORKSPACE / ".datasets" / "cubicasa5k" / "code",
    ]
    code = next((candidate for candidate in candidates if candidate and candidate.exists()), None)
    if code is None:
        raise RuntimeError("CubiCasa 코드가 없습니다. 먼저 `python scripts/setup_cv_runtime.py`를 실행하세요.")
    weight_candidates = [
        Path(explicit_weights).resolve() if explicit_weights else None,
        WORKSPACE / ".cv-runtime" / "model_best_val_loss_var.pkl",
        WORKSPACE / ".datasets" / "cubicasa5k" / "weights" / "model_best_val_loss_var.pkl",
    ]
    weights = next(
        (candidate for candidate in weight_candidates if candidate and candidate.exists()), None
    )
    if weights is None:
        raise RuntimeError("CubiCasa 가중치가 없습니다. 먼저 `python scripts/setup_cv_runtime.py`를 실행하세요.")
    return code, weights


def preferred_device() -> torch.device:
    if DEVICE_PREF == "cpu":
        return torch.device("cpu")
    if DEVICE_PREF == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CV_DEVICE=cuda지만 CUDA를 사용할 수 없습니다.")
        return torch.device("cuda")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


class InferenceEngine:
    def __init__(self) -> None:
        self.code, self.weights = runtime_paths()
        sys.path.insert(0, str(self.code))
        os.chdir(self.code)
        self.device = preferred_device()
        self.lock = threading.Lock()
        self.model = self._load(self.device)

    def _load(self, device: torch.device):
        from floortrans.models import get_model

        checkpoint = torch.load(self.weights, map_location="cpu", weights_only=False)
        model = get_model("hg_furukawa_original", 51)
        model.conv4_ = torch.nn.Conv2d(256, 44, bias=True, kernel_size=1)
        model.upsample = torch.nn.ConvTranspose2d(44, 44, kernel_size=4, stride=4)
        model.load_state_dict(checkpoint["model_state"])
        model.eval()
        return model.to(device)

    def _infer(self, image_bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
        original_height, original_width = image_bgr.shape[:2]
        scale = min(1.0, MAX_DIM / max(original_width, original_height))
        width = round(original_width * scale)
        height = round(original_height * scale)
        image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        if scale < 1:
            image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
        tensor = torch.from_numpy(np.moveaxis(image, -1, 0).astype(np.float32)).unsqueeze(0)
        tensor = (2 * (tensor / 255.0) - 1).to(self.device)
        if self.device.type == "cuda":
            torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.no_grad():
            prediction = self.model(tensor)
            prediction = functional.interpolate(
                prediction, size=(height, width), mode="bilinear", align_corners=False
            )
            room_classes = torch.argmax(torch.softmax(prediction[0, 21:33], dim=0), dim=0)
            icon_classes = torch.argmax(torch.softmax(prediction[0, 33:44], dim=0), dim=0)
            wall_mask = torch.isin(
                room_classes, torch.tensor([2, 8], device=self.device)
            ).to(torch.uint8)
            window_mask = (icon_classes == 1).to(torch.uint8)
            door_mask = (icon_classes == 2).to(torch.uint8)
        if self.device.type == "cuda":
            torch.cuda.synchronize()
        elapsed_ms = (time.perf_counter() - started) * 1000
        return (
            wall_mask.cpu().numpy() * 255,
            door_mask.cpu().numpy() * 255,
            window_mask.cpu().numpy() * 255,
            elapsed_ms,
        )

    def segment(self, image_bytes: bytes):
        encoded = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("이미지를 디코딩할 수 없습니다.")
        with self.lock:
            try:
                wall_mask, door_mask, window_mask, elapsed_ms = self._infer(image)
            except RuntimeError as error:
                if self.device.type != "cuda":
                    raise
                # CUDA OOM·드라이버 실패 시 모델을 CPU로 다시 로드해 요청을 계속 처리한다.
                print(f"CUDA 추론 실패, CPU 폴백: {error}", flush=True)
                torch.cuda.empty_cache()
                self.device = torch.device("cpu")
                self.model = self._load(self.device)
                wall_mask, door_mask, window_mask, elapsed_ms = self._infer(image)

        def data_url(mask: np.ndarray) -> str:
            ok, png = cv2.imencode(".png", mask)
            if not ok:
                raise RuntimeError("마스크 PNG 인코딩 실패")
            return "data:image/png;base64," + base64.b64encode(png).decode("ascii")

        return {
            "maskDataUrl": data_url(wall_mask),
            "doorMaskDataUrl": data_url(door_mask),
            "windowMaskDataUrl": data_url(window_mask),
            "width": int(wall_mask.shape[1]),
            "height": int(wall_mask.shape[0]),
            "device": str(self.device),
            "inferenceMs": round(elapsed_ms, 1),
        }


ENGINE = InferenceEngine()


class Handler(BaseHTTPRequestHandler):
    def _headers(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def _json(self, value, status: int = 200) -> None:
        self._headers(status)
        self.wfile.write(json.dumps(value, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/health":
            self._json(
                {
                    "ok": True,
                    "device": str(ENGINE.device),
                    "cudaAvailable": torch.cuda.is_available(),
                    "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
                    "maxDimension": MAX_DIM,
                    "license": "CubiCasa5K CC BY-NC 4.0 — commercial use requires review",
                }
            )
            return
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path != "/segment":
            self._json({"error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("요청 본문 크기가 허용 범위를 벗어났습니다.")
            payload = json.loads(self.rfile.read(length))
            data_url = str(payload.get("imageDataUrl", ""))
            if "," not in data_url:
                raise ValueError("imageDataUrl이 없습니다.")
            image_bytes = base64.b64decode(data_url.split(",", 1)[1], validate=True)
            self._json(ENGINE.segment(image_bytes))
        except Exception as error:
            self._json({"error": str(error)}, 400)

    def log_message(self, format, *args):
        print(f"[CV] {self.address_string()} {format % args}", flush=True)


if __name__ == "__main__":
    print(
        f"CV inference server: http://{HOST}:{PORT} · device={ENGINE.device} · max={MAX_DIM}px",
        flush=True,
    )
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
