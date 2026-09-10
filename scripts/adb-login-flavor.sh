#!/usr/bin/env bash
# Connexion ADB UI : lance une flavor et saisit email/mdp depuis .env.
# Usage: ./scripts/adb-login-flavor.sh <flavor> <serial>
# Flavors → compte :
#   prod|preprod|dev|feat → PERSONAL_MAIL / PERSONAL_PASSWORD
#   qa                    → QA_LAB_*
#   admin                 → ADMIN_*
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLAVOR="${1:?flavor}"
SERIAL="${2:?serial adb}"
cd "$ROOT"

# shellcheck disable=SC1091
set -a
# charge .env sans l’exporter
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  export "$key=$val"
done < .env
set +a

PKG=$(node -p "require('./lib/appFlavors').resolveFlavor('$FLAVOR').androidPackage")
EMAIL=$(node -p "require('./lib/appFlavors').resolveFlavor('$FLAVOR').defaultLoginEmail")
case "$FLAVOR" in
  qa) PASS="${QA_LAB_PASSWORD:?}" ;;
  admin) PASS="${ADMIN_PASSWORD:?}" ;;
  *) PASS="${PERSONAL_PASSWORD:?}" ;;
esac

ADB=(adb -s "$SERIAL")
echo "==> $FLAVOR ($PKG) ← $EMAIL on $SERIAL"

"${ADB[@]}" shell am force-stop "$PKG" || true
"${ADB[@]}" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || \
  "${ADB[@]}" shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$PKG" || true
sleep 3

# Si déjà connecté (pas d’écran auth), on sort OK
DUMP=$("${ADB[@]}" exec-out uiautomator dump /dev/tty 2>/dev/null | sed 's/UI hier.*$//' || true)
if echo "$DUMP" | grep -qiE 'Profil|Véhicules|Mon Garage|Trajet|Budget|Accueil'; then
  if ! echo "$DUMP" | grep -qiE 'Connexion|Se connecter|Mot de passe'; then
    echo "Déjà sur l’app (session existante ?) — OK"
    exit 0
  fi
fi

# Focus email : chercher EditText
# Approche robuste : tap zones approximatives + input
# Écran auth : titre en haut, QR, puis email/mdp
# On utilise `input` après taps successifs.

escape_input() {
  # adb input text : espace = %s, @ = \@  (selon version)
  printf '%s' "$1" | sed 's/ /%s/g; s/@/\\@/g; s/&/\\&/g'
}

# Ouvrir section email/mdp si besoin (bouton « Ou avec email »)
"${ADB[@]}" shell input swipe 500 1400 500 400 300 || true
sleep 0.5

# Tap champ email (zone milieu haute typique)
"${ADB[@]}" shell input tap 540 720 || true
sleep 0.3
"${ADB[@]}" shell input keyevent 123 || true # move end
"${ADB[@]}" shell input keyevent KEYCODE_MOVE_END || true
# clear : beaucoup de DEL
for _ in $(seq 1 40); do "${ADB[@]}" shell input keyevent KEYCODE_DEL >/dev/null 2>&1 || true; done
"${ADB[@]}" shell input text "$(escape_input "$EMAIL")" || true
sleep 0.4

# Champ mot de passe (sous email)
"${ADB[@]}" shell input tap 540 860 || true
sleep 0.3
for _ in $(seq 1 40); do "${ADB[@]}" shell input keyevent KEYCODE_DEL >/dev/null 2>&1 || true; done
"${ADB[@]}" shell input text "$(escape_input "$PASS")" || true
sleep 0.4

# Bouton Se connecter — chercher via uiautomator bounds
DUMP2=$("${ADB[@]}" exec-out uiautomator dump /dev/tty 2>/dev/null | tr '\n' ' ' || true)
BOUNDS=$(python3 - <<'PY' "$DUMP2"
import re, sys
xml = sys.argv[1] if len(sys.argv) > 1 else ""
# node with text Se connecter
m = re.search(r'text="Se connecter"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
if not m:
    m = re.search(r'content-desc="Se connecter"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
if not m:
    # sometimes text before bounds order differs
    m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="Se connecter"', xml)
if m:
    x1,y1,x2,y2 = map(int, m.groups())
    print((x1+x2)//2, (y1+y2)//2)
PY
)

if [[ -n "${BOUNDS:-}" ]]; then
  echo "Tap Se connecter @ $BOUNDS"
  # shellcheck disable=SC2086
  "${ADB[@]}" shell input tap $BOUNDS
else
  echo "Bouton non trouvé — tap fallback"
  "${ADB[@]}" shell input tap 540 1100 || true
fi

sleep 4
DUMP3=$("${ADB[@]}" exec-out uiautomator dump /dev/tty 2>/dev/null | tr '\n' ' ' || true)
if echo "$DUMP3" | grep -qiE 'Véhicules|Mon Garage|Trajet|Budget|Profil|Accueil|sync'; then
  echo "LOGIN OK $FLAVOR"
  exit 0
fi
if echo "$DUMP3" | grep -qiE 'incorrect|erreur|invalide|Échec|failed'; then
  echo "LOGIN FAIL (message erreur UI)"
  exit 1
fi
echo "LOGIN INCERTAIN — vérifier manuellement $FLAVOR / $EMAIL"
exit 0
