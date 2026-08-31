import numpy as np


def canonicalize_vertices(vertices: np.ndarray) -> np.ndarray:
    source = np.asarray(vertices, dtype=np.float32)
    return np.column_stack((source[:, 1], source[:, 2], -source[:, 0])).astype(
        np.float32
    )
