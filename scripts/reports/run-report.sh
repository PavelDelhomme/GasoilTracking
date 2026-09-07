#!/usr/bin/env bash
# Pipeline obligatoire : générer PDF → vérifier overflow → (optionnel) envoyer mail.
# Usage:
#   ./scripts/reports/run-report.sh generators/mon-rapport.js
#   ./scripts/reports/run-report.sh generators/mon-rapport.js --mail --subject "Gasoil — rapport"
#   REPORT_OUT=foo.pdf ./scripts/reports/run-report.sh generators/mon-rapport.js --mail
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPORTS="$ROOT/scripts/reports"
OUT_DIR="${REPORT_DIR:-$ROOT/dist/reports}"
mkdir -p "$OUT_DIR"

GENERATOR=""
DO_MAIL=0
SUBJECT="Gasoil Tracking — rapport récapitulatif"
BODY_FILE=""
TO=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mail) DO_MAIL=1; shift ;;
    --subject) SUBJECT="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --to) TO="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$GENERATOR" ]]; then GENERATOR="$1"; shift
      else echo "Arg inconnu: $1" >&2; exit 2
      fi
      ;;
  esac
done

if [[ -z "$GENERATOR" ]]; then
  echo "Usage: $0 <generator.js> [--mail] [--subject ...] [--body-file ...] [--to ...]" >&2
  exit 2
fi

GEN_PATH="$GENERATOR"
[[ "$GEN_PATH" = /* ]] || GEN_PATH="$REPORTS/$GENERATOR"
if [[ ! -f "$GEN_PATH" ]]; then
  # essayer relatif au cwd
  if [[ -f "$ROOT/$GENERATOR" ]]; then GEN_PATH="$ROOT/$GENERATOR"
  else echo "FAIL: générateur introuvable: $GENERATOR" >&2; exit 2
  fi
fi

if [[ ! -d "$REPORTS/node_modules/pdfkit" ]]; then
  echo "==> npm install (pdfkit) dans scripts/reports"
  (cd "$REPORTS" && npm install --no-fund --no-audit)
fi

export REPORT_DIR="$OUT_DIR"
export NODE_PATH="$REPORTS/node_modules${NODE_PATH:+:$NODE_PATH}"
echo "==> Génération PDF via $(basename "$GEN_PATH")"
GEN_JSON="$(cd "$(dirname "$GEN_PATH")" && node "$(basename "$GEN_PATH")")"
echo "$GEN_JSON"
PDF="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["out"])' <<<"$GEN_JSON")"

echo "==> Vérification overflow (marge droite)"
python3 "$REPORTS/verify-overflow.py" "$PDF"

if [[ "$DO_MAIL" -eq 1 ]]; then
  echo "==> Envoi mail"
  ARGS=(--pdf "$PDF" --subject "$SUBJECT")
  [[ -n "$BODY_FILE" ]] && ARGS+=(--body-file "$BODY_FILE")
  [[ -n "$TO" ]] && ARGS+=(--to "$TO")
  node "$REPORTS/send-mail.cjs" "${ARGS[@]}"
else
  echo "==> PDF OK (pas d’envoi mail — ajoute --mail si besoin)"
  echo "PDF=$PDF"
fi
