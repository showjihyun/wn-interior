"""CubiCasa 공식 CNN으로 1,000건 벽/방 의미 마스크를 생성한다."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as functional


REPO = Path(__file__).resolve().parents[1]
DATASET = (REPO.parent / ".datasets" / "cubicasa5k").resolve()
OFFICIAL = DATASET / "code"
WEIGHTS = DATASET / "weights" / "model_best_val_loss_var.pkl"
MAX_DIM = int(os.environ.get("CUBICASA_NEURAL_MAX_DIM", "1024"))
LIMIT = int(os.environ.get("CUBICASA_NEURAL_LIMIT", "1000"))
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
TARGET = DATASET / f"neural_masks_{MAX_DIM}"
sys.path.insert(0, str(OFFICIAL))
os.chdir(OFFICIAL)

from floortrans.models import get_model  # noqa: E402


def load_model():
    checkpoint = torch.load(WEIGHTS, map_location=DEVICE, weights_only=False)
    model = get_model("hg_furukawa_original", 51)
    model.conv4_ = torch.nn.Conv2d(256, 44, bias=True, kernel_size=1)
    model.upsample = torch.nn.ConvTranspose2d(44, 44, kernel_size=4, stride=4)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    return model.to(DEVICE)


def main() -> None:
    manifest = json.loads((DATASET / "sample-manifest.json").read_text(encoding="utf-8"))
    cases = manifest["cases"][:LIMIT]
    model = load_model()
    rows = []
    for index, case in enumerate(cases, 1):
        case_dir = DATASET / "samples" / case["category"] / case["id"]
        image_bgr = cv2.imread(str(case_dir / "F1_scaled.png"))
        original_height, original_width = image_bgr.shape[:2]
        scale = min(1.0, MAX_DIM / max(original_width, original_height))
        width = round(original_width * scale)
        height = round(original_height * scale)
        image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        if scale < 1:
            image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
        tensor = torch.from_numpy(np.moveaxis(image, -1, 0).astype(np.float32)).unsqueeze(0)
        tensor = (2 * (tensor / 255.0) - 1).to(DEVICE)
        if DEVICE.type == "cuda":
            torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.no_grad():
            prediction = model(tensor)
            prediction = functional.interpolate(
                prediction, size=(height, width), mode="bilinear", align_corners=False
            )
            rooms = torch.softmax(prediction[0, 21:33], dim=0)
            room_classes = torch.argmax(rooms, dim=0)
            icon_classes = torch.argmax(torch.softmax(prediction[0, 33:44], dim=0), dim=0)
            wall_mask = torch.isin(
                room_classes, torch.tensor([2, 8], device=DEVICE)
            ).to(torch.uint8)
            window_mask = (icon_classes == 1).to(torch.uint8)
            door_mask = (icon_classes == 2).to(torch.uint8)
        if DEVICE.type == "cuda":
            torch.cuda.synchronize()
        elapsed_ms = (time.perf_counter() - started) * 1000
        category_dir = TARGET / case["category"]
        category_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(category_dir / f"{case['id']}.png"), wall_mask.cpu().numpy() * 255)
        cv2.imwrite(
            str(category_dir / f"{case['id']}-doors.png"), door_mask.cpu().numpy() * 255
        )
        cv2.imwrite(
            str(category_dir / f"{case['id']}-windows.png"), window_mask.cpu().numpy() * 255
        )
        cv2.imwrite(
            str(category_dir / f"{case['id']}-rooms.png"), room_classes.cpu().numpy().astype(np.uint8)
        )
        rows.append(
            {
                "category": case["category"],
                "id": case["id"],
                "width": width,
                "height": height,
                "elapsedMs": round(elapsed_ms, 1),
            }
        )
        if index % 25 == 0:
            print(f"neural masks: {index}/{len(cases)}", flush=True)
    summary = {
        "count": len(rows),
        "maxDimension": MAX_DIM,
        "device": str(DEVICE),
        "meanElapsedMs": round(sum(row["elapsedMs"] for row in rows) / len(rows), 1),
    }
    (TARGET / "manifest.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
