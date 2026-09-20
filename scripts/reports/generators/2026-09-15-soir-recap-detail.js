'use strict';
/**
 * Récap détaillé soirée 2026-09-15 — catalogue B/C, Cloudity, lab devices, 1.4.138.
 * Pipeline: ./scripts/reports/run-report.sh generators/2026-09-15-soir-recap-detail.js --mail
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT ||
  `GasoilTracking-Recap-Detail-${new Date().toISOString().slice(0, 10)}.pdf`;
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
    Title: 'Gasoil Tracking — Recap detail 2026-09-15',
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
  'Recapitulatif detaille — 15 septembre 2026 (soir). Catalogue vehicules B+C, integration Cloudity, verification Blackview + Samsung, correctif lab-session, ship 1.4.137 puis 1.4.138.'
);
callout(
  'Live maintenant',
  'API / web : v1.4.138 · versionCode 164 · forceUpdate OTA · catalogue GET /api/vehicle-catalog = 508 modeles (2026.09.15-b). Domaine https://gasoil-tracking.delhomme.ovh',
  ACCENT
);

kvList([
  ['Branche Git ship', 'prod (GasoilTracking.git)'],
  ['Checkout canonique', 'Cloudity/products/GasoilTracking (submodule, branche dev)'],
  ['Clone secondaire', '~/Perso/GasoilTracking (souvent sur prod)'],
  ['Stack Portainer', 'gasoil-tracking (api + web) — volume gasoil_api_data intact'],
  ['Destinataire', 'paveldelhomme@gmail.com (PERSONAL_MAIL)'],
  ['Date rapport', '2026-09-15 ~21:50 Europe/Paris'],
]);

h2('Sommaire');
bullets([
  '1. Versions & deploiement',
  '2. Integration Cloudity (submodule)',
  '3. Catalogue vehicules — phases B + C',
  '4. Maps / Waze / Cloudity Maps (decisions)',
  '5. Verification appareils & comptes',
  '6. Correctif lab-session (pourquoi + comment)',
  '7. Commits cles',
  '8. Backlog & suite',
]);

h2('1. Versions & deploiement');
table(
  ['Canal', 'Valeur'],
  [
    ['APP_VERSION live', '1.4.138'],
    ['versionCode Android', '164'],
    ['forceUpdate OTA', 'oui'],
    ['APK prod', 'gasoil-tracking-1.4.138-vc164.apk (~43,7 Mo)'],
    ['Catalogue API', '508 vehicules · schema gasoil.vehicle-catalog.v1'],
    ['Health', 'ok'],
  ],
  [1.4, 3]
);
para(
  'Deploiements Portainer Git (refs/heads/prod) : stack recreatee apres le ship catalogue (timeout initial cause d’un bug build web — double declaration status dans edit.tsx). Correctifs API ESM (__dirname) puis redeploy. Images VPS alignees 1.4.138 ; prune KEEP_N=2 conserve.'
);
h3('Flavors APK installees (1.4.138)');
table(
  ['Flavor', 'Package', 'Compte defaut'],
  [
    ['prod', 'com.gasoiltracking.app', 'perso (Gmail)'],
    ['preprod', 'com.gasoiltracking.preprod', 'perso'],
    ['qa', 'com.gasoiltracking.qa', 'qa.lab@maily.ovh'],
    ['admin', 'com.gasoiltracking.admin', 'admin@delhomme.ovh'],
  ],
  [1.2, 2.2, 2]
);

h2('2. Integration Cloudity (submodule)');
para(
  'GasoilTracking est un submodule Git actif sous Cloudity — ce n’est pas une fusion monolithe. Stacks Portainer et volumes restent separes.'
);
table(
  ['Element', 'Etat'],
  [
    ['Chemin', '.../Cloudity/Cloudity/products/GasoilTracking'],
    ['Alias', 'products/fuel → GasoilTracking (symlink)'],
    ['.gitmodules', 'url GasoilTracking.git · branch=dev'],
    ['Pointeur parent', 'bfa9e73 (1.4.138 lab-session) sur chore/restructure-platform'],
    ['Travail quotidien', 'Ouvrir products/GasoilTracking (ou Cloudity.code-workspace)'],
    ['Ship', 'merge/checkout prod → make deploy → bump submodule Cloudity'],
  ],
  [1.4, 3]
);
callout(
  'Important',
  'Le clone historique ~/Perso/GasoilTracking reste un second checkout du meme remote. Canonique = products/GasoilTracking. Doc : docs/SUITE-ECOSYSTEM-LINK.md',
  ACCENT
);

h2('3. Catalogue vehicules — phases B + C');
bullets([
  'Phase B : enrichissement VEHICLE_CATALOG + VEHICLE_CATALOG_EXTRA (~508 modeles, annees 1982–2025), alias de recherche (citroen/vw/clio/e-208…).',
  'Phase C : JSON versionne api/static/vehicle-catalog.json, endpoint public GET /api/vehicle-catalog, cache app 7 j (lib/vehicleCatalogStore.ts).',
  'UI add/edit vehicule : recherche live bootstrap + refresh API.',
  'Build : npm run catalog:export (= node scripts/build-vehicle-catalog.mjs, sans tsx).',
  'Reste optionnel : phase D ADEME · phase E immatriculation.',
]);
para(
  'Incident deploy 1.4.137 : build web casse (Identifier status already declared dans app/vehicle/edit.tsx) puis route catalogue 500 (__dirname absent en ESM). Les deux ont ete corriges avant le polish et le merge prod→dev (elimination du double module Cache/Store).'
);

h2('4. Maps / Waze / Cloudity Maps (decisions)');
bullets([
  'Pas d’API Waze embarquable — deep-link uniquement.',
  'Pas de clone Google Maps / Mappy dans Gasoil ; cible OSM type OsmAnd / Organic Maps.',
  'Cloudity Maps = produit dedie (products/maps placeholder README) — repo GitHub a creer plus tard.',
  'Gasoil garde conso + GPS Leaflet/OSRM (defaut Paris, marqueur GPS visible depuis 1.4.136).',
  'Doc : docs/cloudity-maps-navigation.md',
]);

h2('5. Verification appareils & comptes');
para(
  'Cibles labo : Blackview BV9700 (EEA9700PRO0014587) et Samsung SM-G990B2 (R5CT7263YJL). Nothing non touche pour cette salve. Xiaomi : ne pas installer.'
);
h3('Smoke API (avant UI)');
table(
  ['Compte', 'Login', 'Vehicules'],
  [
    ['perso (Gmail)', '200 + token', '11'],
    ['admin@delhomme.ovh', '200 + token', '10'],
    ['qa.lab@maily.ovh', '200 + token', '11'],
  ],
  [2, 1.4, 1]
);
h3('Etat UI apres 1.4.138 (lab-session)');
table(
  ['Device', 'qa', 'admin', 'prod', 'preprod'],
  [
    ['Blackview', 'LOGGED (208)', 'LOGGED', '1.4.138', '1.4.138'],
    ['Samsung', 'LOGGED (208)', 'LOGGED', '1.4.138', '1.4.138'],
  ],
  [1.3, 1.3, 1.3, 1.1, 1.1]
);
note(
  'Admin peut afficher « Aucun vehicule actif » tant qu’aucun vehicule n’est selectionne — session cloud OK (message Actualiser depuis le cloud).'
);

h2('6. Correctif lab-session (pourquoi + comment)');
para(
  'Probleme : sur Blackview, la saisie MDP via adb input etait peu fiable (visite guidee, clavier AZERTY masquant « Se connecter », troncature des JWT dans les deep-links longs, fausses frappes → « Identifiants invalides » alors que l’API login reussissait).'
);
bullets([
  'Nouveau ecran app/lab-session.tsx (flavors non-prod uniquement : qa, admin, dev, feat, preprod).',
  'Flux : POST /api/auth/login → ecrire lab-session.json → adb push vers /sdcard/Android/data/<pkg>/files/ → am start scheme://lab-session.',
  'L’app lit le fichier (expo-file-system), applySession + refreshCloudNow, puis home.',
  'Prod OTA : pas d’injection (followsProdOta) — ouverture auth manuelle seulement.',
  'Script : scripts/adb-login-flavor.sh mis a jour pour ce flux.',
]);

h2('7. Commits cles (prod)');
table(
  ['Commit', 'Resume'],
  [
    ['cd2db72', 'feat 1.4.137 catalogue ~508 + API + docs Maps/Cloudity'],
    ['4c6cab5', 'fix double declaration status (build web)'],
    ['8bb928a', 'fix __dirname ESM pour /api/vehicle-catalog'],
    ['596024d', 'polish catalogue + chemin canonique Cloudity'],
    ['eb00e1c', 'feat 1.4.138 lab-session + login ADB fichier'],
    ['bfa9e73', 'dev aligne (merge prod) — pointeur submodule Cloudity'],
  ],
  [1.2, 3.2]
);

h2('8. Backlog & suite');
table(
  ['Item', 'Priorite / note'],
  [
    ['Phase D catalogue ADEME', 'optionnel, non bloquant'],
    ['Phase E immatriculation', 'optionnel'],
    ['Prise ODNB / OBD-II', 'a confirmer libelle puis brancher'],
    ['Boutons Waze / OsmAnd / Organic Maps', 'deep-links depuis Gasoil'],
    ['Repo + submodule Cloudity Maps', 'products/maps placeholder → vrai repo'],
    ['SSO Cloudity ID', 'opt-in plus tard'],
    ['PDF recap demain (si demande)', 'pipeline reports/'],
  ],
  [2.2, 2.2]
);
callout(
  'Process travail',
  '1) Travailler dans Cloudity/products/GasoilTracking sur dev. 2) Ship : merge → prod, bump app.json + docker + sw, make deploy, build APK, OTA FORCE_UPDATE. 3) Bump pointeur submodule dans le monorepo Cloudity.',
  ACCENT
);

note(
  'Genere via scripts/reports (pdfkit-safe + verify-overflow). Ne pas redeployer manuellement un PDF non PASS.'
);

const pages = writeFooters('Gasoil Tracking — recap 2026-09-15');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
