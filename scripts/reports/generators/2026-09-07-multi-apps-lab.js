'use strict';
/**
 * Récap 7 sept. 2026 — multi-apps labo + devices + pipeline PDF.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Recap-multi-apps-labo-7-septembre-2026.pdf';
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
    Title: 'Gasoil Tracking — Multi-apps labo & devices',
    Author: 'Gasoil Tracking',
    Subject: '1.4.58 — flavors prod/preprod/qa/admin + cadrage Nothing/Blackview',
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
para('Recap labo — 7 septembre 2026 — multi-applications + comptes + devices');
callout(
  'Version codee',
  '1.4.58 (versionCode 84)\nAPK flavors : prod, preprod, qa, admin (dev/feat disponibles au build)\nServeur live toujours sur la branche prod — force-update utilisateurs a publier si souhaite',
  '#16a34a'
);
kvList([
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Branche', 'prod (code flavors)'],
  ['Probleme resolu', 'Un seul APK = une seule session → impossible QA + perso + admin en parallele'],
  ['Solution', 'Packages Android distincts (APP_FLAVOR) = sessions AsyncStorage separees'],
  ['Nothing', 'Hors ligne ADB au moment de l install — APKs prets dans dist/'],
  ['Blackview', 'prod + preprod + qa + admin installes'],
  ['Samsung G990B2', 'prod + qa + admin installes'],
]);

h2('1. Pourquoi plusieurs apps');
para(
  'Sur Nothing, se connecter au compte QA labo tout en restant sur le compte perso (ou admin) etait impossible avec une seule application : deconnexion mutuelle, confusion Labo QA, et risque d ecraser la session manager.'
);
bullets([
  'Gasoil Tracking (prod) → paveldelhomme@gmail.com — meme app que les utilisateurs',
  'Gasoil Preprod → compte perso — canal stable avance (juste avant prod)',
  'Gasoil QA Lab → qa.lab@maily.ovh — tests jetables / checklist',
  'Gasoil Admin → admin@delhomme.ovh — administration',
  'Gasoil Dev / Feat → Blackview (terrain dur), builds a la demande',
]);

h2('2. Table des flavors');
table(
  ['Flavor', 'Package', 'Compte defaut', 'OTA force prod'],
  [
    ['prod', 'com.gasoiltracking.app', 'paveldelhomme@gmail.com', 'oui'],
    ['preprod', 'com.gasoiltracking.preprod', 'perso', 'non'],
    ['dev', 'com.gasoiltracking.dev', 'perso', 'non'],
    ['feat', 'com.gasoiltracking.feat', 'perso', 'non'],
    ['qa', 'com.gasoiltracking.qa', 'qa.lab@maily.ovh', 'non'],
    ['admin', 'com.gasoiltracking.admin', 'admin@delhomme.ovh', 'non'],
  ],
  [1.1, 2.4, 2.2, 1.2]
);
note('Email pre-rempli a l ouverture de Connexion selon la flavor. Bandeau couleur + package visible.');

h2('3. Cadrage devices (a suivre)');
h3('Nothing');
bullets([
  'Role : equivalent production le plus stable mais le plus avance possible (= preprod)',
  'Garder aussi prod (parite utilisateurs / suivi installation normale)',
  'Installer qa + admin pour les 3 comptes sans se deconnecter',
  'Ne pas servir de cobaye feat cassant — c est le role Blackview',
]);
h3('Blackview BV9700');
bullets([
  'Role : tests purs et durs — local + distant',
  'Toutes flavors : dev, prod, feat, preprod, qa, admin',
  'Deja installe ce soir : prod, preprod, qa, admin (1.4.58)',
]);
h3('Samsung SM-G990B2');
bullets(['Labo autorise — prod + qa + admin installes (1.4.58)']);
h3('Xiaomi');
bullets(['Ne pas installer']);

h2('4. Commandes');
bullets([
  './scripts/build-flavor-apk.sh qa|admin|prod|preprod|dev|feat',
  './scripts/install-flavor.sh <flavor> [serial]',
  'make apk-qa / make apk-admin / make apk-prod / make apk-preprod',
  'Pipeline PDF+mail : ./scripts/reports/run-report.sh generators/... --mail',
]);
callout(
  'Fichiers APK generes',
  'dist/gasoil-tracking-prod-1.4.58.apk (+ alias gasoil-tracking-1.4.58.apk)\ndist/gasoil-tracking-preprod-1.4.58.apk\ndist/gasoil-tracking-qa-1.4.58.apk\ndist/gasoil-tracking-admin-1.4.58.apk',
  ACCENT
);

h2('5. Comptes (.env)');
kvList([
  ['Perso / manager', 'PERSONAL_MAIL + PERSONAL_PASSWORD'],
  ['Admin', 'ADMIN_EMAIL + ADMIN_PASSWORD (admin@delhomme.ovh)'],
  ['QA lab', 'QA_LAB_EMAIL + QA_LAB_PASSWORD — scripts/qa-lab-account.sh'],
]);
para(
  'Mots de passe : ne jamais les mettre dans le PDF/mail en clair. Les lire dans .env localement pour se connecter sur chaque app.'
);

h2('6. Suite recommandee');
bullets([
  'Reconnecter Nothing en ADB → installer prod + preprod + qa + admin',
  'Sur chaque icone : se connecter avec le compte dedie (email deja pre-rempli)',
  'Publier 1.4.58 force-update utilisateurs seulement quand tu valides le canal prod',
  'Builds dev/feat sur Blackview quand une branche feature est a tester',
]);

callout(
  'Process PDF',
  'Ce document est passe par scripts/reports (pdfkit-safe + verify-overflow PASS) avant envoi mail.',
  '#16a34a'
);

const pages = writeFooters('Gasoil Tracking — multi-apps labo 7 sept. 2026');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
