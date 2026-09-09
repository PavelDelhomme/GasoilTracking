'use strict';
/**
 * Récap v1.4.85 — sync/jauge + header sync/thème + trajets Maps
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Recap-1.4.85-2026-09-09.pdf';
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
    Title: 'Gasoil Tracking — Récap 1.4.85',
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
para('Livraison 1.4.85 — sync téléphone/web, jauge Annuler/OK, header sync≠thème, trajets Maps.');
callout('Version', 'Mobile OTA 1.4.85 (versionCode 111) · web Docker APP_VERSION 1.4.85 · forceUpdate', ACCENT);

kvList([
  ['Date', '2026-09-09'],
  ['Branche', 'prod'],
  ['Site', 'https://gasoil-tracking.delhomme.ovh'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
]);

h2('1. Contenu de la version');
table(
  ['Sujet', 'Détail'],
  [
    ['Sync cloud', 'Ne plus utiliser exportedAt=now ; téléphone source de vérité ; web tire le cloud'],
    ['Jauge', 'Annuler / OK visibles et utilisables (flexBasis)'],
    ['Header', 'Boutons Sync et Clair/Sombre séparés (cases + séparateur)'],
    ['Trajets / Maps', 'Vias géométrie OSRM → Google Maps suit le corridor choisi (éco/rapide/alt)'],
    ['iPhone', 'Choix Google Maps ou Plans Apple ; vias → Google (Plans sans via)'],
  ],
  [1.1, 2.3]
);

h2('2. Trajets — pourquoi Maps divergeait');
para(
  'L’app proposait des itinéraires OSRM (éco / rapide / alternatif) mais ouvrait souvent google.navigation:q= sans waypoints : Google recalculait un autre trajet. Désormais des points via: échantillonnés sur la géométrie choisie biaisent Directions vers le même corridor.'
);
bullets([
  'lib/routeVias.ts — samplePassThroughViasFromRoute + buildViaWaypoints',
  'Android : URL directions prioritaire dès qu’il y a via ou origin',
  'Alternatives OSRM un peu plus distinctes (seuil dedupe resserré)',
]);

h2('3. Déploiement');
bullets([
  'Commit + push branche prod',
  'Upload APK /api/ci/releases (forceUpdate)',
  'Redeploy stack Portainer / Docker web+api',
]);

h2('4. À vérifier sur téléphone');
bullets([
  'Header : Sync à gauche, séparateur, soleil/lune à droite — taps distincts',
  'Trajet : choisir Économique puis Démarrer → Maps doit coller au corridor (via)',
  'Jauge : Modifier → Annuler et OK côte à côte',
  'Web : après hard refresh, 206 ≈ 13,9 L (pas 40,7)',
]);

note('Données perso non modifiées volontairement hors sync de restauration antérieure.');

const pages = writeFooters('Gasoil Tracking — récap 1.4.85');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
