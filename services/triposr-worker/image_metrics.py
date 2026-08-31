import numpy as np
from PIL import Image


def normalized_silhouette_iou(source: Image.Image, rendered: Image.Image) -> float:
    source_mask = foreground_mask(source)
    render_mask = foreground_mask(rendered)
    source_normalized = normalize_mask(source_mask)
    render_normalized = normalize_mask(render_mask)
    union = np.logical_or(source_normalized, render_normalized).sum()
    if union == 0:
        return 0.0
    return float(np.logical_and(source_normalized, render_normalized).sum() / union)


def foreground_mask(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    border = np.concatenate(
        [rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]],
        axis=0,
    )
    background = np.median(border, axis=0)
    return np.max(np.abs(rgb - background), axis=2) > 0.08


def normalize_mask(mask: np.ndarray, size: int = 256) -> np.ndarray:
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        return np.zeros((size, size), dtype=bool)
    cropped = mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    image = Image.fromarray((cropped.astype(np.uint8) * 255), mode="L")
    resized = image.resize((size, size), Image.Resampling.NEAREST)
    return np.asarray(resized) > 0
