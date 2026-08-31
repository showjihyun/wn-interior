from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


ROOT = Path("output/imagegen/3d-to-2d-benchmark")
CANVAS = 640

MANUAL_OPENING_REVIEW = {
    "case-01-studio": {"predicted": 2, "matched": 2, "note": "entry and north window preserved"},
    "case-02-dual-vertical": {"predicted": 4, "matched": 3, "note": "extra north window"},
    "case-03-dual-horizontal": {"predicted": 4, "matched": 3, "note": "extra south window"},
    "case-04-three-bays": {"predicted": 4, "matched": 4, "note": "all openings preserved"},
    "case-05-four-grid": {"predicted": 5, "matched": 4, "note": "extra south window"},
    "case-06-corridor-six": {
        "predicted": 6,
        "matched": 4,
        "note": "room count preserved but three internal door locations were omitted or moved",
    },
    "case-07-l-shape": {
        "predicted": 5,
        "matched": 4,
        "note": "one horizontal-wall door moved to the vertical partition",
    },
    "case-08-long-five": {"predicted": 7, "matched": 6, "note": "extra south window"},
    "case-09-central-spine": {"predicted": 7, "matched": 6, "note": "extra east window"},
    "case-10-apartment": {
        "predicted": 7,
        "matched": 7,
        "note": "one internal door and the bathroom window omitted",
    },
}


@dataclass
class Segment:
    orientation: str
    coord: float
    start: float
    end: float

    @property
    def length(self) -> float:
        return self.end - self.start


