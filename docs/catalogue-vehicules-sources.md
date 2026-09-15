# Catalogue véhicules, recherche modèles & sources de vérité

Document de cadrage (2026-09-15) pour **améliorer « Ajouter un véhicule »** : recherche, modèles anciens/récents, caractéristiques, et **mises à jour régulières** du catalogue.  
Complète le travail déjà documenté côté aéro (`scripts/reports/generators/2026-09-10-cx-scx-systeme-d-scraping.js`).

---

## 1. État actuel dans Gasoil Tracking

| Couche | Fichier / UI | Rôle |
|--------|----------------|------|
| Catalogue embarqué | `constants/vehicles.ts` → `VEHICLE_CATALOG` | ~**274** presets, **31** marques, années ~**1982–2024** |
| Favoris UI | `PRESET_VEHICLES` (8 cartes) | Accès rapide, pas le catalogue complet |
| Recherche | `searchVehicles(query)` | Score modèle exact / préfixe / blob ; max **80** résultats |
| Écran | `app/vehicle/add.tsx`, `edit.tsx` | Recherche + applique conso / réservoir / physique |
| Physique | `lib/vehiclePhysics.ts` | Segments, masse, SCx, boîte si absents du preset |
| Enrichissement VIN | `lib/vehicleSpecsLookup.ts` | Autoref (clé optionnelle) + cache SCx local |
| Cache aéro | `lib/scxCache.ts` | SCx / Cx saisis ou scrapés « Système D » |

**Limites aujourd’hui**

- Catalogue **statique** dans l’APK (pas de refresh cloud / cron).
- Couverture **partielle** (surtout modèles FR « populaires ») ; beaucoup de trims / années manquent.
- Conso / réservoir = **indicatifs** (WLTP / moyennes), pas une lecture carte grise.
- VIN → surtout **masse / identité** ; **pas** Cx/SCx ni toujours le type mine.

---

## 2. Objectif produit

1. **Recherche** plus pertinente (marque, modèle, année, énergie, alias « 806 Roland Garros », fautes).
2. **Beaucoup plus** de véhicules : anciens (années 80–2000) **et** récents (année N / N+1).
3. **Caractéristiques** préremplies fiables : carburant, conso, réservoir, masse, (SCx si dispo).
4. **Liste mise à jour régulièrement** sans rebuild manuel de tout `vehicles.ts` à la main.
5. **Sources de vérité** claires : ce qui vient de la carte grise vs catalogue vs estimation.

---

## 3. Carte grise (France) — ce qu’on peut (et ne peut pas) lire

La carte grise (certificat d’immatriculation) est la **source légale d’identité** du véhicule. Gasoil **ne lit pas** automatiquement une CG papier/PDF aujourd’hui ; l’utilisateur peut saisir **immatriculation**, **VIN**, marque/modèle/année.

### 3.1 Champs utiles (codes CG FR)

| Code | Signification | Utilité Gasoil |
|------|----------------|----------------|
| **A** | N° d’immatriculation | Identifiant user / sync |
| **D.1 / D.2 / D.3** | Marque / type / dénomination commerciale | Recherche catalogue |
| **E** | VIN (17 car.) | Enrichissement Autoref / NHTSA |
| **P.3** | Carburant | `fuelType` |
| **P.6** | Puissance administrative | Secondaire |
| **V.7** | CO₂ | Secondaire (éco) |
| **F.1 / F.2 / G** | PTAC / masse en service | Masse / payload |
| **J / J.1…** | Genre / carrosserie | Segment (berline, SUV…) |
| **Type mine / CNIT** (souvent sur CG ou fiche) | Identifiant technique FR | Meilleure clé de matching fiche |

**Ce que la CG ne donne presque jamais**

- Cx / SCx (aéro)
- Conso réelle L/100 (seulement parfois CO₂ → estimation grossière)
- Capacité exacte du réservoir (rare)

→ Pour conso / réservoir / aéro : **catalogue technique** ou saisie user, pas la CG seule.

### 3.2 APIs / services « immatriculation → fiche » (FR)

