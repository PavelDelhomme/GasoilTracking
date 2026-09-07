#!/usr/bin/env bash
# Vérif device complète : purge → sim commute → historique → pas de zombie.
# Usage: ./scripts/device-commute-smoke.sh [serial] [flavor]
set -euo pipefail
SERIAL="${1:-}"
FLAVOR="${2:-preprod}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

case "$FLAVOR" in
  prod) PKG=com.gasoiltracking.app; SCHEME=gasoiltracking ;;
  preprod) PKG=com.gasoiltracking.preprod; SCHEME=gasoiltracking-preprod ;;
  qa) PKG=com.gasoiltracking.qa; SCHEME=gasoiltracking-qa ;;
  admin) PKG=com.gasoiltracking.admin; SCHEME=gasoiltracking-admin ;;
  dev) PKG=com.gasoiltracking.dev; SCHEME=gasoiltracking-dev ;;
  *) echo "flavor inconnu: $FLAVOR"; exit 1 ;;
esac

ADB=(adb)
if [[ -n "$SERIAL" ]]; then ADB=(adb -s "$SERIAL"); fi

# Ouvre une URL deep-link en quotant pour le shell distant (& sinon = background)
open_deeplink() {
  local url="$1"
  # json.dumps-like : guillemets doubles échappés pour am start -d
  local quoted
  quoted=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$url")
  "${ADB[@]}" shell am start -a android.intent.action.VIEW -d "$quoted" -p "$PKG" >/dev/null
}

NONCE=$(date +%s)
OUTDIR="/tmp/gasoil-smoke-${FLAVOR}-${SERIAL:-default}"
mkdir -p "$OUTDIR"

echo "== $FLAVOR on ${SERIAL:-default} =="
"${ADB[@]}" shell pm path "$PKG" | head -1

"${ADB[@]}" shell cmd deviceidle whitelist +"$PKG" 2>/dev/null || true
"${ADB[@]}" shell cmd appops set "$PKG" RUN_ANY_IN_BACKGROUND allow 2>/dev/null || true
"${ADB[@]}" shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
"${ADB[@]}" shell pm grant "$PKG" android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true

echo "== Purge sim =="
open_deeplink "${SCHEME}://trip?purgeSim=1"
sleep 4

echo "== Run sim commute (nonce=$NONCE) — rester au premier plan =="
"${ADB[@]}" logcat -c || true
open_deeplink "${SCHEME}://trip?runSim=1&runSimNonce=${NONCE}"

OK=0
for i in $(seq 1 24); do
  sleep 5
  "${ADB[@]}" shell screencap -p /sdcard/gasoil-smoke.png
  "${ADB[@]}" pull /sdcard/gasoil-smoke.png "$OUTDIR/t${i}.png" >/dev/null
  if "${ADB[@]}" logcat -d -t 80 2>/dev/null | grep -qiE 'Sim commute OK|Sim interrompue|SIMULATEUR commute'; then
    OK=1
    echo "signal toast/log à t=$((i*5))s"
    break
  fi
  # Heuristique UI : Historique après fin de sim
  echo "… wait $((i*5))s"
done

sleep 2
"${ADB[@]}" shell screencap -p /sdcard/gasoil-smoke-final.png
"${ADB[@]}" pull /sdcard/gasoil-smoke-final.png "$OUTDIR/final.png" >/dev/null

echo "== Accueil =="
open_deeplink "${SCHEME}://"
sleep 2
"${ADB[@]}" shell screencap -p /sdcard/gasoil-smoke-home.png
"${ADB[@]}" pull /sdcard/gasoil-smoke-home.png "$OUTDIR/home.png" >/dev/null

echo "== Process =="
"${ADB[@]}" shell pidof "$PKG" && echo OK_PID || echo FAIL_PID

echo "Screenshots: $OUTDIR"
echo "DONE smoke $FLAVOR ok_hint=$OK"
