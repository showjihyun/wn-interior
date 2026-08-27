"""CubiCasa5K ZIP에서 층화된 실제 도면 표본만 HTTP Range로 추출한다.

필요 패키지: remotezip, requests (remotezip 설치 시 함께 설치됨)
데이터는 저장소 밖 ../.datasets/cubicasa5k 에 저장한다.
"""

from __future__ import annotations

import argparse
import json
import struct
import time
import zlib
from pathlib import Path

import requests
from remotezip import RemoteZip


DATASET_URL = "https://zenodo.org/records/2613548/files/cubicasa5k.zip?download=1"
DOI = "10.5281/zenodo.2613548"
LICENSE = "CC BY-NC 4.0"
SELECTION = {
    "high_quality": 362,
    "high_quality_architectural": 362,
    "colorful": 276,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../.datasets/cubicasa5k"),
        help="표본 저장 경로",
    )
    return parser.parse_args()


def download_range(url: str, start: int, end: int, target: Path) -> None:
    expected = end - start + 1
    current = target.stat().st_size if target.exists() else 0
    if current == expected:
        print(f"range cached: {target.name} ({expected / 1024 / 1024:.1f} MiB)", flush=True)
        return
    if current > expected:
        target.unlink()
        current = 0

    headers = {
        "Range": f"bytes={start + current}-{end}",
        "User-Agent": "HomePlan3D-Accuracy-Audit/1.0",
    }
    mode = "ab" if current else "wb"
    with requests.get(url, headers=headers, stream=True, timeout=120) as response:
        response.raise_for_status()
        if response.status_code != 206:
            raise RuntimeError(f"Range 요청 실패: HTTP {response.status_code}")
        downloaded = current
        last_report = time.monotonic()
        with target.open(mode) as out:
            for chunk in response.iter_content(1024 * 1024):
                if not chunk:
                    continue
                out.write(chunk)
                downloaded += len(chunk)
                if time.monotonic() - last_report >= 10:
                    print(
                        f"{target.name}: {downloaded / 1024 / 1024:.1f} / "
                        f"{expected / 1024 / 1024:.1f} MiB",
                        flush=True,
                    )
                    last_report = time.monotonic()
    if target.stat().st_size != expected:
        raise RuntimeError(f"Range 크기 불일치: {target.stat().st_size} != {expected}")


def extract_entry(blob: bytes, range_start: int, info, target: Path) -> None:
    relative = info.header_offset - range_start
    header = blob[relative : relative + 30]
    if len(header) != 30:
        raise RuntimeError(f"로컬 ZIP 헤더 누락: {info.filename}")
    signature, _, flags, compression, _, _, _, _, _, name_len, extra_len = struct.unpack(
        "<IHHHHHIIIHH", header
    )
    if signature != 0x04034B50:
        raise RuntimeError(f"ZIP 서명 불일치: {info.filename}")
    if flags & 0x1:
        raise RuntimeError(f"암호화된 ZIP 항목은 지원하지 않음: {info.filename}")
    data_start = relative + 30 + name_len + extra_len
    compressed = blob[data_start : data_start + info.compress_size]
    if compression == 0:
        raw = compressed
    elif compression == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"미지원 압축 방식 {compression}: {info.filename}")
    if len(raw) != info.file_size:
        raise RuntimeError(f"압축 해제 크기 불일치: {info.filename}")
    if zlib.crc32(raw) & 0xFFFFFFFF != info.CRC:
        raise RuntimeError(f"CRC 불일치: {info.filename}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)


def main() -> None:
    args = parse_args()
    output = args.output.resolve()
    ranges_dir = output / "ranges"
    samples_dir = output / "samples"
    ranges_dir.mkdir(parents=True, exist_ok=True)
    samples_dir.mkdir(parents=True, exist_ok=True)

    print("CubiCasa5K central directory 읽는 중…", flush=True)
    archive = RemoteZip(DATASET_URL)
    infos = archive.infolist()
    info_by_name = {info.filename: info for info in infos}
    case_ids: dict[str, list[str]] = {}
    for info in infos:
        parts = info.filename.split("/")
        if len(parts) == 4 and parts[3] == "F1_scaled.png":
            case_ids.setdefault(parts[1], []).append(parts[2])

    manifest_cases: list[dict[str, object]] = []
    range_manifest: list[dict[str, object]] = []
    for category, count in SELECTION.items():
        selected_ids = case_ids[category][:count]
        selected_infos = []
        for case_id in selected_ids:
            for filename in ("F1_scaled.png", "model.svg"):
                selected_infos.append(
                    info_by_name[f"cubicasa5k/{category}/{case_id}/{filename}"]
                )

        start = min(info.header_offset for info in selected_infos)
        end = max(info.header_offset + info.compress_size + 65536 for info in selected_infos)
        target = ranges_dir / f"{category}-{start}-{end}.bin"
        print(
            f"{category}: {count}건, {(end - start + 1) / 1024 / 1024:.1f} MiB 다운로드",
            flush=True,
        )
        download_range(DATASET_URL, start, end, target)
        blob = target.read_bytes()

        for case_id in selected_ids:
            case_dir = samples_dir / category / case_id
            entries = {}
            for filename in ("F1_scaled.png", "model.svg"):
                info = info_by_name[f"cubicasa5k/{category}/{case_id}/{filename}"]
                extract_entry(blob, start, info, case_dir / filename)
                entries[filename] = {
                    "crc32": f"{info.CRC:08x}",
                    "compressedSize": info.compress_size,
                    "size": info.file_size,
                    "zipOffset": info.header_offset,
                }
            manifest_cases.append(
                {"category": category, "id": case_id, "entries": entries}
            )
        range_manifest.append(
            {"category": category, "count": count, "start": start, "end": end}
        )

    manifest = {
        "dataset": "CubiCasa5K",
        "doi": DOI,
        "license": LICENSE,
        "source": DATASET_URL,
        "selection": "archive-order stratified sample",
        "count": len(manifest_cases),
        "ranges": range_manifest,
        "cases": manifest_cases,
    }
    (output / "sample-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"추출 완료: {len(manifest_cases)}건 → {samples_dir}", flush=True)


if __name__ == "__main__":
    main()
