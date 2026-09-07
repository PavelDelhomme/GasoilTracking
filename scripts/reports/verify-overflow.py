#!/usr/bin/env python3
"""Vérifie qu'aucune encre n'envahit la marge droite d'un PDF (anti-débordement)."""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description="Vérifie overflow horizontal d'un PDF A4")
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--dpi", type=int, default=140)
    ap.add_argument("--right-px", type=int, default=45, help="Bande droite à contrôler (px)")
    ap.add_argument("--max-ink", type=int, default=30, help="Seuil pixels sombres autorisés")
    args = ap.parse_args()

    pdf = args.pdf.resolve()
    if not pdf.is_file():
        print(f"FAIL missing {pdf}", file=sys.stderr)
        return 2

    try:
        from PIL import Image
    except ImportError:
        print("FAIL: Pillow requis (pip install Pillow)", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory(prefix="gt-pdf-") as tmp:
        prefix = Path(tmp) / "page"
        cmd = ["pdftoppm", "-png", "-r", str(args.dpi), str(pdf), str(prefix)]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except FileNotFoundError:
            print("FAIL: pdftoppm manquant (poppler)", file=sys.stderr)
            return 2
        except subprocess.CalledProcessError as e:
            print(f"FAIL pdftoppm: {e.stderr.decode()[:300]}", file=sys.stderr)
            return 2

        pages = sorted(Path(tmp).glob("page-*.png"))
        if not pages:
            print("FAIL: aucune page rendue", file=sys.stderr)
            return 2

        failed = []
        for page in pages:
            im = Image.open(page).convert("L")
            w, h = im.size
            ink = 0
            for y in range(30, h - 40):
                for x in range(w - args.right_px, w):
                    if im.getpixel((x, y)) < 235:
                        ink += 1
            status = "OK" if ink < args.max_ink else "OVERFLOW"
            print(f"{page.name}: right_ink={ink} {status}")
            if status != "OK":
                failed.append(page.name)

        if failed:
            print(f"RESULT FAIL pages={failed}")
            return 1
        print(f"RESULT PASS pages={len(pages)}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
