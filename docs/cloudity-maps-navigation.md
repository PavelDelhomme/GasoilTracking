# Gasoil ↔ Cloudity Maps (cadrage)

## Décision (D5)

- **Cloudity Maps** = futur `products/maps` (repo dédié), moteur **OSM / MapLibre**, routing OSRM/Valhalla, objectif F-Droid (libs OSS).
- **GasoilTracking** reste stack Portainer `gasoil-tracking` + volume `gasoil_api_data` (**jamais** Remove).
- Lien futur = API trips versionnée + couche stations/trajets dans Maps — Fuel reste source de vérité carburant.

## Waze

Pas d’API publique pour « cloner » Waze. Autorisé : **deep link** / URL (`waze://`, `https://waze.com/ul`) depuis Gasoil ou Maps, comme Google/Apple Maps aujourd’hui (`lib/mapsNavigation.ts`).

## Phase actuelle

Gasoil a déjà guidage OSRM + ouverture Google/Apple Maps. Cloudity Maps = **plus tard** (après submodules stables + backups volumes).