def threshold_lines(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return np.where(gray < 185, 255, 0).astype(np.uint8)


def hough_segments(mask: np.ndarray) -> list[Segment]:
    height, width = mask.shape
    lines = cv2.HoughLinesP(
        mask,
        rho=1,
        theta=np.pi / 360,
        threshold=55,
        minLineLength=max(45, int(max(width, height) * 0.09)),
        maxLineGap=max(12, int(max(width, height) * 0.025)),
    )
    if lines is None:
        return []
    result: list[Segment] = []
    for raw in lines[:, 0]:
        x1, y1, x2, y2 = map(float, raw)
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        if dx >= dy * 8:
            result.append(Segment("h", (y1 + y2) / 2, min(x1, x2), max(x1, x2)))
        elif dy >= dx * 8:
            result.append(Segment("v", (x1 + x2) / 2, min(y1, y2), max(y1, y2)))
    return result


def structural_bbox(segments: list[Segment], width: int, height: int) -> tuple[float, float, float, float]:
    long_segments = [item for item in segments if item.length >= max(width, height) * 0.25]
    source = long_segments or segments
    xs: list[float] = []
    ys: list[float] = []
    for item in source:
        if item.orientation == "h":
            xs.extend([item.start, item.end])
            ys.append(item.coord)
        else:
            xs.append(item.coord)
            ys.extend([item.start, item.end])
    if not xs or not ys:
        return 0, 0, width - 1, height - 1
    return min(xs), min(ys), max(xs), max(ys)


def normalize_segments(
    segments: list[Segment], bbox: tuple[float, float, float, float], plan_width: float, plan_height: float
) -> list[Segment]:
    left, top, right, bottom = bbox
    sx = plan_width / max(1, right - left)
    sy = plan_height / max(1, bottom - top)
    normalized: list[Segment] = []
    for item in segments:
        if item.orientation == "h":
            normalized.append(
                Segment("h", (item.coord - top) * sy, (item.start - left) * sx, (item.end - left) * sx)
            )
        else:
            normalized.append(
                Segment("v", (item.coord - left) * sx, (item.start - top) * sy, (item.end - top) * sy)
            )
    return normalized


def merge_segments(segments: list[Segment], plan_width: float, plan_height: float) -> list[Segment]:
    coord_tolerance = min(plan_width, plan_height) * 0.035
    gap_tolerance = max(plan_width, plan_height) * 0.1
    min_length = max(plan_width, plan_height) * 0.16
    merged: list[Segment] = []
    for orientation in ("h", "v"):
        oriented = sorted((item for item in segments if item.orientation == orientation), key=lambda item: item.coord)
        clusters: list[list[Segment]] = []
        for item in oriented:
            if not clusters or abs(np.median([part.coord for part in clusters[-1]]) - item.coord) > coord_tolerance:
                clusters.append([item])
            else:
                clusters[-1].append(item)
        for cluster in clusters:
            coord = float(np.median([item.coord for item in cluster]))
            intervals = sorted((item.start, item.end) for item in cluster)
            current_start, current_end = intervals[0]
            for start, end in intervals[1:]:
                if start <= current_end + gap_tolerance:
                    current_end = max(current_end, end)
                else:
                    if current_end - current_start >= min_length:
                        merged.append(Segment(orientation, coord, current_start, current_end))
                    current_start, current_end = start, end
            if current_end - current_start >= min_length:
                merged.append(Segment(orientation, coord, current_start, current_end))
    return merged


def ground_truth_segments(project: dict) -> tuple[list[Segment], float, float]:
    walls = project["plan"]["walls"]
    xs = [point for wall in walls for point in (wall["a"]["x"], wall["b"]["x"])]
    ys = [point for wall in walls for point in (wall["a"]["y"], wall["b"]["y"])]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    result: list[Segment] = []
    for wall in walls:
        x1, y1 = wall["a"]["x"] - min_x, wall["a"]["y"] - min_y
        x2, y2 = wall["b"]["x"] - min_x, wall["b"]["y"] - min_y
        if abs(x2 - x1) >= abs(y2 - y1):
            result.append(Segment("h", (y1 + y2) / 2, min(x1, x2), max(x1, x2)))
        else:
            result.append(Segment("v", (x1 + x2) / 2, min(y1, y2), max(y1, y2)))
    return result, max_x - min_x, max_y - min_y


def overlap_ratio(left: Segment, right: Segment) -> float:
    overlap = max(0.0, min(left.end, right.end) - max(left.start, right.start))
    return overlap / max(1.0, left.length)


def matches(source: Segment, target: Segment, tolerance: float) -> bool:
    return (
        source.orientation == target.orientation
        and abs(source.coord - target.coord) <= tolerance
        and overlap_ratio(source, target) >= 0.58
    )


def wall_metrics(predicted: list[Segment], truth: list[Segment], plan_width: float, plan_height: float) -> dict:
    tolerance = min(plan_width, plan_height) * 0.055
    candidates = sorted(
        (
            (overlap_ratio(truth_item, predicted_item), truth_index, predicted_index)
            for truth_index, truth_item in enumerate(truth)
            for predicted_index, predicted_item in enumerate(predicted)
            if matches(truth_item, predicted_item, tolerance)
        ),
        reverse=True,
    )
    matched_truth: set[int] = set()
    matched_predicted: set[int] = set()
    for _, truth_index, predicted_index in candidates:
        if truth_index in matched_truth or predicted_index in matched_predicted:
            continue
        matched_truth.add(truth_index)
        matched_predicted.add(predicted_index)
    matched = len(matched_truth)
    recall = matched / max(1, len(truth))
    precision = matched / max(1, len(predicted))
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    return {
        "truth": len(truth),
        "predicted": len(predicted),
        "matched_one_to_one": matched,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def render_segments(segments: list[Segment], plan_width: float, plan_height: float, thickness: int = 5) -> np.ndarray:
    margin = 36
    scale = min((CANVAS - margin * 2) / plan_width, (CANVAS - margin * 2) / plan_height)
    x_offset = (CANVAS - plan_width * scale) / 2
    y_offset = (CANVAS - plan_height * scale) / 2
    image = np.zeros((CANVAS, CANVAS), dtype=np.uint8)
    for item in segments:
        if item.orientation == "h":
            start = (round(x_offset + item.start * scale), round(y_offset + item.coord * scale))
            end = (round(x_offset + item.end * scale), round(y_offset + item.coord * scale))
        else:
            start = (round(x_offset + item.coord * scale), round(y_offset + item.start * scale))
            end = (round(x_offset + item.coord * scale), round(y_offset + item.end * scale))
        cv2.line(image, start, end, 255, thickness, cv2.LINE_AA)
    return image


def room_count_from_segments(mask: np.ndarray) -> int:
    sealed = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=1)
    free = cv2.bitwise_not(sealed)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(free)
    areas = [stats[index, cv2.CC_STAT_AREA] for index in range(1, count)]
    if not areas:
        return 0
    outside = int(labels[0, 0])
    return sum(
        stats[index, cv2.CC_STAT_AREA] >= CANVAS * CANVAS * 0.012 and index != outside
        for index in range(1, count)
    )


def interior_mask_from_segments(mask: np.ndarray) -> np.ndarray:
    sealed = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=1)
    free = cv2.bitwise_not(sealed)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(free)
    if count <= 1:
        return np.zeros_like(mask)
    outside = int(labels[0, 0])
    result = np.zeros_like(mask)
    for index in range(1, count):
        area = stats[index, cv2.CC_STAT_AREA]
        if index != outside and area >= CANVAS * CANVAS * 0.012:
            result[labels == index] = 255
    return result


