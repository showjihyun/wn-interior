"""Download the fixed, license-checked Wikimedia floor-plan benchmark set."""

from __future__ import annotations

import hashlib
import json
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

import certifi

API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "HomePlan3D-benchmark/1.0 (https://github.com/showjihyun/wn-interior)"
OUTPUT_DIR = Path("e2e/fixtures")
MANIFEST = OUTPUT_DIR / "wikimedia-floorplans.json"
TLS_CONTEXT = ssl.create_default_context(cafile=certifi.where())

CANDIDATES = [
    ("File:178 Central Street Somerville MA.png", "real-wikimedia-somerville.png"),
    ("File:1920 Harris Homes plan M1022.jpg", "real-wikimedia-harris-1920.jpg"),
    ("File:2 bhk Bungalow floor plan.jpg", "real-wikimedia-bungalow-2bhk.jpg"),
    ("File:1930s state house.jpg", "real-wikimedia-state-house-1930.jpg"),
    (
        "File:5 rue de la Tour-des-Dames (Paris) - plan.jpg",
        "real-wikimedia-paris-plan.jpg",
    ),
    ("File:A Divided Apartment (דירה מחולקת).png", "real-wikimedia-divided-apartment.png"),
    ("File:Apartment.png", "real-wikimedia-apartment.png"),
    (
        "File:Apartment plan-Space Settlements A Design Study.png",
        "real-wikimedia-space-apartment.png",
    ),
]

ALLOWED_LICENSE = re.compile(r"^(Public domain|CC0|CC BY(?:-SA)?(?: [0-9.]+)?)$", re.I)


def request_json(params: dict[str, str]) -> dict:
    url = f"{API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30, context=TLS_CONTEXT) as response:
        return json.load(response)


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60, context=TLS_CONTEXT) as response:
        return response.read()


def plain_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", value)).strip()


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    titles = "|".join(title for title, _ in CANDIDATES)
    payload = request_json(
        {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "titles": titles,
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": "1200",
        }
    )
    pages = {page["title"]: page for page in payload["query"]["pages"].values()}
    manifest: list[dict] = []

    for title, filename in CANDIDATES:
        page = pages.get(title)
        if not page or not page.get("imageinfo"):
            raise RuntimeError(f"Wikimedia file missing: {title}")
        info = page["imageinfo"][0]
        metadata = info.get("extmetadata", {})
        license_name = plain_text(metadata.get("LicenseShortName", {}).get("value"))
        if not ALLOWED_LICENSE.match(license_name):
            raise RuntimeError(f"License is not allowed for {title}: {license_name!r}")
        image_url = info.get("thumburl") or info["url"]
        content = download(image_url)
        target = OUTPUT_DIR / filename
        target.write_bytes(content)
        manifest.append(
            {
                "file": filename,
                "commonsTitle": title,
                "sourcePage": info["descriptionurl"],
                "license": license_name,
                "artist": plain_text(metadata.get("Artist", {}).get("value")),
                "originalWidth": info["width"],
                "originalHeight": info["height"],
                "benchmarkWidth": info.get("thumbwidth", info["width"]),
                "benchmarkHeight": info.get("thumbheight", info["height"]),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )
        print(f"downloaded {filename}: {license_name}")

    MANIFEST.write_text(json.dumps({"cases": manifest}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST} ({len(manifest)} cases)")


if __name__ == "__main__":
    main()
