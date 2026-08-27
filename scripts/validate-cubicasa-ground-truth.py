"""감사 JSON의 SVG ground truth 파서가 CubiCasa 공식 House 로더와 일치하는지 검증."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2


REPO = Path(__file__).resolve().parents[1]
DATASET = (REPO.parent / ".datasets" / "cubicasa5k").resolve()
OFFICIAL_CODE = DATASET / "code"
sys.path.insert(0, str(OFFICIAL_CODE))

from floortrans.loaders.house import House, rooms_selected  # noqa: E402


def main() -> None:
    evidence_path = REPO / "docs" / "evidence" / "cv-accuracy-latest.json"
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    rows = evidence["real"]["rows"]
    # 세 유형 전체에 걸쳐 일정 간격으로 100건 선택
    indexes = [round(i * (len(rows) - 1) / 99) for i in range(100)]
    results = []
    for n, index in enumerate(indexes, 1):
        row = rows[index]
        case_dir = DATASET / "samples" / row["category"] / row["id"]
        image = cv2.imread(str(case_dir / "F1_scaled.png"))
        if image is None:
            raise RuntimeError(f"이미지 로드 실패: {case_dir}")
        height, width = image.shape[:2]
        house = House(str(case_dir / "model.svg"), height, width)
        official_rooms = sum(room != rooms_selected["Outdoor"] for room in house.room_types)
        official_walls = sum(wall.name == "Wall" for wall in house.wall_objs)
        results.append(
            {
                "category": row["category"],
                "id": row["id"],
                "auditRooms": row["gtRooms"],
                "officialRooms": official_rooms,
                "auditWalls": row["gtWalls"],
                "officialWalls": official_walls,
            }
        )
        if n % 10 == 0:
            print(f"official loader: {n}/100", flush=True)

    summary = {
        "count": len(results),
        "roomCountExact": sum(r["auditRooms"] == r["officialRooms"] for r in results),
        "wallCountExact": sum(r["auditWalls"] == r["officialWalls"] for r in results),
        "maxRoomCountDifference": max(
            abs(r["auditRooms"] - r["officialRooms"]) for r in results
        ),
        "maxWallCountDifference": max(
            abs(r["auditWalls"] - r["officialWalls"]) for r in results
        ),
    }
    output = {"summary": summary, "rows": results}
    target = REPO / "docs" / "evidence" / "cv-evaluation-ground-truth-check.json"
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
