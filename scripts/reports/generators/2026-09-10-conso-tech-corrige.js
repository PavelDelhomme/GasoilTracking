'use strict';
/**
 * Rapport technique corrigé — caractéristiques véhicule + modèle physique conso.
 * Remplace / complète le PDF heuristique du 2026-09-10.
 *
 *   ./scripts/reports/run-report.sh generators/2026-09-10-conso-tech-corrige.js --mail \
 *     --subject "Gasoil Tracking — Rapport technique conso (corrigé)"
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Rapport-Tech-Conso-Corrige-2026-09-10.pdf';
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
    Title: 'Gasoil Tracking — Rapport technique conso (corrigé)',
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
doc.font('Helvetica-Bold').fontSize(17).fillColor(DARK).text('Gasoil Tracking', LEFT(), doc.y, {
  width: WIDTH(),
});
doc
  .font('Helvetica-Bold')
  .fontSize(13)
  .fillColor(DARK)
  .text('Rapport technique — consommation & caractéristiques véhicule', LEFT(), doc.y, {
    width: WIDTH(),
  });
para(
  'Document corrigé suite au passage au modèle physique (bilan de forces). ' +
    'Il remplace l’analyse du PDF « formules heuristiques » : ce qui était approximatif y est ' +
    'expliqué, puis aligné sur la physique réelle, avec la liste exacte des infos véhicule ' +
    'à demander / préremplir / laisser modifier.'
);
callout(
  'Version cible',
  '1.4.90 (versionCode 116) — modèle physique actif dès qu’un tracé GPS (≥2 points) est dispo.',
  ACCENT
);
kvList([
  ['Date', '2026-09-10'],
  ['Branche', 'prod'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Précision attendue', '~5–15 % sans OBD (GPS + fiche véhicule)'],
  ['Ancien PDF', 'Formules heuristiques L/100 (coefficients) — incomplet'],
]);

h2('Sommaire');
bullets([
  '1. Ce qu’on a appris (écarts heuristique vs physique)',
  '2. Caractéristiques véhicule à prendre en compte',
  '3. Défauts auto par segment (préremplissage)',
  '4. Modèle physique — équations et constantes',
  '5. Données trajet (GPS / altitude)',
  '6. Ce qui a été ajouté dans l’app',
  '7. Quand physique vs heuristique',
  '8. Limites honnêtes & suite',
]);

h2('1. Ce qu’on a appris — écarts du modèle précédent');
para(
  'Le modèle historique multipliait une conso catalogue (L/100) par des facteurs : âge, boîte, ' +
    'vitesse moyenne, dénivelé cumulé, idle, accélérations, stop-go, plafond ~1,10. ' +
    'Courant en soft, mais pas un bilan énergétique.'
);
table(
  ['Sujet', 'Avant (heuristique)', 'Maintenant (physique)'],
  [
    [
      'Vitesse / aéro',
      'Paliers fixes (+6 % / +12 %…)',
      'F_air = ½ ρ SCx v² à chaque point',
    ],
    [
      'Dénivelé',
      'Malus sur ascension totale',
      'm g sin θ signé (+ montée, − descente)',
    ],
    [
      'Descente / frein moteur',
      'Jamais « conso 0 »',
      'Si F_totale ≤ 0 → P_moteur = 0',
    ],
    [
      'Boîte',
      'Malus fixe sur L/100',
      'η_trans selon nb de rapports',
    ],
    [
      'Accélération',
      'Ratio d’événements brusques',
      'F = m · a instantané',
    ],
    [
      'Plafond 1,10',
      'Borne arbitraire de coefficients',
      'Inutile — la mécanique borne seule',
    ],
  ],
  [1.1, 1.9, 2.0]
);
note(
  'Sans OBD, on n’a pas le régime / couple réel. On utilise des rendements moyens ' +
    '(moteur + transmission) + GPS. C’est le compromis ingénierie standard (type bilan de forces / VT-Micro).'
);

h2('2. Caractéristiques véhicule à prendre en compte');
para(
  'Pour chaque véhicule (ajout ou édition), l’app propose des valeurs auto ; ' +
    'l’utilisateur corrige ce qui change vraiment la conso.'
);

h3('2.1 Champs déjà utiles (catalogue / fiche)');
table(
  ['Champ', 'Pourquoi ça compte', 'Où'],
  [
    ['brand / model / year', 'Segment auto + âge → η_moteur', 'Ajout / édition'],
    ['fuelType', 'Énergie J/L + rendement thermique', 'Ajout / édition'],
    ['consumptionPer100', 'Repli heuristique + affichage', 'Catalogue / adapt pleins'],
    ['tankCapacity', 'Jauge / autonomie (pas la physique)', 'Ajout / édition'],
    ['transmissionGears', 'η_trans (0,85…0,90)', 'Ajout / édition'],
    ['consumptionLearnFactor', 'Correctif perso (jauges / pleins)', 'Appris auto'],
  ],
  [1.6, 2.2, 1.2]
);

h3('2.2 Nouveaux champs physiques (demandés / préremplis)');
table(
  ['Champ DB / UI', 'Rôle dans le calcul', 'Défaut si vide'],
  [
    ['vehicleSegment', 'Choisit masse / SCx / rapports types', 'Inféré marque+modèle'],
    ['curbWeightKg', 'Masse à vide → m = curb + payload', 'Selon segment'],
    ['payloadKg', 'Conducteur + passagers / bagages', '150 kg'],
    ['dragAreaScx', 'S × Cx (m²) → résistance air', 'Selon segment'],
    ['transmissionGears', 'η_trans (4→0,85 ; 5→0,87 ; 6→0,89 ; 7+→0,90)', 'Selon segment'],
  ],
  [1.5, 2.3, 1.4]
);
callout(
  'Règle UX',
  'Préremplir intelligemment → l’utilisateur ne touche que ce qu’il connaît ' +
    '(ex. masse carte grise, SUV plus lourd, charge familiale). Rien n’est obligatoire pour démarrer.',
  ACCENT
);

h3('2.3 Constantes dérivées (pas saisies, calculées)');
table(
  ['Grandeur', 'Formule / valeur', 'Source'],
  [
    ['m (masse totale)', 'curbWeightKg + payloadKg', 'vehiclePhysics'],
    ['Cr (roulement)', '0,011', 'Pneus moyens'],
    ['ρ (air)', '1,225 kg/m³', 'Standard'],
    ['g', '9,81 m/s²', 'Standard'],
    ['η_moteur', '0,28 essence / 0,33 diesel / 0,26 GPL (−0,001 / 5 ans après 10 ans)', 'Âge + carburant'],
    ['E_carburant', '32 MJ/L essence · 38 MJ/L diesel · 25 MJ/L GPL', 'Densité énergétique'],
    ['P_ralenti', '1,75 kW si v < ~2 km/h', 'Constante'],
  ],
  [1.4, 2.6, 1.0]
);

h2('3. Défauts auto par segment');
para(
  'Quand marque/modèle est reconnu (ex. 206 → citadine, 806 → monospace, 3008 → SUV), ' +
    'ou quand l’utilisateur choisit un segment, ces valeurs sont proposées :'
);
table(
  ['Segment', 'Label UI', 'Masse vide', 'S × Cx', 'Rapports'],
  [
    ['city', 'Citadine', '1050 kg', '0,62 m²', '5'],
    ['sedan', 'Berline / compacte', '1300 kg', '0,68 m²', '6'],
    ['suv', 'SUV / crossover', '1550 kg', '0,82 m²', '6'],
    ['mpv', 'Monospace', '1600 kg', '0,85 m²', '6'],
    ['van', 'Utilitaire / fourgon', '1800 kg', '1,05 m²', '6'],
    ['pickup', 'Pick-up', '2000 kg', '1,10 m²', '6'],
  ],
  [1.0, 1.6, 1.1, 1.0, 0.9]
);
note(
  'Exemples mots-clés : 206/208/Clio → city ; 806/Berlingo → mpv ; 3008/Captur/Duster → suv. ' +
    'Sinon défaut berline. Véhicules déjà en base sans ces colonnes : résolution à la volée, pas de migration forcée.'
);

h2('4. Modèle physique — équations');
h3('4.1 Forces à chaque seconde GPS');
para('F_totale(t) = F_air + F_roulement + F_pente + F_inertie');
bullets([
  'F_air = ½ · ρ · SCx · v²',
  'F_roulement = Cr · m · g · cos θ',
  'F_pente = m · g · sin θ   (θ ≈ Δaltitude / Δdistance, borné ±35 %)',
  'F_inertie = m · a   (a = Δv/Δt, borné ±6 m/s²)',
]);

h3('4.2 Puissance moteur et litres');
bullets([
  'Si F_totale > 0 : P_roues = F · v ; P_moteur = P_roues / η_trans',
  'Si F_totale ≤ 0 : P_moteur = 0 (injection coupée — descente / frein moteur)',
  'Si v < ~2 km/h : P_moteur = P_ralenti (1,75 kW)',
  'Débit [L/s] = P_moteur / (η_moteur · E_carburant)',
  'Litres trajet = Σ débit(t) · Δt   puis × consumptionLearnFactor',
]);

h3('4.3 Comparaison haute vitesse (intuition)');
para(
  'Passer de 90 à 130 km/h ne « coûte » pas +12 % comme un facteur fixe : ' +
    'la résistance air croît en v² et la puissance en v³. Le modèle physique ' +
    'capture cet écart sans table de paliers.'
);

h2('5. Données trajet (dynamiques)');
table(
  ['Entrée', 'Source', 'Usage'],
  [
    ['v, a', 'Points GPS (lat/lon/timestamp)', 'Forces air + inertie'],
    ['θ (pente)', 'Altitude GPS ou profil Open-Meteo', 'Force de pente signée'],
    ['Δt', 'Différence timestamps', 'Intégration L/s'],
    ['learnedFactor', 'Jauge début/fin + pleins', 'Correctif utilisateur'],
  ],
  [1.2, 2.2, 1.8]
);
para(
  'En live, le GPS alimente le modèle sans appeler Open-Meteo à chaque tick. ' +
    'En fin de trajet (et repair history), un profil d’altitude est récupéré pour affiner la pente.'
);

h2('6. Ce qui a été ajouté dans l’app');
h3('6.1 Code');
bullets([
  'lib/vehiclePhysics.ts — segments, défauts, η_trans, η_moteur, suggestPhysicsFields',
  'lib/consumptionModel.ts — estimateTripFuelPhysics + branchement dans estimateTripFuelLiters',
  'types Vehicle + SQLite/web — curb_weight_kg, drag_area_scx, vehicle_segment, payload_kg',
  'app/vehicle/add.tsx & edit.tsx — UI segment / masse / SCx / charge / boîte',
  'locationService, calculateTripStats, fin de trajet, repairTripHistory — passent points (± altitudes)',
  'Tests Vitest — physique (montée > plat, forceHeuristic) + accélération heuristique conservée',
]);

h3('6.2 UX « demander / auto / modifier »');
bullets([
  'Ajout 1 tap (favori catalogue) : physique préremplie via marque/modèle',
  'Saisie manuelle : changer marque/modèle recalcule segment + masse + SCx',
  'Chips segment : un tap recharge les défauts du segment choisi',
  'Édition d’un véhicule existant : mêmes champs, valeurs résolues si absentes en base',
]);

h2('7. Quand physique vs heuristique');
table(
  ['Situation', 'Mode utilisé'],
  [
    ['Trajet GPS live / stats avec routePoints', 'Physique'],
    ['Fin de trajet + profil altitude', 'Physique + altitudes'],
    ['Distance seule, seed, L/100 sans tracé', 'Heuristique (repli)'],
    ['Tests / forceHeuristic: true', 'Heuristique forcée'],
  ],
  [2.6, 1.6]
);

h2('8. Limites honnêtes & suite');
bullets([
  'Pas de cartographie couple/régime réelle (rendement moyen constant).',
  'Vent, température, clim, remorque non modélisés.',
  'Altitude téléphone souvent bruitée → Open-Meteo en fin de trajet.',
  'Le facteur appris (jauges / pleins) reste utile pour coller à ton style de conduite.',
]);
h3('Suite possible');
bullets([
  'Enrichir le catalogue (masse / SCx réels par modèle)',
  'Afficher sur le détail trajet « physique vs catalogue »',
  'Affiner η_moteur par norme Euro / cylindrée (approche type COPERT)',
  'Stocker altitude GPS live quand fiable pour moins dépendre d’Open-Meteo',
]);

note(
  'Généré via scripts/reports (pdfkit-safe) — overflow vérifié avant envoi. ' +
    'Fichier : GasoilTracking-Rapport-Tech-Conso-Corrige-2026-09-10.pdf'
);

const pages = writeFooters('Gasoil Tracking — rapport tech conso corrigé');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