def render_truth_rooms(project: dict, plan_width: float, plan_height: float) -> np.ndarray:
    walls = project["plan"]["walls"]
    min_x = min(point for wall in walls for point in (wall["a"]["x"], wall["b"]["x"]))
    min_y = min(point for wall in walls for point in (wall["a"]["y"], wall["b"]["y"]))
    margin = 36
    scale = min((CANVAS - margin * 2) / plan_width, (CANVAS - margin * 2) / plan_height)
    x_offset = (CANVAS - plan_width * scale) / 2
    y_offset = (CANVAS - plan_height * scale) / 2
    result = np.zeros((CANVAS, CANVAS), dtype=np.uint8)
    for room in project["plan"]["rooms"]:
        polygon = np.array(
            [
                [round(x_offset + (point["x"] - min_x) * scale), round(y_offset + (point["y"] - min_y) * scale)]
                for point in room["polygon"]
            ],
            dtype=np.int32,
        )
        cv2.fillPoly(result, [polygon], 255)
    return result


def opening_metrics(case_id: str, truth_count: int) -> dict:
    review = MANUAL_OPENING_REVIEW[case_id]
    precision = review["matched"] / max(1, review["predicted"])
    recall = review["matched"] / max(1, truth_count)
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    return {
        "truth": truth_count,
        "predicted": review["predicted"],
        "matched": review["matched"],
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "review": "manual side-by-side, no correction",
        "note": review["note"],
    }


