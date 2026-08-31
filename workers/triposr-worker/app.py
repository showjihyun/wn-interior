import asyncio
import base64
import hashlib
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import rembg
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from huggingface_hub import hf_hub_download
from PIL import Image

from geometry import canonicalize_vertices
from image_metrics import normalized_silhouette_iou

TRIPOSR_ROOT = Path(os.environ.get("TRIPOSR_ROOT", "/opt/TripoSR"))
sys.path.insert(0, str(TRIPOSR_ROOT))

from tsr.system import TSR  # noqa: E402
from tsr.utils import remove_background, resize_foreground  # noqa: E402

MODEL_ID = os.environ.get("TRIPOSR_MODEL_ID", "stabilityai/TripoSR")
MODEL_VERSION = os.environ.get("TRIPOSR_VERSION", "107cefdc244c")
CHUNK_SIZE = int(os.environ.get("TRIPOSR_CHUNK_SIZE", "4096"))
MC_RESOLUTION = int(os.environ.get("TRIPOSR_MC_RESOLUTION", "192"))
MAX_IMAGE_BYTES = int(os.environ.get("TRIPOSR_MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"

app = FastAPI(title="interior3d TripoSR worker", docs_url=None, redoc_url=None)
generation_lock = asyncio.Lock()
model: TSR | None = None
rembg_session: Any = None
model_digest: str | None = None
load_error: str | None = None


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(file: str) -> str:
    digest = hashlib.sha256()
    with open(file, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_runtime() -> None:
    global model, rembg_session, model_digest, load_error
    try:
        weight = hf_hub_download(MODEL_ID, filename="model.ckpt")
        loaded = TSR.from_pretrained(
            MODEL_ID,
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        loaded.renderer.set_chunk_size(CHUNK_SIZE)
        loaded.to(DEVICE)
        model_digest = sha256_file(weight)
        rembg_session = rembg.new_session()
        model = loaded
    except Exception as error:  # startup evidence is returned by /health
        load_error = f"{type(error).__name__}: {error}"


@app.on_event("startup")
async def start_model_load() -> None:
    asyncio.create_task(asyncio.to_thread(load_runtime))


@app.get("/health")
async def health() -> dict[str, Any]:
    gpu = None
    if torch.cuda.is_available():
        gpu = {
            "name": torch.cuda.get_device_name(0),
            "allocatedBytes": torch.cuda.memory_allocated(0),
            "reservedBytes": torch.cuda.memory_reserved(0),
        }
    return {
        "ok": load_error is None,
        "ready": model is not None,
        "model": MODEL_ID,
        "version": MODEL_VERSION,
        "device": DEVICE,
        "chunkSize": CHUNK_SIZE,
        "mcResolution": MC_RESOLUTION,
        "modelDigest": model_digest,
        "error": load_error,
        "gpu": gpu,
    }


def validate_metadata(raw: str, source_sha256: str) -> dict[str, Any]:
    try:
        metadata = json.loads(raw)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="metadata-invalid-json") from error
    allowed = {
        "jobId",
        "productId",
        "productFingerprint",
        "targetDims",
        "sourceImageSha256",
    }
    if set(metadata.keys()) != allowed:
        raise HTTPException(status_code=400, detail="metadata-fields-invalid")
    if metadata.get("sourceImageSha256") != source_sha256:
        raise HTTPException(status_code=400, detail="source-image-sha256-mismatch")
    dims = metadata.get("targetDims")
    if not isinstance(dims, dict) or not all(
        isinstance(dims.get(axis), (int, float)) and dims[axis] > 0
        for axis in ("w", "d", "h")
    ):
        raise HTTPException(status_code=400, detail="target-dims-invalid")
    return metadata


def prepare_image(data: bytes) -> Image.Image:
    source = Image.open(io.BytesIO(data)).convert("RGBA")
    removed = remove_background(source, rembg_session)
    resized = resize_foreground(removed, 0.85)
    rgba = np.asarray(resized).astype(np.float32) / 255.0
    rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1 - rgba[:, :, 3:4]) * 0.5
    return Image.fromarray((rgb * 255.0).astype(np.uint8))


def png_review_view(name: str, image: Image.Image) -> dict[str, str]:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    data = output.getvalue()
    return {
        "name": name,
        "pngBase64": base64.b64encode(data).decode("ascii"),
        "sha256": sha256_bytes(data),
    }


def generate_glb(source: Image.Image) -> tuple[bytes, float, list[dict[str, str]]]:
    if model is None:
        raise RuntimeError("model-not-ready")
    with torch.no_grad():
        scene_codes = model([source], device=DEVICE)
        meshes = model.extract_mesh(scene_codes, True, resolution=MC_RESOLUTION)
        rendered_views = model.render(scene_codes, n_views=4, return_type="pil")[0]
    meshes[0].vertices = canonicalize_vertices(meshes[0].vertices)
    exported = meshes[0].export(file_type="glb")
    glb = exported.encode("utf-8") if isinstance(exported, str) else bytes(exported)
    score = max(normalized_silhouette_iou(source, rendered) for rendered in rendered_views)
    review_views = [png_review_view("processed-input.png", source)]
    review_views.extend(
        png_review_view(f"view-{index:03d}.png", rendered)
        for index, rendered in enumerate(rendered_views)
    )
    del scene_codes, meshes
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return glb, score, review_views


@app.post("/generate")
async def generate(
    metadata: str = Form(...),
    image: UploadFile = File(...),
) -> dict[str, Any]:
    if load_error:
        raise HTTPException(status_code=503, detail=f"model-load-failed:{load_error}")
    if model is None:
        raise HTTPException(status_code=503, detail="model-loading")
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if len(data) == 0 or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image-size-invalid")
    source_sha256 = sha256_bytes(data)
    validate_metadata(metadata, source_sha256)
    async with generation_lock:
        try:
            source = await asyncio.to_thread(prepare_image, data)
            glb, score, review_views = await asyncio.to_thread(generate_glb, source)
        except torch.cuda.OutOfMemoryError as error:
            torch.cuda.empty_cache()
            raise HTTPException(status_code=507, detail="gpu-out-of-memory") from error
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"generation-failed:{type(error).__name__}:{error}",
            ) from error
    return {
        "glbBase64": base64.b64encode(glb).decode("ascii"),
        "contentSha256": sha256_bytes(glb),
        "sourceImageSha256": source_sha256,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "generator": {
            "name": "TripoSR",
            "version": MODEL_VERSION,
            "modelDigest": model_digest,
        },
        "silhouetteIou": score,
        "reviewViews": review_views,
    }
