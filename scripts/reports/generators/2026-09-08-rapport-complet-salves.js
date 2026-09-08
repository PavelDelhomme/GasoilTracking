'use strict';
/**
 * Rapport complet 8 sept. 2026 — 3 salves + correctifs journée (1.4.62 → 1.4.70).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Rapport-complet-8-septembre-2026.pdf';
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
    Title: 'Gasoil Tracking — Rapport complet 8 septembre 2026',
    Author: 'Gasoil Tracking',
    Subject: 'Versions 1.4.62 à 1.4.70 — bugs, 3 salves, tests, déploiement',
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
doc
  .font('Helvetica-Bold')
  .fontSize(17)
  .fillColor(DARK)
  .text('Gasoil Tracking', LEFT(), doc.y, { width: WIDTH() });
para('Rapport complet — 8 septembre 2026 — problèmes résolus, 3 salves d’améliorations, tests.');
callout(
  'Version live cible',
  '1.4.70 (versionCode 96)\nBranche prod · force-update Android\nCompte perso NON modifié (206 + 806 + Touran + 48 trajets)\nQA lab : Peugeot 208 · 2022 essence (seed test)',
  '#16a34a'
);
kvList([
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Branche', 'prod'],
  ['Périmètre', '1.4.62 → 1.4.70 (journée + 3 salves)'],
  ['Devices', 'Blackview BV9700 + Samsung SM-G990B2'],
  ['Compte perso', 'Lecture seule — aucune écriture sync'],
  ['Compte test', 'qa.lab@maily.ovh'],
  ['Tests auto', 'Vitest — 12 tests critiques PASS'],
  ['Prod URL', 'https://gasoil-tracking.delhomme.ovh'],
]);

h2('1. Sommaire');
bullets([
  'Contexte & incidents de la journée',
  'Timeline versions 1.4.62 → 1.4.69 (avant les 3 salves)',
  'Salve 1 — Stabilité OTA / sync / données',
  'Salve 2 — UX trajet, Maps, jauge, véhicules',
  'Salve 3 — Tests, CI, hardening',
  'Avant / après détaillé',
  'Plan de tests exécuté',
  'État des comptes & suite',
]);

h2('2. Contexte & incidents');
para(
  'La journée a enchaîné des correctifs critiques (OOM trajet live, sync pendant GPS, odomètre, budget) puis des demandes UX : ne plus lancer Google Maps sans choisir l’itinéraire, masquer le jargon GitHub Actions dans la modal MAJ, iOS Google/Plans, et un rapport mail PDF.'
);
h3('Incidents notables');
bullets([
  'Plantage pendant trajet : UI OOM (poll GPS complet → Context → Leaflet) alors que le FGS Android continuait — points encore là à la réouverture.',
  'Peur de perte de trajets (5 derniers jours) : fausse alerte — données présentes sur le compte perso (lecture seule confirmée).',
  'Race OTA : upload GitHub Actions 1.4.67 après 1.4.68 → /api/version affichait une ancienne APK (ORDER BY id DESC).',
  'Modal MAJ : texte « même application, pas de désinstallation » perçu comme nul / anxiogène.',
]);

h2('3. Timeline versions (avant salves finales)');
table(
  ['Version', 'Contenu clé'],
  [
    ['1.4.62–65', 'Budget, odo, entretien km, notifs, fin trajet flush'],
    ['1.4.66–67', 'Anti-OOM live, sync bloquée pendant trajet, FGS lite'],
    ['1.4.68', 'Choisir itinéraire avant Maps ; vias ; iOS Maps ; notes MAJ'],
    ['1.4.69', 'Copy MAJ, chips panneau, jauge carburant, recherche 208/108'],
    ['1.4.70', '3 salves : OTA semver, sync safe, tests Vitest, CI'],
  ],
  [1.1, 3.2]
);

h2('4. Salve 1 — Stabilité OTA / sync / données');
h3('4.1 Race OTA (régression de version)');
para(
  'Avant : GET /api/version et latestApkFile prenaient la dernière ligne INSERT (id DESC). Un build plus lent d’une ancienne version redevenait « latest » et forçait une mise à jour vers le passé.'
);
para(
  'Maintenant : pickLatestRelease = max semver ; saveRelease refuse (HTTP 409) toute APK plus ancienne que le live ; pending build n’est effacé que si la version couvre l’annonce ; workflow GH Actions cancel-in-progress + skip upload si VERSION < live.'
);
h3('4.2 Sync replace — plaque / photos perdues');
para(
  'Avant : replaceAllData / createVehicle n’écrivaient pas plate_number, registration_photo_uri, ni photo_uri / due_odometer entretien → une synchro cloud effaçait silencieusement plaque et photos.'
);
para('Maintenant : INSERT alignés sur mapVehicle / updateVehicle / createMaintenance.');
h3('4.3 Pull sync par « poids » dangereux');
para(
  'Avant : remoteW > localW + 5 tirait le cloud même s’il était plus vieux → risque d’écraser les trajets du jour.'
);
para(
  'Maintenant : poids seul uniquement si horloge cloud ≥ locale (−2 s) ; sinon push local. Garde trajet actif aussi sur refreshFromCloud et prepareDataForUpdate (OTA).'
);

h2('5. Salve 2 — UX trajet / Maps / jauge / véhicules');
table(
  ['Sujet', 'Avant', 'Maintenant'],
  [
    [
      'Démarrage nav',
      'Suggestion domicile → Maps + trajet immédiat',
      'Prépare destination + alts ; choix éco/rapide puis Démarrer',
    ],
    [
      'Vias Maps',
      'Souvent ignorés (navigation:q=)',
      'URL directions + via: ; Apple ignore vias → force Google',
    ],
    [
      'Modal MAJ',
      'Jargon CI / « pas de désinstallation »',
      'Notes userFacing + message rassurant court',
    ],
    [
      'Jauge',
      'soft-skip trop agressif ; « essence »',
      'softSkip explicite ; catch = demander ; libellé carburant',
    ],
    [
      'Catalogue',
      '208/108 confus ; nom sans année',
      'Recherche scorée ; Peugeot 208 · 2022 essence',
    ],
    ['SW web', 'Cache gasoil-shell-v1.4.9', 'gasoil-shell-v1.4.70'],
  ],
  [1.1, 1.8, 1.8]
);

h2('6. Salve 3 — Tests & CI');
bullets([
  'Vitest ajouté (npm test) — 12 assertions : semver, pickLatestRelease, releaseNotes, searchVehicles, politique syncPreferNewer.',
  'Workflow mobile-release : notes propres (sans GitHub Actions SHA), cancel-in-progress, garde skip si version < live.',
  'compareVersions client = compareSemver (parseInt) — plus de Number() NaN sur suffixes.',
]);
callout('Résultat tests', 'vitest run → 12/12 PASS (lib/__tests__/critical-fixes.test.ts)', '#2563eb');

h2('7. Avant / après — impacts utilisateur');
h3('Trajet & navigation');
para(
  'Avant : un tap « retour domicile » ouvrait Google Maps et démarrait le suivi sans pouvoir valider l’itinéraire (éco / rapide). Les vias OSRM étaient souvent ignorés.'
);
para(
  'Maintenant : l’app calcule les alternatives, affiche des chips (carte + panneau), bloque Démarrer tant que le calcul / le choix n’est pas prêt, puis ouvre Maps sur l’itinéraire sélectionné.'
);
h3('Mise à jour APK');
para(
  'Avant : texte technique anxiogène ; notes CI ; risque de forcer une ancienne APK après course de builds.'
);
para(
  'Maintenant : message clair (« un tap, données et connexion conservés ») ; notes filtrées ; semver max + 409 sur upload plus vieux.'
);
h3('Données & sync');
para(
  'Avant : sync pouvait remplacer un local récent par un cloud plus riche mais périmé ; plaque/photos perdues au replace ; refresh cloud possible pendant un trajet GPS.'
);
para(
  'Maintenant : horloge prioritaire, colonnes complètes, garde trajet actif sur pull forcé et backup pré-OTA.'
);

h2('8. Plan de tests exécuté');
table(
  ['Test', 'Résultat'],
  [
    ['Vitest critical-fixes (12)', 'PASS'],
    ['node --check api/src/index.js + semver.js', 'PASS'],
    ['Compte perso sync RO (véhicules + trajets)', 'OK — inchangé'],
    ['Compte QA login + véhicule 208 seed', 'OK'],
    ['Build APK signé EAS cert SHA attendu', 'À confirmer au ship 1.4.70'],
    ['Upload /api/ci/releases + /api/version', 'À confirmer au ship'],
    ['Install Blackview + Samsung', 'À confirmer au ship'],
    ['Health https://gasoil-tracking.delhomme.ovh/health', 'Historiquement 200'],
  ],
  [2.6, 1.6]
);
note(
  'Les lignes « À confirmer au ship » sont validées dans le même pipeline que l’envoi de ce mail (build → rsync Docker → upload → adb).'
);

h2('9. Comptes — règles respectées');
bullets([
  'Compte perso (paveldelhomme@gmail.com) : aucune écriture sync ; flotte 206 / 806 Roland Garros / Touran conservée.',
  'Compte QA : utilisé uniquement pour seed test (Peugeot 208) et vérifs login.',
  'Aucune modification « bordel » / données métier hors correctifs code + seed QA vide.',
]);

h2('10. Fichiers touchés (salves 1.4.70)');
bullets([
  'api/src/semver.js, api/src/index.js — OTA semver / 409',
  'lib/database.ts — replaceAllData + createVehicle colonnes',
  'lib/backup.ts — syncPreferNewer + gardes trajet',
  'lib/fuelGaugePrompt.ts, lib/mapsNavigation.ts, lib/api.ts, lib/semver.ts',
  'lib/releaseNotes.ts, components/AppUpdateModal.tsx (déjà 1.4.68/69)',
  'app/(tabs)/trip.tsx, vehicle/add.tsx, vehicle/edit.tsx',
  'public/sw.js, .github/workflows/mobile-release.yml',
  'lib/__tests__/critical-fixes.test.ts, vitest.config.ts',
]);

h2('11. Suite recommandée');
bullets([
  'Surveiller que GH Actions n’uploade plus d’APK plus ancienne (409 + skip).',
  'Étendre Vitest à syncPayload / prepareSnapshotForPush (413).',
  'Si besoin : renommer manuellement un véhicule perso (ex. 206→208) — uniquement sur demande explicite.',
  'Nothing Phone : réinstaller 1.4.70 quand ADB dispo (stable / prod).',
]);

note('Généré via scripts/reports (pdfkit-safe) — overflow verify obligatoire avant envoi mail.');

const pages = writeFooters('Gasoil Tracking — rapport 8 sept. 2026');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
