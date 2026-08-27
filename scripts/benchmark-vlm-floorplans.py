"""Benchmark cloud vision models as room-polygon extractors.

Credentials are read only from process environment variables. Provider responses are
not persisted wholesale; only parsed polygons and non-secret response metadata are
written to the caller-selected output directory.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import email.utils
import hashlib
import json
import os
import random
import re
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path


HARNESS_VERSION = 3
HARD_REQUEST_CAP = 100
HARD_HTTP_ATTEMPT_CAP = 100
HARD_MAX_OUTPUT_TOKENS = 32768
OPENAI_API_REVISION = "v1/responses"
GEMINI_API_REVISION = "2026-05-20"
PROVIDER_ENDPOINTS = {
    "openai": "https://api.openai.com/v1/responses",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/interactions",
}

PROMPT = """Analyze this architectural floor-plan image and extract every enclosed interior room.
Return one simple polygon per room boundary. Ignore text, furniture, dimensions, exterior/outdoor
areas, doors, windows, and wall thickness. Coordinates must be integers normalized to the full
input image: x=0 is the left edge, x=1000 the right edge, y=0 the top edge, y=1000 the bottom edge.
Trace the visible inner room boundary accurately. Do not invent rooms that are not enclosed.
"""

POINT_SCHEMA = {
    "type": "object",
    "properties": {
        "x": {"type": "integer", "minimum": 0, "maximum": 1000},
        "y": {"type": "integer", "minimum": 0, "maximum": 1000},
    },
    "required": ["x", "y"],
    "additionalProperties": False,
}

FLOORPLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "rooms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "polygon": {
                        "type": "array",
                        "items": POINT_SCHEMA,
                        "minItems": 3,
                        "maxItems": 100,
                    },
                },
                "required": ["name", "polygon"],
                "additionalProperties": False,
            },
            "maxItems": 100,
        }
    },
    "required": ["rooms"],
    "additionalProperties": False,
}


class ApiRequestError(RuntimeError):
    """Provider request failure with an explicit fail-fast classification."""

    def __init__(self, message: str, *, status_code: int | None = None, fatal: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.fatal = fatal


class PhysicalAttemptBudget:
    """Bound actual HTTP transmissions, including provider retries."""

    def __init__(self, maximum: int):
        self.maximum = maximum
        self.used = 0

    def claim(self) -> None:
        if self.used >= self.maximum:
            raise ApiRequestError(
                f"Physical HTTP-attempt cap ({self.maximum}) exhausted",
                fatal=True,
            )
        self.used += 1


def canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def redact_error(value: str) -> str:
    value = re.sub(r"sk-[A-Za-z0-9_-]{12,}", "[REDACTED_OPENAI_KEY]", value)
    return re.sub(r"AIza[A-Za-z0-9_-]{16,}", "[REDACTED_GOOGLE_KEY]", value)


def retry_delay_seconds(error: urllib.error.HTTPError, attempt: int) -> float:
    retry_after = error.headers.get("Retry-After") if error.headers else None
    if retry_after:
        try:
            return min(60.0, max(0.0, float(retry_after)))
        except ValueError:
            try:
                parsed = email.utils.parsedate_to_datetime(retry_after)
                now = dt.datetime.now(dt.timezone.utc)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=dt.timezone.utc)
                return min(60.0, max(0.0, (parsed - now).total_seconds()))
            except (TypeError, ValueError):
                pass
    return min(30.0, (2**attempt) + random.random())


def post_json(
    url: str,
    headers: dict[str, str],
    payload: dict,
    timeout: int,
    attempt_budget: PhysicalAttemptBudget,
) -> dict:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error: Exception | None = None
    for attempt in range(1, 4):
        attempt_budget.claim()
        request = urllib.request.Request(url, data=encoded, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                parsed = json.loads(response.read().decode("utf-8"))
                if not isinstance(parsed, dict):
                    raise ApiRequestError("Provider returned a non-object JSON response")
                return parsed
        except urllib.error.HTTPError as error:
            body = redact_error(error.read().decode("utf-8", errors="replace"))
            fatal = error.code in {400, 401, 403, 404, 422}
            last_error = ApiRequestError(
                f"HTTP {error.code}: {body[:500]}", status_code=error.code, fatal=fatal
            )
            if fatal or (error.code != 429 and not 500 <= error.code < 600):
                raise last_error
            if attempt < 3:
                time.sleep(retry_delay_seconds(error, attempt))
                continue
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
        if attempt < 3:
            time.sleep(min(30.0, (2**attempt) + random.random()))
    raise ApiRequestError(f"API retries exhausted: {redact_error(str(last_error))}")


def require_completed(response: dict, provider: str) -> None:
    status = response.get("status")
    if status != "completed":
        details = response.get("error") or response.get("incomplete_details") or "no details"
        raise ApiRequestError(
            f"{provider} response status is {status!r}: {redact_error(str(details))}"
        )


def output_text_openai(response: dict) -> str:
    require_completed(response, "OpenAI")
    parts: list[str] = []
    for item in response.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if (
                isinstance(content, dict)
                and content.get("type") == "output_text"
                and isinstance(content.get("text"), str)
            ):
                parts.append(content["text"])
    if not parts:
        raise ApiRequestError("OpenAI completed response has no output_text")
    return "".join(parts)


def output_text_gemini(response: dict) -> str:
    require_completed(response, "Gemini")
    # output_text is an SDK convenience field. Raw REST responses normally use steps.
    if isinstance(response.get("output_text"), str) and response["output_text"]:
        return response["output_text"]
    steps = response.get("steps", [])
    for step in reversed(steps if isinstance(steps, list) else []):
        if not isinstance(step, dict) or step.get("type") != "model_output":
            continue
        parts = [
            content["text"]
            for content in step.get("content", [])
            if isinstance(content, dict)
            and content.get("type") == "text"
            and isinstance(content.get("text"), str)
        ]
        if parts:
            return "".join(parts)
    raise ApiRequestError("Gemini completed response has no model_output text")


def build_openai_payload(image_b64: str, model: str, max_output_tokens: int) -> dict:
    return {
        "model": model,
        "store": False,
        "max_output_tokens": max_output_tokens,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": PROMPT},
                    {
                        "type": "input_image",
                        "image_url": f"data:image/png;base64,{image_b64}",
                        "detail": "high",
                    },
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "floorplan_rooms",
                "strict": True,
                "schema": FLOORPLAN_SCHEMA,
            }
        },
    }


def build_gemini_payload(image_b64: str, model: str, max_output_tokens: int) -> dict:
    return {
        "model": model,
        "store": False,
        "input": [
            {
                "type": "image",
                "mime_type": "image/png",
                "data": image_b64,
                "resolution": "high",
            },
            {"type": "text", "text": PROMPT},
        ],
        "response_format": {
            "type": "text",
            "mime_type": "application/json",
            "schema": FLOORPLAN_SCHEMA,
        },
        "generation_config": {"max_output_tokens": max_output_tokens},
    }


def call_openai(
    image_b64: str,
    model: str,
    timeout: int,
    max_output_tokens: int,
    attempt_budget: PhysicalAttemptBudget,
) -> dict:
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        raise ApiRequestError("OPENAI_API_KEY is not configured", fatal=True)
    return post_json(
        PROVIDER_ENDPOINTS["openai"],
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        build_openai_payload(image_b64, model, max_output_tokens),
        timeout,
        attempt_budget,
    )


def call_gemini(
    image_b64: str,
    model: str,
    timeout: int,
    max_output_tokens: int,
    attempt_budget: PhysicalAttemptBudget,
) -> dict:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise ApiRequestError("GEMINI_API_KEY is not configured", fatal=True)
    return post_json(
        PROVIDER_ENDPOINTS["gemini"],
        {
            "x-goog-api-key": key,
            "Content-Type": "application/json",
            "Api-Revision": GEMINI_API_REVISION,
        },
        build_gemini_payload(image_b64, model, max_output_tokens),
        timeout,
        attempt_budget,
    )


def validate_result(value: object) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get("rooms"), list):
        raise ValueError("Structured response must be an object containing a rooms array")
    return value


def to_letterbox_predictions(
    result: dict, width: int, height: int, image_size: int = 256
) -> list[dict]:
    scale = min(image_size / height, image_size / width)
    new_height = int(height * scale)
    new_width = int(width * scale)
    top = (image_size - new_height) // 2
    left = (image_size - new_width) // 2
    predictions = []
    for index, room in enumerate(result.get("rooms", [])):
        points = room.get("polygon", []) if isinstance(room, dict) else []
        segmentation = []
        for point in points:
            if not isinstance(point, dict):
                continue
            try:
                x = max(0, min(1000, int(point["x"])))
                y = max(0, min(1000, int(point["y"])))
            except (KeyError, TypeError, ValueError):
                continue
            segmentation.append(
                [left + (x / 1000) * new_width, top + (y / 1000) * new_height]
            )
        if len(segmentation) >= 3:
            predictions.append(
                {
                    "image_id": "",
                    "segmentation": segmentation,
                    "category_id": 0,
                    "id": index,
                    "label": str(room.get("name", ""))[:100],
                }
            )
    return predictions


def provider_config(provider: str, model: str, max_output_tokens: int) -> dict:
    return {
        "harnessVersion": HARNESS_VERSION,
        "benchmarkScope": "room_polygon_extraction_only_not_full_2d_to_3d",
        "provider": provider,
        "requestedModel": model,
        "endpoint": PROVIDER_ENDPOINTS[provider],
        "apiRevision": OPENAI_API_REVISION if provider == "openai" else GEMINI_API_REVISION,
        "promptSha256": sha256_bytes(PROMPT.encode("utf-8")),
        "schemaSha256": sha256_bytes(canonical_json(FLOORPLAN_SCHEMA)),
        "imageInput": {"mimeType": "image/png", "resolution": "high"},
        "maxOutputTokens": max_output_tokens,
    }


def case_fingerprint(config: dict, image_sha256: str) -> str:
    return sha256_bytes(canonical_json({"config": config, "imageSha256": image_sha256}))


def case_key(case: dict) -> tuple[str, str]:
    return str(case["category"]), str(case["id"])


def validate_cases(cases: list[dict], required_count: int) -> None:
    if required_count and len(cases) != required_count:
        raise SystemExit(f"Expected exactly {required_count} cases, found {len(cases)}")
    keys = [case_key(case) for case in cases]
    if len(keys) != len(set(keys)):
        raise SystemExit("Prepared benchmark contains duplicate category/id pairs")
    stems = [str(case.get("fileStem", "")) for case in cases]
    if len(stems) != len(set(stems)):
        raise SystemExit("Prepared benchmark contains duplicate fileStem values")
    if any(not re.fullmatch(r"[A-Za-z0-9_.-]+", stem) for stem in stems):
        raise SystemExit("Prepared benchmark contains an unsafe fileStem")


def read_cache(
    prediction_path: Path, metadata_path: Path, fingerprint: str
) -> tuple[list, dict] | None:
    if not prediction_path.exists() or not metadata_path.exists():
        return None
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        predictions = json.loads(prediction_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if metadata.get("fingerprint") != fingerprint or not isinstance(predictions, list):
        return None
    benchmark = metadata.get("benchmark")
    # Completed provider calls, including legitimate empty/parse-failed outputs, are cached.
    if not isinstance(benchmark, dict) or not benchmark.get("apiRequestSucceeded"):
        return None
    return predictions, dict(benchmark)


def response_metadata(provider: str, response: dict | None) -> dict:
    if not response:
        return {"id": None, "status": None, "actualModel": None, "usage": None}
    return {
        "id": response.get("id") or response.get("responseId"),
        "status": response.get("status"),
        "actualModel": response.get("model") or response.get("modelVersion"),
        "usage": response.get("usage")
        or response.get("usage_metadata")
        or response.get("usageMetadata"),
        "provider": provider,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("openai", "gemini"), required=True)
    parser.add_argument("--model")
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--max-output-tokens", type=int, default=16384)
    parser.add_argument("--max-requests", type=int, default=HARD_REQUEST_CAP)
    parser.add_argument("--max-http-attempts", type=int, default=HARD_HTTP_ATTEMPT_CAP)
    parser.add_argument("--require-case-count", type=int, default=0)
    parser.add_argument("--estimated-cost-per-request-usd", type=float, default=0.5)
    parser.add_argument("--max-estimated-cost-usd", type=float, default=50.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    defaults = {"openai": "gpt-5.6-sol", "gemini": "gemini-3.1-pro-preview"}
    model = args.model or defaults[args.provider]
    if not 1 <= args.max_requests <= HARD_REQUEST_CAP:
        raise SystemExit(f"--max-requests must be between 1 and {HARD_REQUEST_CAP}")
    if not 1 <= args.max_http_attempts <= HARD_HTTP_ATTEMPT_CAP:
        raise SystemExit(
            f"--max-http-attempts must be between 1 and {HARD_HTTP_ATTEMPT_CAP}"
        )
    if not 256 <= args.max_output_tokens <= HARD_MAX_OUTPUT_TOKENS:
        raise SystemExit(
            f"--max-output-tokens must be between 256 and {HARD_MAX_OUTPUT_TOKENS}"
        )
    if args.estimated_cost_per_request_usd <= 0 or args.max_estimated_cost_usd <= 0:
        raise SystemExit("Cost estimate and cost cap must both be positive")

    prepared_raw = args.prepared.read_bytes()
    prepared = json.loads(prepared_raw)
    cases = prepared["cases"]
    if args.limit > 0:
        cases = cases[: args.limit]
    validate_cases(cases, args.require_case_count)
    if len(cases) > args.max_requests:
        raise SystemExit(
            f"Request count {len(cases)} exceeds configured cap {args.max_requests}"
        )
    # Retries can be billable transmissions. Estimate against the physical cap rather
    # than only the number of logical benchmark cases.
    maximum_physical_attempts = min(args.max_http_attempts, len(cases) * 3)
    estimated_cost = maximum_physical_attempts * args.estimated_cost_per_request_usd
    if estimated_cost > args.max_estimated_cost_usd + 1e-9:
        raise SystemExit(
            f"Operator estimate ${estimated_cost:.2f} exceeds cap "
            f"${args.max_estimated_cost_usd:.2f}"
        )

    config = provider_config(args.provider, model, args.max_output_tokens)
    run_fingerprint = sha256_bytes(canonical_json(config))
    case_set_sha256 = sha256_bytes(canonical_json([case_key(case) for case in cases]))
    if args.dry_run:
        sample_payload = (
            build_openai_payload("DRY_RUN", model, args.max_output_tokens)
            if args.provider == "openai"
            else build_gemini_payload("DRY_RUN", model, args.max_output_tokens)
        )
        print(
            json.dumps(
                {
                    "dryRun": True,
                    "networkCalls": 0,
                    "scope": "room_polygon_extraction_only_not_full_2d_to_3d",
                    "provider": args.provider,
                    "requestedModel": model,
                    "caseCount": len(cases),
                    "maximumPhysicalHttpAttempts": maximum_physical_attempts,
                    "caseSetSha256": case_set_sha256,
                    "runFingerprint": run_fingerprint,
                    "preparedManifestSha256": sha256_bytes(prepared_raw),
                    "estimatedMaximumCostUsd": round(estimated_cost, 2),
                    "configuredCostCapUsd": args.max_estimated_cost_usd,
                    "store": sample_payload.get("store"),
                    "imageResolution": (
                        sample_payload["input"][0].get("resolution")
                        if args.provider == "gemini"
                        else sample_payload["input"][0]["content"][1].get("detail")
                    ),
                    "maxOutputTokens": args.max_output_tokens,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    required_key = "OPENAI_API_KEY" if args.provider == "openai" else "GEMINI_API_KEY"
    if not os.environ.get(required_key):
        raise SystemExit(
            f"{required_key} is not configured. Set it in the process environment; "
            "do not pass API keys on the command line."
        )

    predictions_dir = args.output / "predictions"
    metadata_dir = args.output / "metadata"
    predictions_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    actual_models: set[str] = set()
    live_request_count = 0
    attempt_budget = PhysicalAttemptBudget(maximum_physical_attempts)
    fatal_error: str | None = None
    started_all = time.perf_counter()
    for index, case in enumerate(cases, 1):
        image_bytes = Path(case["image"]).read_bytes()
        image_sha256 = sha256_bytes(image_bytes)
        fingerprint = case_fingerprint(config, image_sha256)
        prediction_path = predictions_dir / f'{case["fileStem"]}.json'
        metadata_path = metadata_dir / f'{case["fileStem"]}.json'
        cached = read_cache(prediction_path, metadata_path, fingerprint)
        if cached:
            _, cached_row = cached
            cached_row["cached"] = True
            rows.append(cached_row)
            if cached_row.get("actualModel"):
                actual_models.add(cached_row["actualModel"])
            print(f"{args.provider}: {index}/{len(cases)} cached", flush=True)
            continue

        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        started = time.perf_counter()
        error = None
        provider_response = None
        result = {"rooms": []}
        predictions: list[dict] = []
        api_request_succeeded = False
        parsed_room_extraction_succeeded = False
        caught: Exception | None = None
        live_request_count += 1
        try:
            provider_response = (
                call_openai(
                    image_b64,
                    model,
                    args.timeout,
                    args.max_output_tokens,
                    attempt_budget,
                )
                if args.provider == "openai"
                else call_gemini(
                    image_b64,
                    model,
                    args.timeout,
                    args.max_output_tokens,
                    attempt_budget,
                )
            )
            require_completed(provider_response, args.provider)
            api_request_succeeded = True
            output_text = (
                output_text_openai(provider_response)
                if args.provider == "openai"
                else output_text_gemini(provider_response)
            )
            result = validate_result(json.loads(output_text))
            predictions = to_letterbox_predictions(result, case["width"], case["height"])
            for prediction in predictions:
                prediction["image_id"] = case["fileStem"]
            parsed_room_extraction_succeeded = bool(predictions)
        except Exception as exc:  # Persist a sanitized per-case failure before fail-fast.
            caught = exc
            error = redact_error(str(exc))
        elapsed_ms = (time.perf_counter() - started) * 1000
        metadata = response_metadata(args.provider, provider_response)
        if metadata.get("actualModel"):
            actual_models.add(metadata["actualModel"])
        prediction_path.write_text(
            json.dumps(predictions, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        benchmark_row = {
            "category": case["category"],
            "id": case["id"],
            "elapsedMs": round(elapsed_ms, 1),
            "predictedRooms": len(predictions),
            "apiRequestSucceeded": api_request_succeeded,
            "parsedRoomExtractionSucceeded": parsed_room_extraction_succeeded,
            "error": error,
            "fingerprint": fingerprint,
            "imageSha256": image_sha256,
            "actualModel": metadata.get("actualModel"),
            "responseStatus": metadata.get("status"),
            "cached": False,
        }
        metadata_path.write_text(
            json.dumps(
                {
                    "fingerprint": fingerprint,
                    "config": config,
                    "provider": args.provider,
                    "requestedModel": model,
                    "parsed": result,
                    "responseMetadata": metadata,
                    "benchmark": benchmark_row,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        rows.append(benchmark_row)
        print(f"{args.provider}: {index}/{len(cases)} rooms={len(predictions)}", flush=True)
        if isinstance(caught, ApiRequestError) and caught.fatal:
            fatal_error = error or "fatal provider error"
            break

    if fatal_error is None and len(rows) == len(cases) and not actual_models:
        fatal_error = (
            "Provider responses did not identify an actual model; evidence provenance "
            "cannot be established"
        )

    elapsed_values = [row["elapsedMs"] for row in rows]
    successful_elapsed = [
        row["elapsedMs"] for row in rows if row.get("apiRequestSucceeded")
    ]
    runtime = {
        "harnessVersion": HARNESS_VERSION,
        "scope": "room_polygon_extraction_only_not_full_2d_to_3d",
        "provider": args.provider,
        "requestedModel": model,
        "actualModels": sorted(actual_models),
        "apiRevision": config["apiRevision"],
        "runFingerprint": run_fingerprint,
        "caseSetSha256": case_set_sha256,
        "preparedManifestSha256": sha256_bytes(prepared_raw),
        "config": config,
        "count": len(rows),
        "expectedCount": len(cases),
        "liveRequestCount": live_request_count,
        "physicalHttpAttemptCount": attempt_budget.used,
        "maximumPhysicalHttpAttempts": maximum_physical_attempts,
        "cachedCount": sum(bool(row.get("cached")) for row in rows),
        "apiSuccessCount": sum(bool(row.get("apiRequestSucceeded")) for row in rows),
        "parsedRoomExtractionSuccessCount": sum(
            bool(row.get("parsedRoomExtractionSucceeded")) for row in rows
        ),
        "meanEndToEndRequestMs": (
            round(statistics.mean(successful_elapsed), 1) if successful_elapsed else None
        ),
        "meanAllAttemptMs": round(statistics.mean(elapsed_values), 1) if rows else None,
        "p95EndToEndRequestMs": (
            round(sorted(successful_elapsed)[int((len(successful_elapsed) - 1) * 0.95)], 1)
            if successful_elapsed
            else None
        ),
        "wallElapsedSeconds": round(time.perf_counter() - started_all, 3),
        "gpuMemory": "not_applicable_cloud_api",
        "operatorEstimatedCostPerRequestUsd": args.estimated_cost_per_request_usd,
        "operatorEstimatedMaximumCostUsd": round(estimated_cost, 2),
        "configuredCostCapUsd": args.max_estimated_cost_usd,
        "fatalError": fatal_error,
        "rows": rows,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "runtime.json").write_text(
        json.dumps(runtime, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(runtime, ensure_ascii=False, indent=2), flush=True)
    if fatal_error:
        raise SystemExit(
            f"Fatal provider/configuration error; stopped after first failure: {fatal_error}"
        )
    if len(rows) != len(cases):
        raise SystemExit(f"Incomplete run: wrote {len(rows)} of {len(cases)} cases")


if __name__ == "__main__":
    main()
