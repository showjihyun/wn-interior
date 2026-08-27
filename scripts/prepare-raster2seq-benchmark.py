"""Prepare the exact CubiCasa sample split used by the existing 1,000-case benchmark."""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

from PIL import Image


def select_cases(cases: list[dict], split: str) -> list[dict]:
    if split == "dev":
        return [case for index, case in enumerate(cases) if index % 10 == 0]
    if split == "holdout":
        return [case for index, case in enumerate(cases) if index % 10 != 0]
    return list(cases)


def link_or_copy(source: Path, target: Path) -> None:
    if target.exists():
        return
    try:
        os.link(source, target)
    except OSError:
        shutil.copy2(source, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--split", choices=("dev", "holdout", "all"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    manifest_path = args.dataset_root / "sample-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    selected = select_cases(manifest["cases"], args.split)
    if args.limit > 0:
        selected = selected[: args.limit]
    input_dir = args.output / "input"
    input_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for case in selected:
        category = case["category"]
        case_id = str(case["id"])
        source_dir = args.dataset_root / "samples" / category / case_id
        source_image = source_dir / "F1_scaled.png"
        source_svg = source_dir / "model.svg"
        file_stem = f"{category}__{case_id}"
        target_image = input_dir / f"{file_stem}.png"
        link_or_copy(source_image, target_image)
        with Image.open(source_image) as image:
            width, height = image.size
        rows.append(
            {
                "category": category,
                "id": case_id,
                "fileStem": file_stem,
                "image": str(source_image.resolve()),
                "svg": str(source_svg.resolve()),
                "width": width,
                "height": height,
            }
        )

    prepared = {
        "dataset": manifest["dataset"],
        "datasetLicense": manifest["license"],
        "split": args.split,
        "selection": "manifest index modulo 10; dev=0, holdout=1..9",
        "count": len(rows),
        "cases": rows,
    }
    (args.output / "cases.json").write_text(
        json.dumps(prepared, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"split": args.split, "count": len(rows), "input": str(input_dir)}))


if __name__ == "__main__":
    main()
