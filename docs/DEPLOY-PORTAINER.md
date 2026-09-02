# Production live

**https://gasoil-tracking.delhomme.ovh** — déployé depuis Git sur le VPS Contabo.

| | |
|--|--|
| Conteneur | `gasoil-tracking-web` (réseaux `gasoil-network` + `web`) |
| Clone Git VPS | `/home/pavel/apps/gasoil-tracking` |
| Compose | `docker-compose.portainer.yml` |
| NPM | Proxy Host → `gasoil-tracking-web:80` + Let's Encrypt |
| DNS | `gasoil-tracking.delhomme.ovh` → `95.111.227.204` |

## Mises à jour (Makefile)

```bash
# Après commit local
make update          # push GitHub + git pull VPS + rebuild
# ou séparément :
make release         # push seulement
make deploy          # rebuild VPS depuis Git
make status-prod     # curl /health
```

`scripts/deploy-vps.sh` : SSH → `git fetch/reset origin/main` → `docker compose -f docker-compose.portainer.yml up -d --build`

## Stack Portainer UI (optionnel)

Le conteneur tourne déjà (compose projet `gasoil-tracking`). Pour le gérer aussi dans Portainer en mode **Repository** :

1. https://portainer.delhomme.ovh → login
2. Stacks → Add stack → Repository  
   - Name: `gasoil-tracking`  
   - URL: `https://github.com/PavelDelhomme/GasoilTracking.git`  
   - Compose: `docker-compose.portainer.yml`  
   - Auth: PAT GitHub  
3. Avant : `make` n’utilise plus le clone local, ou arrête le compose SSH pour éviter le conflit de nom de conteneur.

Sinon, **`make update` suffit** pour les mises à jour en production.