def side_by_side(truth_path: Path, generated_path: Path, output_path: Path) -> None:
    truth = cv2.imread(str(truth_path))
    generated = cv2.imread(str(generated_path))
    target_height = 720
    panels = []
    for label, image in (("HOMEPLAN / GROUND TRUTH", truth), ("CODEX IMAGEGEN", generated)):
        scale = target_height / image.shape[0]
        resized = cv2.resize(image, (round(image.shape[1] * scale), target_height), interpolation=cv2.INTER_AREA)
        cv2.rectangle(resized, (0, 0), (resized.shape[1], 42), (23, 32, 25), -1)
        cv2.putText(resized, label, (16, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (185, 242, 39), 2, cv2.LINE_AA)
        panels.append(resized)
    separator = np.full((target_height, 8, 3), 225, dtype=np.uint8)
    cv2.imwrite(str(output_path), np.concatenate([panels[0], separator, panels[1]], axis=1))


def comparison_grid(results: list[dict]) -> None:
    cells: list[np.ndarray] = []
    for item in results:
        image = cv2.imread(str(ROOT / "cases" / item["id"] / "comparison.png"))
        cells.append(cv2.resize(image, (760, 360), interpolation=cv2.INTER_AREA))
    rows = [np.concatenate(cells[index : index + 2], axis=1) for index in range(0, len(cells), 2)]
    cv2.imwrite(str(ROOT / "comparison-grid.png"), np.concatenate(rows, axis=0))


def html_report(payload: dict) -> None:
    summary = payload["summary"]
    rows = "".join(
        f"<tr><td>{item['id']}</td><td>{item['rooms']['truth']} / {item['rooms']['predicted']}</td>"
        f"<td>{item['walls']['f1']:.3f}</td><td>{item['openings']['f1']:.3f}</td>"
        f"<td>{item['shape_iou_after_bbox_alignment']:.3f}</td><td>{item['aspect_error'] * 100:.1f}%</td>"
        f"<td>{item['openings']['note']}</td></tr>"
        for item in payload["results"]
    )
    document = f"""<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HomePlan vs Codex imagegen · 3D→2D benchmark</title><style>
body{{margin:0;background:#f3f0e7;color:#172019;font:15px/1.55 system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:64px 0}}h1{{font-size:clamp(36px,7vw,76px);line-height:.95;letter-spacing:-.06em;max-width:900px}}.lead{{font-size:20px;max-width:800px}}.stats{{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid;margin:42px 0}}.stats div{{padding:20px;border-right:1px solid}}.stats strong{{display:block;font-size:28px}}img{{width:100%;height:auto;border:1px solid}}table{{width:100%;border-collapse:collapse;margin-top:36px;font-size:13px}}th,td{{padding:12px 8px;border-bottom:1px solid #c8c9bc;text-align:left}}th{{background:#172019;color:#f3f0e7}}code{{font-family:Consolas,monospace}}@media(max-width:760px){{.stats{{grid-template-columns:1fr 1fr}}table{{display:block;overflow:auto}}}}</style>
<main><p>EXPLORATORY BENCHMARK · 10 CASES · ONE GENERATION EACH</p><h1>구조는 복원했지만,<br>실측 비율은 흔들렸다.</h1>
<p class="lead">HomePlan은 정답 Project를 직접 렌더하는 상한선이고, Codex imagegen은 3D top + 양방향 iso 픽셀만 보고 2D를 생성했다. 동일한 입력 조건과 고정 프롬프트를 사용했다.</p>
<section class="stats"><div><strong>{summary['exact_room_count']}/10</strong>방 개수 일치</div><div><strong>{summary['mean_wall_f1']:.3f}</strong>벽 F1</div><div><strong>{summary['mean_opening_f1']:.3f}</strong>개구부 F1</div><div><strong>{summary['mean_shape_iou_after_bbox_alignment']:.3f}</strong>정합 후 shape IoU</div><div><strong>{summary['mean_aspect_error'] * 100:.1f}%</strong>평균 종횡비 오차</div></section>
<img src="comparison-grid.png" alt="10개 사례의 HomePlan 정답과 Codex imagegen 결과 비교">
<table><thead><tr><th>Case</th><th>Rooms T/P</th><th>Wall F1</th><th>Opening F1</th><th>Shape IoU</th><th>Aspect err.</th><th>반증</th></tr></thead><tbody>{rows}</tbody></table>
<p>벽 지표는 외곽 bounding-box 정합 뒤 axis-aligned centerline 허용 오차를 적용한 탐색 지표다. 개구부는 comparison 이미지를 수동 대조했으며 수정은 하지 않았다. 한 사례당 1회 생성이라 분산과 재현성은 측정하지 않는다.</p></main></html>"""
    (ROOT / "report.html").write_text(document, encoding="utf8")


def evaluate_case(case_dir: Path) -> dict:
    project = json.loads((case_dir / "project.json").read_text(encoding="utf8"))
    truth, plan_width, plan_height = ground_truth_segments(project)
    generated_path = case_dir / "codex-imagegen.png"
    generated = cv2.imread(str(generated_path))
    mask = threshold_lines(generated)
    raw = hough_segments(mask)
    bbox = structural_bbox(raw, generated.shape[1], generated.shape[0])
    normalized = normalize_segments(raw, bbox, plan_width, plan_height)
    predicted = merge_segments(normalized, plan_width, plan_height)
    metrics = wall_metrics(predicted, truth, plan_width, plan_height)
    truth_mask = render_segments(truth, plan_width, plan_height)
    predicted_mask = render_segments(predicted, plan_width, plan_height)
    predicted_rooms = room_count_from_segments(predicted_mask)
    predicted_interior = interior_mask_from_segments(predicted_mask)
    truth_interior = render_truth_rooms(project, plan_width, plan_height)
    intersection = np.count_nonzero((predicted_interior > 0) & (truth_interior > 0))
    union = np.count_nonzero((predicted_interior > 0) | (truth_interior > 0))
    shape_iou = intersection / max(1, union)
    aspect_truth = plan_width / plan_height
    left, top, right, bottom = bbox
    aspect_predicted = (right - left) / max(1, bottom - top)
    aspect_error = abs(aspect_predicted - aspect_truth) / aspect_truth
    overlay = np.full((CANVAS, CANVAS, 3), 255, dtype=np.uint8)
    overlay[truth_mask > 0] = (50, 70, 220)
    overlay[predicted_mask > 0] = (55, 180, 75)
    overlay[(truth_mask > 0) & (predicted_mask > 0)] = (30, 30, 30)
    cv2.imwrite(str(case_dir / "structure-overlay.png"), overlay)
    side_by_side(case_dir / "ground-truth-2d.png", generated_path, case_dir / "comparison.png")
    return {
        "id": project["id"],
        "label": project["label"],
        "rooms": {"truth": len(project["plan"]["rooms"]), "predicted": int(predicted_rooms)},
        "openings": opening_metrics(project["id"], len(project["plan"]["openings"])),
        "shape_iou_after_bbox_alignment": round(shape_iou, 4),
        "aspect_error": round(aspect_error, 4),
        "walls": metrics,
        "bbox": [round(value, 2) for value in bbox],
    }


def main() -> None:
    results = [evaluate_case(case_dir) for case_dir in sorted((ROOT / "cases").iterdir()) if case_dir.is_dir()]
    summary = {
        "cases": len(results),
        "mean_wall_precision": round(float(np.mean([item["walls"]["precision"] for item in results])), 4),
        "mean_wall_recall": round(float(np.mean([item["walls"]["recall"] for item in results])), 4),
        "mean_wall_f1": round(float(np.mean([item["walls"]["f1"] for item in results])), 4),
        "mean_opening_f1": round(float(np.mean([item["openings"]["f1"] for item in results])), 4),
        "mean_shape_iou_after_bbox_alignment": round(
            float(np.mean([item["shape_iou_after_bbox_alignment"] for item in results])), 4
        ),
        "mean_aspect_error": round(float(np.mean([item["aspect_error"] for item in results])), 4),
        "exact_room_count": int(
            sum(item["rooms"]["truth"] == item["rooms"]["predicted"] for item in results)
        ),
    }
    payload = {"summary": summary, "results": results}
    (ROOT / "metrics.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf8")
    comparison_grid(results)
    html_report(payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
