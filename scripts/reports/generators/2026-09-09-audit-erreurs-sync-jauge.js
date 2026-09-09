'use strict';
/**
 * Audit erreurs — sync web/mobile + jauge Annuler/OK (2026-09-09)
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Audit-erreurs-sync-jauge-2026-09-09.pdf';
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
    Title: 'Gasoil Tracking — Audit erreurs sync / jauge',
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
para('Audit erreurs — désync web / smartphone + boutons Annuler / OK jauge (09/09/2026).');
callout(
  'Source de vérité',
  'Le smartphone (Nothing, flavor prod) reste la référence terrain. Le cloud doit suivre le téléphone, pas l’Inverse IndexedDB web périmé.',
  ACCENT
);

kvList([
  ['Date audit', '2026-09-09 · ~17:20 Europe/Paris'],
  ['App mobile', '1.4.83 / versionCode 109 · com.gasoiltracking.app'],
  ['Site', 'https://gasoil-tracking.delhomme.ovh'],
  ['Compte test', 'perso (paveldelhomme@gmail.com) — aucune donnée métier altérée volontairement'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
]);

h2('1. Sommaire');
bullets([
  'E1 — Boutons Annuler / OK de la jauge : OK écrasé hors écran (bandeau jaune)',
  'E2 — Site web affiche 40,7 L / 81 % alors que le téléphone / cloud correct = 13,9 L / ~28 %',
  'E3 — Cause sync : collectSnapshot() met exportedAt=now → syncPreferNewer pousse toujours le local',
  'E4 — Un clic Sync web a écrasé le cloud (46 trajets / 40,7 L) ; restauration immédiate depuis le Nothing',
  'Correctifs code en cours (jauge layout, sync web, comparaison timestamps)',
]);

h2('2. États constatés (sans modification métier)');
h3('2.1 Smartphone Nothing (prod)');
table(
  ['Indicateur', 'Valeur'],
  [
    ['Peugeot 206 carburant', '13,9 L / 50 L · ~28 % · 1/4'],
    ['Odomètre affiché', '121 520 km'],
    ['Aujourd’hui', '88,4 km · 8,8 L · 2 trajets'],
    ['Compte', 'Connecté · Pavel Delhomme'],
    ['Tests UI', 'Accueil / Véhicules / Trajet / Budget ouverts ; Annuler jauge sans sauver'],
  ],
  [1.2, 2.2]
);

h3('2.2 API cloud (après restauration téléphone)');
table(
  ['Indicateur', 'Valeur'],
  [
    ['updatedAt', '2026-09-09T15:21:26Z (push Nothing)'],
    ['Peugeot 206', '13,9 L · trackedKm 319,6'],
    ['Trajets / pleins', '53 trajets · 5 pleins'],
    ['Incident sync web', '15:20:30Z avait remis 40,7 L / 46 trajets — corrigé par « Pousser appareil → cloud »'],
  ],
  [1.2, 2.2]
);

h3('2.3 Application web (IndexedDB navigateur)');
table(
  ['Indicateur', 'Valeur'],
  [
    ['Avant correction UI', '40,7 L / 50 L · 81 % · odo 128 505 km'],
    ['Backup local', 'exportedAt 14:46:52Z · 46 trajets · fuel 40,7'],
    ['Écart vs téléphone', 'Oui — stale cache navigateur, pas un second serveur'],
  ],
  [1.2, 2.2]
);

h2('3. Erreurs détaillées');
h3('E1 — Jauge Annuler / OK (mobile)');
para(
  'Sur Accueil et Véhicules, après « Modifier », la rangée de confirmation affiche Annuler en pleine largeur ; le bouton OK (fond jaune/vert) est compressé en fine bande verticale sur le bord droit de l’écran, donc inutilisable. Annuler fonctionne (testé : retour à 13,9 L sans écriture).'
);
bullets([
  'Fichier : components/FuelGaugeSlider.tsx (confirmRow / flex)',
  'Contexte aggravant : jauge dans TouchableOpacity (VehicleCard) — refactoré en View + Pressable header',
  'Fix : flexBasis 0, minWidth 0, largeur 100 %, libellé OK court, accessibilité',
]);

h3('E2 — Web 81 % vs téléphone 28 %');
para(
  'Le site ne lit pas « le serveur faux » : l’API sync renvoyait bien 13,9 L après le push téléphone. Le navigateur affichait son snapshot IndexedDB périmé (40,7 L). Autonomie web ~592 km / « 41 L restants » cohérente avec ce stale local, incohérente avec le cloud.'
);

h3('E3 — Bug syncPreferNewer (critique)');
para(
  'lib/dataSnapshot.ts collectSnapshot() pose toujours exportedAt = Date.now(). syncPreferNewer comparait localAt à ce tampon → le local paraissait toujours « plus récent » que le cloud → push systématique. Un Sync manuel web a donc écrasé 53 trajets / 13,9 L par 46 trajets / 40,7 L.'
);
bullets([
  'Fix : comparer via snapshotActivityAt + remote.updatedAt (pas exportedAt frais)',
  'Fix : si le cloud a plus de trajets → pull',
  'Fix AuthContext : forcePushLocalToCloud seulement hors web ; web → syncPreferNewer + resync au chargement',
]);

h3('E4 — Incident opérationnel pendant l’audit');
para(
  'Pendant la vérif web, le bouton Sync a déclenché E3. Restauration immédiate depuis le Nothing (menu → Pousser cet appareil → cloud). Cloud revalidé : 13,9 L · 53 trajets. Données téléphone inchangées.'
);

h2('4. Autres observations (non bloquantes)');
bullets([
  'Capacités cloud 806/Touran parfois affichées à 50 L côté % API alors que fuel 80/58 — à surveiller (capacité réelle 80/58 sur web backup)',
  'Deux libellés « Modifier » sur carte véhicule (jauge vs fiche) — confusion UX mineure',
  'Onglet Pleins : tap ADB a parfois atterri sur Véhicules (coordonnées barre) — pas un bug app confirmé',
]);

h2('5. Correctifs & suite');
table(
  ['Action', 'Statut'],
  [
    ['Restaurer cloud depuis Nothing', 'FAIT'],
    ['Layout Annuler/OK jauge', 'CODE local (à shipper OTA)'],
    ['Sync : ne plus utiliser exportedAt=now', 'CODE local'],
    ['Web : pas de forcePush à la connexion', 'CODE local'],
    ['Rebuild web Docker + OTA 1.4.84', 'À faire juste après ce mail'],
    ['Retest Annuler/OK + Sync web pull', 'Après déploiement'],
  ],
  [2.2, 1.2]
);

note(
  'Aucune modification volontaire des trajets / pleins / odo utilisateur. Seuls sync cloud (restauration) et tests UI Annuler sans OK.'
);

const pages = writeFooters('Gasoil Tracking — audit erreurs 2026-09-09');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
