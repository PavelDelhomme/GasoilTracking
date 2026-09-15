# Navigation & Cloudity Maps — stratégie GasoilTracking

> Cadré 2026-09-15. Complète `docs/SUITE-ECOSYSTEM-LINK.md` et les docs Cloudity (`products/maps`, décision D5).

## 1. Verdict rapide

| Option | Verdict |
|--------|---------|
| **API Waze embarquée** (turn-by-turn dans l’app) | **Non** — pas d’API publique de navigation à intégrer. Deep link `waze://` / Play Store seulement. |
| **Battre Waze** dans Gasoil seul | **Non réaliste** court terme (trafic live, communauté, police). |
| **OsmAnd-like (F-Droid, OSM offline)** | **Cible Cloudity Maps** (produit dédié), pas fusion dans Gasoil. |
| **Mappy / Google** | Deep link / Intent externes OK ; pas de clone légal de leurs moteurs. |
| **Intégration Gasoil ↔ Cloudity** | **Oui, doucement** : submodule `products/GasoilTracking` (+ alias `fuel`) + stacks **séparées** ; Maps = `products/maps` plus tard. |

Gasoil garde son **suivi conso + GPS** (Leaflet/OSM + OSRM déjà en place). Cloudity Maps apportera la **nav / cartes suite** ; Gasoil s’y branchera (deep link ou SDK interne) sans fusionner les DB.

## 2. Ce que Gasoil a déjà (Maps)

- Onglet Maps : Leaflet OSM, itinéraires OSRM, suivi libre / A→B, HUD, lieux.
- Export navigation externe : Google Maps Directions (`lib/mapsNavigation.ts`).
- Pas de dépendance Waze runtime.

**Amélioration nav « dans Gasoil » (incrémental)**  
OSRM alternatives, offline partiel, deep link Waze/OsmAnd/Organic Maps en boutons « Ouvrir dans… » — **sans** prétendre remplacer Waze.

## 3. Cloudity Maps (cible)

Chemin monorepo : `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity`  
Placeholder : `products/maps/` (README dans Cloudity, **pas encore de repo Git**) — **pas** un merge du repo Gasoil.

Inspirations : OsmAnd / Organic Maps / Mappy UX — stack **OSM + OSRM/Valhalla + tuiles** (self-host ou provider).  
F-Droid : possible si stack libre (pas de Play Services obligatoires) — décision suite Cloudity.

Gasoil **alimente** Maps (trajets, conso, places) via API / export ; Maps **ne remplace pas** le volume `gasoil_api_data`.

## 4. Intégration « un écosystème », pas un monolithe

Déjà en place côté Cloudity :

1. Stacks Portainer **séparées** (`gasoil-tracking`, `cloudity`, …).
2. Submodule Git `products/GasoilTracking` → `GasoilTracking.git` (**actif**, alias `products/fuel`) — **sans** toucher `gasoil_api_data`.
   Chemin de travail canonique : `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/GasoilTracking`.
3. Placeholder `products/maps/` (README) — repo Maps à créer plus tard.
4. SSO Cloudity ID = **opt-in** plus tard.
5. Tester flavors / appareils labo **sur le produit**, pas en fusionnant les serveurs.

Commencer doucement =

- Docs + workspace + submodule `GasoilTracking` (fait).
- Garder `prod` / `preprod` / `dev` Gasoil.
- Ne **pas** copier l’API Gasoil dans le gateway Go Cloudity.
- Quand Maps existe : Intent / URL scheme `cloudity-maps://navigate?...` + fallback OSM dans Gasoil.

## 5. Ordre de travaux recommandé

1. ~~Stabiliser Maps GPS Gasoil (1.4.136)~~  
2. ~~Catalogue véhicules B + API C~~ (2026-09-15)  
3. Boutons « Ouvrir dans Waze / OsmAnd / Organic Maps »  
4. MVP Cloudity Maps (repo `products/maps`)  
5. SSO / hub tuile Fuel  
6. Phase D catalogue (import ADEME)

## 6. Waze — détails

- Deep link typique : `https://waze.com/ul?ll=LAT,LON&navigate=yes`  
- Pas de SDK nav open pour RN/Expo grand public.  
- ToS : pas de scraping trafic Waze.

→ Bouton optionnel « Naviguer avec Waze » = OK. Moteur Waze dans l’APK = **non**.