| Source | Accès | Données typiques | Notes |
|--------|--------|------------------|--------|
| **SIV / ANTS** (État) | Pas d’API publique grand public pour apps perso | Vérité administrative | Interdit / inaccessible pour Gasoil |
| **API Immatriculation** (prestataires privés : apiplaque, carapis, etc.) | Payant, ToS | Marque, modèle, année, énergie, parfois puissance / CO₂ | À évaluer (coût, RGPD, rate-limit) |
| **Histovec** | Service État pour propriétaire | Historique | Pas un catalogue modèles |
| **VIN decode** Autoref.eu | Clé optionnelle déjà branchée | Masse, marque, modèle | Déjà dans `lookupAutorefByVin` |
| **NHTSA vPIC** | Gratuit (US) | Make/model/année | Moins pertinent pour parc FR |

**Recommandation**

- Court terme : **VIN + saisie CG manuelle** + catalogue enrichi.
- Moyen terme : **une** API plaque FR payante (si budget) en option « Scanner / saisir immat », **jamais** obligatoire, données stockées chez l’utilisateur + sync chiffrée existante.
- Ne **pas** scraper ANTS / SIV.

---

## 4. Sources de vérité pour caractéristiques (hors CG)

Ordre de priorité proposé (du plus fiable au plus estimé) :

```
1. Mesure / saisie utilisateur vérifiée (plein réel, jauge, manuel)
2. Fiche constructeur / presse (PDF) pour ce VIN / type mine / année+moteur
3. Open data FR conso / énergie (si dispo et matché)
4. Catalogue Gasoil versionné (cloud) dérivé de sources auditées
5. APIs VIN (Autoref / NHTSA) → identité + masse
6. Segments / heuristiques vehiclePhysics (dernier recours)
```

### 4.1 Open data & catalogues « modèles »

| Source | Contenu | Licence / accès | Usage |
|--------|---------|-----------------|--------|
| **ADEME / Car Labelling** (données véhicules neufs FR) | Conso, CO₂, énergie, marque/modèle | Open data (vérifier licence à la date d’import) | Seed conso + carburant modèles récents |
| **data.gouv.fr** jeux « véhicules » / émissions | Variables selon jeu | Open | Import batch |
| **EPA fuel economy** (US) | Conso US | Open | Secondaire / comparaison |
| **CarQuery API** | Make → model → trim, années | Gratuit (fragile) | Arborescence recherche |
| **Constructeurs** (fiches presse) | Cx, dimensions, masse | © — citation / manuel | SCx de référence |
| **zeperfs / fiches-auto / automobile-catalog** | Specs amateurs | ToS / scraping prudent | Cache SCx (déjà prévu Système D) |
| **DrivAerNet++** | Cd CFD, pas de plaque | Recherche | Affiner `SEGMENT_DEFAULTS` offline |

### 4.2 Mapping champs → source typique

| Champ Gasoil | Meilleure source | Fallback |
|--------------|------------------|----------|
| `brand` / `model` / `year` | CG + VIN + ADEME/CarQuery | Saisie |
| `fuelType` | CG (P.3) / ADEME | Catalogue |
| `consumptionPer100` | ADEME / catalogue / **appris via pleins** | Preset |
| `tankCapacity` | Fiche constructeur / catalogue | Segment |
| `curbWeightKg` | CG masse / Autoref / fiche | `KNOWN_PHYSICS` |
| `dragAreaScx` | Fiche presse / cache SCx | Segment |
| `transmissionGears` | Fiche / VIN | Défaut segment |

La **vérité conso long terme** dans Gasoil reste : **pleins + km** (`recalibrateFromManualGauge` / adapt), le catalogue ne fait qu’**amorcer**.

---

## 5. Architecture cible : catalogue vivant

### 5.1 Séparer « embarqué » et « à jour »

