#!/usr/bin/env bash
# Installe un APK flavor sur un device ADB.
# Usage: ./scripts/install-flavor.sh <flavor> [serial]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLAVOR="${1:?flavor requis (prod|preprod|dev|feat|qa|admin)}"
SERIAL="${2:-}"
VERSION=$(node -p "require('$ROOT/app.json').expo.version")
APK="$ROOT/dist/gasoil-tracking-${FLAVOR}-${VERSION}.apk"
if [[ ! -f "$APK" ]]; then
  echo "APK manquant: $APK — lance d'abord ./scripts/build-flavor-apk.sh $FLAVOR"
  exit 1
fi
ADB=(adb)
[[ -n "$SERIAL" ]] && ADB=(adb -s "$SERIAL")
PKG=$(APP_FLAVOR="$FLAVOR" node -p "require('$ROOT/lib/appFlavors').resolveFlavor('$FLAVOR').androidPackage")
echo "Install $APK → $PKG on ${SERIAL:-default}"
"${ADB[@]}" install -r "$APK"
echo "OK. Ouvre l’app « $(APP_FLAVOR="$FLAVOR" node -p "require('$ROOT/lib/appFlavors').resolveFlavor('$FLAVOR').name") » et connecte le compte prévu."
