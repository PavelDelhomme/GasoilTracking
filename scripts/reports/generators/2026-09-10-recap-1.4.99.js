'use strict';
/**
 * Récap livraisons récentes + note sécurité mot de passe — 2026-09-10
 * Focus : v1.4.90 → v1.4.99 (surtout 1.4.95–1.4.99) + clarification reset MDP.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Recap-1.4.99-et-avant-2026-09-10.pdf';
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
    Title: 'Gasoil Tracking — Récap 1.4.99 et livraisons précédentes',
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
  'Rapport de compréhension : ce qui a été livré maintenant (v1.4.99) et juste avant (Maps, Trajet, Aide, conso…), plus la clarification sur la modification / réinitialisation du mot de passe.'
);
callout(
  'Version live',
  '1.4.99 · versionCode 125 · forceUpdate OTA · https://gasoil-tracking.delhomme.ovh',
  ACCENT
);

kvList([
  ['Date rapport', '2026-09-10'],
  ['Branche', 'prod'],
  ['Commit 1.4.99', '977e834'],
  ['Site / API', 'https://gasoil-tracking.delhomme.ovh'],
  ['APK OTA', 'gasoil-tracking-1.4.99-vc125.apk'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Install ADB', 'Blackview BV9700 + Samsung SM-G990B2 (Nothing non branché)'],
]);

h2('Sommaire');
bullets([
  '1. Mot de passe — deux flux (sécurité du lien email)',
  '2. Livraison actuelle 1.4.99 (détail)',
  '3. Juste avant — 1.4.95 → 1.4.98',
  '4. Fondation récente — 1.4.90 → 1.4.94',
  '5. Tableau récap versions',
  '6. Comment tester 1.4.99',
  '7. Suite / non bloquant',
]);

h2('1. Mot de passe — ce qui existe déjà (et c’est bien)');
para(
  'Tu as demandé un formulaire web sécurisé avec URL ultra aléatoire pour la réinit. Bonne nouvelle : c’est déjà le modèle du lien « Réinitialiser par email ». Pas de changement de code nécessaire sur ce point — on le documente clairement.'
);

h3('1.1 Réinitialisation par email (oublié / perdu)');
bullets([
  'Compte → ou page Connexion → « Mot de passe oublié » → email.',
  'Token : crypto.randomBytes(32) → 64 caractères hex ≈ 256 bits d’entropie (non devinable).',
  'En base : uniquement le hash SHA-256 du token (jamais le token en clair).',
  'URL : https://gasoil-tracking.delhomme.ovh/reset-password?token=<aléatoire>',
  'Validité : 2 heures ; usage unique (used_at) ; anciens tokens du même user effacés à chaque demande.',
  'Anti-énumération : même message si l’email n’existe pas (« Si un compte existe… »).',
  'Rate-limit auth + register sur forgot / reset.',
  'Après succès : bcrypt cost 12 + révocation de toutes les sessions refresh.',
  'Formulaire : page app/web reset-password (nouveau MDP + confirmation).',
]);
callout(
  'Verdict sécurité lien',
  'Le lien email est adapté à une app perso/prod : aléatoire fort, hashé, court-lived, one-shot. C’est le bon niveau pour « URL ultra sécurisée ».',
  ACCENT
);

h3('1.2 Changement connecté (mot de passe actuel)');
bullets([
  'Mon compte (app ou web) : mot de passe actuel + nouveau + confirmation.',
  'API POST /api/auth/change-password (JWT requis) : vérifie l’ancien MDP, hash le nouveau, révoque les autres sessions.',
  'Ce flux ne passe pas par un lien email : tu es déjà authentifié — c’est normal et sûr.',
]);
para(
  'En résumé : oublié → lien email aléatoire ; déjà connecté → formulaire compte avec MDP actuel. Les deux coexistent volontairement.'
);

h2('2. Livraison actuelle — v1.4.99');
para(
  'Objectif utilisateur : moins d’erreurs sur les pleins, raccourcis Accueil utiles, navigation recentrée sur Maps (plus d’onglet Trajet dans la barre).'
);

h3('2.1 Accueil');
bullets([
  'Clic « Carburant total » → ouvre directement Budget (plus seulement un chiffre passif).',
  'Carte « Depuis le plein » → historique des trajets filtré depuis le dernier plein (?tab=history&filter=sinceFill).',
]);

h3('2.2 Nouveau plein');
bullets([
  'Station par défaut = la plus proche GPS (plus la dernière utilisée).',
  'Si plusieurs stations très proches → liste à choisir (« Plusieurs stations proches »).',
  'Raccourci optionnel « Ou dernière station : … » si tu préfères celle d’avant.',
  'Champs verrouillés par défaut + crayon pour déverrouiller un champ seul (litres, montant, prix, odo, km, note).',
  'Prix au litre : valeur affichée « -- auto » ; en dessous le vrai prix ex. 1,79 €/L.',
  'Plus de texte GPS redondant entre compteur et km depuis plein (hint seulement si pas de compteur).',
  'Plafond litres = place libre estimée × 1,12, plafonné à la capacité réservoir (évite de « déborder » la jauge).',
]);

h3('2.3 Maps = hub navigation');
bullets([
  'Onglet Trajet retiré de la barre (href: null) — écran conservé pour guidage en cours + historique.',
  'Header Maps (cette page seulement) : barre « Tapez une adresse… » à côté du drawer.',
  'Sheet : « Lieux & récents » (Maison / Travail / autres lieux + destinations récentes) à la place du texte suivi libre / search bas.',
  'Boutons : Démarrer suivi libre · Historique.',
  'FAB Accueil « Démarrer trajet » → Maps (si trajet actif → « Voir trajet » reste sur l’écran trajet).',
]);

h3('2.4 Aide');
bullets([
  'Textes mis à jour : plus d’onglet Trajet dans la barre ; Maps = entrée principale ; plein verrouillé / station GPS.',
]);

h2('3. Juste avant — v1.4.95 → 1.4.98');
table(
  ['Ver', 'vc', 'Quoi'],
  [
    ['1.4.98', '124', 'Page Aide (guide + problèmes connus) depuis le drawer'],
    ['1.4.97', '123', 'UI Trajet : HUD libre/nav, Plein/Pause/Terminer avant stats, historique drawer'],
    ['1.4.96', '122', 'Suivi libre depuis Maps, panneau maxspeed, stations refusables, VIN/SCx'],
    ['1.4.95', '121', 'Onglet Maps, panneaux OSM, guidage OSRM steps, catalogue masse/SCx'],
  ],
  [1.1, 0.7, 3.2]
);

h3('3.1 Détail utile (95–97)');
bullets([
  'Maps : carte + démarrage suivi / nav ; limitations de vitesse OSM près de toi.',
  'Guidage in-app OSRM (instructions) ; Google Maps reste secours.',
  'Essence basse : proposition de stations (prix + détour + litres) — tu peux refuser et partir quand même.',
  'Trajet : panneau + jauge en suivi libre ; nav à droite du véhicule ; « Suivi en cours » en bas.',
  'Historique trajets : menu ☰ (plus un sous-onglet historique dans Trajet live).',
]);

h2('4. Fondation récente — v1.4.90 → 1.4.94');
bullets([
  '1.4.90 : modèle physique de conso (masse, SCx, dénivelé, accélérations) dès qu’un tracé GPS est dispo.',
  'Affinages : specs véhicule / catalogue, bouchons au temps, dénivelé dense, vitesses affichées à 2 décimales.',
  'Déploiement systématique après livraison (commit prod + make deploy + APK + OTA FORCE_UPDATE).',
  'Avant ça (1.4.76–89) : jauge demi-cercle, sync anti-écrasement cloud, OTA versionCode, QR pair web, UX FAB/budget… (déjà documentés dans d’autres PDF).',
]);

h2('5. Tableau récap versions (cette salve)');
table(
  ['Version', 'Code', 'Thème'],
  [
    ['1.4.99', '125', 'Accueil clics · plein GPS/verrou · Maps hub'],
    ['1.4.98', '124', 'Aide catégorisée'],
    ['1.4.97', '123', 'HUD trajet + historique drawer'],
    ['1.4.96', '122', 'Maps suivi + stations refusables'],
    ['1.4.95', '121', 'Maps + OSM + OSRM'],
    ['1.4.90', '116', 'Conso modèle physique'],
  ],
  [1.2, 0.8, 3]
);

h2('6. Comment tester 1.4.99 rapidement');
bullets([
  'Accueil → taper Carburant total → arrive sur Budget.',
  'Accueil → Depuis le plein → historique filtré (chip « Depuis le plein »).',
  'Nouveau plein → station proche auto ; crayon pour éditer un champ ; prix -- auto + €/L ; tenter trop de litres → plafonné.',
  'Barre d’onglets : plus de Trajet ; Maps a la search en haut + Lieux & récents.',
  'Chercher une adresse → démarre nav ; Historique depuis Maps ou ☰.',
  'Mot de passe oublié (email test) → lien /reset-password?token=… → nouveau MDP.',
]);

h2('7. Suite / non bloquant');
bullets([
  'Nothing : brancher ADB ou accepter l’OTA force pour installer 1.4.99.',
  'Optionnel plus tard : page web HTML « pure » dédiée reset (aujourd’hui = même route Expo web, déjà sur PUBLIC_URL).',
  'Optionnel : masquer le formulaire change-password in-app et forcer uniquement le flux email (pas demandé — les deux restent).',
  'Script upload OTA : passer le chemin dist/gasoil-tracking-prod-VERSION.apk (nom flavor).',
]);

note(
  'Généré via scripts/reports (pdfkit-safe + verify-overflow). Pipeline : run-report.sh --mail. Aucune donnée compte / JWT dans ce PDF.'
);

const pages = writeFooters('Gasoil Tracking — récap 1.4.99');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
