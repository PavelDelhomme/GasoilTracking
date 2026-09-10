'use strict';
/**
 * Rapport technique — caractéristiques véhicule + formules de consommation.
 *
 *   ./scripts/reports/run-report.sh generators/2026-09-10-conso-formules.js --mail \
 *     --subject "Gasoil Tracking — Formules conso & caractéristiques véhicule"
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Formules-Conso-Caracteristiques-2026-09-10.pdf';
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
    Title: 'Gasoil Tracking — Formules conso & caractéristiques véhicule',
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
para(
  'Rapport technique complet : d’où viennent les caractéristiques véhicule (dont la boîte), ' +
    'et comment chaque formule calcule la consommation (trajets GPS, moyennes pleins, facteurs vitesse / dénivelé / style).'
);
callout(
  'Verdict honnête',
  'La boîte (nb de rapports) est prise en compte, mais de façon grossière (+0 à +6 %). ' +
    'Il n’y a pas de ratios de démultiplication, ni de sélection de rapport en roulant, ' +
    'ni de vitesses limites réelles de la route dans le modèle L/100.',
  ACCENT
);
kvList([
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Date', '10/09/2026'],
  ['Fichiers clés', 'lib/consumptionModel.ts · lib/calculations.ts · types · vehicle/edit'],
  ['App live', 'https://gasoil-tracking.delhomme.ovh'],
]);

h2('Sommaire');
bullets([
  '1. Caractéristiques véhicule — stockage et origine',
  '2. Champ « boîte » (transmissionGears) — ce qu’il fait vraiment',
  '3. Formule centrale estimateTripFuelLiters',
  '4. Facteurs détaillés (âge, boîte, vitesse, idle, accel, stop-go, dénivelé)',
  '5. Consommation moyenne depuis les pleins',
  '6. Adaptation auto de consumptionPer100',
  '7. Où chaque formule est utilisée (et où elle ne l’est pas)',
  '8. Lacunes / non implémenté',
  '9. Exemple numérique chiffré',
]);

h2('1. Caractéristiques véhicule — stockage et origine');
para(
  'Un véhicule (type Vehicle) regroupe des champs saisis ou choisis dans un catalogue local, ' +
    'puis persistés en SQLite (mobile) / stockage web, et synchronisés via snapshot cloud.'
);
table(
  ['Champ', 'Rôle', 'Origine'],
  [
    ['consumptionPer100', 'L/100 de base du modèle', 'Catalogue / saisie / adapt pleins'],
    ['tankCapacity', 'Capacité réservoir (L)', 'Catalogue / saisie'],
    ['fuelType', 'diesel / essence / gpl / élec', 'Catalogue / saisie'],
    ['year', 'Âge → facteur conso', 'Saisie'],
    ['transmissionGears', 'Nb de rapports (4/5/6…)', 'Édition véhicule seulement'],
    ['consumptionLearnFactor', 'Multiplicateur trajet', 'Défaut 1 ; reset après adapt'],
    ['consumptionAutoAdapt', 'Recalibre L/100 via pleins', 'Opt-out possible'],
    ['estimatedFuelLiters', 'Niveau jauge estimé', 'Jauge UI / burn trajet / pleins'],
    ['defaultFuelPrice', 'Prix €/L défaut', 'Saisie / stations'],
  ],
  [1.4, 1.8, 1.8]
);
para(
  'Catalogue : constants/vehicles.ts (presets marque/modèle/année/conso/tank/fuel). ' +
    'Le catalogue ne fournit pas le nombre de rapports. ' +
    'À la création (vehicle/add), le champ boîte n’est pas proposé → transmissionGears reste souvent null. ' +
    'Il s’édite dans vehicle/edit (« Boîte (nb de rapports) »).'
);
note('Pas d’API externe qui « détecte » la boîte ou estime la conso catalogue.');

h2('2. Champ « boîte » — ce qu’il fait vraiment');
para(
  'transmissionGears est un entier (ex. 5 ou 6). Ce n’est pas le type manuelle/auto, ' +
    'ni une table de rapports (1ère = x, 2ème = y).'
);
h3('Facteur transmissionFactor(gears)');
bullets([
  'gears null / ≤ 0 → facteur = 1 (neutre)',
  'gears ≤ 4 → 1,06 (+6 %)',
  'gears = 5 → 1,02 (+2 %)',
  'gears ≥ 6 → 1,00 (neutre)',
]);
para(
  'Ce facteur multiplie le L/100 dans estimateTripFuelLiters. ' +
    'Il n’y a aucun lien avec la vitesse limite du trajet, ni avec la vitesse instantanée pour « choisir un rapport ».'
);
callout(
  'Réponse directe',
  'Oui, on « calcule avec la boîte » si le nb de rapports est renseigné — mais uniquement comme bonus/malus fixe. ' +
    'Non, on ne modélise pas les rapports vs vitesse limite vs vitesse utilisateur.',
  ACCENT
);

h2('3. Formule centrale — estimateTripFuelLiters');
para('Fichier : lib/consumptionModel.ts. Entrées : véhicule, distanceKm, contexte optionnel.');
para('Pipeline :');
bullets([
  'base = consumptionPer100 si > 0, sinon 7,5 L/100',
  'age = vehicleAgeFactor(year)',
  'gear = transmissionFactor(gears du ctx ou du véhicule)',
  'learned = learnedFactor (ctx ou vehicle), défaut 1 (seuil > 0,5)',
  'elev = elevationFactor(ascentM, distanceKm)',
  'speed = speedConsumptionFactor(avgSpeedKmh)',
  'traffic = trafficIdleFactor(idleRatio)',
  'accel / stopGo = facteurs style (sinon 1)',
  'situational = min(1,10 , speed × traffic × accel × stopGo)',
  'l100 = base × age × gear × 1,04 × learned × elev × situational',
  'litres = arrondi 2 décimales de (distanceKm × l100 / 100)',
]);
para('Constante REAL_WORLD_MARGIN = 1,04 (+4 % « monde réel » vs conso catalogue idéale).');
para(
  'Plafond situational à ×1,10 : même si vitesse + idle + accel poussent fort, ' +
    'l’empilement des facteurs situationnels est limité pour rester proche de la conso véhicule recalibrée aux pleins.'
);

h2('4. Facteurs détaillés');
h3('4.1 Âge — vehicleAgeFactor(year)');
table(
  ['Âge (ans)', 'Facteur'],
  [
    ['≤ 8', '1,00'],
    ['8 → 15', '1 + (âge−8) × 0,005'],
    ['15 → 25', '1,035 + (âge−15) × 0,004'],
    ['> 25', 'min(1,08 , 1,075 + (âge−25) × 0,002)'],
    ['année invalide', '1,04'],
  ],
  [1.5, 3]
);

h3('4.2 Vitesse moyenne en mouvement — speedConsumptionFactor');
para(
  'La vitesse utilisée est la moyenne en mouvement (segments ≥ 5 km/h), pas la moyenne mur-à-mur. ' +
    'Plafond GPS plausible : 130 km/h (MAX_PLAUSIBLE_SPEED_KMH).'
);
table(
  ['Vitesse moy. (km/h)', 'Facteur'],
  [
    ['< 15', '1,14'],
    ['15–35', '1,08'],
    ['35–55', '1,04'],
    ['55–95', '1,00 (neutre)'],
    ['95–115', '1,06'],
    ['115–130', '1,12'],
    ['≥ 130', '1,16'],
  ],
  [2, 2]
);
para(
  'Les « vitesses limites » du simulateur GPS (30/50/80/90…) servent uniquement à générer des points de test, ' +
    'pas à pondérer le L/100 en production.'
);

h3('4.3 Idle / bouchons — trafficIdleFactor');
para('idleRatio = part du temps tracé < 5 km/h (0–0,9). Facteur = 1 + clamp(idle, 0..0,85) × 0,12.');

h3('4.4 Accélérations — accelAggressionFactor');
para(
  'Sur triplets de points : compte les |Δv| ≥ 15 km/h sur dt < 4 s. ' +
    'ratio = min(0,45 , harsh/samples) ; facteur = 1 + ratio × 0,14 (jusqu’à ~+12 %). ' +
    'Nécessite ≥ 8 échantillons valides.'
);

h3('4.5 Stop-and-go — stopAndGoFactor');
para('Transitions arrêt (< 5 km/h) → mouvement ; jusqu’à +10 %.');

h3('4.6 Dénivelé — elevationFactor');
para('per10km = (ascentM / max(distanceKm,1)) × 10 ; facteur = min(1,45 , 1 + (per10km/100) × 0,08).');
para(
  'Ascent via Open-Meteo (fetchElevationAscentM), surtout à la fin de trajet / repair history. ' +
    'Le live GPS (calculateTripStats / locationService) n’injecte en général pas ascentM → elev = 1 en cours de route.'
);

h2('5. Consommation moyenne depuis les pleins');
para('getConsumptionStats(vehicleId) — lib/calculations.ts');
bullets([
  'Entre pleins complets : L/100 = litres_courant / distance × 100 (compteur, km saisis, ou trajets)',
  'Plus tout plein avec distanceSinceLastKm > 0',
  'Filtre isSaneConsumptionSample : thermique 3–18 L/100 ; élec 5–40',
  'averageConsumption = moyenne arithmétique des échantillons sains (sinon 0)',
]);
para('calculateRealConsumption(prev, curr) : même logique sur un seul intervalle plein→plein.');

h2('6. Adaptation auto — adaptVehicleConsumption');
para('Après un plein (si consumptionAutoAdapt ≠ false et pas électrique) :');
bullets([
  'Échantillons L/100 (distance ≥ 20 km)',
  'Garde les 6 derniers ; poids w = (i+1)² (le plus récent pèse le plus)',
  'measured = moyenne pondérée',
  '1er échantillon : next = 0,9×measured + 0,1×prev ; sinon 0,75 / 0,25',
  'Clamp Δ : max(1,2 , prev×0,35) L/100',
  'Écrit consumptionPer100 et remet consumptionLearnFactor = 1 (évite double peine)',
]);

h2('7. Où c’est branché (et où non)');
h3('Modèle complet estimateTripFuelLiters');
bullets([
  'Trajet live GPS (locationService)',
  'Fin de trajet (trip.tsx) avec accel / idle / ascent quand dispo',
  'calculateTripStats, applyTripFuelBurn, repairTripHistory, seed démo',
]);
h3('Conso linéaire simple (km × L/100 / 100) sans facteurs');
bullets([
  'Budget / trajets manuels / import / station fillup (certains chemins)',
  'budgetOutlook planned routes',
]);
h3('Helpers définis mais non branchés en prod UI');
bullets([
  'learnedFactorFromGauge — pas d’appel prod',
  'learnFactorFromFullFillUps — jamais appelé',
  'blendConsumptionLearnFactor — jamais appelé',
]);
para(
  'La jauge au démarrage de trajet met à jour estimatedFuelLiters (niveau), ' +
    'pas le facteur d’apprentissage.'
);

h2('8. Lacunes / non implémenté');
bullets([
  'Pas de type boîte manuelle vs automatique',
  'Pas de ratios / régimes / choix de rapport selon vitesse',
  'Pas de vitesse limite cartographique dans la conso',
  'Champ gears absent à la création véhicule (souvent null → facteur 1)',
  'Catalogue sans gears',
  'Dénivelé surtout en post-traitement, pas live',
  'Électrique : pas d’adapt auto kWh/100 dédié',
  'Facteurs situationnels plafonnés à ×1,10',
]);

h2('9. Exemple numérique');
para(
  'Véhicule : consumptionPer100 = 7,0 · année 2003 (âge ~23) · 5 rapports · trajet 40 km · ' +
    'vitesse moy. mouvement 48 km/h · idle 20 % · ascent 120 m · learn = 1 · accel/stopGo ≈ 1.'
);
bullets([
  'age ≈ 1,035 + (23−15)×0,004 = 1,067',
  'gear = 1,02',
  'margin = 1,04',
  'elev : per10km = (120/40)×10 = 30 → 1 + 0,30×0,08 = 1,024',
  'speed (48) = 1,04',
  'traffic (0,20) = 1 + 0,20×0,12 = 1,024',
  'situational = min(1,10 , 1,04×1,024×1×1) ≈ 1,065',
  'l100 ≈ 7,0 × 1,067 × 1,02 × 1,04 × 1 × 1,024 × 1,065 ≈ 8,5 L/100',
  'litres ≈ 40 × 8,5 / 100 ≈ 3,4 L',
]);
note(
  'Chiffres arrondis pour lisibilité. Le code arrondit les litres à 2 décimales en fin de formule.'
);

h2('10. Fichiers de référence');
table(
  ['Fichier', 'Contenu'],
  [
    ['lib/consumptionModel.ts', 'Tous les facteurs + estimateTripFuelLiters'],
    ['lib/calculations.ts', 'Stats pleins, adapt, calculateTripStats'],
    ['lib/fuelLevel.ts', 'Burn trajet, jauge, preview plein'],
    ['types/index.ts', 'Interface Vehicle'],
    ['app/vehicle/edit.tsx', 'Saisie transmissionGears'],
    ['constants/vehicles.ts', 'Catalogue presets'],
    ['app/(tabs)/trip.tsx', 'Fin trajet + facteurs GPS'],
  ],
  [2.2, 2.8]
);

callout(
  'Suite possible (si tu valides)',
  'Renseigner gears à la création ; distinguer auto/manuel ; ou brancher un vrai modèle ' +
    'rapport/vitesse — à discuter après ta relecture de ce PDF.',
  ACCENT
);

const pages = writeFooters('Gasoil Tracking — formules conso');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
