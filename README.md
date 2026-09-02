# Gasoil Tracking

Application mobile (iOS & Android) + version web pour suivre la consommation de carburant, les budgets dynamiques et les trajets GPS.

**Domaine** : https://gasoil-tracking.delhomme.ovh  
**Portainer** : https://portainer.delhomme.ovh  
**Nginx Proxy Manager** : https://nginx.delhomme.ovh

## Démarrage rapide

```bash
make help          # toutes les commandes
make install
make start         # Expo / QR code
make mobile-start  # Samsung connecté (ADB)
make docker-up     # Web local → http://localhost:3340
make deploy-portainer  # instructions Portainer + NPM
```

## Fonctionnalités

- Multi-véhicules (anciens et récents) avec conso personnalisée
- Pleins + consommation réelle
- Budget dynamique (recalcul à chaque plein)
- Trajets GPS en arrière-plan + Google Maps
- Export web servi par nginx (Docker / Portainer)

## Déploiement Portainer + NPM

Voir [docs/DEPLOY-PORTAINER.md](docs/DEPLOY-PORTAINER.md).

```bash
# Sur le VPS (réseau « web » déjà créé)
docker compose -f docker-compose.yml -f docker-compose.portainer.yml up -d --build
```

Dans NPM : Proxy Host `gasoil-tracking.delhomme.ovh` → `gasoil-tracking-web:80` + SSL.

## Mobile Samsung

```bash
make mobile-devices
make mobile-install-expo
make mobile-start
```

## Configuration Google Maps

Dans `app.json`, remplace `VOTRE_CLE_GOOGLE_MAPS_ANDROID` / `_IOS` (Google Cloud Console → Maps SDK).

## Stack technique

Expo 52 · React Native · Expo Router · SQLite · Expo Location · React Native Maps · Docker/nginx
