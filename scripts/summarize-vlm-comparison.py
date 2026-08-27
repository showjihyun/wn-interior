"""Combine aligned dev100 room-polygon metrics with strict provenance checks."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path


EXPECTED_COUNT = 100
SCOPE = "room_polygon_extraction_only_not_full_2d_to_3d"
COMPARISON_CONDITION = "prediction_only_geometry_repair_then_safe_legacy_fallback"


def read_document(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def case_key(row: dict) -> tuple[str, str]:
    return str(row["category"]), str(row["id"])


def exact_case_set(rows: list[dict], source: str) -> set[tuple[str, str]]:
    keys = [case_key(row) for row in rows]
    if len(keys) != EXPECTED_COUNT:
        raise SystemExit(f"{source} must contain exactly {EXPECTED_COUNT} rows, found {len(keys)}")
    if len(keys) != len(set(keys)):
        raise SystemExit(f"{source} contains duplicate category/id pairs")
    return set(keys)


def assert_nonempty_models(document: dict, provider: str) -> None:
    actual_models = document.get("actualModels")
    if not isinstance(actual_models, list) or not actual_models or any(
        not isinstance(model, str) or not model.strip() for model in actual_models
    ):
        raise SystemExit(f"{provider} evidence requires nonempty actualModels provenance")
    if not isinstance(document.get("apiRevision"), str) or not document["apiRevision"].strip():
        raise SystemExit(f"{provider} evidence requires nonempty apiRevision provenance")


def assert_vlm_provenance(document: dict, provider: str) -> None:
    if document.get("engine") != "Cloud VLM room polygon extractor":
        raise SystemExit(f"{provider} evidence has incorrect engine provenance")
    if document.get("provider") != provider:
        raise SystemExit(f"{provider} evidence has incorrect provider provenance")
    if not document.get("requestedModel") or not document.get("runFingerprint"):
        raise SystemExit(f"{provider} evidence is missing model/fingerprint provenance")
    assert_nonempty_models(document, provider)
    if document.get("scope") != SCOPE or document.get("applicability", {}).get("scope") != SCOPE:
        raise SystemExit(f"{provider} evidence is not explicitly room-polygon-only")
    if (
        document.get("repairGeometry") is not True
        or document.get("safeFallback") is not True
        or document.get("comparisonCondition") != COMPARISON_CONDITION
        or document.get("rawVlmOutputIncluded") is not True
        or not isinstance(document.get("rawSummary"), dict)
    ):
        raise SystemExit(f"{provider} evidence does not contain both raw and strict-selected metrics")
    if document.get("summary", {}).get("condition") != COMPARISON_CONDITION:
        raise SystemExit(f"{provider} selected summary uses a mixed comparison condition")
    applicability = document.get("applicability", {})
    if applicability.get("gpuMemory") != "not_applicable_cloud_api":
        raise SystemExit(f"{provider} evidence must mark GPU memory not applicable")


def assert_strict_raster2seq(document: dict) -> None:
    if document.get("engine") != "Raster2Seq CubiCasa5K checkpoint":
        raise SystemExit("Raster2Seq evidence has incorrect engine provenance")
    if document.get("split") != "dev":
        raise SystemExit("Raster2Seq evidence is not the dev split")
    if document.get("repairGeometry") is not True or document.get("safeFallback") is not True:
        raise SystemExit(
            "Raster2Seq evidence must be the strict repair + safe-fallback dev100 result"
        )


def geometry_metrics(summary: dict) -> dict:
    return {
        "meanRoomF1At50": summary.get("meanRoomF1At50"),
        "medianRoomF1At50": summary.get("medianRoomF1At50"),
        "p10RoomF1At50": summary.get("p10RoomF1At50"),
        "meanBestRoomIoU": summary.get("meanBestRoomIoU"),
        "macroInvalidPolygonRate": summary.get("invalidPolygonRate"),
        "overlapAffectedPolygonRate": summary.get("overlapAffectedPolygonRate"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--raster2seq", type=Path, required=True)
    parser.add_argument("--openai", type=Path, required=True)
    parser.add_argument("--gemini", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    baseline_document, baseline_sha = read_document(args.baseline)
    raster2seq_document, raster2seq_sha = read_document(args.raster2seq)
    openai_document, openai_sha = read_document(args.openai)
    gemini_document, gemini_sha = read_document(args.gemini)

    assert_strict_raster2seq(raster2seq_document)
    for provider, document in (("openai", openai_document), ("gemini", gemini_document)):
        if document.get("split") != "dev":
            raise SystemExit(f"{provider} evidence is not the dev split")
        assert_vlm_provenance(document, provider)

    case_sets = {
        "currentHybrid": exact_case_set(baseline_document["real"]["rows"], "baseline"),
        "raster2seq": exact_case_set(raster2seq_document["rows"], "Raster2Seq"),
        "openai": exact_case_set(openai_document["rows"], "OpenAI"),
        "gemini": exact_case_set(gemini_document["rows"], "Gemini"),
    }
    expected_cases = case_sets["currentHybrid"]
    for name, cases in case_sets.items():
        if cases != expected_cases:
            raise SystemExit(f"{name} case set does not exactly match the dev100 baseline")

    manifest_hashes = {
        raster2seq_document.get("preparedManifestSha256"),
        openai_document.get("preparedManifestSha256"),
        gemini_document.get("preparedManifestSha256"),
    }
    if None in manifest_hashes or len(manifest_hashes) != 1:
        raise SystemExit("Prepared-manifest fingerprints differ across evaluated engines")
    grid_resolutions = {
        baseline_document["real"].get("gridResolution"),
        raster2seq_document.get("gridResolution"),
        openai_document.get("gridResolution"),
        gemini_document.get("gridResolution"),
    }
    if grid_resolutions != {128}:
        raise SystemExit(f"Grid methodology mismatch: {sorted(grid_resolutions, key=str)}")

    baseline = baseline_document["real"]["summary"]["overall"]
    raster2seq = raster2seq_document["summary"]
    openai = openai_document["summary"]
    gemini = gemini_document["summary"]
    comparison = {
        "currentHybrid": {
            "condition": "existing_legacy_room_polygon_baseline",
            **geometry_metrics(baseline),
            "localPipelineMeanMs": baseline.get("meanElapsedMs"),
            "localModelInferenceMeanMs": None,
            "cloudEndToEndRequestMeanMs": None,
        },
        "raster2seq": {
            "condition": COMPARISON_CONDITION,
            **geometry_metrics(raster2seq),
            "safeFallbackRate": raster2seq.get("safeFallbackRate"),
            "localPipelineMeanMs": None,
            "localModelInferenceMeanMs": raster2seq.get("reportedMeanInferenceMs"),
            "cloudEndToEndRequestMeanMs": None,
        },
        "openai": {
            "condition": COMPARISON_CONDITION,
            **geometry_metrics(openai),
            "rawVlm": geometry_metrics(openai_document["rawSummary"]),
            "apiRequestSuccessRate": openai.get("apiRequestSuccessRate"),
            "roomExtractionSuccessRate": openai.get("roomExtractionSuccessRate"),
            "baselineEligibleExtractionSuccessRate": openai.get(
                "baselineEligibleExtractionSuccessRate"
            ),
            "safeFallbackRate": openai.get("safeFallbackRate"),
            "localPipelineMeanMs": None,
            "localModelInferenceMeanMs": None,
            "cloudEndToEndRequestMeanMs": openai.get("meanEndToEndRequestMs"),
        },
        "gemini": {
            "condition": COMPARISON_CONDITION,
            **geometry_metrics(gemini),
            "rawVlm": geometry_metrics(gemini_document["rawSummary"]),
            "apiRequestSuccessRate": gemini.get("apiRequestSuccessRate"),
            "roomExtractionSuccessRate": gemini.get("roomExtractionSuccessRate"),
            "baselineEligibleExtractionSuccessRate": gemini.get(
                "baselineEligibleExtractionSuccessRate"
            ),
            "safeFallbackRate": gemini.get("safeFallbackRate"),
            "localPipelineMeanMs": None,
            "localModelInferenceMeanMs": None,
            "cloudEndToEndRequestMeanMs": gemini.get("meanEndToEndRequestMs"),
        },
    }
    base_f1 = baseline["meanRoomF1At50"]
    for name in ("raster2seq", "openai", "gemini"):
        value = comparison[name]["meanRoomF1At50"]
        comparison[name]["roomF1DeltaVsCurrent"] = (
            round(value - base_f1, 4) if value is not None else None
        )

    sorted_cases = sorted([list(key) for key in expected_cases])
    result = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "scope": SCOPE,
        "scopeDisclosure": (
            "Room-polygon extraction only. No metric in this document establishes a "
            "successful complete 2D-to-3D conversion."
        ),
        "methodology": (
            "Exact same CubiCasa dev100 case set and grid-128 room IoU@0.5. Raster2Seq "
            "and each VLM selected result use prediction-only geometry repair followed by "
            "safe fallback to the same per-case legacy baseline; raw VLM metrics are nested "
            "separately and are not mixed into selected-result comparisons."
        ),
        "comparisonCondition": COMPARISON_CONDITION,
        "raster2seqEvidenceProfile": "repairGeometry=true,safeFallback=true",
        "caseCount": EXPECTED_COUNT,
        "caseSetSha256": hashlib.sha256(
            json.dumps(sorted_cases, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "preparedManifestSha256": next(iter(manifest_hashes)),
        "provenance": {
            "currentHybrid": {
                "engine": baseline_document.get("engine"),
                "sourceSha256": baseline_sha,
            },
            "raster2seq": {
                "engine": raster2seq_document.get("engine"),
                "commit": raster2seq_document.get("raster2seqCommit"),
                "checkpoint": raster2seq_document.get("checkpoint"),
                "repairGeometry": raster2seq_document.get("repairGeometry"),
                "safeFallback": raster2seq_document.get("safeFallback"),
                "sourceSha256": raster2seq_sha,
            },
            "openai": {
                "engine": openai_document.get("engine"),
                "provider": openai_document.get("provider"),
                "requestedModel": openai_document.get("requestedModel"),
                "actualModels": openai_document["actualModels"],
                "apiRevision": openai_document["apiRevision"],
                "runFingerprint": openai_document.get("runFingerprint"),
                "sourceSha256": openai_sha,
            },
            "gemini": {
                "engine": gemini_document.get("engine"),
                "provider": gemini_document.get("provider"),
                "requestedModel": gemini_document.get("requestedModel"),
                "actualModels": gemini_document["actualModels"],
                "apiRevision": gemini_document["apiRevision"],
                "runFingerprint": gemini_document.get("runFingerprint"),
                "sourceSha256": gemini_sha,
            },
        },
        "latencyWarning": (
            "Local pipeline/model timings and cloud end-to-end request timings are intentionally "
            "separate and must not be compared as the same inference metric."
        ),
        "comparison": comparison,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
