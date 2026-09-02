# Gasoil Tracking

Application mobile (iOS & Android) + version web pour suivre la consommation de carburant, les budgets dynamiques et les trajets GPS.

**Domaine** : https://gasoil-tracking.delhomme.ovh  
**Portainer** : https://portainer.delhomme.ovh  
**Nginx Proxy Manager** : https://nginx.delhomme.ovh

## Déploiement (Portainer Git uniquement)

```bash
make portainer-info   # valeurs à coller dans Portainer (1ère fois)
make release          # push main → GitHub
make deploy           # webhook Portainer (rebuild)
make update           # release + deploy
make status-prod      # https://gasoil-tracking.delhomme.ovh
```

Guide : [docs/DEPLOY-PORTAINER.md](docs/DEPLOY-PORTAINER.md)

| | |
|--|--|
| Portainer | https://portainer.delhomme.ovh |
| Nginx PM | https://nginx.delhomme.ovh |
| Domaine | https://gasoil-tracking.delhomme.ovh |
| Compose | `docker-compose.portainer.yml` |

## Démarrage local

```bash
make help
make install
make start              # Expo mobile
make docker-up          # Web local : http://localhost:3340
make mobile-start       # Samsung ADB
```
