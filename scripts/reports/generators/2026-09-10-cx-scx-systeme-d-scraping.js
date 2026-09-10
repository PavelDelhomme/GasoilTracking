'use strict';
/**
 * Gros rapport technique : récupérer Cx / SCx sans API payante
 * (« Système D » — sources gratuites, scraping fiable, champs Gasoil).
 * Usage perso uniquement — pas un mode d’emploi pour industrialiser.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Cx-SCx-Systeme-D-complet-v2-2026-09-10.pdf';
const outDir = process.env.REPORT_DIR
  ? path.resolve(process.env.REPORT_DIR)
  : path.join(__dirname, '../../../dist/reports');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, OUT_NAME);

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 40, bottom: 46, left: 40, right: 40 },
  bufferPages: true,
  autoFirstPage: true,
  info: {
    Title: 'Gasoil Tracking — Cx / SCx Systeme D et scraping fiable',
    Author: 'Gasoil Tracking',
  },
});

const stream = fs.createWriteStream(out);
doc.pipe(stream);

const {
  ACCENT,
  DARK,
  LEFT,
  WIDTH,
  h2,
  h3,
  para,
  note,
  bullets,
  callout,
  kvList,
  table,
  writeFooters,
} = bindPdfHelpers(doc);

doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
doc.moveDown(1);
doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text('Gasoil Tracking', LEFT(), doc.y, {
  width: WIDTH(),
});
para(
  'Rapport technique complet : comment recuperer Cx, surface frontale S et SCx (= S x Cx) sans API payante, pourquoi ces grandeurs sont vitales pour la conso GPS, quelles infos scrapées / saisies vraiment, et comment monter un pipeline « Systeme D » fiable pour enrichir le cache local (lib/scxCache.ts + catalogue).'
);
callout(
  'Cadre',
  'Projet perso Gasoil Tracking uniquement. Scraping = volume faible, delais, robots.txt, pas de revente / API publique construite sur donnees tiers. Usage commercial = interdit / risqué.',
  ACCENT
);

kvList([
  ['Date', '2026-09-10'],
  ['App live', '1.4.99 · modele physique depuis 1.4.90'],
  ['Formule air', 'F_air = 0.5 * rho * SCx * v_air^2  (consumptionModel)'],
  ['Cache actuel', 'lib/scxCache.ts + KNOWN_PHYSICS + SEGMENT_DEFAULTS'],
  ['Script stub', 'scripts/enrich-scx-cache.mjs'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
]);

h2('Sommaire (ce PDF)');
bullets([
  '1. Pourquoi Cx / S / SCx — physique dans Gasoil',
  '2. Ce qu’il faut renseigner (schema de donnees cible)',
  '3. Priorite des champs : indispensables vs bonus vs pieges',
  '4. Sources gratuites sans scraping (APIs / datasets)',
  '5. Sites « fiches » utiles (Zeperfs, UltimateSpecs, Fiches-auto…)',
  '6. Architecture scraping fiable (pipeline multi-etapes)',
  '7. Matching marque / modele / annee / motorisation',
  '8. Parsing, unites, validation croisee, score de confiance',
  '9. Stockage Gasoil : scxCache, catalogue, VIN, UI',
  '10. Cadre legal / ethique / robots.txt',
  '11. Plan d’implementation concret (phases)',
  '12. Checklist qualite + exemples chiffres',
  '13. Ce qu’on ne recuperera JAMAIS automatiquement',
  '14–21. Annexes (synonymes, JSONL, erreurs, conso…)',
  '22–24. Matrice risques / problemes / solutions explorees',
  '25–27. Arbres decision, matching FR, deep dive pipeline',
  '28–30. Metriques, backlog Gasoil, scenarios QA',
  '31–35. SCx_learned, headless, gouvernance, FAQ, semaine type',
  '36. Resume executif complet',
]);

h2('1. Pourquoi Cx / S / SCx — physique dans Gasoil');
para(
  'Le modele de conso GPS (depuis v1.4.90) estime le carburant via un bilan de forces le long du trace : resistance au roulement, gravite (denivele), inertie (accelerations), et trainée aero. Sans OBD, la trainée est le terme dominant des que la vitesse monte (autoroute, nationale).'
);
h3('1.1 Formules utiles');
bullets([
  'Force aero : F_air = 0.5 * rho * SCx * v_air^2  (rho ~ 1.225 kg/m3).',
  'SCx = S * Cx  (m2). S = surface frontale projettee, Cx = coefficient de trainée.',
  'Puissance aero ~ F_air * v ; energie integree sur le trajet -> litres via rendement moteur / PCI carburant.',
  'Erreur SCx de +20 % => erreur conso aero du meme ordre a vitesse constante (souvent 5–15 % sur un trajet mixte).',
]);
h3('1.2 Pourquoi pas seulement « L/100 catalogue »');
bullets([
  'Le L/100 WLTP / constructeur est une moyenne de cycle : utile en fallback, mauvais pour un trajet reel vent / vitesse / denivele.',
  'Avec GPS dense + masse + SCx, on explique pourquoi un meme vehicule consomme plus a 130 qu’a 90, ou en montee.',
  'Gasoil a deja : SEGMENT_DEFAULTS (citadine 0.62 … pick-up 1.1), KNOWN_PHYSICS (regex modeles), SCX_CACHE (Cx + S + SCx + source).',
]);
callout(
  'Objectif Systeme D',
  'Remplir dragAreaScx (et si possible Cx + S + masse) pour le maximum de modeles FR / EU utilises, sans payer une API auto, en restant fiable et auditable (source + date + score).',
  ACCENT
);

h2('2. Schema de donnees cible — quoi scrapter / stocker');
para(
  'Ne pas aspirer « toute la page ». Extraire un enregistrement normalise, versionne, avec provenance. C’est ce qui rend le Systeme D fiable.'
);
table(
  ['Champ', 'Unite', 'Pourquoi'],
  [
    ['brand', 'texte', 'Cle de matching (Peugeot ≠ Peugeot SA)'],
    ['model', 'texte', 'Cle (208 ≠ 208 GT Line marketing)'],
    ['generation / code', 'texte', 'T9, P5… ; Cx change entre gen'],
    ['yearFrom / yearTo', 'annee', 'Filtrer la bonne generation'],
    ['bodyStyle', 'enum', 'Berline / SW / SUV change S'],
    ['fuel', 'enum', 'Diesel / essence / HEV — masse differente'],
    ['engineLabel', 'texte', '1.2 PureTech ; optionnel matching'],
    ['curbWeightKg', 'kg', 'Roulement + inertie (critique)'],
    ['cx', '-', 'Si seul : besoin de S'],
    ['frontalAreaM2', 'm2', 'Si seul : besoin de Cx'],
    ['dragAreaScx', 'm2', 'PRIORITAIRE pour le modele'],
    ['gears', 'int', 'eta transmission moyenne'],
    ['tankL', 'L', 'Jauge / plein (deja catalogue)'],
    ['l100Mixed', 'L/100', 'Fallback / calibration'],
    ['sourceUrl', 'URL', 'Audit + re-fetch'],
    ['sourceName', 'texte', 'zeperfs / fiches-auto / manuel'],
    ['fetchedAt', 'ISO', 'Fraicheur'],
    ['confidence', '0–1', 'Qualite estimee'],
    ['notes', 'texte', 'Cx mesure vs marketing'],
  ],
  [1.4, 0.7, 2.9]
);

h3('2.1 Identifiants secondaires utiles');
bullets([
  'VIN WMI + VDS (17 car.) : masse / motorisation via Autoref ou NHTSA — presque jamais Cx.',
  'Code CNIT / type mine (FR) : identification precise fiche technique.',
  'Dimensions L x l x h : permet d’ESTIMER S si absente (heuristique largeur x hauteur x k, k~0.80–0.85).',
  'Masse PTAC / charge utile : pour payload, pas pour SCx.',
]);

h2('3. Priorite des champs');
h3('3.1 Indispensables pour Gasoil (ordre)');
bullets([
  '1) dragAreaScx — si present, on l’utilise tel quel (resolveScxFromEntry).',
  '2) Sinon cx + frontalAreaM2 → SCx calcule.',
  '3) curbWeightKg — sinon segment / cache / 1300 kg par defaut.',
  '4) fuelType + gears — rendement / idle.',
  '5) year + bodyStyle — pour ne pas appliquer le SCx d’une autre gen.',
]);
h3('3.2 Tres utiles mais secondaires');
bullets([
  'l100Mixed / urban / highway : calibration croisee (si le modele physique s’ecarte trop → alerte confiance).',
  'Puissance / couple : pas dans F_air, mais aide a detecter une fiche « mauvaise motorisation ».',
  'CdA (parfois note SCx) : meme grandeur, synonymes CdA / SCx / A*Cd.',
]);
h3('3.3 Pieges classiques');
bullets([
  'Cx marketing « a partir de 0.28 » sans S → sous-estime la trainée si on invente S trop petite.',
  'Surface frontale mal definie (avec / sans retro) : ecarts 5–10 %.',
  'Variante SW / break : meme Cx souvent, S un peu plus haute.',
  'SUV restyle : annee calendaire ≠ annee generation.',
  'Unites : lb, inch, Cx en « 0,32 » FR vs « .32 » EN.',
  'Pages multi-versions : scrapter la ligne qui matche annee + carburant.',
]);

h2('4. Sources gratuites SANS scraping agressif');
para(
  'Toujours commencer par ces canaux. Le scraping ne vient qu’en comblement de trous.'
);
table(
  ['Source', 'Donnees typiques', 'Cx/SCx ?', 'Usage Gasoil'],
  [
    ['CarQuery / NHTSA vPIC', 'marque, modele, annee, moteur, parfois poids', 'Non / rare', 'Identite + masse US'],
    ['Autoref.eu (cle optionnelle)', 'VIN → specs, masse', 'Rarement Cx', 'Bouton Enrichir VIN'],
    ['Catalogue local VEHICLE_CATALOG', 'conso, reservoir, parfois masse/SCx', 'Partiel', 'Deja en prod'],
    ['SCX_CACHE + KNOWN_PHYSICS', 'SCx / masse modeles frequents', 'Oui (manuel)', 'Fallback rapide'],
    ['DrivAerNet++', '8000 geometries + Cd calcules', 'Oui (labo)', 'Offline ML / stats, pas runtime'],
    ['Wikipedia / Commons', 'parfois Cx cite + ref', 'Sporadique', 'Piste manuelle'],
    ['Docs constructeur PDF', 'fiches presse Cx / S', 'Oui si publie', 'Meilleure verite'],
  ],
  [1.5, 1.6, 0.9, 1.0]
);
h3('4.1 DrivAerNet++ (scientifique)');
bullets([
  'Dataset open-source de designs automobiles avec coefficients aero calcules (CFD).',
  'Excellent pour apprendre des correlations (forme → Cd), pas pour « Peugeot 206 2001 diesel » fiche exacte.',
  'Trop lourd a embarquer dans l’APK ; usage hors-ligne : notebooks, generation de tables de segments raffinees.',
  'Idee Gasoil : entrainer / ajuster SEGMENT_DEFAULTS (SUV vs berline) a partir de statistiques DrivAer, pas remplacer le cache modele.',
]);
h3('4.2 Autoref / CarQuery — realite');
bullets([
  'Autoref : utile pour masse / cylindree / boite depuis VIN ; Cx presque jamais.',
  'CarQuery : arborescence make/model/trim ; poids parfois ; aero absente.',
  'Conclusion : APIs gratuites = identite + masse. Aero = fiches specialisees ou saisie.',
]);

h2('5. Sites « fiches » — ce qu’on peut esperer');
para(
  'Ces sites sont souvent cites pour le Systeme D. Contenu typique (varie selon fiche). Respecter ToS / robots ; volume perso faible.'
);
table(
  ['Site', 'Points forts', 'Faiblesses'],
  [
    ['Fiches-auto.fr', 'Pedagogie S / Cx, fiches FR, explications surface', 'Couverture incomplete ; HTML change'],
    ['Zeperfs', 'Perf + parfois Cd / S / masse, communautaire', 'Qualite variable ; anti-bot possible'],
    ['UltimateSpecs', 'Fiches detaillees multi-marques', 'Structure lourde ; ToS ; rate-limit'],
    ['Automobile-catalog', 'Specs techniques historiques', 'Aero inegale'],
    ['Car.info / similar', 'Dimensions, poids', 'Cx rare'],
    ['Forums / PDF presse', 'Cx officiel cite', 'Non structure ; OCR parfois'],
  ],
  [1.3, 2.0, 1.7]
);
h3('5.1 Champs souvent presents sur une bonne fiche');
bullets([
  'Cx (Cd), surface frontale (m2), parfois SCx deja calcule.',
  'Masse a vide / a vide en ordre de marche (attention definition EU).',
  'Dimensions hors-tout, empattement, voies.',
  'Consommations mixtes / CO2 (pour calage).',
  'Annees de production, motorisations listees.',
]);
h3('5.2 Ce qu’il faut noter dans sourceName');
bullets([
  'Toujours garder sourceName + sourceUrl + fetchedAt.',
  'Si la page dit « environ » / « estime » → confidence <= 0.55.',
  'Si PDF constructeur → confidence 0.85–0.95.',
  'Si moyenne segment uniquement → confidence 0.35 (comme SEGMENT_DEFAULTS).',
]);

h2('6. Architecture scraping fiable (multi-etapes)');
para(
  'Un scrape « one-shot BeautifulSoup sur une URL Google » casse en 48 h. Un pipeline fiable separe telechargement, extraction, normalisation, validation, publication.'
);
h3('6.1 Vue d’ensemble');
bullets([
  'A. File d’attente jobs : (brand, model, year?, body?, fuel?) priorisee par vehicules actifs utilisateurs + catalogue.',
  'B. Resolve URL : search interne site / sitemap / map marque→modele→slug (table maintenue).',
  'C. Fetch HTTP : User-Agent clair projet perso, Accept-Language fr, timeout, retries expo, respect Retry-After.',
  'D. Store brut : HTML/PDF dans un dossier cache disque hashe (sha256 URL) — reparse sans re-hit.',
  'E. Extracteurs versionnes par site (selectors / regex / JSON-LD) avec tests unitaires sur fixtures HTML.',
  'F. Normalizer → ScxCacheEntry + champs etendus.',
  'G. Validator (bornes physiques) + cross-check multi-sources.',
  'H. Merge dans lib/scxCache.ts ou JSON genere (CI) — revue humaine pour confidence < 0.7.',
]);
h3('6.2 Delais et politesse (fiabilite legale + technique)');
bullets([
  '1 requete / 3–8 s minimum par domaine ; jam jamais parallele sauvage sur le meme host.',
  'Lire robots.txt ; si Disallow sur /fiche → ne pas scraper (passer manuel).',
  'Budget : ex. 50 pages / soir max pour un projet perso.',
  'Si 403/429 → pause longue + marquage source « degraded ».',
  'Ne pas tourner depuis l’app mobile utilisateur — batch offline sur machine de dev.',
]);
h3('6.3 Couches anti-casse');
bullets([
  'Fixtures : sauver 5–10 HTML reels anonymises ; tests CI « extract still works ».',
  'Detecteur de layout : si 0 champ aero extrait alors que page > 20 ko → alerte « selecteur casse ».',
  'Fallback extracteur B (regex « Cx[:\\s]+0[,.]\\d{2} ») si DOM change.',
  'JSON-LD / microdata d’abord si present (plus stable que classes CSS).',
  'PDF constructeur : pdfplumber / pdftotext + motifs « Cx » « SCx » « surface frontale ».',
]);
h3('6.4 Pseudo-flux Python (concept)');
bullets([
  '1) load_queue() → 2) for job in queue: url = resolve(job)',
  '3) html = fetch_cached(url) → 4) data = extractors[site].parse(html)',
  '5) rec = normalize(data, job) → 6) if not valid(rec): quarantine',
  '7) merge_best(rec, existing_by_key) → 8) export_ts_or_json()',
  '9) rapport diff : nouveaux / conflictuels / scores bas → revue manuelle',
]);
callout(
  'Point cle fiabilite',
  'La fiabilite vient du cache HTML + extracteurs testes + validation physique + fusion multi-sources — pas d’un « scraper plus malin ».',
  ACCENT
);

h2('7. Matching marque / modele / annee — le vrai probleme');
para(
  '80 % des erreurs SCx viennent d’un mauvais matching (mauvaise gen / mauvaise carrosserie), pas d’un Cx mal lu.'
);
h3('7.1 Normalisation texte');
bullets([
  'Minuscules, NFD strip accents (Citroën → citroen).',
  'Synonymes : vw=volkswagen, mercedes-benz=mercedes, bmw serie 1 = 116i? (attention).',
  'Retirer tokens marketing : gt line, business, exclusive, edition, phase 2 (parfois garder phase).',
  'Model codes : « 206+ » ≠ « 206 » exact — garder variante.',
  'Annees : yearFrom/yearTo inclusifs ; si une seule annee connue → +/- 1 an tolerance score -0.1.',
]);
h3('7.2 Cle de fusion recommandee');
bullets([
  'key = brand_norm | model_norm | body | yearFrom-yearTo | fuel_family',
  'Si conflit SCx entre sources : garder max(confidence), ou moyenne ponderee si |delta| < 0.05.',
  'Si |delta| >= 0.08 → conflict flag, ne pas ecraser le cache prod sans revue.',
]);
h3('7.3 Heuristique surface frontale si absente');
bullets([
  'S_est = width_m * height_m * k  avec k ≈ 0.81 (berline), 0.84 (SUV), 0.78 (sportive basse).',
  'Puis SCx_est = Cx * S_est si Cx connu — confidence plafonnee a 0.5.',
  'Ne jamais inventer Cx et S tous les deux (double erreur).',
]);

h2('8. Parsing, unites, validation');
h3('8.1 Bornes physiques (reject / quarantine)');
table(
  ['Champ', 'Min raisonnable', 'Max raisonnable'],
  [
    ['cx', '0.20', '0.55 (utilitaires plus haut)'],
    ['frontalAreaM2', '1.5', '3.5'],
    ['dragAreaScx', '0.40', '1.40'],
    ['curbWeightKg', '700', '3500'],
    ['gears', '4', '10'],
    ['tankL', '20', '120'],
  ],
  [1.4, 1.5, 2.1]
);
h3('8.2 Parsing nombres FR/EN');
bullets([
  'Remplacer virgule decimale ; supprimer espaces / NBSP ; gerer « 0.32 » et « 0,32 ».',
  'Detecter « Cd = 0.32 » « Cx : 0.32 » « coefficient de trainee 0.32 ».',
  'SCx parfois note « 0,65 m2 » — si label SCx/CdA, ne pas multiplier encore par Cx.',
  'Masse « 1 180 kg » ou « 1180kg » ou « 2,601 lbs » → convertir lbs * 0.4536.',
]);
h3('8.3 Score de confiance (exemple)');
bullets([
  '+0.40 si Cx et S presents et SCx coherent (|S*Cx - SCx| < 0.03)',
  '+0.25 si source constructeur / PDF presse',
  '+0.15 si 2 sites independants d’accord a 5 %',
  '+0.10 si annee + body matchent strictement',
  '-0.20 si seule estimation dimensionnelle',
  '-0.25 si page communautaire sans reference',
  'Publier auto dans cache app si confidence >= 0.70 ; sinon file « a valider ».',
]);

h2('9. Integration Gasoil Tracking (existant → cible)');
h3('9.1 Deja en place');
bullets([
  'lib/vehiclePhysics.ts : SEGMENT_DEFAULTS, KNOWN_PHYSICS, suggestPhysicsFields.',
  'lib/scxCache.ts : entrees Cx / S / SCx / source ; lookupScxCache ; resolveScxFromEntry.',
  'UI vehicle/edit : champs masse, SCx, VIN, bouton Enrichir.',
  'scripts/enrich-scx-cache.mjs : stub Systeme D (audit trous + URLs recherche).',
  'Modele : F_air utilise phys.dragAreaScx uniquement (pas besoin des deux Cx et S au runtime).',
]);
h3('9.2 Cible recommandee');
bullets([
  'data/scx-raw/ : HTML caches (gitignore).',
  'data/scx-normalized.jsonl : une ligne = un record valide.',
  'scripts/scrape/extractors/*.mjs : un fichier par source.',
  'scripts/scrape/merge-to-cache.mjs : regenere lib/scxCache.ts ou import JSON.',
  'CI optionnelle : vitest fixtures extracteurs + verify bornes.',
  'Aide app : deja « Pas de Cx magique via Internet » — a completer quand le cache grossit.',
]);
h3('9.3 Ce que l’utilisateur final voit');
bullets([
  'Garage → modifier → S x Cx prefill si cache hit.',
  'Sinon segment + message : saisir SCx si connu (fiche technique).',
  'Jamais de scrape live depuis le telephone (lenteur, ToS, IP utilisateur).',
]);

h2('10. Cadre legal / ethique');
bullets([
  'ToS des sites : souvent interdiction de scraping automatise — usage perso faible volume = zone grise ; commercial = non.',
  'Ne pas redistribuer une base « aspiree » complete comme produit.',
  'Ne pas contourner Cloudflare / captchas (ça devient attaque). Si bloque → saisie manuelle.',
  'Attribuer les sources dans le champ source (transparence).',
  'RGPD : ne pas scrapter avis utilisateurs / profils — seulement specs techniques.',
  'robots.txt n’est pas la loi mais le signal minimal a respecter pour rester « propre ».',
]);
callout(
  'Position Gasoil',
  'Systeme D = enrichissement offline du cache local pour estimation conso perso. Pas un service de revente de fiches auto.',
  ACCENT
);

h2('11. Plan d’implementation concret (phases)');
h3('Phase 0 — deja fait / immédiat');
bullets([
  'Continuer saisie manuelle des vehicules reels (206, 208, Touran…) dans scxCache.',
  'Enrichir catalogue VEHICLE_CATALOG.curbWeightKg / dragAreaScx quand connus.',
  'Documenter source a chaque ajout (comme aujourd’hui).',
]);
h3('Phase 1 — fiabiliser sans scrape');
bullets([
  'Liste prioritaire : tous les modeles du garage sync + top catalogue.',
  'Feuille calcul : brand, model, years, Cx, S, SCx, poids, URL, confidence.',
  'Import CSV → merge-to-cache (script simple, 0 HTTP).',
]);
h3('Phase 2 — fetch poli + parse');
bullets([
  'Implementer 1 extracteur (ex. fiches-auto) sur fixtures d’abord.',
  'fetch_cached + rate-limit + quarantine.',
  'Revue humaine des conflits avant merge prod.',
]);
h3('Phase 3 — multi-sources + score');
bullets([
  '2e source (zeperfs ou PDF presse) pour cross-check.',
  'confidence de confiance + rapport hebdo des trous.',
  'Option : stats DrivAerNet++ pour recalibrer segments seulement.',
]);
h3('Phase 4 — VIN / Autoref (masse)');
bullets([
  'AUTOREF_API_KEY si dispo : masse prioritaire ; SCx reste cache.',
  'Ne jamais ecraser un SCx haute confiance avec une estimation segment.',
]);

h2('12. Checklist qualite avant d’accepter une fiche');
bullets([
  '[ ] brand/model/year coherents avec la page',
  '[ ] bodyStyle correct (SW vs berline)',
  '[ ] Cx dans [0.20–0.55] ou utilitaire justifie',
  '[ ] S dans [1.5–3.5] m2',
  '[ ] SCx = Cx*S a 0.03 pres OU SCx fourni seul',
  '[ ] masse coherent avec segment (+/- 25 %)',
  '[ ] sourceUrl archivee / html cache',
  '[ ] confidence calculee',
  '[ ] pas de collision avec entree haute confiance existante',
  '[ ] test unitaire extracteur vert si HTML nouveau',
]);

h2('13. Exemples d’ordres de grandeur (aide detection erreur)');
table(
  ['Segment', 'Cx typ.', 'S typ. m2', 'SCx typ.'],
  [
    ['Citadine', '0.30–0.33', '1.9–2.1', '0.58–0.68'],
    ['Compacte', '0.28–0.32', '2.1–2.3', '0.60–0.72'],
    ['Berline', '0.25–0.30', '2.2–2.4', '0.58–0.70'],
    ['SUV C', '0.30–0.35', '2.4–2.7', '0.75–0.90'],
    ['MPV', '0.30–0.34', '2.5–2.9', '0.80–0.95'],
    ['Fourgon', '0.35–0.42', '2.8–3.3', '1.00–1.30'],
  ],
  [1.2, 1.2, 1.2, 1.4]
);
para(
  'Exemples deja en cache Gasoil : Peugeot 206 SCx~0.63 (Cx 0.32 x S 1.97) ; 208 SCx~0.61 ; Touran SCx~0.84 ; 3008 SCx~0.78. Un « 206 a SCx 1.1 » est presque surement une erreur de matching SUV.'
);

h2('14. Informations « poussees » qu’on peut recuperer — et pour quoi faire');
h3('14.1 Aero et geometrie');
bullets([
  'Cx, S, SCx/CdA → trainée.',
  'Largeur, hauteur, longueur → estimation S ; detection SUV.',
  'Garde au sol (si presente) → proxy « SUV-ness ».',
]);
h3('14.2 Masses et charges');
bullets([
  'Masse a vide / en ordre de marche → roulement + inertie.',
  'PTAC, charge utile → payload max (optionnel).',
  'Repartition AV/AR : hors scope conso actuelle.',
]);
h3('14.3 Chaine cinematique');
bullets([
  'Boite (manuelle/auto) + nb rapports → eta_trans grossier (deja gears).',
  'Transmission 4x4 → malus conso forfaitaire possible plus tard.',
  'Pneumatiques dimension : Cr un peu plus fin (DEFAULT_ROLLING_CR=0.011 aujourd’hui).',
]);
h3('14.4 Energie');
bullets([
  'Conso mixte / urbaine / route → calibration / detection derive modele.',
  'Capacite reservoir → jauge.',
  'Norme WLTP vs NEDC : ne pas melanger sans flag.',
]);
h3('14.5 Identite');
bullets([
  'Annees prod, code projet, facelift → matching.',
  'VIN decode → masse / moteur, pas aero.',
]);

h2('15. Ce qu’on ne recuperera JAMAIS automatiquement de facon fiable');
bullets([
  'Cx exact de CHAQUE finition / pack aero / jantes 19" (trop granulaire).',
  'Effet vent lateral / pluie / charge toit — variables trajet, pas fiche.',
  'Usure moteur / style de conduite — appris via trajets utilisateur, pas scrape.',
  'SCx « vrai » en vieillissement (modifs carrosserie).',
]);

h2('16. Glossaire rapide');
bullets([
  'Cx / Cd : coefficient de trainee (sans dimension).',
  'S / A : surface frontale (m2).',
  'SCx / CdA : produit S*Cx (m2) — grandeur directement dans F_air.',
  'rho : densite air (~1.225 kg/m3 a 15 C niveau mer).',
  'Cr : coefficient de roulement pneus.',
  'Systeme D : enrichment local sans API payante, revue humaine.',
]);

h2('17. Decision : on continue cette histoire ou pas ?');
para(
  'Oui, on continue — mais dans le bon ordre : (1) saisie / CSV des modeles reels, (2) extracteur + fixtures sur UNE source, (3) multi-sources + scores, (4) jamais de scrape dans l’app. DrivAerNet++ reste un outil labo pour segments, pas une fiche 206.'
);
callout(
  'Prochaine action concrete (si tu valides)',
  'Phase 1 : script import CSV → scxCache + liste prioritaire de tes vehicules. Phase 2 : 1er extracteur avec fixtures HTML. Pas de scrape massif avant.',
  ACCENT
);

h2('18. Annexe A — synonymes a parser');
bullets([
  'Cx, Cx, Cd, Cd, coefficient de trainee, drag coefficient, air drag coeff.',
  'S, Sf, surface frontale, frontal area, A, area.',
  'SCx, S.Cx, S x Cx, CdA, Cd*A, drag area.',
  'Masse a vide, poids a vide, curb weight, unladen weight, masse en ordre de marche (EU + conducteur parfois).',
]);

h2('19. Annexe B — structure JSONL cible (exemple)');
para(
  '{"brand":"Peugeot","model":"206","yearFrom":1998,"yearTo":2012,"bodyStyle":"hatch","fuel":"essence","curbWeightKg":1025,"cx":0.32,"frontalAreaM2":1.97,"dragAreaScx":0.63,"sourceName":"fiches-auto","sourceUrl":"https://…","fetchedAt":"2026-09-10","confidence":0.82,"notes":"coherent Cx*S"}'
);
note(
  'Ne pas coller d’URL scrapee en masse dans le repo public si ToS douteux — preferer cache local gitignore + valeurs normalisees dans scxCache.'
);

h2('20. Annexe C — erreurs frequentes a logger');
bullets([
  'EXTRACT_EMPTY : page OK mais 0 champ aero',
  'LAYOUT_CHANGED : ratio champs / taille HTML anormal',
  'UNIT_UNKNOWN : nombre sans unite',
  'PHYS_OUT_OF_RANGE : hors bornes section 8',
  'MATCH_AMBIGUOUS : plusieurs fiches candidates',
  'CONFLICT_SCX : delta vs cache >= 0.08',
  'ROBOTS_DISALLOW / HTTP_429 : stop source',
]);

h2('21. Annexe D — lien avec la conso affichee');
bullets([
  'A basse vitesse (<50 km/h) : roulement + idle dominent → mauvais SCx peu visible.',
  'A 90–130 km/h : aero domine → SCx critique.',
  'Denivele fort : masse critique (SCx secondaire).',
  'Donc : enrichir SCx surtout pour trajets route/autoroute ; masse pour montagne / ville stop-go.',
]);

h2('22. Matrice problemes → impacts → solutions');
para(
  'Cette section complete le rapport : chaque probleme probable du Systeme D, ce que ca casse dans Gasoil, et les solutions a explorer (pas une seule voie magique).'
);
table(
  ['Probleme', 'Impact conso', 'Solutions a explorer'],
  [
    ['Mauvais matching gen', 'SCx SUV sur citadine', 'yearFrom/To + code projet + revue'],
    ['Cx sans S', 'Sous-estime trainée', 'Estimer S (L×h×k) ou scrap S'],
    ['S inventee trop basse', 'Conso autoroute basse', 'k segment + bornes + 2e source'],
    ['Masse NEDC vs EU', 'Erreur denivele', 'Flag « ordre de marche »'],
    ['Selecteurs HTML casses', 'Cache freeze', 'Fixtures CI + regex fallback'],
    ['429 / Cloudflare', 'Source morte', 'Pause, manuel, autre site'],
    ['Conflit 2 sources', 'Oscillation SCx', 'confidence + delta max 0.05'],
    ['Scrape dans l’app', 'IP user / ToS', 'Batch offline uniquement'],
    ['DrivAer ≠ 206 reelle', 'Fausse precision', 'Segments seulement'],
    ['VIN sans Cx', 'Attente trompeuse', 'UI : masse OK, SCx cache'],
  ],
  [1.5, 1.4, 2.1]
);

h2('23. Problemes potentiels detailles (catalogue de risques)');
h3('23.1 Risques donnees');
bullets([
  'Homonymes modeles (Golf 4/5/6/7/8) : annee seule insuffisante si facelift mid-year.',
  'Meme Cx publie pour toute la gamme alors que S change (SW / 5 portes).',
  'Fiches « phase 1 / phase 2 » avec aero differente non etiquetee.',
  'Valeurs copiees entre sites (fausse confirmation multi-sources).',
  'Unites melees (inch, lb) sur fiches internationales.',
  'Cx « a partir de » = meilleure finition aero, pas la tienne.',
]);
h3('23.2 Risques techniques scraping');
bullets([
  'DOM classes obfusquees / regenerées a chaque deploy front.',
  'Contenu charge en JS (SSR absent) → fetch HTML vide sans headless.',
  'Headless detecte (Playwright) → ban IP ; pour perso, preferer HTML statique.',
  'Encodage Windows-1252 vs UTF-8 → Cx « 0,32 » casse.',
  'Pagination / onglets motorisation : mauvaise ligne lue.',
  'PDF scanne image → OCR erreur 0.38 lu 0.88.',
]);
h3('23.3 Risques produit Gasoil');
bullets([
  'Ecraser un SCx manuel utilisateur par un scrape moyen → colere.',
  'Sync cloud qui propage un mauvais SCx a tous les appareils.',
  'OTA qui embarque un cache pourri → forceUpdate difficile a justifier.',
  'Trop de confiance UI (« Cx officiel ») alors que confidence 0.4.',
]);
h3('23.4 Risques legales / ethiques');
bullets([
  'ToS interdit automatisation → risque compte / IP.',
  'Redistribuer dataset aspire = zone commerciale.',
  'Contourner captcha = intention hostile (a ne jamais faire).',
]);

h2('24. Solutions possibles — explorees une par une');
h3('24.1 Saisie manuelle guidee (baseline)');
bullets([
  'Pour : zero ToS, qualite max sur TES voitures.',
  'Contre : ne scale pas a 500 modeles.',
  'Quand : toujours pour vehicules actifs du compte perso.',
  'Outillage : ecran edit + hint « ou trouver Cx » (fiche technique / PDF presse).',
]);
h3('24.2 CSV / tableur → merge-to-cache');
bullets([
  'Pour : revue humaine en masse, Git-friendly.',
  'Contre : encore manuel pour la collecte.',
  'Format : colonnes section 2 ; script valide bornes puis ecrit scxCache.',
  'Ideal Phase 1 Gasoil.',
]);
h3('24.3 Scraping poli 1 source + fixtures');
bullets([
  'Pour : accelere les trous catalogue.',
  'Contre : maintenance extracteurs ; ToS.',
  'Mitigation : cache HTML, 1 req/5s, CI fixtures, confidence gate.',
]);
h3('24.4 Multi-sources + vote');
bullets([
  'Pour : detecte copies et outliers.',
  'Contre : complexite ; fausse independance si sites se recopient.',
  'Mitigation : preferer 1 constructeur PDF + 1 fiche ; pas 3 aggregators.',
]);
h3('24.5 Estimation geometrique (dimensions → S)');
bullets([
  'Pour : comble S manquante si Cx connu.',
  'Contre : k empirique ; erreur systematique SUV.',
  'Mitigation : confidence <= 0.5 ; k par segment.',
]);
h3('24.6 Calibration inverse depuis trajets GPS');
bullets([
  'Idee : sur trajets plats a vitesse stable, estimer SCx effectif qui minimise l’erreur vs litres / jauge.',
  'Pour : personnalise a TON vehicule (jantes, barres de toit…).',
  'Contre : besoin de beaucoup de km « propres » ; vent ; trafic.',
  'Exploration future : SCx_learned = blend(cache, fit) avec poids croissant.',
]);
h3('24.7 DrivAerNet++ / ML formes');
bullets([
  'Pour : raffiner SEGMENT_DEFAULTS (pas modeles nommes).',
  'Contre : pas de mapping « 206 2001 ».',
  'Usage : labo offline uniquement.',
]);
h3('24.8 API payante (si un jour budget)');
bullets([
  'Pour : SLA, schema stable.',
  'Contre : cout ; Cx souvent encore absent.',
  'Decision : hors scope Systeme D actuel.',
]);
h3('24.9 Autoref / VIN pour masse seulement');
bullets([
  'Pour : masse fiable, deja bouton Enrichir.',
  'Contre : ne resout pas SCx.',
  'UI : ne jamais promettre « Cx via VIN ».',
]);

h2('25. Arbres de decision (que faire selon le cas)');
h3('25.1 Vehicule utilisateur actif sans SCx');
bullets([
  '1) lookup scxCache / KNOWN_PHYSICS / catalogue',
  '2) sinon segment default + badge « estime »',
  '3) proposer saisie manuelle (lien aide)',
  '4) option VIN → masse seulement',
  '5) plus tard : SCx_learned si assez de trajets',
]);
h3('25.2 Conflit scrape vs cache');
bullets([
  'Si |delta| < 0.05 → moyenne ponderee confidence',
  'Si 0.05–0.08 → garder le plus confident, log warning',
  'Si >= 0.08 → quarantine, pas de merge auto',
]);
h3('25.3 Source HTTP degradee');
bullets([
  '429/403 → disable source 7 jours, basculer autre ou manuel',
  'LAYOUT_CHANGED → freeze extracteur, alerte dev',
  'Ne jamais baisser les delais pour « rattraper »',
]);

h2('26. Problemes de matching — cas concrets FR');
bullets([
  'Peugeot 206 vs 206+ : masses/S proches mais pas identiques — cles separees.',
  '308 II vs 308 III (P5) : aero differente — yearFrom critique.',
  'Clio IV vs Clio V : ne pas matcher sur « Clio » seul.',
  'Citroën C3 Aircross vs C3 : SUV vs citadine — bodyStyle obligatoire.',
  'Partner / Rifter / Berlingo jumelles PSA : partager SCx avec caution.',
  'Touran vs Golf Sportsvan : S differente, Cx proche.',
]);

h2('27. Deep dive pipeline — etapes, echecs, retries');
h3('27.1 Resolve URL');
bullets([
  'Probleme : search interne renvoie pub / mauvaismodele.',
  'Solutions : table slug manuelle brand/model → path ; sitemap XML ; refus si score titre < seuil.',
]);
h3('27.2 Fetch');
bullets([
  'Probleme : HTML vide (SPA).',
  'Solutions : detecter « root vide » ; si SPA-only → abandon source ou headless rare (perso, risque).',
  'Probleme : timeout intermittent.',
  'Solutions : 3 retries expo (2s, 8s, 30s) ; sinon requeue J+1.',
]);
h3('27.3 Extract');
bullets([
  'Probleme : plusieurs Cx sur la page (historique generations).',
  'Solutions : ancrage section annee ; prendre tableau ligne match year.',
  'Probleme : SCx labelle « Cx » par erreur editeur.',
  'Solutions : si valeur > 0.55 et < 1.5 → probablement SCx pas Cx.',
]);
h3('27.4 Validate & merge');
bullets([
  'Toujours ecrire un rapport diff avant commit scxCache.',
  'PR / commit separe « data: enrich scx cache » pour revert facile.',
]);

h2('28. Metriques de succes du Systeme D');
bullets([
  'Couverture : % vehicules actifs avec SCx confidence >= 0.7',
  'Stabilite extracteurs : 0 LAYOUT_CHANGED / mois',
  'Conflits ouverts < 5',
  'Erreur conso autoroute vs plein (sur trajets calages) en baisse',
  'Zero scrape depuis clients mobiles',
  'Temps humain revue < 30 min / semaine',
]);

h2('29. Backlog concret Gasoil (apres ce PDF)');
table(
  ['#', 'Tache', 'Priorite'],
  [
    ['1', 'CSV import → scxCache (Phase 1)', 'Haute'],
    ['2', 'UI badge confiance SCx / « estime »', 'Haute'],
    ['3', 'Ne jamais ecraser SCx saisi user', 'Haute'],
    ['4', '1 extracteur + 5 fixtures HTML', 'Moyenne'],
    ['5', 'Rapport trous hebdo (mail)', 'Moyenne'],
    ['6', 'SCx_learned experimental (GPS)', 'Basse'],
    ['7', 'Stats DrivAer → segments', 'Basse'],
    ['8', 'Doc Aide : ou trouver Cx', 'Haute'],
  ],
  [0.5, 2.8, 0.9]
);

h2('30. Scenarios de test qualite (QA)');
bullets([
  'Ajouter 206 avec SCx cache → conso autoroute > ville a distance egale.',
  'Forcer SCx 1.2 sur citadine → conso absurde → detecteur bornes UI.',
  'VIN enrich : masse change, SCx inchange si deja present.',
  'Deux sources conflictuelles → pas de merge silencieux.',
  'Compte QA lab : verifier qu’un mauvais cache n’ecrase pas le perso (packages separes).',
]);

h2('31. Exploration « SCx appris » (detail)');
para(
  'Sur un trajet quasi plat (|denivele| faible), vitesse moyenne haute, peu d’arrets : l’energie aero domine. On peut ajuster SCx pour coller a la conso impliquee par la baisse de jauge / plein suivant.'
);
bullets([
  'Filtrer segments GPS : v > 80 km/h, accel faible, grade ~0.',
  'Integrer F_air theorique vs litres estimes / observes.',
  'Regression 1 parametre (SCx) avec regularisation vers cache a priori.',
  'N’appliquer le blend qu’apres N km (ex. 300 km autoroute cumules).',
  'Probleme : vent / pluie / charge → outliers ; mediane robuste.',
  'Probleme : plein partiel mal saisi → pollue l’apprentissage.',
]);

h2('32. Exploration headless vs HTTP simple');
bullets([
  'HTTP simple : prefere ; testable ; cacheable ; CI friendly.',
  'Headless : seulement si contenu 100 % JS et source critique — sinon cout + detection.',
  'Alternative : archive.today / PDF presse deja telecharge manuellement.',
]);

h2('33. Gouvernance des donnees dans le repo');
bullets([
  'lib/scxCache.ts : valeurs normalisees + source courte (OK git).',
  'data/scx-raw/ : HTML brut gitignore.',
  'data/scx-quarantine.jsonl : conflits a revoir.',
  'Ne pas committer d’emails / tokens dans les URLs de debug.',
]);

h2('34. FAQ longue');
bullets([
  'Q : Pourquoi pas tout scrapter ce week-end ? R : ToS + casse + faux matching > benefice.',
  'Q : Le Cx Wikipedia suffit ? R : Parfois ; toujours noter source et annee.',
  'Q : SCx 0.63 pour 206 c’est « vrai » ? R : Ordre de grandeur fiche/moyenne — assez pour le modele.',
  'Q : L’API Autoref donnera le Cx un jour ? R : Ne pas compter dessus ; masse oui.',
  'Q : On peut vendre le cache ? R : Non — usage perso / app.',
  'Q : DrivAer remplace Zeperfs ? R : Non — roles differents.',
  'Q : Que faire si je doute ? R : Laisser segment + badge estime, saisir a la main plus tard.',
]);

h2('35. Checklist operationnelle semaine type');
bullets([
  'Lun : lister trous (vehicules sync sans SCx haute confiance)',
  'Mar : 5 fiches manuelles OU 1 run scrape poli limite',
  'Mer : revue quarantine / conflits',
  'Jeu : merge → scxCache + tests vitest physics',
  'Ven : si change runtime → bump version + OTA seulement si besoin app',
  'Continue : jamais scraper depuis CI publique sans secrets/rate-limit',
]);

h2('36. Resume executif (complet)');
bullets([
  'APIs gratuites : identite + parfois masse — pas le Cx.',
  'SCx = champ runtime ; Cx+S = forme noble pour audit.',
  'Fiabilite = cache HTML + extracteurs testes + validation + fusion + revue humaine.',
  'Explorer aussi : CSV, estimation S, SCx_learned GPS, DrivAer segments — pas une seule voie.',
  'Risques majeurs : mauvais matching, faux Cx marketing, ecrasement saisie user, ToS.',
  'Gasoil a le tuyau (scxCache) : le nourrir proprement en phases.',
  'Volume perso, offline offline, pas dans l’APK client.',
]);

note(
  'Rapport complete (v2) — risques, matrices solutions, backlog, SCx_learned, FAQ. Pipeline scripts/reports + verify-overflow. Aucun scrape live execute pour ce document.'
);

const pages = writeFooters('Gasoil Tracking — Cx/SCx Systeme D');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