```
APK (fallback offline)
  constants/vehicles.ts          → snapshot minimal / seed
  lib/scxCache.ts                → SCx critiques

Serveur (déjà Portainer / API)
  GET /api/vehicle-catalog       → JSON versionné (marque, modèle, année, fuel, conso, tank, mass, scx…)
  ETag / versionCatalog          → app tire si plus récent

App
  AsyncStorage cache catalogue
  searchVehicles() lit cache puis seed
  Job refresh : au login / 7 jours / bouton « MAJ catalogue »
```

### 5.2 Pipeline de mise à jour régulière

| Fréquence | Action |
|-----------|--------|
| **Mensuelle** (cron VPS ou GitHub Action) | Import ADEME / open data → diff → PR ou push artifact `vehicle-catalog-YYYY-MM.json` |
| **Hebdo** (optionnel) | Refresh trims année N pour marques top FR |
| **À la demande** | Script `scripts/build-vehicle-catalog.mjs` : merge sources → validateur → upload API |
| **Release app** | Rebundler un **snapshot** du catalogue dans l’APK (filet hors-ligne) |

### 5.3 Qualité / validation

- Schéma JSON strict (`schema`, `updatedAt`, `entries[]`).
- Tests : recherche « 208 » ≠ « 108 » ; présence 806 / Clio / modèles seed QA.
- `confidence` 0–1 par champ (ex. conso ADEME = 0.8, segment = 0.3).
- Ne **jamais** écraser une fiche user déjà calibrée (pleins) avec une conso catalogue.

### 5.4 Améliorations recherche (UI)

- Tokens : marque + modèle + année + fuel (`diesel`, `hybride`).
- Alias / typos (`megane` → `Mégane`, `c4 picasso`).
- Filtres : énergie, année min/max, segment.
- Résultats groupés par génération (ex. 208 I / II).
- Afficher **source** sous le preset (« ADEME 2024 », « catalogue local », « VIN »).

---

## 6. Plan d’implémentation (phases)

| Phase | Livrable | Effort |
|-------|----------|--------|
| **A** | Doc (ce fichier) + backlog | Fait |
| **B** | Étendre `VEHICLE_CATALOG` (vieux + 2024/2025) + meilleurs alias recherche | **Fait** (2026-09-15, ~508 modèles) |
| **C** | Endpoint `/api/vehicle-catalog` + cache app + refresh 7 j | **Fait** (`api/static/…`, `vehicleCatalogStore`) |
| **D** | Script import ADEME / data.gouv → JSON | Moyen |
| **E** | Option immat/VIN FR (prestataire) derrière feature flag | Plus gros / € |
| **F** | Continuer cache SCx (Système D) pour aéro | Continu |

---

## 7. RGPD & légal (rappel)

- Immat / VIN = **données personnelles** → déjà dans le compte sync ; pas de log serveur inutile.
- Pas de revente de bases CG.
- Respect ToS des sites scrapés ; préférer **open data** et APIs contractuelles.
- Mentionner dans l’UI : « valeurs catalogue **indicatives** ; affinez avec vos pleins ».

---

## 8. Fichiers clés à toucher plus tard

- `constants/vehicles.ts` — seed / snapshot
- `app/vehicle/add.tsx`, `edit.tsx` — UI recherche
- `lib/vehicleSpecsLookup.ts`, `lib/vehiclePhysics.ts`, `lib/scxCache.ts`
- `api/src/index.js` — futur `GET /api/vehicle-catalog`
- `scripts/build-vehicle-catalog.mjs` — à créer
- Aide in-app : `lib/helpContent.ts` (section Garage / VIN)

---

## 9. Synthèse « source de vérité »

| Besoin | Source de vérité |
|--------|------------------|
| « C’est quelle voiture ? » | **Carte grise** (+ VIN) |
| « Quelle conso mettre au départ ? » | **Catalogue / ADEME**, puis **pleins** |
| « Quelle masse / SCx pour le modèle physique ? » | **Fiche technique / cache SCx / VIN masse** |
| « Liste à jour des modèles » | **Catalogue versionné serveur** (import open data mensuel) + snapshot APK |

Ce document est la référence pour la prochaine itération « recherche modèles + MAJ régulière ». L’implémentation code démarre sur demande explicite (phases B+).
