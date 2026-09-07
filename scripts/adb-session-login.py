#!/usr/bin/env python3
"""Connexion labo : login API → deep link verify:// sur le device (sessions séparées par flavor)."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def resolve_flavor(raw: str) -> dict:
    out = subprocess.check_output(
        [
            "node",
            "-e",
            "const {resolveFlavor}=require('./lib/appFlavors');"
            f"console.log(JSON.stringify(resolveFlavor({json.dumps(raw)})))",
        ],
        cwd=str(ROOT),
        text=True,
    )
    return json.loads(out)


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if not line.strip() or line.strip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def api_login(api: str, email: str, password: str) -> dict:
    req = urllib.request.Request(
        f"{api.rstrip('/')}/api/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("flavor")
    ap.add_argument("serial")
    args = ap.parse_args()
    env = load_env()
    flavor = resolve_flavor(args.flavor)
    api = env.get("PUBLIC_URL") or "https://gasoil-tracking.delhomme.ovh"

    if flavor["key"] == "qa":
        email, password = env["QA_LAB_EMAIL"], env["QA_LAB_PASSWORD"]
    elif flavor["key"] == "admin":
        email, password = env["ADMIN_EMAIL"], env["ADMIN_PASSWORD"]
    else:
        email, password = env["PERSONAL_MAIL"], env["PERSONAL_PASSWORD"]

    print(f"==> {flavor['key']} {flavor['androidPackage']} ← {email}")
    try:
        data = api_login(api, email, password)
    except urllib.error.HTTPError as e:
        print("LOGIN_API_FAIL", e.read().decode()[:300], file=sys.stderr)
        return 1

    token = data.get("token") or data.get("accessToken")
    refresh = data.get("refreshToken") or ""
    if not token:
        print("NO_TOKEN", data, file=sys.stderr)
        return 1

    q = urllib.parse.urlencode({"ok": "1", "session": token, "refresh": refresh})
    url = f"{flavor['scheme']}://verify?{q}"
    print(f"deep_link_len={len(url)}")

    # Important : & dans l’URL doit être quoté pour le shell distant
    cmd = (
        f"am start -a android.intent.action.VIEW -d {json.dumps(url)} "
        f"-p {flavor['androidPackage']}"
    )
    subprocess.check_call(
        ["adb", "-s", args.serial, "shell", "am", "force-stop", flavor["androidPackage"]]
    )
    subprocess.check_call(["adb", "-s", args.serial, "shell", cmd])
    print("OK deep-link sent — ouvrir Continuer si besoin")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
