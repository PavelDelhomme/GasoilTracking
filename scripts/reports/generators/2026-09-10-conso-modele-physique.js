'use strict';
/**
 * Modèle physique de consommation (bilan de forces) — sans OBD.
 *
 *   ./scripts/reports/run-report.sh generators/2026-09-10-conso-modele-physique.js --mail \
 *     --subject "Gasoil Tracking — Modèle physique de consommation"
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Modele-Physique-Conso-2026-09-10.pdf';
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
    Title: 'Gasoil Tracking — Modèle physique de consommation',
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
  .text('Modèle physique de consommation (sans OBD)', LEFT(), doc.y, { width: WIDTH() });
para(
  'Passage du modèle heuristique (coefficients L/100) au bilan de forces point à point ' +
    'sur le tracé GPS. Objectif : 5–10 % d’écart typique vs réalité, sans boîtier diagnostic.'
);
callout(
  'Version cible',
  '1.4.90 — lib/vehiclePhysics.ts + estimateTripFuelPhysics dans consumptionModel.ts',
  ACCENT
);
kvList([
  ['Date', '2026-09-10'],
  ['Branche', 'prod'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Repli', 'Heuristique L/100 si pas de tracé GPS (≥2 points)'],
]);

h2('1. Pourquoi changer');
bullets([
  'Vitesse : un facteur fixe (+6 % / +12 %) sous-estime fortement l’aéro (∝ v², puissance ∝ v³).',
  'Dénivelé : un malus sur l’ascension ignore le frein moteur / descente (conso ~0).',
  'Boîte : un malus fixe L/100 selon le nb de rapports est grossier ; mieux vaut η_trans.',
  'Accélération : mieux capturée par F = m·a à chaque seconde que par un ratio d’événements.',
]);

h2('2. Équations implémentées');
h3('Forces instantanées');
para(
  'À chaque segment GPS (Δt typ. 1 s) : F_totale = F_air + F_roulement + F_pente + F_inertie'
);
table(
  ['Terme', 'Formule', 'Constantes'],
  [
    ['Air', '½ ρ SCx v²', 'ρ = 1,225 kg/m³'],
    ['Roulement', 'Cr · m · g · cos θ', 'Cr ≈ 0,011'],
    ['Pente', 'm · g · sin θ', 'θ via Δalt / Δdist'],
    ['Inertie', 'm · a', 'a = Δv / Δt (borné)'],
  ],
  [1.2, 2.2, 1.6]
);

h3('Puissance → litres');
bullets([
  'Si F > 0 : P_roues = F · v ; P_moteur = P_roues / η_trans',
  'Si F ≤ 0 : injection coupée → P_moteur = 0 (descente / frein moteur)',
  'Ralenti (v < ~2 km/h) : P_moteur ≈ 1,75 kW',
  'Débit [L/s] = P_moteur / (η_moteur · E_carburant)',
  'Essence ≈ 32 MJ/L, η ≈ 0,28 ; gazole ≈ 38 MJ/L, η ≈ 0,33 (−0,001 / 5 ans après 10 ans)',
  'Total trajet = somme des débits × Δt',
]);

h2('3. Données véhicule (saisies / défauts auto)');
para(
  'À l’ajout ou à l’édition, l’app propose des défauts selon le segment (citadine, berline, SUV…). ' +
    'L’utilisateur peut tout modifier.'
);
table(
  ['Champ', 'Rôle', 'Défaut exemple'],
  [
    ['vehicleSegment', 'Choisit masse / SCx / rapports', 'city → 1050 kg, SCx 0,62'],
    ['curbWeightKg', 'Masse à vide', 'selon segment'],
    ['payloadKg', 'Conducteur + charge', '150 kg'],
    ['dragAreaScx', 'S × Cx aérodynamique', '0,62–1,1 m²'],
    ['transmissionGears', 'η_trans (0,85…0,90)', '5 → 0,87 ; 6 → 0,89'],
  ],
  [1.6, 2.2, 1.4]
);
note(
  'Véhicules déjà en base sans ces champs : résolution automatique via marque/modèle ' +
    '(inferVehicleSegment) — pas de migration manuelle obligatoire.'
);

h2('4. Quand le modèle physique s’applique');
table(
  ['Contexte', 'Mode'],
  [
    ['GPS live (locationService) + stats trajet', 'Physique (points)'],
    ['Fin de trajet + profil Open-Meteo', 'Physique + altitudes'],
    ['Distance seule / seed / stats L/100', 'Heuristique (repli)'],
    ['forceHeuristic: true (tests)', 'Heuristique forcée'],
  ],
  [2.4, 1.6]
);

h2('5. Fichiers touchés');
bullets([
  'lib/vehiclePhysics.ts — segments, rendements, suggestPhysicsFields',
  'lib/consumptionModel.ts — estimateTripFuelPhysics + branchement estimateTripFuelLiters',
  'types + database (+ web) — curb_weight_kg, drag_area_scx, vehicle_segment, payload_kg',
  'app/vehicle/add.tsx & edit.tsx — UI segment / masse / SCx / charge / boîte',
  'calculations, locationService, trip, repairTripHistory — passent points (± altitudes)',
]);

h2('6. Limites honnêtes');
bullets([
  'Pas de cartographie moteur couple/régime réelle (rendement moyen constant).',
  'Vent, température, clim, charge remorque non modélisés.',
  'Altitude GPS téléphone souvent bruyante → profil Open-Meteo en fin de trajet.',
  'Marge attendue ~5–15 % ; le facteur appris (jauges / pleins) reste un correctif.',
]);

h2('7. Suite possible');
bullets([
  'Préremplir masse / SCx depuis catalogue enrichi (fiche technique).',
  'Afficher « conso physique vs catalogue » sur le détail trajet.',
  'Calibrage η_moteur par famille Euro / cylindrée (approche COPERT).',
]);

const pages = writeFooters('Gasoil Tracking — modèle physique conso');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
