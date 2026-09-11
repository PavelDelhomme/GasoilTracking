'use strict';
/**
 * Rapport campagne QA + correctifs préprod (minimap boucles, sync, etc.)
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT ||
  `GasoilTracking-Rapport-QA-preprod-${new Date().toISOString().slice(0, 10)}.pdf`;
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
    Title: 'Gasoil Tracking — Rapport QA / préprod 11 sept. 2026',
    Author: 'Gasoil Tracking',
    Subject: 'Campagne tests trajet + correctifs préprod (pas encore prod)',
  },
});

const stream = fs.createWriteStream(out);
doc.pipe(stream);

const {
  ACCENT,
  DARK,
  MUTED,
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
doc
  .font('Helvetica-Bold')
  .fontSize(13)
  .fillColor(DARK)
  .text('Rapport QA + correctifs préprod — 11 septembre 2026', LEFT(), doc.y, {
    width: WIDTH(),
  });

callout(
  'Périmètre',
  'Correctifs livrés sur la branche preprod uniquement (Nothing préprod). Prod reste en 1.4.118 jusqu’à validation manuelle.',
  ACCENT
);

kvList([
  ['Date', '11/09/2026 · soir'],
  ['Branche correctifs', 'preprod (origin/preprod)'],
  ['Prod live', '1.4.118 · vc144 (inchangée)'],
  ['Préprod cible', '1.4.119 · vc145 · com.gasoiltracking.preprod'],
  ['Compte QA', 'qa.lab@maily.ovh'],
  ['Compte perso (contrôle)', 'paveldelhomme@gmail.com'],
  ['Nothing', 'prod + préprod (install préprod ce soir)'],
]);

h2('1. Sommaire');
bullets([
  'Bug minimap historique sur boucles GPS (aller-retour sans arrêt)',
  'Campagne QA / scénarios trajet (pause, zombies, sync, boucles)',
  'Correctifs appliqués en préprod seulement',
  'État des comptes (QA seedé, perso OK)',
  'Plan de test Nothing préprod',
]);

h2('2. Problème minimap — trajet 11/09 19:16→19:56');
para(
  'Le trajet GPS du soir (≈9,4 km, embouteillages) revient au même quartier (départ ≈ arrivée, ~15 m). La carte détail Leaflet affiche bien le tracé Ouest puis retour ; la mini-carte historique paraissait vide / illisible (corridor très fin, pastilles superposées, downsample uniforme qui peut appauvrir la boucle).'
);
h3('Cause');
bullets([
  'Départ et arrivée quasi confondus → pastilles vertes/rouges empilées',
  'Bbox très allongé Est-Ouest → zoom collé, peu de hauteur visuelle',
  'Tracé dessiné en segments View rotatifs (fragile) plutôt qu’un vrai polyline SVG',
]);
h3('Correctif préprod');
bullets([
  'TripMiniMap : polyline SVG + halo pour lisibilité',
  'downsampleRoute : conserve les points les plus loin du segment départ→arrivée (extrêmes de boucle)',
  'zoomForPoints : marge si corridor trop allongé',
  'Badge « Boucle » + pastille arrivée légèrement décalée',
  'Historique : préférer le GPS stocké (≥2 points) sans le remplacer par un OSRM A→B',
]);

h2('3. Campagne tests — scénarios trajet');
table(
  ['Scénario', 'Résultat', 'Action'],
  [
    ['Boucle A→…→A sans arrêt', 'Minimap historique illisible', 'Corrigé préprod'],
    ['Sync alors que hash égal', 'Toast « terminez le trajet » trompeur', 'Corrigé 1.4.118 (prod)'],
    ['Trajet zombie tiny / pause', 'Sync bloquée sans UI active', 'finalize + stop tiny (1.4.118)'],
    ['Push téléphone vs correction cloud', 'Réécriture 806 sur trajet 206', 'Hash + horloge (1.4.117+)'],
    ['Compte QA vide', '0 véhicule / 0 trajet', 'Seed boucle QA ajouté'],
    ['Freecess mid-trajet', 'Risque isActive fantôme', 'Seuils stale resserrés'],
    ['Pause puis sync', 'Doit clôturer si tiny/vieux', 'Couvert syncPreferNewer'],
    ['Essence 206 prix pompe', 'Prendre le moins cher E10/SP95/SP98', 'Déjà en 1.4.117'],
  ],
  [2.2, 2.2, 1.4]
);

h2('4. Findings détaillés');
table(
  ['Sévérité', 'Titre', 'Détail'],
  [
    ['WARN', 'Minimap boucle', 'Corrigé sur preprod 1.4.119 — à valider Nothing'],
    ['WARN', 'Toast sync trompeur', 'Corrigé prod 1.4.118'],
    ['WARN', 'Écrasement cloud', 'Mitigé 1.4.117+ (meta sync)'],
    ['INFO', 'QA était vide', 'Seed : QA · Peugeot 208 + trajet boucle 7,2 km'],
    ['OK', 'Perso trajet 78', 'Sur 206 · 9,443 km · 0,77 L'],
    ['OK', 'Boucle GPS 11/09', '72 points · start≈end confirmé'],
    ['INFO', 'API prod', 'v1.4.118 vc144 force=true (inchangé)'],
  ],
  [1.1, 1.8, 3]
);

h2('5. Correctifs préprod (pas encore prod)');
bullets([
  'Branche git : preprod @ commit minimap boucles',
  'Version app préprod : 1.4.119 · versionCode 145',
  'Package Android : com.gasoiltracking.preprod',
  'Aucun make deploy / OTA force prod pour ce lot',
]);

h2('6. Plan de test sur Nothing (préprod)');
bullets([
  'Ouvrir Gasoil Préprod (package preprod) — login perso',
  'Maps → Historique → trajet du 11/09 (ou seed QA) : minimap doit montrer le tracé GPS complet + badge Boucle si retour',
  'Ouvrir le détail : comparer mini vs carte Leaflet',
  'Lancer un suivi libre court, pause, sync → toast « Déjà synchronisé » ou push, pas de faux « trajet actif »',
  'Compte QA (app QA) : vérifier le trajet seed boucle sur la minimap',
]);

h2('7. Suite / backlog');
bullets([
  'Après validation Nothing préprod → cherry-pick / merge vers prod + OTA',
  'Éventuel WebView léger pour mini-cartes si tuiles OSM bloquées réseau',
  'Élargir seed QA (plein, budget, trajet actif zombie volontaire pour régression)',
]);

note(
  'Généré via scripts/reports — helpers pdfkit-safe. Destinataire PERSONAL_MAIL. Correctifs préprod uniquement.'
);

const pages = writeFooters('Gasoil Tracking — QA / préprod 11/09/2026');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
