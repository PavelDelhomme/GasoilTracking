'use strict';
/**
 * Récap v1.4.86 — Maps/QR/sync + UX trajet/budget/historique + conso accélérations
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Recap-1.4.86-2026-09-10.pdf';
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
    Title: 'Gasoil Tracking — Récap 1.4.86',
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
  'Livraison 1.4.86 — bugs Maps/QR/sync, UX trajet·budget·historique·jauge, conso live accélérations.'
);
callout(
  'Version',
  'Mobile OTA 1.4.86 (versionCode 112) · web Docker APP_VERSION 1.4.86 · forceUpdate',
  ACCENT
);

kvList([
  ['Date', '2026-09-10'],
  ['Branche', 'prod'],
  ['Site', 'https://gasoil-tracking.delhomme.ovh'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Tests', 'vitest 38 assertions — Maps, sync-hash, short-trip, accel'],
]);

h2('1. Bugs bloquants corrigés');
table(
  ['Sujet', 'Détail'],
  [
    ['QR rate-limit', 'GET /qr/poll hors authLimiter ; qrPollLimiter 120/min + backoff client 429'],
    [
      'Maps via cassé',
      'waypoints encodeURIComponent ; vias géométrie seulement éco/alt ; intent nav sans via',
    ],
    ['Trajet < 500 m', 'Dialog Supprimer / Conserver (shouldDeleteShortTrip)'],
    [
      'Sync intelligente',
      'expo-network reconnect + snapshotContentHash → skipped si local ≡ remote',
    ],
  ],
  [1.1, 2.3]
);

h2('2. UX Trajet (En cours)');
bullets([
  'Picker itinéraire unique (overlay carte) — plus de doublon ITINÉRAIRE formulaire',
  'Chip nom véhicule flottant + FloatingFuelBadge draggable (L / %)',
  'Boutons courts : Plein / Pause / Terminer trajet',
  'FAB éventail : Ouvrir Maps / Saisie manuelle / Importer',
  'FAB Accueil → trip?tab=live&reset=1 (reset destination / routes)',
  'Guidance : hors corridor → pas de « Demi-tour » alarmiste',
]);

h2('3. Budget / Historique / Accueil / Jauge');
bullets([
  'Budget : chips véhicule + Toutes (sans titre « Budget & planification »)',
  'Historique : filtre Toutes / véhicules (selectVehicle aligné)',
  'Accueil : chips tronquées + « Voir tous » ; texte ~X L · ~Y km sous jauge',
  'Jauge : icône crayon coin haut-droit (partout)',
]);

h2('4. Conso live + accélérations');
para(
  'locationService (natif + web) et calculateTripStats passent désormais accelAggressionFactor, stopAndGo, idleRatio et avgSpeed à estimateTripFuelLiters — aligné avec la fin de trajet.'
);

h2('5. Déploiement');
bullets([
  'Commit + push branche prod',
  'Upload APK /api/ci/releases (forceUpdate, versionCode 112)',
  'make deploy (Portainer / Docker web+api)',
]);

h2('6. À vérifier sur téléphone');
bullets([
  'QR web : poll sans bloquer login 15 min',
  'Trajet éco → Maps suit le corridor (via encodés) ; rapide → pas de via fantôme',
  'Terminer un trajet quasi immobile → proposer suppression',
  'Badge essence déplaçable pendant trajet actif',
  'Budget / Historique : chip Toutes puis retour véhicule actif',
]);

note('Données perso non écrasées — sync skip si hash identique ; pas de wipe volontaire.');

const pages = writeFooters('Gasoil Tracking — récap 1.4.86');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
