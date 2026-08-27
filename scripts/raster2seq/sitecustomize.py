"""Report process-local PyTorch CUDA peaks at interpreter shutdown."""

from __future__ import annotations

import atexit
import os


def report_cuda_peak() -> None:
    if os.environ.get("RASTER2SEQ_DISABLE_CUDA_REPORT") == "1":
        return
    try:
        import torch

        if not torch.cuda.is_available():
            return
        print(
            f"TORCH_CUDA_PEAK_ALLOCATED_MIB={torch.cuda.max_memory_allocated() / 1024 / 1024:.1f}",
            flush=True,
        )
        print(
            f"TORCH_CUDA_PEAK_RESERVED_MIB={torch.cuda.max_memory_reserved() / 1024 / 1024:.1f}",
            flush=True,
        )
    except Exception as error:
        print(f"TORCH_CUDA_PEAK_ERROR={error}", flush=True)


if os.environ.get("RASTER2SEQ_DISABLE_CUDA_REPORT") != "1":
    atexit.register(report_cuda_peak)
