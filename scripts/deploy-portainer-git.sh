#!/usr/bin/env bash
# Redeploy stack Portainer Git (prod) — delete+recreate pour forcer env + build
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 <<PY
import json, subprocess, urllib.request, urllib.error, time
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
stack = next((s for s in (stacks or []) if s.get("Name") == STACK_NAME), None)
if stack:
    print("delete", api("DELETE", f"/api/stacks/{stack['Id']}?endpointId={ENDPOINT_ID}&external=false"))
    time.sleep(2)

payload = {
    "Name": STACK_NAME,
    "RepositoryURL": "https://github.com/PavelDelhomme/GasoilTracking.git",
    "ComposeFilePathInRepository": "docker-compose.yml",
    "RepositoryReferenceName": BRANCH_REF,
    "RepositoryAuthentication": True,
    "RepositoryUsername": "PavelDelhomme",
    "RepositoryPassword": gh,
    "Env": [
        {"name": "JWT_SECRET", "value": env.get("JWT_SECRET", "change-me")},
        {"name": "APP_VERSION", "value": env.get("APP_VERSION", "1.0.2")},
        {"name": "ADMIN_EMAIL", "value": env.get("ADMIN_EMAIL", "admin@delhomme.ovh")},
        {"name": "INVITE_CODE", "value": env.get("INVITE_CODE", "")},
        {"name": "RELEASE_UPLOAD_TOKEN", "value": env.get("RELEASE_UPLOAD_TOKEN", "")},
        {"name": "ADMIN_PASSWORD", "value": env.get("ADMIN_PASSWORD", "")},
        {"name": "ADMIN_RESET_PASSWORD", "value": env.get("ADMIN_RESET_PASSWORD", "0")},
        {"name": "ADMIN_NAME", "value": env.get("ADMIN_NAME", "Admin")},
        {"name": "SMTP_HOST", "value": env.get("SMTP_HOST", "")},
        {"name": "SMTP_PORT", "value": env.get("SMTP_PORT", "587")},
        {"name": "SMTP_USER", "value": env.get("SMTP_USER", "")},
        {"name": "SMTP_PASS", "value": env.get("SMTP_PASS", "")},
        {"name": "SMTP_FROM", "value": env.get("SMTP_FROM", "Gasoil Tracking <noreply@maily.ovh>")},
        {"name": "SMTP_SECURE", "value": env.get("SMTP_SECURE", "false")},
        {"name": "TRUST_PROXY", "value": "1"},
    ],
}
print("create from", BRANCH_REF)
status, body = api("POST", f"/api/stacks/create/standalone/repository?endpointId={ENDPOINT_ID}", payload)
print("=>", status, body.get("Id") if isinstance(body, dict) else body)
if status not in (200, 201):
    raise SystemExit(1)
print("OK stack", body.get("Id"))
PY

echo "==> Attente conteneurs..."
for i in $(seq 1 24); do
  sleep 10
  if curl -sf "https://gasoil-tracking.delhomme.ovh/health" >/dev/null \
    && curl -sf "https://gasoil-tracking.delhomme.ovh/api/version" >/dev/null; then
    echo "live ok"
    curl -sf "https://gasoil-tracking.delhomme.ovh/api/version"; echo
    exit 0
  fi
  echo "… $i"
done
echo "timeout"; exit 1
