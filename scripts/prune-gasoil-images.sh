#!/usr/bin/env bash
# Sur le VPS : ne garde que la version courante (+ 1 rollback) des images gasoil.
# Usage local : ./scripts/prune-gasoil-images.sh
# Usage VPS   : ssh pavel-server 'bash -s' < scripts/prune-gasoil-images.sh
# Env optionnel : KEEP_N=2 (défaut) — nombre de tags semver à conserver (hors latest).
set -euo pipefail

KEEP_N="${KEEP_N:-2}"

list_semver_tags() {
  local repo="$1"
  docker images --format '{{.Repository}} {{.Tag}}' \
    | awk -v r="$repo" '$1==r && $2 ~ /^[0-9]+\.[0-9]+\.[0-9]+$/ { print $2 }' \
    | sort -t. -k1,1n -k2,2n -k3,3n
}

prune_repo() {
  local repo="$1"
  local tags
  mapfile -t tags < <(list_semver_tags "$repo")
  local n=${#tags[@]}
  if [[ "$n" -eq 0 ]]; then
    echo "(aucune image $repo)"
    return 0
  fi
  local current="${tags[$((n - 1))]}"
  echo "==> $repo : courant $current (garde $KEEP_N dernières + latest)"

  # latest → version courante
  if docker image inspect "${repo}:${current}" >/dev/null 2>&1; then
    docker tag "${repo}:${current}" "${repo}:latest"
  fi

  local start=0
  if [[ "$n" -gt "$KEEP_N" ]]; then
    start=$((n - KEEP_N))
  fi
  local keep=()
  local i
  for ((i = start; i < n; i++)); do
    keep+=("${tags[$i]}")
  done
  keep+=("latest")

  docker images --format '{{.Repository}}:{{.Tag}}' | while read -r ref; do
    case "$ref" in
      "${repo}":*) ;;
      *) continue ;;
    esac
    local tag="${ref#${repo}:}"
    [[ "$tag" == "<none>" ]] && continue
    local ok=0
    local k
    for k in "${keep[@]}"; do
      if [[ "$tag" == "$k" ]]; then ok=1; break; fi
    done
    if [[ "$ok" -eq 0 ]]; then
      echo "rmi $ref"
      docker rmi "$ref" 2>/dev/null || true
    fi
  done
}

echo "==> Prune images gasoil (KEEP_N=$KEEP_N)"
prune_repo gasoil-tracking-web
prune_repo gasoil-tracking-api
docker image prune -f >/dev/null || true
echo "==> Restant :"
docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}' \
  | grep '^gasoil-tracking' || true
