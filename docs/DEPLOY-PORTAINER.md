# Gasoil Tracking — Portainer Git + Nginx Proxy Manager

Déploiement **uniquement via Portainer** (connexion Git directe).  
Les mises à jour = `git push` + `make deploy` (webhook) ou *Pull and redeploy* dans Portainer.

| | |
|--|--|
| Portainer | https://portainer.delhomme.ovh |
| Nginx Proxy Manager | https://nginx.delhomme.ovh |
| Domaine | https://gasoil-tracking.delhomme.ovh |
| Repo Git | https://github.com/PavelDelhomme/GasoilTracking |
| Compose Portainer | `docker-compose.portainer.yml` |

## 1. Créer la stack (une seule fois)

1. https://portainer.delhomme.ovh → **Stacks** → **Add stack**
2. Nom : `gasoil-tracking`
3. Build method : **Repository**
4. Remplir :

| Champ | Valeur |
|-------|--------|
| Repository URL | `https://github.com/PavelDelhomme/GasoilTracking.git` |
| Reference | `refs/heads/main` |
| Compose path | `docker-compose.portainer.yml` |
| Authentication | ON (repo privé) — GitHub user + PAT `repo` |

5. **Deploy the stack** (Portainer clone + `docker build` sur le VPS)
6. Conteneur attendu : `gasoil-tracking-web` sur les réseaux `gasoil-network` + `web`

Vérifier sur le VPS : `docker network inspect web` contient déjà `nginx-proxy-manager_npm_1`.

## 2. Nginx Proxy Manager (une seule fois)

https://nginx.delhomme.ovh → **Proxy Hosts** → **Add** :

| Champ | Valeur |
|-------|--------|
| Domain Names | `gasoil-tracking.delhomme.ovh` |
| Scheme | `http` |
| Forward Hostname | `gasoil-tracking-web` |
| Forward Port | `80` |
| Websockets | ON |
| SSL | Let’s Encrypt + Force SSL |

DNS : enregistrement **A** `gasoil-tracking` → IP du VPS Contabo.

## 3. Webhook Portainer (mises à jour en 1 commande)

1. Portainer → Stack `gasoil-tracking` → **Webhooks** → Create  
2. Copier l’URL du webhook  
3. Localement, dans `.env` (jamais commité) :

```env
PORTAINER_WEBHOOK_URL=https://portainer.delhomme.ovh/api/stacks/webhooks/...
```

4. Workflow :

```bash
# Après tes modifs
make release    # commit si besoin + push GitHub
make deploy     # déclenche le webhook → rebuild / redeploy Portainer
```

Sans webhook : `make release` puis dans Portainer → stack → **Pull and redeploy**.

## 4. Commandes Makefile

```bash
make help
make portainer-info   # valeurs à coller dans Portainer
make release          # push main → GitHub
make deploy           # webhook Portainer (après release)
make update           # release + deploy
make status-prod      # health check https://gasoil-tracking.delhomme.ovh
```

## Architecture

```
git push (main)
    ↓
GitHub PavelDelhomme/GasoilTracking
    ↓  Portainer Git / Webhook
VPS Contabo → build Dockerfile → gasoil-tracking-web:80
    ↓  réseau Docker « web »
NPM → https://gasoil-tracking.delhomme.ovh
```
