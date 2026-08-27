"""Local HTTP sidecar for pinned Raster2Seq CubiCasa5K inference.

The server intentionally exposes only localhost CORS origins.  It keeps the
official model in memory, serializes inference through one lock, converts the
model's 256x256 letterboxed coordinates back to source-image pixels, and
rejects the entire candidate when deterministic geometry repair cannot produce
one valid, hole-free polygon per predicted room.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import copy
import gc
import io
import json
import math
import os
import random
import re
import threading
import time
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import numpy as np
import torch
from PIL import Image, ImageOps, UnidentifiedImageError
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union


RASTER2SEQ_COMMIT = "a6c4e27a68d11d7a459f6e4a2601fd887227dd1a"
MODEL_IMAGE_SIZE = 256
MIN_POLYGON_AREA_PX2 = 1.0
MIN_RETAINED_AREA_RATIO = 0.35
MAX_REQUEST_BYTES = 16 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
CC5K_LABELS = {
    0: "Outdoor",
    1: "Kitchen",
    2: "Living Room",
    3: "Bed Room",
    4: "Bath",
    5: "Entry",
    6: "Storage",
    7: "Garage",
    8: "Undefined",
    9: "Window",
    10: "Door",
}
LOCAL_ORIGIN_RE = re.compile(
    r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$",
    re.IGNORECASE,
)
DATA_URL_RE = re.compile(
    r"^data:image/(?:png|jpe?g|webp|bmp|tiff?);base64,(?P<data>[A-Za-z0-9+/=\r\n]+)$",
    re.IGNORECASE,
)


class SidecarError(Exception):
    """Error with a stable API diagnostic code and HTTP status."""

    def __init__(self, code: str, message: str, status: HTTPStatus) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass
class RoomCandidate:
    points: np.ndarray
    name: str | None


def _round_coordinate(value: float) -> float:
    return round(float(value), 4)


def _remove_duplicate_vertices(points: np.ndarray) -> tuple[np.ndarray, int]:
    if len(points) == 0:
        return points, 0
    kept = [points[0]]
    removed = 0
    for point in points[1:]:
        if np.allclose(point, kept[-1], atol=1e-6):
            removed += 1
        else:
            kept.append(point)
    if len(kept) > 1 and np.allclose(kept[0], kept[-1], atol=1e-6):
        kept.pop()
        removed += 1
    return np.asarray(kept, dtype=np.float64), removed


def _remove_collinear_vertices(points: np.ndarray) -> tuple[np.ndarray, int]:
    kept = [point.copy() for point in points]
    removed = 0
    changed = True
    while changed and len(kept) >= 3:
        changed = False
        for index in range(len(kept)):
            previous = kept[index - 1]
            current = kept[index]
            following = kept[(index + 1) % len(kept)]
            first = current - previous
            second = following - current
            cross = first[0] * second[1] - first[1] * second[0]
            if abs(cross) <= 1e-6:
                kept.pop(index)
                removed += 1
                changed = True
                break
    return np.asarray(kept, dtype=np.float64), removed


def _is_one_hole_free_polygon(geometry: Any) -> bool:
    return bool(
        geometry is not None
        and not geometry.is_empty
        and geometry.geom_type == "Polygon"
        and len(geometry.interiors) == 0
        and geometry.is_valid
        and geometry.area > MIN_POLYGON_AREA_PX2
    )


def _repair_unambiguous_self_intersection(points: np.ndarray) -> Any | None:
    """Repair only when noding the complete boundary produces exactly one face.

    ``buffer(0)`` can turn a bow-tie into one arbitrary triangle and silently
    discard the other half. Polygonizing the fully noded boundary makes that
    ambiguity explicit: more than one face always forces legacy fallback.
    """

    closed = np.vstack((points, points[0]))
    noded_boundary = unary_union(LineString(closed))
    faces = [face for face in polygonize(noded_boundary) if face.area > MIN_POLYGON_AREA_PX2]
    if len(faces) != 1:
        return None
    repaired = faces[0]
    return repaired if _is_one_hole_free_polygon(repaired) else None


def _inverse_letterbox(
    points: np.ndarray, source_width: int, source_height: int
) -> tuple[np.ndarray, int]:
    scale = min(MODEL_IMAGE_SIZE / source_height, MODEL_IMAGE_SIZE / source_width)
    resized_height = int(source_height * scale)
    resized_width = int(source_width * scale)
    if resized_width < 1 or resized_height < 1:
        raise SidecarError(
            "UNSUPPORTED_ASPECT_RATIO",
            "Image aspect ratio collapses one dimension during Raster2Seq preprocessing.",
            HTTPStatus.BAD_REQUEST,
        )
    top = (MODEL_IMAGE_SIZE - resized_height) // 2
    left = (MODEL_IMAGE_SIZE - resized_width) // 2
    restored = points.astype(np.float64).copy()
    restored[:, 0] = (restored[:, 0] - left) / (resized_width / source_width)
    restored[:, 1] = (restored[:, 1] - top) / (resized_height / source_height)
    outside = int(
        np.logical_or.reduce(
            (
                restored[:, 0] < 0,
                restored[:, 0] > source_width,
                restored[:, 1] < 0,
                restored[:, 1] > source_height,
            )
        ).sum()
    )
    restored[:, 0] = np.clip(restored[:, 0], 0, source_width)
    restored[:, 1] = np.clip(restored[:, 1], 0, source_height)
    return restored, outside


def repair_room_candidates(
    candidates: list[RoomCandidate], source_width: int, source_height: int
) -> tuple[list[dict[str, Any]], bool, dict[str, Any]]:
    """Repair without ground truth, or reject the complete room candidate set.

    Unlike the exploratory evaluator's largest-polygon salvage, this production
    Self-intersections are fully noded and polygonized; exactly one valid,
    hole-free face must remain. Overlap ``difference`` results follow the same
    single-polygon rule. Multi-polygons and holes are unsafe because choosing a
    component would be arbitrary.
    """

    diagnostics: dict[str, Any] = {
        "rawPolygonCount": len(candidates),
        "outputPolygonCount": 0,
        "duplicateVerticesRemoved": 0,
        "collinearVerticesRemoved": 0,
        "outOfBoundsVertices": 0,
        "outOfBoundsVertexRate": 0.0,
        "invalidPolygonsRepaired": 0,
        "overlapPolygonsClipped": 0,
        "repairRejectedPolygons": 0,
        "unsafeReasons": [],
    }
    unsafe_reasons: list[dict[str, Any]] = diagnostics["unsafeReasons"]
    if not candidates:
        unsafe_reasons.append({"code": "NO_ROOM_POLYGONS"})
        return [], False, diagnostics

    prepared: list[RoomCandidate] = []
    total_vertices = 0
    for room_index, candidate in enumerate(candidates):
        points = np.asarray(candidate.points, dtype=np.float64).reshape(-1, 2)
        if len(points) < 3 or not np.isfinite(points).all():
            diagnostics["repairRejectedPolygons"] += 1
            unsafe_reasons.append(
                {"code": "INVALID_VERTEX_SEQUENCE", "roomIndex": room_index}
            )
            continue
        points, outside = _inverse_letterbox(points, source_width, source_height)
        points, duplicate_count = _remove_duplicate_vertices(points)
        points, collinear_count = _remove_collinear_vertices(points)
        total_vertices += len(points)
        diagnostics["outOfBoundsVertices"] += outside
        diagnostics["duplicateVerticesRemoved"] += duplicate_count
        diagnostics["collinearVerticesRemoved"] += collinear_count
        if len(points) < 3:
            diagnostics["repairRejectedPolygons"] += 1
            unsafe_reasons.append(
                {"code": "DEGENERATE_AFTER_CLEANUP", "roomIndex": room_index}
            )
            continue
        prepared.append(RoomCandidate(points=points, name=candidate.name))

    diagnostics["outOfBoundsVertexRate"] = round(
        diagnostics["outOfBoundsVertices"] / total_vertices if total_vertices else 0.0,
        4,
    )
    if diagnostics["outOfBoundsVertexRate"] > 0.02:
        unsafe_reasons.append(
            {
                "code": "EXCESSIVE_OUT_OF_BOUNDS_VERTICES",
                "rate": diagnostics["outOfBoundsVertexRate"],
                "limit": 0.02,
            }
        )
    if len(prepared) != len(candidates):
        return [], False, diagnostics

    repaired: list[tuple[Any, str | None]] = []
    claimed = None
    for room_index, candidate in enumerate(prepared):
        try:
            shape = Polygon(candidate.points)
            original_area = abs(float(shape.area))
            if not shape.is_valid:
                shape = _repair_unambiguous_self_intersection(candidate.points)
                diagnostics["invalidPolygonsRepaired"] += 1
                if not _is_one_hole_free_polygon(shape):
                    diagnostics["repairRejectedPolygons"] += 1
                    unsafe_reasons.append(
                        {
                            "code": "AMBIGUOUS_SELF_INTERSECTION_REPAIR",
                            "roomIndex": room_index,
                            "geometryType": getattr(shape, "geom_type", None),
                        }
                    )
                    return [], False, diagnostics
            elif not _is_one_hole_free_polygon(shape):
                diagnostics["repairRejectedPolygons"] += 1
                unsafe_reasons.append(
                    {"code": "INVALID_POLYGON", "roomIndex": room_index}
                )
                return [], False, diagnostics

            before_clip_area = float(shape.area)
            if claimed is not None and shape.intersects(claimed):
                clipped = shape.difference(claimed)
                if not _is_one_hole_free_polygon(clipped):
                    diagnostics["repairRejectedPolygons"] += 1
                    unsafe_reasons.append(
                        {
                            "code": "AMBIGUOUS_OVERLAP_REPAIR",
                            "roomIndex": room_index,
                            "geometryType": getattr(clipped, "geom_type", None),
                        }
                    )
                    return [], False, diagnostics
                if clipped.area < max(
                    MIN_POLYGON_AREA_PX2, before_clip_area * MIN_RETAINED_AREA_RATIO
                ):
                    diagnostics["repairRejectedPolygons"] += 1
                    unsafe_reasons.append(
                        {
                            "code": "OVERLAP_REPAIR_RETAINS_TOO_LITTLE",
                            "roomIndex": room_index,
                            "retainedAreaRatio": round(
                                clipped.area / before_clip_area
                                if before_clip_area
                                else 0.0,
                                4,
                            ),
                            "minimum": MIN_RETAINED_AREA_RATIO,
                        }
                    )
                    return [], False, diagnostics
                if clipped.area < before_clip_area - MIN_POLYGON_AREA_PX2:
                    diagnostics["overlapPolygonsClipped"] += 1
                shape = clipped

            if shape.area < max(
                MIN_POLYGON_AREA_PX2, original_area * MIN_RETAINED_AREA_RATIO
            ):
                diagnostics["repairRejectedPolygons"] += 1
                unsafe_reasons.append(
                    {
                        "code": "TOTAL_REPAIR_RETAINS_TOO_LITTLE",
                        "roomIndex": room_index,
                    }
                )
                return [], False, diagnostics

            coordinates = np.asarray(shape.exterior.coords[:-1], dtype=np.float64)
            coordinates, duplicate_count = _remove_duplicate_vertices(coordinates)
            coordinates, collinear_count = _remove_collinear_vertices(coordinates)
            diagnostics["duplicateVerticesRemoved"] += duplicate_count
            diagnostics["collinearVerticesRemoved"] += collinear_count
            if len(coordinates) < 3:
                diagnostics["repairRejectedPolygons"] += 1
                unsafe_reasons.append(
                    {"code": "DEGENERATE_REPAIRED_POLYGON", "roomIndex": room_index}
                )
                return [], False, diagnostics

            final_shape = Polygon(coordinates)
            if not _is_one_hole_free_polygon(final_shape):
                diagnostics["repairRejectedPolygons"] += 1
                unsafe_reasons.append(
                    {"code": "REPAIRED_POLYGON_FAILED_AUDIT", "roomIndex": room_index}
                )
                return [], False, diagnostics
            repaired.append((final_shape, candidate.name))
            claimed = final_shape if claimed is None else unary_union((claimed, final_shape))
        except SidecarError:
            raise
        except Exception as error:
            diagnostics["repairRejectedPolygons"] += 1
            unsafe_reasons.append(
                {
                    "code": "GEOMETRY_REPAIR_ERROR",
                    "roomIndex": room_index,
                    "message": str(error),
                }
            )
            return [], False, diagnostics

    for first_index in range(len(repaired) - 1):
        for second_index in range(first_index + 1, len(repaired)):
            overlap_area = repaired[first_index][0].intersection(repaired[second_index][0]).area
            if overlap_area > MIN_POLYGON_AREA_PX2:
                unsafe_reasons.append(
                    {
                        "code": "OVERLAP_REMAINS_AFTER_REPAIR",
                        "firstRoomIndex": first_index,
                        "secondRoomIndex": second_index,
                        "area": round(float(overlap_area), 4),
                    }
                )
                return [], False, diagnostics

    if unsafe_reasons:
        return [], False, diagnostics

    rooms = []
    for shape, name in repaired:
        room: dict[str, Any] = {
            "polygon": [
                {"x": _round_coordinate(x), "y": _round_coordinate(y)}
                for x, y in shape.exterior.coords[:-1]
            ]
        }
        if name:
            room["name"] = name
        rooms.append(room)
    diagnostics["outputPolygonCount"] = len(rooms)
    return rooms, bool(rooms), diagnostics


def _decode_image_data_url(image_data_url: Any) -> Image.Image:
    if not isinstance(image_data_url, str):
        raise SidecarError(
            "INVALID_IMAGE_DATA_URL",
            "imageDataUrl must be a base64 image data URL.",
            HTTPStatus.BAD_REQUEST,
        )
    match = DATA_URL_RE.fullmatch(image_data_url)
    if not match:
        raise SidecarError(
            "INVALID_IMAGE_DATA_URL",
            "Only base64 PNG, JPEG, WebP, BMP, or TIFF image data URLs are accepted.",
            HTTPStatus.BAD_REQUEST,
        )
    try:
        raw = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError) as error:
        raise SidecarError(
            "INVALID_IMAGE_BASE64",
            "imageDataUrl contains invalid base64 data.",
            HTTPStatus.BAD_REQUEST,
        ) from error
    try:
        with Image.open(io.BytesIO(raw)) as opened:
            if opened.width * opened.height > MAX_IMAGE_PIXELS:
                raise SidecarError(
                    "IMAGE_TOO_LARGE",
                    f"Image header exceeds the {MAX_IMAGE_PIXELS} pixel limit.",
                    HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                )
            if opened.width < 1 or opened.height < 1:
                raise SidecarError(
                    "INVALID_IMAGE_DIMENSIONS",
                    "Decoded image has invalid dimensions.",
                    HTTPStatus.BAD_REQUEST,
                )
            opened.load()
            image = ImageOps.exif_transpose(opened)
            if image.mode in ("RGBA", "LA") or "transparency" in image.info:
                rgba = image.convert("RGBA")
                background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
                image = Image.alpha_composite(background, rgba).convert("RGB")
            else:
                image = image.convert("RGB")
            return image.copy()
    except SidecarError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as error:
        raise SidecarError(
            "INVALID_IMAGE",
            "imageDataUrl could not be decoded as an image.",
            HTTPStatus.BAD_REQUEST,
        ) from error


def _cpu_operator_support() -> tuple[bool | None, str]:
    source = Path("/opt/raster2seq/models/ops/src/cpu/ms_deform_attn_cpu.cpp")
    try:
        text = source.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None, "CPU operator source was unavailable; support must be probed at runtime."
    if "Not implement on cpu" in text:
        return False, "Pinned MSDeformAttn operator explicitly reports 'Not implement on cpu'."
    return None, "CPU operator support is not declared; support must be probed at runtime."


class Raster2SeqEngine:
    def __init__(self, checkpoint: Path, requested_device: str) -> None:
        self.checkpoint = checkpoint
        self.requested_device = requested_device
        self.device = "unavailable"
        self.device_name: str | None = None
        self.model: Any = None
        self.generate: Any = None
        self.resize_and_pad: Any = None
        self.detectron_transforms: Any = None
        self.lock = threading.Lock()
        self.ready = False
        self.error_code: str | None = None
        self.error: str | None = None
        self.initialization_ms: float | None = None
        self.load_diagnostics: dict[str, Any] = {}

    def _device_candidates(self) -> list[str]:
        candidates: list[str] = []
        cuda_failure: str | None = None
        if self.requested_device in ("auto", "cuda"):
            try:
                if not torch.cuda.is_available():
                    cuda_failure = "torch.cuda.is_available() returned false."
                else:
                    torch.cuda.init()
                    _ = torch.empty(1, device="cuda")
                    candidates.append("cuda")
            except Exception as error:
                cuda_failure = str(error)
        if cuda_failure:
            self.load_diagnostics["cudaUnavailableReason"] = cuda_failure

        # Keep CPU as a genuine second candidate when its custom operators are
        # implemented, including after a later CUDA model-load/warmup failure.
        supported, reason = _cpu_operator_support()
        self.load_diagnostics["cpuOperatorSupport"] = supported
        self.load_diagnostics["cpuOperatorDiagnostic"] = reason
        if supported is not False:
            candidates.append("cpu")
        return candidates

    def _model_args(self, device: str) -> Any:
        from predict import get_args_parser

        parser = argparse.ArgumentParser(
            "Raster2Seq sidecar model configuration",
            parents=[get_args_parser()],
            add_help=False,
        )
        args = parser.parse_args(
            [
                "--dataset_name=cubicasa",
                f"--checkpoint={self.checkpoint}",
                "--batch_size=1",
                "--num_workers=0",
                "--semantic_classes=12",
                "--input_channels=3",
                "--poly2seq",
                "--seq_len=512",
                "--num_bins=32",
                "--disable_poly_refine",
                "--dec_attn_concat_src",
                "--per_token_sem_loss",
                "--use_anchor",
                "--ema4eval",
                f"--device={device}",
            ]
        )
        args.with_poly_refine = False
        return args

    def _load_on_device(self, device: str) -> None:
        from datasets.discrete_tokenizer import DiscreteTokenizer
        from datasets.transforms import ResizeAndPad
        from detectron2.data import transforms as detectron_transforms
        from engine import generate
        from models import build_model

        args = self._model_args(device)
        torch.manual_seed(args.seed)
        np.random.seed(args.seed)
        random.seed(args.seed)
        if device == "cuda":
            torch.cuda.manual_seed_all(args.seed)
            torch.backends.cudnn.benchmark = False
            torch.backends.cudnn.deterministic = True

        tokenizer = DiscreteTokenizer(args.num_bins, args.seq_len, add_cls=args.add_cls_token)
        args.vocab_size = len(tokenizer)
        model = build_model(args, train=False, tokenizer=tokenizer)
        model.to(torch.device(device))

        checkpoint = torch.load(str(self.checkpoint), map_location="cpu")
        state_dict = copy.deepcopy(checkpoint["ema"] if args.ema4eval else checkpoint["model"])
        for key in list(checkpoint["model"].keys()):
            if key.startswith("module."):
                state_dict[key[7:]] = checkpoint["model"][key]
                state_dict.pop(key, None)
        missing_keys, unexpected_keys = model.load_state_dict(state_dict, strict=False)
        unexpected_keys = [
            key
            for key in unexpected_keys
            if not (key.endswith("total_params") or key.endswith("total_ops"))
        ]
        del checkpoint
        del state_dict
        gc.collect()

        for parameter in model.parameters():
            parameter.requires_grad = False
        model.eval()

        self.load_diagnostics["missingModelKeys"] = list(missing_keys)
        self.load_diagnostics["unexpectedModelKeys"] = list(unexpected_keys)
        self.model = model
        self.generate = generate
        self.resize_and_pad = ResizeAndPad
        self.detectron_transforms = detectron_transforms
        self.device = device
        self.device_name = (
            torch.cuda.get_device_name(torch.cuda.current_device())
            if device == "cuda"
            else "CPU"
        )

        # A real forward pass verifies that CUDA initialization and the custom
        # deformable-attention operator work before /health reports ready.
        warmup = torch.ones((1, 3, MODEL_IMAGE_SIZE, MODEL_IMAGE_SIZE), dtype=torch.float32)
        warmup = warmup.to(torch.device(device))
        with torch.inference_mode():
            _ = self.generate(
                self.model,
                warmup,
                semantic_rich=True,
                use_cache=True,
                per_token_sem_loss=True,
                drop_wd=False,
                poly2seq=True,
            )
        if device == "cuda":
            torch.cuda.synchronize()

    def initialize(self) -> None:
        started = time.perf_counter()
        if not self.checkpoint.is_file():
            self.error_code = "CHECKPOINT_NOT_FOUND"
            self.error = "Raster2Seq checkpoint is not mounted."
            self.initialization_ms = round((time.perf_counter() - started) * 1000, 2)
            return

        candidates = self._device_candidates()
        if not candidates:
            self.error_code = "CPU_UNSUPPORTED_MS_DEFORM_ATTN"
            cuda_reason = self.load_diagnostics.get("cudaUnavailableReason")
            cpu_reason = self.load_diagnostics.get("cpuOperatorDiagnostic")
            self.error = "; ".join(reason for reason in (cuda_reason, cpu_reason) if reason)
            self.initialization_ms = round((time.perf_counter() - started) * 1000, 2)
            return

        failures: list[dict[str, str]] = []
        for device in candidates:
            try:
                self._load_on_device(device)
                self.ready = True
                self.error_code = None
                self.error = None
                break
            except Exception as error:
                failures.append({"device": device, "error": str(error)})
                self.model = None
                self.generate = None
                gc.collect()
                if torch.cuda.is_available():
                    try:
                        torch.cuda.empty_cache()
                    except Exception:
                        pass

        self.load_diagnostics["initializationFailures"] = failures
        if not self.ready:
            cpu_supported, cpu_reason = _cpu_operator_support()
            self.load_diagnostics["cpuOperatorSupport"] = cpu_supported
            self.load_diagnostics["cpuOperatorDiagnostic"] = cpu_reason
            if cpu_supported is False:
                self.error_code = "CPU_UNSUPPORTED_MS_DEFORM_ATTN"
            else:
                self.error_code = "MODEL_INITIALIZATION_FAILED"
            self.error = failures[-1]["error"] if failures else "No usable inference device."
        self.initialization_ms = round((time.perf_counter() - started) * 1000, 2)

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok" if self.ready else "unavailable",
            "ready": self.ready,
            "model": "Raster2Seq CubiCasa5K",
            "raster2seqCommit": RASTER2SEQ_COMMIT,
            "requestedDevice": self.requested_device,
            "device": self.device,
            "deviceName": self.device_name,
            "initializationMs": self.initialization_ms,
            "diagnostics": self.load_diagnostics,
            "errorCode": self.error_code,
            "error": self.error,
        }

    def _prepare_tensor(self, image: Image.Image) -> torch.Tensor:
        array = np.asarray(image, dtype=np.uint8)
        aug_input = self.detectron_transforms.AugInput(array)
        transform = self.detectron_transforms.AugmentationList(
            [self.resize_and_pad((MODEL_IMAGE_SIZE, MODEL_IMAGE_SIZE), pad_value=255)]
        )
        _ = transform(aug_input)
        transformed = np.asarray(aug_input.image)
        tensor = torch.as_tensor(
            transformed.transpose((2, 0, 1)).copy(), dtype=torch.float32
        )
        return tensor.div_(255.0).unsqueeze(0).to(torch.device(self.device))

    def infer(self, image: Image.Image) -> dict[str, Any]:
        if not self.ready:
            raise SidecarError(
                self.error_code or "MODEL_UNAVAILABLE",
                self.error or "Raster2Seq model is unavailable.",
                HTTPStatus.SERVICE_UNAVAILABLE,
            )

        with self.lock:
            tensor = self._prepare_tensor(image)
            if self.device == "cuda":
                torch.cuda.synchronize()
            started = time.perf_counter()
            try:
                with torch.inference_mode():
                    output = self.generate(
                        self.model,
                        tensor,
                        semantic_rich=True,
                        use_cache=True,
                        per_token_sem_loss=True,
                        drop_wd=False,
                        poly2seq=True,
                    )
                if self.device == "cuda":
                    torch.cuda.synchronize()
            except RuntimeError as error:
                message = str(error)
                if self.device == "cpu" and "Not implement on cpu" in message:
                    self.ready = False
                    self.error_code = "CPU_UNSUPPORTED_MS_DEFORM_ATTN"
                    self.error = message
                    raise SidecarError(
                        self.error_code,
                        message,
                        HTTPStatus.SERVICE_UNAVAILABLE,
                    ) from error
                raise SidecarError(
                    "INFERENCE_FAILED", message, HTTPStatus.INTERNAL_SERVER_ERROR
                ) from error
            inference_ms = round((time.perf_counter() - started) * 1000, 2)

        raw_polygons = output.get("room", [[]])[0]
        raw_labels = output.get("labels", [[]])[0]
        candidates: list[RoomCandidate] = []
        ignored_non_rooms = 0
        for index, raw_polygon in enumerate(raw_polygons):
            points = np.asarray(raw_polygon, dtype=np.float64).reshape(-1, 2)
            if len(points) < 3:
                ignored_non_rooms += 1
                continue
            raw_label = raw_labels[index] if raw_labels is not None and index < len(raw_labels) else None
            try:
                label = int(raw_label) if raw_label is not None else None
            except (TypeError, ValueError):
                label = None
            candidates.append(RoomCandidate(points=points, name=CC5K_LABELS.get(label)))

        rooms, safe, diagnostics = repair_room_candidates(
            candidates, image.width, image.height
        )
        diagnostics.update(
            {
                "modelOutputCount": len(raw_polygons),
                "nonRoomPredictionsIgnored": ignored_non_rooms,
                "raster2seqCommit": RASTER2SEQ_COMMIT,
            }
        )
        return {
            "rooms": rooms if safe else [],
            "sourceWidth": image.width,
            "sourceHeight": image.height,
            "device": self.device,
            "inferenceMs": inference_ms,
            "safe": safe,
            "diagnostics": diagnostics,
            "error": None if safe else "Raster2Seq candidate failed geometry safety checks.",
        }


class SidecarHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, server_address: tuple[str, int], engine: Raster2SeqEngine) -> None:
        super().__init__(server_address, SidecarRequestHandler)
        self.engine = engine


class SidecarRequestHandler(BaseHTTPRequestHandler):
    server: SidecarHTTPServer
    server_version = "Raster2SeqSidecar/1"
    sys_version = ""

    def _allowed_origin(self) -> str | None:
        origin = self.headers.get("Origin")
        return origin if origin and LOCAL_ORIGIN_RE.fullmatch(origin) else None

    def _send_json(
        self, status: HTTPStatus, payload: dict[str, Any], *, allow_origin: bool = True
    ) -> None:
        body = json.dumps(
            payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if allow_origin:
            origin = self._allowed_origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def _error_payload(
        self,
        code: str,
        message: str,
        *,
        source_width: int | None = None,
        source_height: int | None = None,
    ) -> dict[str, Any]:
        return {
            "rooms": [],
            "sourceWidth": source_width,
            "sourceHeight": source_height,
            "device": self.server.engine.device,
            "inferenceMs": 0.0,
            "safe": False,
            "diagnostics": {"code": code},
            "error": message,
        }

    def do_OPTIONS(self) -> None:
        origin = self._allowed_origin()
        if not origin:
            self._send_json(
                HTTPStatus.FORBIDDEN,
                {"error": "CORS origin is not allowed."},
                allow_origin=False,
            )
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if urlsplit(self.path).path != "/health":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return
        status = HTTPStatus.OK if self.server.engine.ready else HTTPStatus.SERVICE_UNAVAILABLE
        self._send_json(status, self.server.engine.health())

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/rooms":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            self._send_json(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                self._error_payload(
                    "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."
                ),
            )
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            content_length = -1
        if content_length < 0:
            self._send_json(
                HTTPStatus.LENGTH_REQUIRED,
                self._error_payload("CONTENT_LENGTH_REQUIRED", "Content-Length is required."),
            )
            return
        if content_length > MAX_REQUEST_BYTES:
            self._send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                self._error_payload(
                    "REQUEST_TOO_LARGE",
                    f"Request exceeds the {MAX_REQUEST_BYTES} byte limit.",
                ),
            )
            return

        image: Image.Image | None = None
        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
            if not isinstance(payload, dict):
                raise SidecarError(
                    "INVALID_JSON_BODY",
                    "JSON body must be an object.",
                    HTTPStatus.BAD_REQUEST,
                )
            image = _decode_image_data_url(payload.get("imageDataUrl"))
            response = self.server.engine.infer(image)
            self._send_json(HTTPStatus.OK, response)
        except SidecarError as error:
            self._send_json(
                error.status,
                self._error_payload(
                    error.code,
                    str(error),
                    source_width=image.width if image else None,
                    source_height=image.height if image else None,
                ),
            )
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                self._error_payload("INVALID_JSON", "Request body is not valid JSON."),
            )
        except Exception as error:
            self.log_error("Unhandled /rooms error: %s", error)
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                self._error_payload("INTERNAL_ERROR", "Unexpected inference server error."),
            )


def _run_geometry_self_test() -> None:
    simple = RoomCandidate(
        points=np.asarray([[10, 10], [80, 10], [80, 80], [10, 80]], dtype=np.float64),
        name="room",
    )
    overlapping = RoomCandidate(
        points=np.asarray([[70, 20], [120, 20], [120, 70], [70, 70]], dtype=np.float64),
        name="room-2",
    )
    rooms, safe, diagnostics = repair_room_candidates([simple, overlapping], 256, 256)
    if not safe or len(rooms) != 2 or diagnostics["overlapPolygonsClipped"] != 1:
        raise RuntimeError(f"Geometry self-test failed: {diagnostics}")
    figure_eight = RoomCandidate(
        points=np.asarray(
            [[10, 10], [50, 50], [10, 90], [50, 90], [10, 50], [50, 10]],
            dtype=np.float64,
        ),
        name="ambiguous",
    )
    rooms, safe, _ = repair_room_candidates([figure_eight], 256, 256)
    if safe or rooms:
        raise RuntimeError("Ambiguous self-intersection must force fallback.")
    bow_tie = RoomCandidate(
        points=np.asarray([[10, 10], [90, 90], [10, 90], [90, 10]], dtype=np.float64),
        name="bow-tie",
    )
    rooms, safe, _ = repair_room_candidates([bow_tie], 256, 256)
    if safe or rooms:
        raise RuntimeError("Bow-tie self-intersection must force fallback.")
    print(json.dumps({"geometrySelfTest": "passed"}, separators=(",", ":")))


def main() -> None:
    parser = argparse.ArgumentParser(description="Raster2Seq local inference sidecar")
    parser.add_argument("--host", default=os.environ.get("RASTER2SEQ_SERVER_HOST", "0.0.0.0"))
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("RASTER2SEQ_SERVER_PORT", "8977")),
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(
            os.environ.get(
                "RASTER2SEQ_CHECKPOINT", "/checkpoints/cubicasa5k/checkpoint.pth"
            )
        ),
    )
    parser.add_argument(
        "--device",
        choices=("auto", "cuda", "cpu"),
        default=os.environ.get("RASTER2SEQ_DEVICE", "auto"),
    )
    parser.add_argument("--self-test-geometry", action="store_true")
    args = parser.parse_args()

    if args.self_test_geometry:
        _run_geometry_self_test()
        return

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    engine = Raster2SeqEngine(args.checkpoint, args.device)
    engine.initialize()
    server = SidecarHTTPServer((args.host, args.port), engine)
    print(
        json.dumps(
            {
                "event": "raster2seq-sidecar-started",
                "host": args.host,
                "port": args.port,
                **engine.health(),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        flush=True,
    )
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
