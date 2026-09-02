#!/usr/bin/env bash
# Déploiement production VPS (Git pull + docker compose Portainer)
# Utilisé par: make deploy / make update
set -euo pipefail

SSH_HOST="${DEPLOY_SSH:-pavel-server}"
APP_DIR="${DEPLOY_APP_DIR:-/home/pavel/apps/gasoil-tracking}"
COMPOSE_FILE="docker-compose.portainer.yml"
PROJECT="gasoil-tracking"
DOMAIN="${GASOIL_DOMAIN:-gasoil-tracking.delhomme.ovh}"

echo "==> SSH $SSH_HOST → $APP_DIR (Git + compose)"
ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$APP_DIR"
echo "==> git fetch/reset origin/main"
GIT_SSH_COMMAND="ssh -i \$HOME/.ssh/gasoil_tracking_deploy -o IdentitiesOnly=yes" git fetch origin main
git reset --hard origin/main
echo "==> docker compose up --build"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --build
docker ps --filter name=gasoil-tracking --format '{{.Names}} {{.Status}}'
docker exec gasoil-tracking-web wget -qO- http://127.0.0.1/health
echo
REMOTE

echo "==> Health public https://$DOMAIN/health"
sleep 2
curl -sfI "https://$DOMAIN/health" | head -8
curl -sf "https://$DOMAIN/health"
echo
echo "✅ Production à jour: https://$DOMAIN"
