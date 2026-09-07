'use strict';
/**
 * Template minimal pour un nouveau rapport PDF.
 * Copier vers generators/YYYY-MM-DD-sujet.js puis enrichir.
 *
 *   REPORT_OUT=Mon-Rapport.pdf ./scripts/reports/run-report.sh generators/_template.js --mail
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME = process.env.REPORT_OUT || `GasoilTracking-Rapport-${new Date().toISOString().slice(0, 10)}.pdf`;
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
    Title: 'Gasoil Tracking — Rapport',
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
para('Remplacer ce template par le contenu du rapport demandé.');
callout('Rappel pipeline', 'Toujours passer par run-report.sh (generate → verify overflow → mail).', ACCENT);
kvList([
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Branche', 'prod'],
]);
h2('1. Contenu');
bullets(['Point A', 'Point B', 'Point C']);
table(
  ['Item', 'Statut'],
  [
    ['Exemple', 'OK'],
  ],
  [2, 1]
);
note('Généré via scripts/reports — helpers pdfkit-safe.');

const pages = writeFooters('Gasoil Tracking — rapport');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
