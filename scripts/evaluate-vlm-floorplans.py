"""Evaluate cloud-VLM room polygons under the strict Raster2Seq comparison condition.

This is deliberately a room-polygon-only benchmark. It does not measure successful
2D-to-3D conversion. Both untouched VLM geometry and the selected result after the
same prediction-only repair + safe legacy fallback used by evaluate-raster2seq.py
are retained in the evidence document.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np


EXPECTED_COUNT = 100
SCOPE = "room_polygon_extraction_only_not_full_2d_to_3d"
COMPARISON_CONDITION = "prediction_only_geometry_repair_then_safe_legacy_fallback"


def load_geometry_evaluator():
    """Import the exact geometry, repair, and fallback primitives used by Raster2Seq."""
    source = Path(__file__).with_name("evaluate-raster2seq.py")
    spec = importlib.util.spec_from_file_location("_room_geometry_v1", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load geometry evaluator: {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GEOMETRY = load_geometry_evaluator()


def round4(value: float) -> float:
    return round(float(value), 4)


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.floor((len(ordered) - 1) * p))]


def key_of(row: dict) -> tuple[str, str]:
    return str(row["category"]), str(row["id"])


def unique_row_map(rows: list[dict], source_name: str) -> dict[tuple[str, str], dict]:
    result: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = key_of(row)
        if key in result:
            raise SystemExit(f"{source_name} contains duplicate case {key}")
        result[key] = row
    return result


def validate_exact_case_set(
    prepared: dict, baseline: dict, runtime: dict
) -> tuple[dict[tuple[str, str], dict], dict[tuple[str, str], dict]]:
    if prepared.get("split") != "dev":
        raise SystemExit(f"VLM gate requires the dev split, found {prepared.get('split')!r}")
    cases = prepared.get("cases", [])
    if len(cases) != EXPECTED_COUNT:
        raise SystemExit(f"VLM gate requires exactly {EXPECTED_COUNT} cases, found {len(cases)}")
    prepared_map = unique_row_map(cases, "prepared manifest")
    baseline_map = unique_row_map(baseline["real"]["rows"], "current-hybrid baseline")
    runtime_map = unique_row_map(runtime.get("rows", []), "VLM runtime")
    expected_keys = set(prepared_map)
    if set(baseline_map) != expected_keys:
        raise SystemExit("Current-hybrid baseline case set does not exactly match prepared dev100")
    if set(runtime_map) != expected_keys:
        raise SystemExit("VLM runtime case set does not exactly match prepared dev100")
    return baseline_map, runtime_map


def assert_runtime_provenance(runtime: dict) -> None:
    actual_models = runtime.get("actualModels")
    if not isinstance(actual_models, list) or not actual_models or any(
        not isinstance(model, str) or not model.strip() for model in actual_models
    ):
        raise SystemExit("Runtime provenance requires a nonempty actualModels list")
    if not isinstance(runtime.get("apiRevision"), str) or not runtime["apiRevision"].strip():
        raise SystemExit("Runtime provenance requires a nonempty apiRevision")
    if runtime.get("scope") != SCOPE:
        raise SystemExit("Runtime scope is not explicitly room-polygon-only")
    attempts = runtime.get("physicalHttpAttemptCount")
    maximum = runtime.get("maximumPhysicalHttpAttempts")
    if not isinstance(attempts, int) or not isinstance(maximum, int) or maximum < 1:
        raise SystemExit("Runtime is missing its physical HTTP-attempt accounting")
    if attempts < 0 or attempts > maximum:
        raise SystemExit("Runtime exceeded its declared physical HTTP-attempt cap")


def geometry_summary(rows: list[dict], *, raw: bool) -> dict:
    metrics = [row["raw"] if raw else row for row in rows]
    f1_values = [metric["roomF1At50"] for metric in metrics]
    total_polygons = sum(metric["predictedRooms"] for metric in metrics)
    total_invalid = sum(metric["invalidPolygons"] for metric in metrics)
    return {
        "count": len(rows),
        "roomCountExactRate": round4(mean([float(m["roomCountExact"]) for m in metrics])),
        "roomCountWithinOneRate": round4(
            mean([float(m["roomCountWithinOne"]) for m in metrics])
        ),
        "meanRoomF1At50": round4(mean(f1_values)),
        "medianRoomF1At50": round4(percentile(f1_values, 0.5)),
        "p10RoomF1At50": round4(percentile(f1_values, 0.1)),
        "meanBestRoomIoU": round4(mean([m["meanBestRoomIoU"] for m in metrics])),
        "invalidPolygonRate": round4(mean([m["invalidPolygonRate"] for m in metrics])),
        "globalInvalidPolygonRate": round4(
            total_invalid / total_polygons if total_polygons else 0.0
        ),
        "overlapAffectedPolygonRate": round4(
            mean([m["overlapAffectedPolygonRate"] for m in metrics])
        ),
        "anyOverlapAffectedPolygonRate": round4(
            mean([m["anyOverlapAffectedPolygonRate"] for m in metrics])
        ),
        "outOfBoundsVertexRate": round4(
            mean([m["outOfBoundsVertexRate"] for m in metrics])
        ),
        "meanRoomCoverageRate": round4(mean([m["roomCoverageRate"] for m in metrics])),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("openai", "gemini"), required=True)
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--maximum-mean-request-ms", type=float, default=30000.0)
    args = parser.parse_args()

    prepared_raw = args.prepared.read_bytes()
    prepared_sha256 = hashlib.sha256(prepared_raw).hexdigest()
    prepared = json.loads(prepared_raw)
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    runtime = json.loads(args.runtime.read_text(encoding="utf-8"))
    if runtime.get("provider") != args.provider:
        raise SystemExit(
            f"Runtime provider {runtime.get('provider')!r} does not match {args.provider!r}"
        )
    if runtime.get("preparedManifestSha256") != prepared_sha256:
        raise SystemExit("Runtime prepared-manifest fingerprint does not match evaluator input")
    if runtime.get("fatalError"):
        raise SystemExit("Runtime contains a fatal provider/configuration error")
    if runtime.get("gpuMemory") != "not_applicable_cloud_api":
        raise SystemExit("Cloud VLM runtime must explicitly mark GPU memory as not applicable")
    assert_runtime_provenance(runtime)

    baseline_rows, runtime_rows = validate_exact_case_set(prepared, baseline, runtime)
    rows = []
    for case in prepared["cases"]:
        key = key_of(case)
        prediction_path = args.predictions / f'{case["fileStem"]}.json'
        predicted_rooms = []
        out_of_bounds = 0
        duplicate_vertices_removed = 0
        collinear_vertices_removed = 0
        evaluation_error = None
        try:
            predictions = json.loads(prediction_path.read_text(encoding="utf-8"))
            if not isinstance(predictions, list):
                raise ValueError("Prediction document must be an array")
            for prediction in predictions:
                points = np.asarray(
                    prediction.get("segmentation", []), dtype=np.float64
                ).reshape(-1, 2)
                if len(points) < 3 or not np.isfinite(points).all():
                    continue
                restored, outside = GEOMETRY.inverse_letterbox(
                    points, case["width"], case["height"]
                )
                restored, duplicates = GEOMETRY.remove_duplicate_vertices(restored)
                restored, collinear = GEOMETRY.remove_collinear_vertices(restored)
                if len(restored) < 3:
                    continue
                predicted_rooms.append(restored)
                out_of_bounds += outside
                duplicate_vertices_removed += duplicates
                collinear_vertices_removed += collinear
        except Exception as exc:
            evaluation_error = str(exc)

        gt_rooms = GEOMETRY.parse_gt_rooms(Path(case["svg"]))
        raw_score = GEOMETRY.score_rooms(
            gt_rooms, predicted_rooms, case["width"], case["height"]
        )
        raw_quality = GEOMETRY.polygon_quality(
            predicted_rooms, case["width"], case["height"], out_of_bounds
        )
        provider_row = runtime_rows[key]
        baseline_row = baseline_rows[key]
        api_request_succeeded = bool(provider_row.get("apiRequestSucceeded"))
        room_extraction_succeeded = bool(
            api_request_succeeded
            and provider_row.get("parsedRoomExtractionSucceeded")
            and predicted_rooms
            and raw_quality["invalidPolygons"] < len(predicted_rooms)
            and evaluation_error is None
        )
        raw_metrics = {
            "predictedRooms": len(predicted_rooms),
            "roomCountExact": len(predicted_rooms) == len(gt_rooms),
            "roomCountWithinOne": abs(len(predicted_rooms) - len(gt_rooms)) <= 1,
            **raw_score,
            **raw_quality,
        }

        # Ground truth is never available to this imported prediction-only repair step.
        predicted_rooms, repair_diagnostics = GEOMETRY.repair_polygon_geometry(
            predicted_rooms
        )
        score = GEOMETRY.score_rooms(
            gt_rooms, predicted_rooms, case["width"], case["height"]
        )
        quality = GEOMETRY.polygon_quality(
            predicted_rooms, case["width"], case["height"], out_of_bounds
        )
        baseline_eligible_extraction_succeeded = bool(
            baseline_row.get("conversionSucceeded")
            and room_extraction_succeeded
            and predicted_rooms
            and quality["invalidPolygons"] < len(predicted_rooms)
            and evaluation_error is None
        )
        row = {
            "category": case["category"],
            "id": case["id"],
            "width": case["width"],
            "height": case["height"],
            "gtRooms": len(gt_rooms),
            "predictedRooms": len(predicted_rooms),
            "apiRequestSucceeded": api_request_succeeded,
            "roomExtractionSucceeded": room_extraction_succeeded,
            # This only says extraction is usable where the baseline pipeline was eligible.
            # It is not evidence of successful 3D conversion.
            "baselineEligibleExtractionSucceeded": baseline_eligible_extraction_succeeded,
            "roomCountExact": len(predicted_rooms) == len(gt_rooms),
            "roomCountWithinOne": abs(len(predicted_rooms) - len(gt_rooms)) <= 1,
            **score,
            **quality,
            **repair_diagnostics,
            "raw": raw_metrics,
            "duplicateVerticesRemoved": duplicate_vertices_removed,
            "collinearVerticesRemoved": collinear_vertices_removed,
            "requestElapsedMs": provider_row.get("elapsedMs"),
            "responseStatus": provider_row.get("responseStatus"),
            "actualModel": provider_row.get("actualModel"),
            "fingerprint": provider_row.get("fingerprint"),
            "providerError": provider_row.get("error"),
            "evaluationError": evaluation_error,
        }
        unsafe_candidate = bool(
            quality["invalidPolygons"] > 0
            or quality["severeOverlappingPairs"] > 0
            or quality["outOfBoundsVertexRate"] > 0.02
            or repair_diagnostics["repairUnsafe"]
        )
        row["candidateUnsafe"] = unsafe_candidate
        row["usedFallback"] = False
        if unsafe_candidate:
            # Mirror evaluate-raster2seq.py's safe fallback field-for-field.
            for metric in (
                "predictedRooms",
                "roomCountExact",
                "roomCountWithinOne",
                "matchedRoomsAt50",
                "roomPrecisionAt50",
                "roomRecallAt50",
                "roomF1At50",
                "meanBestRoomIoU",
            ):
                row[f"candidate{metric[0].upper()}{metric[1:]}"] = row[metric]
                row[metric] = baseline_row[metric]
            row["candidateBaselineEligibleExtractionSucceeded"] = row[
                "baselineEligibleExtractionSucceeded"
            ]
            row["baselineEligibleExtractionSucceeded"] = bool(
                baseline_row.get("conversionSucceeded")
            )
            row["invalidPolygons"] = 0
            row["invalidPolygonRate"] = 0.0
            row["severeOverlappingPairs"] = 0
            row["overlapAffectedPolygonRate"] = 0.0
            row["anyOverlapAffectedPolygonRate"] = 0.0
            row["usedFallback"] = True
        rows.append(row)

    common_reliability = {
        "apiRequestSuccessRate": round4(
            mean([float(row["apiRequestSucceeded"]) for row in rows])
        ),
        "roomExtractionSuccessRate": round4(
            mean([float(row["roomExtractionSucceeded"]) for row in rows])
        ),
    }
    raw_summary = {
        **geometry_summary(rows, raw=True),
        **common_reliability,
        "condition": "raw_vlm_output_after_coordinate_restore_and_degenerate_vertex_cleanup",
    }
    summary = {
        **geometry_summary(rows, raw=False),
        **common_reliability,
        "baselineEligibleExtractionSuccessRate": round4(
            mean([float(row["baselineEligibleExtractionSucceeded"]) for row in rows])
        ),
        "duplicateVerticesRemoved": sum(row["duplicateVerticesRemoved"] for row in rows),
        "collinearVerticesRemoved": sum(row["collinearVerticesRemoved"] for row in rows),
        "safeFallbackRate": round4(mean([float(row["usedFallback"]) for row in rows])),
        "invalidPolygonsRepaired": sum(row["invalidPolygonsRepaired"] for row in rows),
        "overlapPolygonsClipped": sum(row["overlapPolygonsClipped"] for row in rows),
        "repairDroppedPolygons": sum(row["repairDroppedPolygons"] for row in rows),
        "repairUnsafeCaseRate": round4(
            mean([float(row["repairUnsafe"]) for row in rows])
        ),
        "meanEndToEndRequestMs": runtime.get("meanEndToEndRequestMs"),
        "p95EndToEndRequestMs": runtime.get("p95EndToEndRequestMs"),
        "wallElapsedSeconds": runtime.get("wallElapsedSeconds"),
        "gpuMemory": "not_applicable_cloud_api",
        "condition": COMPARISON_CONDITION,
    }
    baseline_summary = baseline["real"]["summary"]["overall"]
    thresholds = {
        "minimumRoomF1At50": round4(baseline_summary["meanRoomF1At50"] + 0.10),
        "minimumP10RoomF1At50": baseline_summary["p10RoomF1At50"],
        "minimumApiRequestSuccessRate": 0.98,
        "minimumRoomExtractionSuccessRate": 0.96,
        "minimumBaselineEligibleExtractionSuccessRate": round4(
            max(0.0, baseline_summary["conversionSuccessRate"] - 0.02)
        ),
        "maximumMeanEndToEndRequestMs": args.maximum_mean_request_ms,
        "maximumInvalidPolygonRate": 0.01,
        "maximumOverlapAffectedPolygonRate": 0.05,
    }
    checks = {
        "roomF1": summary["meanRoomF1At50"] >= thresholds["minimumRoomF1At50"],
        "p10RoomF1": summary["p10RoomF1At50"] > thresholds["minimumP10RoomF1At50"],
        "apiReliability": summary["apiRequestSuccessRate"]
        >= thresholds["minimumApiRequestSuccessRate"],
        "roomExtractionReliability": summary["roomExtractionSuccessRate"]
        >= thresholds["minimumRoomExtractionSuccessRate"],
        "baselineEligibleExtraction": summary["baselineEligibleExtractionSuccessRate"]
        >= thresholds["minimumBaselineEligibleExtractionSuccessRate"],
        "cloudEndToEndLatency": summary["meanEndToEndRequestMs"] is not None
        and summary["meanEndToEndRequestMs"] <= thresholds["maximumMeanEndToEndRequestMs"],
        "polygonValidity": summary["invalidPolygonRate"]
        <= thresholds["maximumInvalidPolygonRate"],
        "polygonOverlap": summary["overlapAffectedPolygonRate"]
        <= thresholds["maximumOverlapAffectedPolygonRate"],
    }
    result = {
        "methodologyVersion": 2,
        "scope": SCOPE,
        "geometryMethodology": (
            "same grid-128 IoU@0.5, prediction-only repair, and safe legacy fallback "
            "implementation imported from scripts/evaluate-raster2seq.py"
        ),
        "comparisonCondition": COMPARISON_CONDITION,
        "repairGeometry": True,
        "safeFallback": True,
        "rawVlmOutputIncluded": True,
        "gateProfile": "cloud-vlm-room-polygon-replacement-v2",
        "engine": "Cloud VLM room polygon extractor",
        "provider": args.provider,
        "requestedModel": runtime.get("requestedModel"),
        "actualModels": runtime["actualModels"],
        "apiRevision": runtime["apiRevision"],
        "runFingerprint": runtime.get("runFingerprint"),
        "config": runtime.get("config"),
        "imageSize": GEOMETRY.IMAGE_SIZE,
        "gridResolution": GEOMETRY.GRID,
        "split": prepared["split"],
        "caseSetSha256": runtime.get("caseSetSha256"),
        "preparedManifestSha256": prepared_sha256,
        "applicability": {
            "gpuMemory": "not_applicable_cloud_api",
            "latency": "end_to_end_request_including_network_provider_queue_and_retries",
            "scope": SCOPE,
        },
        "baseline": {"source": str(args.baseline), "summary": baseline_summary},
        "runtime": runtime,
        "rawSummary": raw_summary,
        "summary": summary,
        "thresholds": thresholds,
        "checks": checks,
        "gatePassed": all(checks.values()),
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "scope": SCOPE,
                "rawSummary": raw_summary,
                "selectedSummary": summary,
                "checks": checks,
                "gatePassed": result["gatePassed"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
