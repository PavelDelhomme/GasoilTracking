#!/usr/bin/env bash
# Redeploy la stack Portainer Git (branche prod) — sans webhook
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 <<'PY'
import json, subprocess, urllib.request, urllib.error
from pathlib import Path

root = Path(r"/home/pactivisme/Documents/Dev/Perso/GasoilTracking")
env = {}
for line in (root / ".env").read_text().splitlines():
    if not line.strip() or line.strip().startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k] = v.strip().strip('"').strip("'")

base = env["PORTAINER_URL"].rstrip("/")
token = env["PORTAINER_ACCESS_TOKEN"]
gh = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
STACK_NAME = "gasoil-tracking"
ENDPOINT_ID = 2
BRANCH_REF = "refs/heads/prod"


def api(method, path, data=None, timeout=900):
    req = urllib.request.Request(
        base + path,
        data=None if data is None else json.dumps(data).encode(),
        method=method,
        headers={"X-API-Key": token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
            return r.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            body = json.loads(body)
        except Exception:
            pass
        return e.code, body


status, stacks = api("GET", "/api/stacks")
if status != 200:
    raise SystemExit(f"Impossible de lister les stacks: {status} {stacks}")

stack = next((s for s in stacks if s.get("Name") == STACK_NAME), None)
if not stack:
    print("Stack absente → création Git (prod)")
    payload = {
        "Name": STACK_NAME,
        "RepositoryURL": "https://github.com/PavelDelhomme/GasoilTracking.git",
        "ComposeFilePathInRepository": "docker-compose.yml",
        "RepositoryReferenceName": BRANCH_REF,
        "RepositoryAuthentication": True,
        "RepositoryUsername": "PavelDelhomme",
        "RepositoryPassword": gh,
    }
    status, body = api(
        "POST",
        f"/api/stacks/create/standalone/repository?endpointId={ENDPOINT_ID}",
        payload,
    )
    print("create", status, body.get("Id") if isinstance(body, dict) else body)
    if status not in (200, 201):
        raise SystemExit(1)
else:
    sid = stack["Id"]
    print(f"Redeploy stack #{sid} depuis {BRANCH_REF}")
    # Met à jour la référence git + pull/rebuild
    payload = {
        "RepositoryReferenceName": BRANCH_REF,
        "RepositoryAuthentication": True,
        "RepositoryUsername": "PavelDelhomme",
        "RepositoryPassword": gh,
        "PullImage": True,
        "ReuseStackEnvVars": True,
    }
    # Essais chemins API 2.19 / 2.45
    for path in (
        f"/api/stacks/{sid}/git/redeploy?endpointId={ENDPOINT_ID}",
        f"/api/stacks/{sid}/git?endpointId={ENDPOINT_ID}",
    ):
        status, body = api("PUT" if "/git?" in path and "redeploy" not in path else "PUT", path, payload)
        # certains endpoints veulent POST
        if status in (404, 405):
            status, body = api("POST", path, payload)
        print(path, "=>", status, str(body)[:200] if body else "")
        if status in (200, 201, 204):
            break
    else:
        # fallback: delete + recreate
        print("Fallback delete+create")
        api("DELETE", f"/api/stacks/{sid}?endpointId={ENDPOINT_ID}&external=false")
        status, body = api(
            "POST",
            f"/api/stacks/create/standalone/repository?endpointId={ENDPOINT_ID}",
            {
                "Name": STACK_NAME,
                "RepositoryURL": "https://github.com/PavelDelhomme/GasoilTracking.git",
                "ComposeFilePathInRepository": "docker-compose.yml",
                "RepositoryReferenceName": BRANCH_REF,
                "RepositoryAuthentication": True,
                "RepositoryUsername": "PavelDelhomme",
                "RepositoryPassword": gh,
            },
        )
        print("recreate", status, body.get("Id") if isinstance(body, dict) else body)
        if status not in (200, 201):
            raise SystemExit(1)

print("OK")
PY

echo "==> Health"
sleep 3
curl -sf "https://${GASOIL_DOMAIN:-gasoil-tracking.delhomme.ovh}/health" && echo " web ok"
curl -sf "https://${GASOIL_DOMAIN:-gasoil-tracking.delhomme.ovh}/api/version" | head -c 300; echo
