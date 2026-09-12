#!/usr/bin/env python3
"""Vérifie qu’un APK release est installable (package, versionCode, ABI, certificat)."""
from __future__ import annotations

import argparse
import hashlib
import sys
import zipfile

from pyaxmlparser import APK

EXPECTED_CERT = "13c3be90a99fb1a944bc5eedd782ae154ac4ab545bc4e92d53ba0040273ea5f2"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("apk")
    p.add_argument("--package", required=True)
    p.add_argument("--version-code", required=True, type=int)
    p.add_argument("--version-name", required=True)
    p.add_argument("--cert-sha256", default=EXPECTED_CERT)
    args = p.parse_args()

    apk = APK(args.apk)
    errors: list[str] = []

    if apk.package != args.package:
        errors.append(f"package {apk.package!r} ≠ {args.package!r}")
    try:
        vc = int(apk.version_code)
    except (TypeError, ValueError):
        vc = -1
        errors.append(f"versionCode illisible ({apk.version_code!r})")
    if vc != args.version_code:
        errors.append(
            f"versionCode APK={vc} ≠ attendu {args.version_code} "
            "(EAS remote a probablement écrasé app.json — OTA Android refuse le downgrade)"
        )
    if str(apk.version_name) != str(args.version_name):
        errors.append(f"versionName {apk.version_name!r} ≠ {args.version_name!r}")

    with zipfile.ZipFile(args.apk) as z:
        libs = {n.split("/")[1] for n in z.namelist() if n.startswith("lib/") and "/" in n[4:]}
    if "arm64-v8a" not in libs:
        errors.append(f"pas de lib/arm64-v8a (ABIs={sorted(libs)})")
    extra = libs - {"arm64-v8a"}
    if extra:
        errors.append(f"ABI en trop {sorted(extra)} (APK multi-ABI)")

    certs = apk.get_certificates() or []
    if not certs:
        errors.append("aucun certificat de signature")
    else:
        der = certs[0].dump() if hasattr(certs[0], "dump") else bytes(certs[0])
        sha = hashlib.sha256(der).hexdigest()
        if sha != args.cert_sha256.lower():
            errors.append(f"cert SHA-256 {sha} ≠ {args.cert_sha256}")

    if errors:
        print("APK REFUSÉ :", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print(
        f"APK OK {apk.package} {apk.version_name} vc{vc} abi={sorted(libs)} cert={args.cert_sha256[:12]}…"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
