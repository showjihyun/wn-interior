#!/usr/bin/env bash
set -euo pipefail

INPUT_DIR="${RASTER2SEQ_INPUT_DIR:-/input}"
OUTPUT_DIR="${RASTER2SEQ_OUTPUT_DIR:-/output}"
CHECKPOINT="${RASTER2SEQ_CHECKPOINT:-/checkpoints/cubicasa5k/checkpoint.pth}"
BATCH_SIZE="${RASTER2SEQ_BATCH_SIZE:-1}"
export PYTHONPATH="${RASTER2SEQ_HOOK_DIR:-/runner}:${PYTHONPATH:-}"

mkdir -p "${OUTPUT_DIR}"
: > "${OUTPUT_DIR}/gpu-memory.csv"
started_ns="$(date +%s%N)"

python3.10 predict.py \
  --dataset_name=cubicasa \
  --dataset_root="${INPUT_DIR}" \
  --checkpoint="${CHECKPOINT}" \
  --output_dir="${OUTPUT_DIR}" \
  --batch_size="${BATCH_SIZE}" \
  --num_workers=0 \
  --semantic_classes=12 \
  --input_channels=3 \
  --poly2seq \
  --seq_len=512 \
  --num_bins=32 \
  --disable_poly_refine \
  --dec_attn_concat_src \
  --per_token_sem_loss \
  --use_anchor \
  --ema4eval \
  --save_pred \
  2>&1 | tee "${OUTPUT_DIR}/inference.log" &
prediction_pid=$!

while kill -0 "${prediction_pid}" 2>/dev/null; do
  # Windows WDDM에서는 compute-apps 메모리가 N/A이므로 GPU 전체 사용량을 기록한다.
  # 다른 GPU 프로세스가 있으면 보수적으로 높게 측정된다.
  nvidia-smi \
    --query-gpu=memory.used \
    --format=csv,noheader,nounits \
    2>/dev/null | awk 'NF { print systime() "," $1 }' >> "${OUTPUT_DIR}/gpu-memory.csv" || true
  sleep 0.2
done

set +e
wait "${prediction_pid}"
status=$?
set -e
ended_ns="$(date +%s%N)"

RASTER2SEQ_DISABLE_CUDA_REPORT=1 python3.10 - "${OUTPUT_DIR}" "${started_ns}" "${ended_ns}" "${status}" <<'PY'
import json
import re
import sys
from pathlib import Path

output = Path(sys.argv[1])
started_ns = int(sys.argv[2])
ended_ns = int(sys.argv[3])
status = int(sys.argv[4])
log = (output / "inference.log").read_text(encoding="utf-8", errors="replace")
match = re.search(r"Total inference time:\s*([0-9.]+)\s*ms", log)
allocated_match = re.search(r"TORCH_CUDA_PEAK_ALLOCATED_MIB=([0-9.]+)", log)
reserved_match = re.search(r"TORCH_CUDA_PEAK_RESERVED_MIB=([0-9.]+)", log)
samples = []
for line in (output / "gpu-memory.csv").read_text(encoding="utf-8", errors="replace").splitlines():
    try:
        samples.append(int(line.rsplit(",", 1)[1].strip()))
    except (IndexError, ValueError):
        pass
runtime = {
    "exitCode": status,
    "wallElapsedSeconds": round((ended_ns - started_ns) / 1_000_000_000, 3),
    "reportedMeanInferenceMs": float(match.group(1)) if match else None,
    "peakGpuMemoryMiB": max(samples) if samples else None,
    "peakTorchAllocatedMiB": float(allocated_match.group(1)) if allocated_match else None,
    "peakTorchReservedMiB": float(reserved_match.group(1)) if reserved_match else None,
    "gpuMemorySamples": len(samples),
}
(output / "runtime.json").write_text(json.dumps(runtime, indent=2), encoding="utf-8")
PY

exit "${status}"
