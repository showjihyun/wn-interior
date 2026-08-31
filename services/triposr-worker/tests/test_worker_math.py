import unittest

import numpy as np
from PIL import Image, ImageDraw

from geometry import canonicalize_vertices
from image_metrics import normalized_silhouette_iou


class WorkerMathTest(unittest.TestCase):
    def test_triposr_z_up_axes_are_mapped_to_three_y_up(self):
        vertices = np.array(
            [
                [-0.5, -1.0, 0.0],
                [0.5, 1.0, 0.5],
            ],
            dtype=np.float32,
        )

        canonical = canonicalize_vertices(vertices)
        extents = canonical.max(axis=0) - canonical.min(axis=0)

        np.testing.assert_allclose(extents, [2.0, 0.5, 1.0])
        self.assertEqual(canonical[0, 2], 0.5)
        self.assertEqual(canonical[1, 2], -0.5)

    def test_silhouette_iou_ignores_background_position_and_scale(self):
        source = Image.new("RGB", (256, 256), (128, 128, 128))
        ImageDraw.Draw(source).rectangle((20, 70, 230, 180), fill=(30, 80, 120))
        rendered = Image.new("RGB", (256, 256), "white")
        ImageDraw.Draw(rendered).rectangle((55, 90, 205, 170), fill=(30, 80, 120))

        score = normalized_silhouette_iou(source, rendered)

        self.assertGreater(score, 0.97)

    def test_different_silhouettes_do_not_score_as_match(self):
        source = Image.new("RGB", (256, 256), (128, 128, 128))
        ImageDraw.Draw(source).rectangle((20, 90, 230, 165), fill=(30, 80, 120))
        rendered = Image.new("RGB", (256, 256), "white")
        ImageDraw.Draw(rendered).ellipse((80, 30, 175, 225), fill=(30, 80, 120))

        score = normalized_silhouette_iou(source, rendered)

        self.assertLess(score, 0.8)


if __name__ == "__main__":
    unittest.main()
