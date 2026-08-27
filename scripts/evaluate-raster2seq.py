"""Evaluate Raster2Seq room polygons with the existing 128-grid IoU@0.5 methodology."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from shapely.geometry import LineString, Polygon as ShapelyPolygon
from shapely.ops import polygonize, unary_union


GRID = 128
IMAGE_SIZE = 256
ROOM_RE = re.compile(
    r'<g\b[^>]*class="Space\s+([^"]+)"[^>]*>\s*<polygon\b[^>]*points="([^"]+)"'
)


def round4(value: float) -> float:
    return round(float(value), 4)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.floor((len(ordered) - 1) * p))]


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def parse_points(raw: str) -> np.ndarray:
    values = [float(value) for value in re.split(r"[\s,]+", raw.strip()) if value]
    return np.asarray(
        [[values[index], values[index + 1]] for index in range(0, len(values) - 1, 2)],
        dtype=np.float64,
    )


def parse_gt_rooms(svg_path: Path) -> list[np.ndarray]:
    svg = svg_path.read_text(encoding="utf-8")
    rooms = []
    for classes, points in ROOM_RE.findall(svg):
        if "Outdoor" in classes.split():
            continue
        polygon = parse_points(points)
        if len(polygon) >= 3:
            rooms.append(polygon)
    return rooms


def inverse_letterbox(points: np.ndarray, width: int, height: int) -> tuple[np.ndarray, int]:
    scale = min(IMAGE_SIZE / height, IMAGE_SIZE / width)
    new_height = int(height * scale)
    new_width = int(width * scale)
    top = (IMAGE_SIZE - new_height) // 2
    left = (IMAGE_SIZE - new_width) // 2
    raw = points.astype(np.float64).copy()
    raw[:, 0] = (raw[:, 0] - left) / (new_width / width)
    raw[:, 1] = (raw[:, 1] - top) / (new_height / height)
    out_of_bounds = int(
        np.logical_or.reduce(
            (raw[:, 0] < 0, raw[:, 0] > width, raw[:, 1] < 0, raw[:, 1] > height)
        ).sum()
    )
    raw[:, 0] = np.clip(raw[:, 0], 0, width)
    raw[:, 1] = np.clip(raw[:, 1], 0, height)
    return raw, out_of_bounds


def remove_duplicate_vertices(points: np.ndarray) -> tuple[np.ndarray, int]:
    """Remove only consecutive/closing duplicates; do not repair geometry or simplify corners."""
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


def remove_collinear_vertices(points: np.ndarray) -> tuple[np.ndarray, int]:
    """Remove zero-area collinear spikes/points caused by integer token quantization."""
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


def point_in_polygon(x: float, y: float, polygon: np.ndarray) -> bool:
    inside = False
    previous = len(polygon) - 1
    for current in range(len(polygon)):
        ax, ay = polygon[current]
        bx, by = polygon[previous]
        if (ay > y) != (by > y) and x < ((bx - ax) * (y - ay)) / ((by - ay) or 1.0) + ax:
            inside = not inside
        previous = current
    return inside


def score_rooms(gt_rooms: list[np.ndarray], predicted_rooms: list[np.ndarray], width: int, height: int) -> dict:
    xs = ((np.arange(GRID, dtype=np.float64) + 0.5) / GRID) * width
    ys = ((np.arange(GRID, dtype=np.float64) + 0.5) / GRID) * height
    grid_x, grid_y = np.meshgrid(xs, ys)

    def rasterize_first(polygons: list[np.ndarray]) -> np.ndarray:
        labels = np.full((GRID, GRID), -1, dtype=np.int32)
        for polygon_index, polygon in enumerate(polygons):
            inside = np.zeros((GRID, GRID), dtype=bool)
            previous = len(polygon) - 1
            for current in range(len(polygon)):
                ax, ay = polygon[current]
                bx, by = polygon[previous]
                crosses = (ay > grid_y) != (by > grid_y)
                edge_x = ((bx - ax) * (grid_y - ay)) / ((by - ay) or 1.0) + ax
                inside ^= crosses & (grid_x < edge_x)
                previous = current
            labels[(labels < 0) & inside] = polygon_index
        return labels

    gt_labels = rasterize_first(gt_rooms)
    pred_labels = rasterize_first(predicted_rooms)
    gt_area = np.bincount(gt_labels[gt_labels >= 0], minlength=len(gt_rooms))
    pred_area = np.bincount(pred_labels[pred_labels >= 0], minlength=len(predicted_rooms))
    intersections: dict[tuple[int, int], int] = {}
    joint = (gt_labels >= 0) & (pred_labels >= 0)
    if joint.any() and predicted_rooms:
        codes, counts = np.unique(
            gt_labels[joint] * len(predicted_rooms) + pred_labels[joint], return_counts=True
        )
        intersections = {
            (int(code // len(predicted_rooms)), int(code % len(predicted_rooms))): int(count)
            for code, count in zip(codes, counts)
        }

    iou_matrix = np.zeros((len(gt_rooms), len(predicted_rooms)), dtype=np.float64)
    for (gt_index, pred_index), intersection in intersections.items():
        union = int(gt_area[gt_index]) + int(pred_area[pred_index]) - intersection
        iou_matrix[gt_index, pred_index] = intersection / union if union else 0.0
    matched = []
    if len(gt_rooms) and len(predicted_rooms):
        # Maximize the number of IoU>=0.5 matches first, then total IoU as a tie-breaker.
        weights = (iou_matrix >= 0.5).astype(np.float64) * 1_000.0 + iou_matrix
        gt_indices, pred_indices = linear_sum_assignment(weights, maximize=True)
        matched = [
            (float(iou_matrix[gt_index, pred_index]), int(gt_index), int(pred_index))
            for gt_index, pred_index in zip(gt_indices, pred_indices)
        ]
    matched_at_50 = sum(iou >= 0.5 for iou, _, _ in matched)
    precision = matched_at_50 / len(predicted_rooms) if predicted_rooms else 0.0
    recall = matched_at_50 / len(gt_rooms) if gt_rooms else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    best_ious = (
        iou_matrix.max(axis=1).tolist() if len(predicted_rooms) else [0.0] * len(gt_rooms)
    )
    return {
        "matchedRoomsAt50": matched_at_50,
        "roomPrecisionAt50": round4(precision),
        "roomRecallAt50": round4(recall),
        "roomF1At50": round4(f1),
        "meanBestRoomIoU": round4(mean(best_ious)),
    }


def polygon_quality(polygons: list[np.ndarray], width: int, height: int, out_of_bounds: int) -> dict:
    shapes = []
    invalid = 0
    total_vertices = sum(len(polygon) for polygon in polygons)
    for polygon in polygons:
        try:
            shape = ShapelyPolygon(polygon)
            if not shape.is_valid or shape.area <= 0:
                invalid += 1
            else:
                shapes.append(shape)
        except Exception:
            invalid += 1
    overlapping_pairs = 0
    affected: set[int] = set()
    severe_overlapping_pairs = 0
    severe_affected: set[int] = set()
    for first in range(len(shapes) - 1):
        for second in range(first + 1, len(shapes)):
            intersection_area = shapes[first].intersection(shapes[second]).area
            if intersection_area > 1.0:
                overlapping_pairs += 1
                affected.update((first, second))
                smaller_area = min(shapes[first].area, shapes[second].area)
                if smaller_area > 0 and intersection_area / smaller_area > 0.02:
                    severe_overlapping_pairs += 1
                    severe_affected.update((first, second))
    coverage = unary_union(shapes).area / (width * height) if shapes and width and height else 0.0
    return {
        "invalidPolygons": invalid,
        "totalPolygons": len(polygons),
        "invalidPolygonRate": round4(invalid / len(polygons) if polygons else 0.0),
        "overlappingPairs": overlapping_pairs,
        "anyOverlapAffectedPolygonRate": round4(
            len(affected) / len(polygons) if polygons else 0.0
        ),
        "anyOverlapAffectedPolygons": len(affected),
        "severeOverlappingPairs": severe_overlapping_pairs,
        "overlapAffectedPolygonRate": round4(
            len(severe_affected) / len(polygons) if polygons else 0.0
        ),
        "overlapAffectedPolygons": len(severe_affected),
        "outOfBoundsVertices": out_of_bounds,
        "outOfBoundsVertexRate": round4(out_of_bounds / total_vertices if total_vertices else 0.0),
        "roomCoverageRate": round4(coverage),
    }


def single_hole_free_polygon(geometry):
    """Return only geometry that the product Room type can represent without data loss."""
    if geometry is None or geometry.is_empty or geometry.geom_type != "Polygon":
        return None
    if len(geometry.interiors) > 0:
        return None
    return geometry


def repair_unambiguous_self_intersection(points: np.ndarray):
    closed = np.vstack((points, points[0]))
    faces = [
        face
        for face in polygonize(unary_union(LineString(closed)))
        if face.area > 1.0
    ]
    if len(faces) != 1:
        return None
    return single_hole_free_polygon(faces[0])


def repair_polygon_geometry(polygons: list[np.ndarray]) -> tuple[list[np.ndarray], dict]:
    """Repair self-intersections and assign overlapping area without consulting ground truth."""
    repaired: list[np.ndarray] = []
    claimed = None
    invalid_repaired = 0
    overlap_clipped = 0
    dropped = 0
    unsafe = False
    for polygon in polygons:
        try:
            shape = ShapelyPolygon(polygon)
            original_area = abs(shape.area)
            if not shape.is_valid:
                shape = repair_unambiguous_self_intersection(polygon)
                invalid_repaired += 1
            if shape is None or shape.is_empty or shape.area <= 1.0:
                dropped += 1
                unsafe = True
                continue
            before_clip = shape.area
            if claimed is not None and shape.intersects(claimed):
                clipped = single_hole_free_polygon(shape.difference(claimed))
                if clipped is None or clipped.is_empty:
                    dropped += 1
                    unsafe = True
                    continue
                if clipped.area < max(1.0, before_clip * 0.35):
                    dropped += 1
                    unsafe = True
                    continue
                if clipped.area < before_clip - 1.0:
                    overlap_clipped += 1
                shape = clipped
            if shape.area < max(1.0, original_area * 0.35):
                dropped += 1
                unsafe = True
                continue
            coordinates = np.asarray(shape.exterior.coords[:-1], dtype=np.float64)
            coordinates, _ = remove_duplicate_vertices(coordinates)
            coordinates, _ = remove_collinear_vertices(coordinates)
            if len(coordinates) < 3:
                dropped += 1
                unsafe = True
                continue
            repaired.append(coordinates)
            claimed = shape if claimed is None else claimed.union(shape)
        except Exception:
            dropped += 1
            unsafe = True
    return repaired, {
        "invalidPolygonsRepaired": invalid_repaired,
        "overlapPolygonsClipped": overlap_clipped,
        "repairDroppedPolygons": dropped,
        "repairUnsafe": unsafe,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--hardware-runtime", type=Path)
    parser.add_argument("--safe-fallback", action="store_true")
    parser.add_argument("--repair-geometry", action="store_true")
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--raster2seq-commit", required=True)
    args = parser.parse_args()

    prepared_raw = args.prepared.read_bytes()
    prepared = json.loads(prepared_raw)
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    baseline_rows = {
        (row["category"], str(row["id"])): row for row in baseline["real"]["rows"]
    }
    runtime = json.loads(args.runtime.read_text(encoding="utf-8"))
    hardware_runtime = (
        json.loads(args.hardware_runtime.read_text(encoding="utf-8"))
        if args.hardware_runtime
        else runtime
    )
    rows = []
    for case in prepared["cases"]:
        prediction_path = args.predictions / f'{case["fileStem"]}.json'
        predicted_rooms = []
        out_of_bounds = 0
        duplicate_vertices_removed = 0
        collinear_vertices_removed = 0
        error = None
        try:
            predictions = json.loads(prediction_path.read_text(encoding="utf-8"))
            for prediction in predictions:
                points = np.asarray(prediction.get("segmentation", []), dtype=np.float64).reshape(-1, 2)
                if len(points) < 3 or not np.isfinite(points).all():
                    continue
                restored, outside = inverse_letterbox(points, case["width"], case["height"])
                restored, duplicates = remove_duplicate_vertices(restored)
                restored, collinear = remove_collinear_vertices(restored)
                if len(restored) < 3:
                    continue
                predicted_rooms.append(restored)
                out_of_bounds += outside
                duplicate_vertices_removed += duplicates
                collinear_vertices_removed += collinear
        except Exception as exc:
            error = str(exc)
        gt_rooms = parse_gt_rooms(Path(case["svg"]))
        raw_quality = polygon_quality(
            predicted_rooms, case["width"], case["height"], out_of_bounds
        )
        repair_diagnostics = {
            "invalidPolygonsRepaired": 0,
            "overlapPolygonsClipped": 0,
            "repairDroppedPolygons": 0,
            "repairUnsafe": False,
        }
        if args.repair_geometry:
            predicted_rooms, repair_diagnostics = repair_polygon_geometry(predicted_rooms)
        score = score_rooms(gt_rooms, predicted_rooms, case["width"], case["height"])
        quality = polygon_quality(predicted_rooms, case["width"], case["height"], out_of_bounds)
        baseline_row = baseline_rows.get((case["category"], str(case["id"])), {})
        room_extraction_succeeded = bool(
            predicted_rooms
            and quality["invalidPolygons"] < len(predicted_rooms)
            and error is None
        )
        conversion_succeeded = bool(
            baseline_row.get("conversionSucceeded", False) and room_extraction_succeeded
        )
        row = {
                "category": case["category"],
                "id": case["id"],
                "width": case["width"],
                "height": case["height"],
                "gtRooms": len(gt_rooms),
                "predictedRooms": len(predicted_rooms),
                "conversionSucceeded": conversion_succeeded,
                "roomExtractionSucceeded": room_extraction_succeeded,
                "roomCountExact": len(predicted_rooms) == len(gt_rooms),
                "roomCountWithinOne": abs(len(predicted_rooms) - len(gt_rooms)) <= 1,
                **score,
                **quality,
                **repair_diagnostics,
                "rawInvalidPolygonRate": raw_quality["invalidPolygonRate"],
                "rawOverlapAffectedPolygonRate": raw_quality["overlapAffectedPolygonRate"],
                "duplicateVerticesRemoved": duplicate_vertices_removed,
                "collinearVerticesRemoved": collinear_vertices_removed,
                "error": error,
            }
        unsafe_candidate = bool(
            quality["invalidPolygons"] > 0
            or quality["severeOverlappingPairs"] > 0
            or quality["outOfBoundsVertexRate"] > 0.02
            or repair_diagnostics["repairUnsafe"]
        )
        row["candidateUnsafe"] = unsafe_candidate
        row["usedFallback"] = False
        if args.safe_fallback and unsafe_candidate and baseline_row:
            row["candidateRoomExtractionSucceeded"] = row["roomExtractionSucceeded"]
            for key in (
                "predictedRooms",
                "conversionSucceeded",
                "roomCountExact",
                "roomCountWithinOne",
                "matchedRoomsAt50",
                "roomPrecisionAt50",
                "roomRecallAt50",
                "roomF1At50",
                "meanBestRoomIoU",
            ):
                row[f"candidate{key[0].upper()}{key[1:]}"] = row[key]
                row[key] = baseline_row[key]
            row["roomExtractionSucceeded"] = bool(
                baseline_row.get("conversionSucceeded", False)
            )
            row["invalidPolygons"] = 0
            row["totalPolygons"] = row["predictedRooms"]
            row["invalidPolygonRate"] = 0.0
            row["severeOverlappingPairs"] = 0
            row["overlapAffectedPolygons"] = 0
            row["overlapAffectedPolygonRate"] = 0.0
            row["anyOverlapAffectedPolygons"] = 0
            row["anyOverlapAffectedPolygonRate"] = 0.0
            row["usedFallback"] = True
        rows.append(row)

    f1_values = [row["roomF1At50"] for row in rows]
    summary = {
        "count": len(rows),
        "conversionSuccessRate": round4(mean([float(row["conversionSucceeded"]) for row in rows])),
        "roomExtractionSuccessRate": round4(
            mean([float(row["roomExtractionSucceeded"]) for row in rows])
        ),
        "roomCountExactRate": round4(mean([float(row["roomCountExact"]) for row in rows])),
        "roomCountWithinOneRate": round4(mean([float(row["roomCountWithinOne"]) for row in rows])),
        "meanRoomF1At50": round4(mean(f1_values)),
        "medianRoomF1At50": round4(percentile(f1_values, 0.5)),
        "p10RoomF1At50": round4(percentile(f1_values, 0.1)),
        "meanBestRoomIoU": round4(mean([row["meanBestRoomIoU"] for row in rows])),
        "invalidPolygonRate": round4(mean([row["invalidPolygonRate"] for row in rows])),
        "invalidPolygonMicroRate": round4(
            sum(row["invalidPolygons"] for row in rows)
            / max(1, sum(row["totalPolygons"] for row in rows))
        ),
        "overlapAffectedPolygonRate": round4(
            mean([row["overlapAffectedPolygonRate"] for row in rows])
        ),
        "overlapAffectedPolygonMicroRate": round4(
            sum(row["overlapAffectedPolygons"] for row in rows)
            / max(1, sum(row["totalPolygons"] for row in rows))
        ),
        "anyOverlapAffectedPolygonRate": round4(
            mean([row["anyOverlapAffectedPolygonRate"] for row in rows])
        ),
        "anyOverlapAffectedPolygonMicroRate": round4(
            sum(row["anyOverlapAffectedPolygons"] for row in rows)
            / max(1, sum(row["totalPolygons"] for row in rows))
        ),
        "outOfBoundsVertexRate": round4(mean([row["outOfBoundsVertexRate"] for row in rows])),
        "meanRoomCoverageRate": round4(mean([row["roomCoverageRate"] for row in rows])),
        "duplicateVerticesRemoved": sum(row["duplicateVerticesRemoved"] for row in rows),
        "collinearVerticesRemoved": sum(row["collinearVerticesRemoved"] for row in rows),
        "safeFallbackRate": round4(mean([float(row["usedFallback"]) for row in rows])),
        "invalidPolygonsRepaired": sum(row["invalidPolygonsRepaired"] for row in rows),
        "overlapPolygonsClipped": sum(row["overlapPolygonsClipped"] for row in rows),
        "repairDroppedPolygons": sum(row["repairDroppedPolygons"] for row in rows),
        "repairUnsafeCaseRate": round4(mean([float(row["repairUnsafe"]) for row in rows])),
        "reportedMeanInferenceMs": runtime.get("reportedMeanInferenceMs"),
        "wallElapsedSeconds": runtime.get("wallElapsedSeconds"),
        "peakGpuMemoryMiB": runtime.get("peakGpuMemoryMiB"),
        "peakTorchAllocatedMiB": hardware_runtime.get("peakTorchAllocatedMiB"),
        "peakTorchReservedMiB": hardware_runtime.get("peakTorchReservedMiB"),
    }
    baseline_summary = baseline["real"]["summary"]["overall"]
    thresholds = {
        "minimumRoomF1At50": round4(
            max(
                baseline_summary["meanRoomF1At50"] + 0.10,
                0.65 if prepared["split"] == "holdout" else 0.0,
            )
        ),
        "minimumP10RoomF1At50": baseline_summary["p10RoomF1At50"],
        "minimumConversionSuccessRate": round4(
            max(0.0, baseline_summary["conversionSuccessRate"] - 0.02)
        ),
        "maximumMeanInferenceMs": 2000,
        "maximumPeakGpuMemoryMiB": 10240,
        "maximumInvalidPolygonRate": 0.01,
        "maximumOverlapAffectedPolygonRate": 0.05,
    }
    checks = {
        "roomF1": summary["meanRoomF1At50"] >= thresholds["minimumRoomF1At50"],
        "p10RoomF1": summary["p10RoomF1At50"] > thresholds["minimumP10RoomF1At50"],
        "conversionSuccess": summary["conversionSuccessRate"]
        >= thresholds["minimumConversionSuccessRate"],
        "inferenceTime": summary["reportedMeanInferenceMs"] is not None
        and summary["reportedMeanInferenceMs"] <= thresholds["maximumMeanInferenceMs"],
        "gpuMemory": (
            summary["peakTorchReservedMiB"]
            if summary["peakTorchReservedMiB"] is not None
            else summary["peakGpuMemoryMiB"]
        )
        is not None
        and (
            summary["peakTorchReservedMiB"]
            if summary["peakTorchReservedMiB"] is not None
            else summary["peakGpuMemoryMiB"]
        )
        <= thresholds["maximumPeakGpuMemoryMiB"],
        "polygonValidity": max(
            summary["invalidPolygonRate"], summary["invalidPolygonMicroRate"]
        )
        <= thresholds["maximumInvalidPolygonRate"],
        "polygonOverlap": max(
            summary["overlapAffectedPolygonRate"],
            summary["overlapAffectedPolygonMicroRate"],
        )
        <= thresholds["maximumOverlapAffectedPolygonRate"],
    }
    result = {
        "methodologyVersion": 2,
        "engine": "Raster2Seq CubiCasa5K checkpoint",
        "raster2seqCommit": args.raster2seq_commit,
        "checkpoint": "haopt/Raster2Seq cubicasa5k/checkpoint.pth",
        "imageSize": IMAGE_SIZE,
        "gridResolution": GRID,
        "safeFallback": args.safe_fallback,
        "repairGeometry": args.repair_geometry,
        "split": prepared["split"],
        "preparedManifestSha256": hashlib.sha256(prepared_raw).hexdigest(),
        "baseline": {
            "source": str(args.baseline),
            "summary": baseline_summary,
        },
        "runtime": runtime,
        "hardwareRuntime": hardware_runtime,
        "summary": summary,
        "thresholds": thresholds,
        "checks": checks,
        "gatePassed": all(checks.values()),
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": summary, "checks": checks, "gatePassed": result["gatePassed"]}, indent=2))


if __name__ == "__main__":
    main()
