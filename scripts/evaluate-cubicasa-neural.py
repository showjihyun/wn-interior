"""CubiCasa 공식 다중작업 CNN을 개발 분할에서 실행해 고전 CV와 비교한다."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from skimage import draw


REPO = Path(__file__).resolve().parents[1]
DATASET = (REPO.parent / ".datasets" / "cubicasa5k").resolve()
OFFICIAL = DATASET / "code"
WEIGHTS = DATASET / "weights" / "model_best_val_loss_var.pkl"
LIMIT = int(os.environ.get("CUBICASA_NEURAL_LIMIT", "20"))
MAX_DIM = int(os.environ.get("CUBICASA_NEURAL_MAX_DIM", "1600"))
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
sys.path.insert(0, str(OFFICIAL))
os.chdir(OFFICIAL)

from floortrans.models import get_model  # noqa: E402
from floortrans import post_prosessing  # noqa: E402


def parse_points(raw: str, scale_x: float, scale_y: float) -> np.ndarray:
    values = [float(v) for v in re.split(r"[\s,]+", raw.strip()) if v]
    return np.array(
        [[values[i] * scale_x, values[i + 1] * scale_y] for i in range(0, len(values) - 1, 2)],
        dtype=np.float32,
    )


def parse_ground_truth(svg: str, width: int, height: int, original_width: int, original_height: int):
    scale_x = width / original_width
    scale_y = height / original_height
    rooms = []
    walls = []
    room_re = re.compile(
        r'<g\b[^>]*class="Space\s+([^"]+)"[^>]*>\s*<polygon\b[^>]*points="([^"]+)"'
    )
    for classes, points in room_re.findall(svg):
        if "Outdoor" in classes.split():
            continue
        rooms.append(parse_points(points, scale_x, scale_y))
    wall_re = re.compile(
        r'<g\b[^>]*class="Wall(?:\s+[^"]*)?"[^>]*>\s*<polygon\b[^>]*points="([^"]+)"'
    )
    for points in wall_re.findall(svg):
        walls.append(parse_points(points, scale_x, scale_y))
    doors = len(re.findall(r'class="Door(?:\s|")', svg))
    return rooms, walls, doors


def raster_instances(polygons, height: int, width: int) -> np.ndarray:
    labels = np.zeros((height, width), dtype=np.int32)
    for index, polygon in enumerate(polygons, 1):
        geometries = polygon.geoms if hasattr(polygon, "geoms") else [polygon]
        for geometry in geometries:
            if hasattr(geometry, "exterior"):
                coords = np.asarray(geometry.exterior.coords)
            else:
                coords = np.asarray(geometry)
            if coords.ndim != 2 or len(coords) < 3:
                continue
            rr, cc = draw.polygon(coords[:, 1], coords[:, 0], shape=labels.shape)
            labels[rr, cc] = index
    return labels


def instance_score(gt: np.ndarray, pred: np.ndarray):
    gt_ids = [v for v in np.unique(gt) if v]
    pred_ids = [v for v in np.unique(pred) if v]
    pairs = []
    for gt_id in gt_ids:
        gt_mask = gt == gt_id
        for pred_id in pred_ids:
            pred_mask = pred == pred_id
            intersection = np.logical_and(gt_mask, pred_mask).sum()
            if not intersection:
                continue
            union = np.logical_or(gt_mask, pred_mask).sum()
            pairs.append((intersection / union, gt_id, pred_id))
    pairs.sort(reverse=True)
    used_gt = set()
    used_pred = set()
    matched = 0
    best_ious = {gt_id: 0.0 for gt_id in gt_ids}
    for iou, gt_id, pred_id in pairs:
        best_ious[gt_id] = max(best_ious[gt_id], iou)
        if gt_id in used_gt or pred_id in used_pred:
            continue
        used_gt.add(gt_id)
        used_pred.add(pred_id)
        if iou >= 0.5:
            matched += 1
    precision = matched / len(pred_ids) if pred_ids else 0
    recall = matched / len(gt_ids) if gt_ids else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return f1, np.mean(list(best_ious.values())) if best_ious else 0


def binary_f1(gt: np.ndarray, pred: np.ndarray) -> float:
    intersection = np.logical_and(gt, pred).sum()
    precision = intersection / pred.sum() if pred.sum() else 0
    recall = intersection / gt.sum() if gt.sum() else 0
    return 2 * precision * recall / (precision + recall) if precision + recall else 0


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
    dev_cases = [case for index, case in enumerate(manifest["cases"]) if index % 10 == 0][:LIMIT]
    model = load_model()
    rows = []
    for index, case in enumerate(dev_cases, 1):
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
        if DEVICE.type == "cuda":
            torch.cuda.synchronize()
        prediction = prediction.cpu()
        heatmaps, rooms, icons = post_prosessing.split_prediction(
            prediction, (height, width), [21, 12, 11]
        )
        polygons, types, room_polygons, _ = post_prosessing.get_polygons(
            (heatmaps, rooms.copy(), icons), 0.4, [1, 2]
        )
        svg = (case_dir / "model.svg").read_text(encoding="utf-8")
        gt_rooms, gt_walls, gt_doors = parse_ground_truth(
            svg, width, height, original_width, original_height
        )
        gt_room_labels = raster_instances(gt_rooms, height, width)
        pred_room_labels = raster_instances(room_polygons, height, width)
        room_f1, best_iou = instance_score(gt_room_labels, pred_room_labels)
        gt_wall_mask = raster_instances(gt_walls, height, width) > 0
        room_segmentation = np.argmax(rooms, axis=0)
        pred_wall_mask = np.isin(room_segmentation, [2, 8])
        predicted_doors = sum(item.get("type") == "door" for item in types)
        rows.append(
            {
                "category": case["category"],
                "id": case["id"],
                "gtRooms": len(gt_rooms),
                "predictedRooms": len(room_polygons),
                "roomF1At50": round(float(room_f1), 4),
                "meanBestRoomIoU": round(float(best_iou), 4),
                "wallF1": round(float(binary_f1(gt_wall_mask, pred_wall_mask)), 4),
                "gtDoors": gt_doors,
                "predictedDoors": predicted_doors,
                "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
            }
        )
        print(f"neural: {index}/{len(dev_cases)}", flush=True)
    mean = lambda key: sum(row[key] for row in rows) / len(rows) if rows else 0
    summary = {
        "count": len(rows),
        "meanRoomF1At50": round(mean("roomF1At50"), 4),
        "meanBestRoomIoU": round(mean("meanBestRoomIoU"), 4),
        "meanWallF1": round(mean("wallF1"), 4),
        "meanElapsedMs": round(mean("elapsedMs"), 1),
    }
    output = {
        "model": "CubiCasa5K official multi-task CNN",
        "weights": WEIGHTS.name,
        "device": str(DEVICE),
        "maxDimension": MAX_DIM,
        "summary": summary,
        "rows": rows,
    }
    target = REPO / "docs" / "evidence" / "cubicasa-neural-dev.json"
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
