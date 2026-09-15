#!/usr/bin/env bash
# Connexion ADB labo via fichier session + deep-link (évite troncature JWT).
# Usage: ./scripts/adb-login-flavor.sh <flavor> <serial>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLAVOR="${1:?flavor}"
SERIAL="${2:?serial adb}"
cd "$ROOT"

set -a
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"; val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  export "$key=$val"
done < .env
set +a

PKG=$(node -p "require('./lib/appFlavors').resolveFlavor('$FLAVOR').androidPackage")
SCHEME=$(node -p "require('./lib/appFlavors').resolveFlavor('$FLAVOR').scheme")
EMAIL=$(node -p "require('./lib/appFlavors').resolveFlavor('$FLAVOR').defaultLoginEmail")
FOLLOWS_OTA=$(node -p "require('./lib/appFlavors').resolveFlavor('$FLAVOR').followsProdOta ? '1' : '0'")
case "$FLAVOR" in
  qa) PASS="${QA_LAB_PASSWORD:?}" ;;
  admin) PASS="${ADMIN_PASSWORD:?}" ;;
  *) PASS="${PERSONAL_PASSWORD:?}" ;;
esac

API_URL="${EXPO_PUBLIC_API_URL:-https://gasoil-tracking.delhomme.ovh}"
ADB=(adb -s "$SERIAL")
echo "==> $FLAVOR ($PKG) ← $EMAIL on $SERIAL"

if [[ "$FOLLOWS_OTA" == "1" ]]; then
  echo "→ flavor prod : ouverture auth (pas d’injection)"
  "${ADB[@]}" shell am start -a android.intent.action.VIEW -d "${SCHEME}://auth" >/dev/null 2>&1 || true
  echo "LOGIN MANUAL $FLAVOR"
  exit 0
fi

echo "→ login API + push lab-session.json + deep-link"
SESSION_FILE=$(mktemp /tmp/gasoil-lab-session-XXXXXX.json)
EMAIL="$EMAIL" PASS="$PASS" API_URL="$API_URL" OUT="$SESSION_FILE" python3 - <<'PY'
import json, os, urllib.request
api = os.environ['API_URL'].rstrip('/')
req = urllib.request.Request(
    api + '/api/auth/login',
    data=json.dumps({'email': os.environ['EMAIL'], 'password': os.environ['PASS']}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST',
)
with urllib.request.urlopen(req, timeout=30) as r:
    body = json.load(r)
user = body['user']
payload = {
    'token': body['token'],
    'refresh': body.get('refreshToken') or '',
    'user': {
        'id': user['id'],
        'email': user['email'],
        'name': user.get('name') or '',
        'isManager': bool(user.get('isManager')),
    },
}
open(os.environ['OUT'], 'w').write(json.dumps(payload))
print('API OK', user['email'])
PY

REMOTE_DIR="/sdcard/Android/data/${PKG}/files"
REMOTE_FILE="${REMOTE_DIR}/lab-session.json"
"${ADB[@]}" shell mkdir -p "$REMOTE_DIR" >/dev/null 2>&1 || true
"${ADB[@]}" push "$SESSION_FILE" "$REMOTE_FILE" >/dev/null
rm -f "$SESSION_FILE"

"${ADB[@]}" shell am force-stop "$PKG" || true
"${ADB[@]}" shell am start -W -a android.intent.action.VIEW -d "${SCHEME}://lab-session" >/dev/null 2>&1 \
  || "${ADB[@]}" shell am start -a android.intent.action.VIEW -d "${SCHEME}://lab-session" "$PKG" >/dev/null 2>&1
sleep 7

"${ADB[@]}" shell uiautomator dump /sdcard/uidump.xml >/dev/null 2>&1 || true
DUMP=$("${ADB[@]}" exec-out cat /sdcard/uidump.xml 2>/dev/null || true)
if echo "$DUMP" | grep -qiE 'Accueil|Véhicule|menu compte|CONSO|Actualiser|Mon Garage|Peugeot|Budget'; then
  if ! echo "$DUMP" | grep -qiE 'Vos données sont sur le serveur|text="Se connecter"'; then
    echo "LOGIN OK $FLAVOR (lab-session file)"
    exit 0
  fi
fi
echo "LOGIN INCERTAIN $FLAVOR — vérifier UI"
exit 0
