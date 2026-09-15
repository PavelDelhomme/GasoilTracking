'use strict';
/**
 * Rapport suite Cloudity — sync Git + prochaines actions (2026-09-15 soir).
 * Pipeline: ./scripts/reports/run-report.sh generators/2026-09-15-suite-sync-cloudity.js --mail
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || `Cloudity-Suite-Sync-${new Date().toISOString().slice(0, 10)}.pdf`;
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
    Title: 'Cloudity Suite — etat sync & suite a lire',
    Author: 'Cloudity Suite',
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
doc.font('Helvetica-Bold').fontSize(17).fillColor(DARK).text('Cloudity Suite', LEFT(), doc.y, {
  width: WIDTH(),
});
para('Etat sync Git / GitHub + prochaines actions — 15 septembre 2026 (soir).');
callout(
  'A lire tranquillement',
  'Ce PDF resume ou en est la suite (JobbingTrack, GasoilTracking, YTMusic, Maps). Les stacks Portainer et volumes Docker restent separes — aucune donnee deplacee.',
  ACCENT
);

kvList([
  ['Espace produits', '.../Cloudity/Cloudity/products/'],
  ['Branche Cloudity', 'chore/restructure-platform'],
  ['Destinataire', 'PERSONAL_MAIL (Gmail)'],
]);

h2('1. Sync Git / GitHub — OK');
table(
  ['Produit', 'Dossier', 'Branche', 'GitHub'],
  [
    ['JobbingTrack', 'jobbing-track/', 'dev', 'aligne'],
    ['GasoilTracking', 'GasoilTracking/ (+ alias fuel)', 'dev (1.4.137)', 'aligne'],
    ['YTMusic / PLM', 'YTMusic/ (+ alias music)', 'dev', 'aligne'],
    ['Cloudity Maps', 'maps/', 'placeholder', 'pas de repo'],
    ['Parent Cloudity', 'Cloudity.git', 'chore/restructure-platform', 'aligne remote'],
  ],
  [1.4, 2.2, 1.6, 1]
);
para(
  'Clones Perso JobbingTrack et products/jobbing-track : meme commit. Gasoil Perso souvent sur prod ; la suite Cloudity pointe sur dev (prod inclus via merge).'
);

h2('2. Decisions Maps / Waze');
bullets([
  'Pas d API Waze embarquable (deep link seulement).',
  'Pas de clone Google Maps / Mappy — cible OSM type OsmAnd / Organic Maps.',
  'Cloudity Maps = produit dedie (products/maps), pas une fusion dans Gasoil.',
  'Gasoil garde conso + GPS Leaflet/OSRM ; Maps viendra plus tard en submodule.',
]);

h2('3. Catalogue vehicules Gasoil (phases B + C)');
bullets([
  'Environ 508 modeles embarques + alias de recherche.',
  'API GET /api/vehicle-catalog + cache app 7 jours.',
  'Export: npm run catalog:export (Node pur).',
  'Suite catalogue: phase D (import ADEME) — optionnel.',
]);

h2('4. Prochaines actions (ordre utile)');
table(
  ['#', 'Action', 'Ou'],
  [
    ['1', 'Boutons Ouvrir dans Waze / OsmAnd / Organic Maps', 'Gasoil'],
    ['2', 'Creer repo CloudityMaps + submodule', 'Cloudity products/maps'],
    ['3', 'Phase D catalogue ADEME (si besoin)', 'Gasoil'],
    ['4', 'Commit ou restore scripts/adb-login-flavor.sh', 'Gasoil Perso (local)'],
    ['5', 'Menage untracked PDF/QA YTMusic Perso', 'YTMusic'],
    ['6', 'Merger chore/restructure-platform -> dev/main', 'Cloudity'],
  ],
  [0.4, 3.2, 1.4]
);

h2('5. Ne pas faire');
bullets([
  'Fusionner les stacks Portainer / volumes (gasoil_api_data, etc.).',
  'Embarquer un moteur Waze ou cloner Google Maps.',
  'Copier l API Gasoil dans le gateway Go Cloudity.',
]);

h2('6. Chemins canoniques');
bullets([
  'Suite: /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity',
  'JT: .../products/jobbing-track',
  'Gasoil: .../products/GasoilTracking',
  'YTMusic: .../products/YTMusic',
  'Maps: .../products/maps (README seulement pour l instant)',
  'Doc sync: docs/ecosystem/SUITE-SYNC-ETAT.md',
]);

h3('Reference docs');
bullets([
  'docs/ecosystem/SUITE-SYNC-ETAT.md',
  'docs/ecosystem/CLOUDITY-MAPS-VISION.md',
  'Gasoil: docs/cloudity-maps-navigation.md',
  'Gasoil: docs/catalogue-vehicules-sources.md (B+C faits)',
]);

note(
  'Genere via scripts/reports (pdfkit-safe). Aucun secret / JWT / mot de passe dans ce PDF.'
);

const pages = writeFooters('Cloudity Suite — sync & suite');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
