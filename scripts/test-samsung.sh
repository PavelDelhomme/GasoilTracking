#!/usr/bin/env bash
# Smoke test Samsung + purge données locales de test.
# Usage: bash scripts/test-samsung.sh [serial]
set -euo pipefail
SERIAL="${1:-R5CT7263YJL}"
PKG="com.gasoiltracking.app"
adb=(adb -s "$SERIAL")

echo "==> Device"
"${adb[@]}" get-state >/dev/null
VER=$("${adb[@]}" shell dumpsys package "$PKG" 2>/dev/null | awk -F= '/versionName=/{print $2; exit}')
echo "versionName=$VER"

dump() {
  "${adb[@]}" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  "${adb[@]}" pull /sdcard/ui.xml /tmp/gt-ui.xml >/dev/null 2>&1 || true
}

echo "==> Purge deep-link (si app ouverte avec données)"
"${adb[@]}" shell settings put secure location_mode 3
"${adb[@]}" shell am start -a android.intent.action.VIEW -d "gasoiltracking://trip?purgeSim=1" "$PKG" >/dev/null 2>&1 || true
sleep 4
dump
if grep -q 'Purge test' /tmp/gt-ui.xml 2>/dev/null; then
  echo "PURGE_DIALOG ok"
  "${adb[@]}" shell input tap 873 1299 || true
  sleep 1
fi

echo "==> Clear app data (démo + sims + cache)"
"${adb[@]}" shell am force-stop "$PKG"
"${adb[@]}" shell pm clear "$PKG" >/dev/null
echo "pm clear OK"

echo "==> Relance — état vide attendu"
"${adb[@]}" shell am start -n "$PKG/.MainActivity" >/dev/null
sleep 3
dump
# Dialogues système post-clear
if grep -q 'Ne pas autoriser' /tmp/gt-ui.xml 2>/dev/null; then
  "${adb[@]}" shell input tap 270 1400 2>/dev/null || true
  # try find button
  python3 - <<'PY' 2>/dev/null || true
import re,subprocess
xml=open('/tmp/gt-ui.xml',encoding='utf-8',errors='replace').read()
m=re.search(r'text="Ne pas autoriser"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml) or re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="Ne pas autoriser"', xml)
if m:
  x1,y1,x2,y2=map(int,m.groups()[:4]); subprocess.call(['adb','-s','"'"$SERIAL"'\"','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)])
PY
  sleep 1
  dump
fi
if grep -q 'Aucun véhicule' /tmp/gt-ui.xml || grep -q 'Ajouter un véhicule' /tmp/gt-ui.xml; then
  echo "SMOKE_OK empty state"
else
  echo "SMOKE_WARN unexpected UI:"
  grep -oE 'text="[^"]{3,80}"' /tmp/gt-ui.xml | head -15 || true
fi

echo "==> Permissions (prépare prochain usage)"
"${adb[@]}" shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
"${adb[@]}" shell pm grant "$PKG" android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true
"${adb[@]}" shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS 2>/dev/null || true

echo "DONE"
