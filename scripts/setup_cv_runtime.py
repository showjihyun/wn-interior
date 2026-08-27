"""로컬 CubiCasa 추론 코드와 공식 가중치를 준비한다."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import gdown


REPO = Path(__file__).resolve().parents[1]
RUNTIME = REPO.parent / ".cv-runtime"
CODE = RUNTIME / "CubiCasa5k"
WEIGHTS = RUNTIME / "model_best_val_loss_var.pkl"
WEIGHT_ID = "1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK"


def main() -> None:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if not (CODE / ".git").exists():
        subprocess.run(
            ["git", "clone", "--depth", "1", "https://github.com/CubiCasa/CubiCasa5k.git", str(CODE)],
            check=True,
        )
    if not WEIGHTS.exists():
        gdown.download(id=WEIGHT_ID, output=str(WEIGHTS), quiet=False)
    print(f"코드: {CODE}")
    print(f"가중치: {WEIGHTS}")
    print("준비 완료. `npm run cv:server`로 실행하세요.")


if __name__ == "__main__":
    main()
