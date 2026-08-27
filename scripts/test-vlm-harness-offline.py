"""Offline regression checks for the VLM benchmark safety/provenance gates."""

from __future__ import annotations

import importlib.util
import contextlib
import hashlib
import io
import json
import sys
import tempfile
import urllib.error
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS = Path(__file__).resolve().parent
REPOSITORY = SCRIPTS.parent


def load_script(filename: str, module_name: str):
    source = SCRIPTS / filename
    spec = importlib.util.spec_from_file_location(module_name, source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BENCHMARK = load_script("benchmark-vlm-floorplans.py", "_vlm_benchmark_test")
EVALUATOR = load_script("evaluate-vlm-floorplans.py", "_vlm_evaluator_test")
SUMMARIZER = load_script("summarize-vlm-comparison.py", "_vlm_summarizer_test")


class VlmHarnessOfflineTests(unittest.TestCase):
    def test_physical_attempt_cap_counts_retries(self) -> None:
        calls = 0

        def fail_offline(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            raise urllib.error.URLError("offline test")

        budget = BENCHMARK.PhysicalAttemptBudget(2)
        with mock.patch.object(BENCHMARK.urllib.request, "urlopen", fail_offline), mock.patch.object(
            BENCHMARK.time, "sleep", lambda *_args: None
        ):
            with self.assertRaises(BENCHMARK.ApiRequestError) as caught:
                BENCHMARK.post_json("https://invalid.test", {}, {}, 1, budget)
        self.assertTrue(caught.exception.fatal)
        self.assertEqual(calls, 2)
        self.assertEqual(budget.used, 2)

    def test_evaluator_rejects_empty_actual_models(self) -> None:
        runtime = {
            "actualModels": [],
            "apiRevision": "v1",
            "scope": EVALUATOR.SCOPE,
            "physicalHttpAttemptCount": 0,
            "maximumPhysicalHttpAttempts": 100,
        }
        with self.assertRaises(SystemExit):
            EVALUATOR.assert_runtime_provenance(runtime)

    def test_evaluator_accepts_capped_room_only_provenance(self) -> None:
        runtime = {
            "actualModels": ["provider-reported-model"],
            "apiRevision": "v1",
            "scope": EVALUATOR.SCOPE,
            "physicalHttpAttemptCount": 2,
            "maximumPhysicalHttpAttempts": 100,
        }
        EVALUATOR.assert_runtime_provenance(runtime)

    def test_summarizer_rejects_mixed_geometry_condition(self) -> None:
        document = {
            "engine": "Cloud VLM room polygon extractor",
            "provider": "openai",
            "requestedModel": "requested",
            "actualModels": ["actual"],
            "apiRevision": "v1",
            "runFingerprint": "fingerprint",
            "scope": SUMMARIZER.SCOPE,
            "applicability": {
                "scope": SUMMARIZER.SCOPE,
                "gpuMemory": "not_applicable_cloud_api",
            },
            "repairGeometry": True,
            "safeFallback": True,
            "comparisonCondition": "raw_without_fallback",
            "rawVlmOutputIncluded": True,
            "rawSummary": {},
            "summary": {"condition": "raw_without_fallback"},
        }
        with self.assertRaises(SystemExit):
            SUMMARIZER.assert_vlm_provenance(document, "openai")

    def test_strict_raster2seq_profile_is_required(self) -> None:
        document = {
            "engine": "Raster2Seq CubiCasa5K checkpoint",
            "split": "dev",
            "repairGeometry": True,
            "safeFallback": False,
        }
        with self.assertRaises(SystemExit):
            SUMMARIZER.assert_strict_raster2seq(document)

    def test_evaluator_emits_raw_and_strict_selected_room_only_metrics(self) -> None:
        prepared_path = REPOSITORY.parent / ".datasets" / "vlm-benchmark" / "dev-100" / "cases.json"
        baseline_path = REPOSITORY / "docs" / "evidence" / "cv-stage1-openings-dev.json"
        if not prepared_path.exists() or not baseline_path.exists():
            self.skipTest("Local dev100 benchmark fixture is not installed")
        prepared_raw = prepared_path.read_bytes()
        prepared = json.loads(prepared_raw)
        rows = [
            {
                "category": case["category"],
                "id": case["id"],
                "elapsedMs": 1.0,
                "apiRequestSucceeded": True,
                "parsedRoomExtractionSucceeded": False,
                "actualModel": "offline-fixture-model",
            }
            for case in prepared["cases"]
        ]
        runtime = {
            "harnessVersion": 3,
            "scope": EVALUATOR.SCOPE,
            "provider": "openai",
            "requestedModel": "offline-requested-model",
            "actualModels": ["offline-fixture-model"],
            "apiRevision": "offline-v1",
            "runFingerprint": "offline-fingerprint",
            "caseSetSha256": "offline-case-set",
            "preparedManifestSha256": hashlib.sha256(prepared_raw).hexdigest(),
            "config": {},
            "physicalHttpAttemptCount": 0,
            "maximumPhysicalHttpAttempts": 100,
            "meanEndToEndRequestMs": 1.0,
            "p95EndToEndRequestMs": 1.0,
            "wallElapsedSeconds": 0.1,
            "gpuMemory": "not_applicable_cloud_api",
            "fatalError": None,
            "rows": rows,
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            predictions = root / "predictions"
            predictions.mkdir()
            for case in prepared["cases"]:
                (predictions / f'{case["fileStem"]}.json').write_text("[]", encoding="utf-8")
            runtime_path = root / "runtime.json"
            output_path = root / "evidence.json"
            runtime_path.write_text(json.dumps(runtime), encoding="utf-8")
            argv = [
                "evaluate-vlm-floorplans.py",
                "--provider",
                "openai",
                "--prepared",
                str(prepared_path),
                "--predictions",
                str(predictions),
                "--runtime",
                str(runtime_path),
                "--baseline",
                str(baseline_path),
                "--output",
                str(output_path),
            ]
            with mock.patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()):
                EVALUATOR.main()
            evidence_text = output_path.read_text(encoding="utf-8")
            evidence = json.loads(evidence_text)
            self.assertEqual(evidence["scope"], EVALUATOR.SCOPE)
            self.assertTrue(evidence["rawVlmOutputIncluded"])
            self.assertEqual(
                evidence["summary"]["condition"], EVALUATOR.COMPARISON_CONDITION
            )
            self.assertNotIn("hybridConversion", evidence_text)

            gemini_evidence = json.loads(evidence_text)
            gemini_evidence["provider"] = "gemini"
            gemini_evidence["requestedModel"] = "offline-gemini-requested"
            gemini_evidence["actualModels"] = ["offline-gemini-actual"]
            gemini_evidence["apiRevision"] = "offline-gemini-v1"
            gemini_evidence["runFingerprint"] = "offline-gemini-fingerprint"
            gemini_path = root / "gemini-evidence.json"
            gemini_path.write_text(json.dumps(gemini_evidence), encoding="utf-8")
            comparison_path = root / "comparison.json"
            summary_argv = [
                "summarize-vlm-comparison.py",
                "--baseline",
                str(baseline_path),
                "--raster2seq",
                str(
                    REPOSITORY
                    / "docs"
                    / "evidence"
                    / "raster2seq-repair-strict-dev100.json"
                ),
                "--openai",
                str(output_path),
                "--gemini",
                str(gemini_path),
                "--output",
                str(comparison_path),
            ]
            with mock.patch.object(sys, "argv", summary_argv), contextlib.redirect_stdout(
                io.StringIO()
            ):
                SUMMARIZER.main()
            comparison_text = comparison_path.read_text(encoding="utf-8")
            comparison = json.loads(comparison_text)
            self.assertEqual(comparison["scope"], SUMMARIZER.SCOPE)
            self.assertEqual(
                comparison["comparison"]["raster2seq"]["condition"],
                SUMMARIZER.COMPARISON_CONDITION,
            )
            self.assertIn("rawVlm", comparison["comparison"]["openai"])
            self.assertNotIn("hybridConversion", comparison_text)


if __name__ == "__main__":
    unittest.main()
