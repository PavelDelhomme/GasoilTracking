'use strict';
/**
 * Rapport QA complet Samsung — session 2026-09-14 soir
 * Versions 1.4.128 → 1.4.133 · bugs détectés · ce qui marche · solutions
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-QA-Samsung-complet-2026-09-14-soir.pdf';
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
    Title: 'Gasoil Tracking — QA Samsung complet 2026-09-14',
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
doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text('Gasoil Tracking', LEFT(), doc.y, {
  width: WIDTH(),
});
para(
  'Rapport QA complet (soir 2026-09-14) : tout ce qui a ete detecte, corrige, reteste sur Samsung SM-G990B2 compte QA. Inclut jauge/sync, simulateur GPS, suivi libre / Terminer, plein reel, Accueil/Maps/Garage/Budget, faux positifs ADB, solutions proposees et backlog.'
);
callout(
  'Etat au moment du rapport',
  'APK QA Samsung : 1.4.133 vc159 · Code local prod aligne · Serveur API encore affiche 1.4.131 dans le menu (deploy OTA prod 1.4.133 a faire) · Blackview : NON touche sur demande explicite',
  ACCENT
);

kvList([
  ['Date', '2026-09-14 (soir ~21h40)'],
  ['Branche', 'prod'],
  ['Appareil teste', 'Samsung SM-G990B2 (ADB) UNIQUEMENT'],
  ['Package', 'com.gasoiltracking.qa'],
  ['Compte', 'qa.lab@maily.ovh'],
  ['APK final', 'dist/gasoil-tracking-qa-1.4.133.apk'],
  ['Site', 'https://gasoil-tracking.delhomme.ovh'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Methode', 'uiautomator ADB + seed cloud API + sim injection'],
]);

h2('Sommaire');
bullets([
  '1. Verdict en une page',
  '2. Fil chronologique de la session',
  '3. Versions livrees 1.4.128 → 1.4.133',
  '4. Ce qui MARCHE (valide Samsung)',
  '5. Bugs REELS detects (avec preuves)',
  '6. Faux positifs / pieges de test ADB',
  '7. Detail suivi libre + bouton Terminer',
  '8. Detail simulateur GPS + burn jauge',
  '9. Detail plein / budget / Accueil',
  '10. Solutions proposees (priorisees)',
  '11. Backlog et prochaines actions',
  '12. Checklist validation terrain',
  '13. Annexes (commandes, comptes, artefacts)',
]);

h2('1. Verdict en une page');
table(
  ['Theme', 'Statut', 'Commentaire'],
  [
    ['Suivi libre start/pause/reprendre', 'OK', '2 cycles propres sur 1.4.133'],
    ['Bouton Terminer', 'OK apres fix', 'Avant : ghost / ressuscitation UI'],
    ['Burn jauge sim A/R (~75 km)', 'OK', '55.0 → 47.9 L (−7.1 L)'],
    ['Burn jauge suivi 0 m', 'OK apres fix', 'Avant : −6.8 L a tort ; maintenant stable'],
    ['Sim labo visible Maps QA', 'OK', 'Bouton ajoute 1.4.132'],
    ['Plein reel enregistre', 'OK', '38.9 L · 87.53 € · jauge → 73.2 L'],
    ['Garage / Budget / Menu', 'OK', 'Batterie UI complete'],
    ['Affichage km · annee', 'OK apres fix', '« annee 2000 » au lieu de « 87 km · 2000 »'],
    ['Double conso 11.7 vs ~8.7', 'OUVERT', 'Deux sources (pleins vs modele)'],
    ['Alertes carburant 806', 'OUVERT', 'Bloquent parfois UI / ADB'],
    ['HUD 0 m sans mouvement', 'ATTENDU', 'Telephone immobile en labo'],
    ['Deploy OTA prod 1.4.133', 'A FAIRE', 'APK QA local seulement pour l’instant'],
  ],
  [2.2, 1.1, 1.7]
);
note(
  'Objectif utilisateur : « vraiment voir ce qui ne va pas ». Ce rapport separe volontairement PASS reels, bugs reels, et faux positifs ADB (sinon on croit que rien n’est teste).'
);

h2('2. Fil chronologique de la session');
table(
  ['Phase', 'Action'],
  [
    ['Debut', 'Frustration tests ADB « merdiques » → passer outre limites (mock GPS OS refuse Samsung)'],
    ['1.4.129-130', 'Jauge Accueil + sync ne tue plus le niveau local'],
    ['1.4.131', 'Filet gpsSimEnabled (flavor QA) ; boutons encore sur ecran Trajet cache'],
    ['Decouverte', 'Maps ≠ ecran sim ; deep link trip?tab=live revele les boutons'],
    ['Sim 1.4.131', 'Trajet sim 74.6 km enregistre MAIS jauge pas brulee (bug applyTripFuelBurn)'],
    ['1.4.132', 'Sim labo sur Maps + Sim rapide en premier + burn sim + annee lisible'],
    ['Preuve burn', 'Sim labo : 55.0 → 47.9 L (−7.1 L)'],
    ['Ghost suivi', 'Suivi libre deja actif au demarrage ; Terminer parfois « mou »'],
    ['1.4.133', 'Terminer coupe UI tout de suite ; pas de burn sur trajets tiny <0.25 km'],
    ['Batterie UI', '20+ PASS : Maps/Garage/Pleins/Budget/Menu/2e cycle suivi'],
    ['Plein', 'Nouveau plein 38.9 L sauve ; budget 249.53/250 ; jauge 73.2 L'],
  ],
  [1.3, 3.7]
);

h2('3. Versions livrees 1.4.128 → 1.4.133');
table(
  ['Ver', 'vc', 'Contenu'],
  [
    ['1.4.133', '159', 'Terminer franc · no-burn tiny · HUD distance liveTail'],
    ['1.4.132', '158', 'Sim labo Maps · burn sim · annee claire · runSim params robustes'],
    ['1.4.131', '157', 'Filet enableGpsSimulator via appFlavor qa/preprod/dev/feat'],
    ['1.4.130', '156', 'preserveLocalFuelOnPull + push force apres jauge'],
    ['1.4.129', '155', 'Jauge Accueil : E si inconnu (plus 1/2 fantome)'],
    ['1.4.128', '—', 'Sync ne reecrase plus jauge cloud (contexte prealable)'],
  ],
  [1.0, 0.7, 3.3]
);

h2('4. Ce qui MARCHE (valide Samsung QA)');
h3('4.1 Navigation & UI');
bullets([
  'Onglets Accueil / Mon Garage / Pleins / Maps / Budget accessibles.',
  'Menu compte : profil QA, push/pull cloud, aide, historique.',
  'Garage : vehicule 806 actif, 7.8 L/100 catalogue, jauge, autonomie.',
  'Budget : enveloppe Carburant total, reste, repartition.',
  'Pleins : liste, CSV, stats mois, formulaire Nouveau plein.',
]);
h3('4.2 Trajets & GPS');
bullets([
  'Suivi libre : demarrer, Pause, Reprendre, Terminer (2 cycles 1.4.133).',
  'Retour idle Maps (« Demarrer suivi libre ») apres Terminer.',
  'Pas de ghost suivi en revenant sur Maps (1.4.133).',
  'Sim labo visible sur Maps (flavors labo).',
  'Sim rapide : trajet Domicile (sim) → Travail A/R (sim) ~74.6 km en historique.',
  'Burn jauge apres sim : −7.1 L (preuve Accueil).',
]);
h3('4.3 Carburant & budget');
bullets([
  'Plein « Completer le reservoir » (~38.9 L) enregistre.',
  'Liste pleins : 3 pleins, 110.9 L, 249.53 € / 250 € (100 %).',
  'Jauge Accueil apres plein : 73.2 L / 80 L (~92 %).',
  'Station GPS proposee (ZA DU PORTAIL RN 12 Thorigné).',
]);
h3('4.4 Sync / session');
bullets([
  'Session QA conservee apres reinstall APK (dans les runs reussis).',
  'Pull cloud / seed API QA fonctionnels pour peupler trajets+pleins.',
  'Jauge cloud vs locale : protecteurs preserveLocalFuelOnPull (1.4.130).',
]);

h2('5. Bugs REELS detects (avec preuves)');
h3('5.1 Critiques / corriges dans la session');
table(
  ['Bug', 'Preuve', 'Fix'],
  [
    ['Sim enregistre sans bruler la jauge', 'Histo 74.6 km / 6.8 L mais Accueil reste 55 L', 'applyTripFuelBurn + addTrackedKm en fin de sim (1.4.132)'],
    ['Terminer « mou » / ghost suivi', 'Maps ouvre deja en Pause/Terminer ; cache GPS ressuscite UI', 'sessionTracking=false immediat + clear cache ; busy bloque resurrect (1.4.133)'],
    ['Burn jauge sur suivi 0 m', '47.9 → 41.1 L alors que HUD 0 m', 'Pas de applyTripFuelBurn si distance < 0.25 km (tiny rejected)'],
    ['Sim invisible sur Maps', 'Scroll Maps sans « Sim rapide »', 'Bouton Sim labo + ecran trip deep-link ; Sim rapide en premier'],
    ['Affichage « 87 km · 2000 »', 'Annee confondue avec compteur', 'Texte « diesel · annee 2000 »'],
  ],
  [1.8, 1.7, 1.5]
);

h3('5.2 Ouverts (a traiter)');
table(
  ['Bug', 'Impact', 'Piste de solution'],
  [
    ['Double conso 11.7 vs ~8.7 L/100', 'Confusion utilisateur Accueil vs histo', 'Renommer clairement « d’apres pleins » vs « modele trajet » ; une seule carte primaire'],
    ['Alertes carburant 806 tres agressives', 'Bloquent UI / tests ; seuil 1/4', 'Cooldowner seuils labo QA ; bouton « Plus tard » plus accessible ; ne pas empiler alertes'],
    ['HUD Parcouru reste 0 m a l’arret', 'Impression que le GPS ne marche pas', 'Message « en attente de mouvement » ; distance depuis liveTail (partiel 1.4.133)'],
    ['Onglet Trajet cache (href null)', 'Sim/historique avances difficiles a trouver', 'Garder Sim labo ; lien « Outils labo » dans menu QA'],
    ['API menu encore 1.4.131', 'Decalage version app vs serveur', 'make deploy + OTA FORCE_UPDATE 1.4.133'],
    ['Mock GPS ADB Samsung impossible', 'Pas d’injection OS (SecurityException)', 'Utiliser Sim labo interne (deja le cas) ; Fake GPS app si besoin live'],
  ],
  [1.8, 1.5, 1.7]
);

h3('5.3 Observations produit (pas forcement bugs)');
bullets([
  'Accueil « aujourd’hui » 86.6 km / 2 trajets : coherent avec ~12 km seed + ~74.6 km sim (faux positif « sous-compte » du script ADB).',
  'Conso « d’apres pleins » 11.7 L/100 ≠ modele physique trajet : attendu tant que les sources restent separees — a clarifier en UI.',
  'Champs plein verrouilles + crayon : UX volontaire ; fragile pour ADB mais OK en manuel.',
]);

h2('6. Faux positifs / pieges de test ADB');
bullets([
  'Chercher « Sim » sur Maps avant 1.4.132 = faux BUG (boutons sur trip cache).',
  'Parser « 1.03 km » depuis « 1.03 km/h » = fausse distance pendant suivi.',
  'Alertes « carburant bas/critique » mangent les taps (PLUS TARD / ANNULER).',
  'App Telephone Samsung vole le focus (onglet Accueil dialer) → dumps hors package.',
  'Deep link runSim sans tab=live tombe souvent sur Historique.',
  'Ne pas installer / toucher Blackview pendant cette campagne (demande explicite).',
]);
callout(
  'Lecon methode',
  'Un PASS ADB sur un libelle visible ≠ fonction OK. Toujours croiser jauge Accueil, historique, et etat idle Maps apres Terminer.',
  ACCENT
);

h2('7. Detail suivi libre + bouton Terminer');
h3('7.1 Comportement observe avant fix');
bullets([
  'Au lancement Maps : parfois deja en « Suivi libre » avec Pause/Terminer (zombie FGS / cache).',
  'Tap Terminer : UI pouvait rester en mode suivi si peekLiveTripId resuscitait sessionTracking.',
  'stopGpsTripLite brulait la jauge AVANT le test tiny → perte de litres sur bruit GPS.',
]);
h3('7.2 Correctifs 1.4.133');
bullets([
  'onStop : setSessionTracking(false) + clear liveTail AVANT await stop.',
  'useEffect : ne pas resurrect pendant busy.',
  'stopGpsTripLite : burn + addTrackedKm seulement si distance >= 0.25 km.',
  'HUD : distance = max(trip.distanceKm, liveTailKm).',
]);
h3('7.3 Retest 1.4.133');
table(
  ['Check', 'Resultat'],
  [
    ['Start suivi libre', 'PASS'],
    ['Pause / Reprendre', 'PASS'],
    ['Terminer → idle', 'PASS'],
    ['2e cycle start/terminer', 'PASS'],
    ['Ghost au retour Maps', 'PASS (absent)'],
    ['Jauge apres 0 m', 'PASS (41.1 inchange)'],
  ],
  [2.5, 2.5]
);

h2('8. Detail simulateur GPS + burn jauge');
h3('8.1 Architecture');
bullets([
  'Ecran trip.tsx (onglet href:null) porte les boutons Sim.',
  'Maps.tsx : suivi libre reel + bouton « Sim labo » (lab flavors) qui route vers trip + runSim.',
  'Sim rapide = injection synchrone A/R Thorigné ↔ Guerche (~75 km).',
  'Sim live ×1 / ×2 = duree mur pour cohabitation musique.',
]);
h3('8.2 Bug burn (critique)');
para(
  'handleRunCarSimulator creait/mettait a jour le trajet, basculait Historique, toast « Sim OK », mais n’appelait PAS applyTripFuelBurn. Resultat : historique convaincant, jauge Accueil inchangee → impression que « rien n’est teste ».'
);
bullets([
  'Fix : applyTripFuelBurn + addTrackedKm apres updateTrip final (sauf abort).',
  'Preuve Samsung : L0=55.0 → L1=47.9 (delta 7.1 L) apres Sim labo 1.4.132+.',
]);
h3('8.3 Limites labo');
bullets([
  'Sans mouvement physique, suivi libre reste ~0 m (GPS stable).',
  'Mock location shell Samsung : SecurityException MOCK_LOCATION.',
  'PurgeSimulatorTrips au debut d’une nouvelle sim peut retirer les anciens sims.',
]);

h2('9. Detail plein / budget / Accueil');
h3('9.1 Plein reussi (preuve)');
table(
  ['Champ', 'Valeur'],
  [
    ['Date', '14/09/2026'],
    ['Station', 'ZA DU PORTAIL RN 12 · Thorigné-Fouillard'],
    ['Mode', 'Completer le reservoir (~38.9 L)'],
    ['Montant', '87.53 €'],
    ['Apres save — pleins mois', '3 pleins · 110.9 L · 249.53 € / 250 €'],
    ['Jauge Accueil', '73.2 L / 80 L · 92 %'],
  ],
  [2.0, 3.0]
);
h3('9.2 Accueil — points d’attention');
bullets([
  'Carte CONSO. « 11.7 L/100 d’apres vos pleins » vs L/100 trajet ~8.7 : a clarifier.',
  'Autonomie / jauge se mettent a jour apres plein et apres burn sim.',
  'Lien « Voir les trajets du jour » ouvre l’historique (filtre parfois « depuis plein »).',
]);

h2('10. Solutions proposees (priorisees)');
h3('P0 — a faire avant prod large');
bullets([
  'Deploy + OTA FORCE_UPDATE 1.4.133 (web/api/app.json/.env/sw.js deja bumpes localement).',
  'Verifier GET /api/version = 1.4.133 vc159.',
  'Smoke Nothing prod (sans casser session perso) apres OTA.',
]);
h3('P1 — UX clarte conso');
bullets([
  'Accueil : une seule conso primaire + sous-ligne « source : pleins | modele | catalogue ».',
  'Tooltips courts sur pourquoi 11.7 ≠ 8.7.',
]);
h3('P1 — alertes 806');
bullets([
  'Ne pas empiler critique + bas + station.',
  'En flavor QA : seuil un peu plus tolerants OU snooze 2 h.',
  'Toujours un dismiss unique « Plus tard » en bas.',
]);
h3('P2 — suivi libre labo');
bullets([
  'Banner « Immobile — parcouru 0 m (GPS OK) » quand speed~0 et tracking.',
  'Option QA : injecter micro-mouvement pour tests sans Fake GPS.',
]);
h3('P2 — outils labo');
bullets([
  'Menu compte QA : section « Labo » (Sim rapide, purge sims, reset jauge).',
  'Garder Sim labo sur Maps (deja fait).',
]);

h2('11. Backlog et prochaines actions');
table(
  ['Priorite', 'Action'],
  [
    ['1', 'Commit + push prod 1.4.133 si pas deja fait'],
    ['2', 'make deploy + build APK prod + upload-release FORCE_UPDATE=1'],
    ['3', 'Retest OTA Nothing (prod) : Terminer + jauge apres trajet court'],
    ['4', 'UI conso dual-source'],
    ['5', 'Assouplir / clarifier alertes 806'],
    ['6', 'Script QA Samsung versionne sous scripts/qa/ (aujourd’hui /tmp)'],
    ['7', 'Blackview : uniquement quand tu le demandes (terrain)'],
  ],
  [1.0, 4.0]
);

h2('12. Checklist validation terrain');
table(
  ['Check', 'Attendu', 'Samsung 1.4.133'],
  [
    ['Demarrer suivi libre', 'Pause+Terminer', 'PASS'],
    ['Terminer → idle', 'Demarrer suivi libre', 'PASS'],
    ['Sim labo burn', 'Jauge baisse ~6–8 L', 'PASS (−7.1)'],
    ['Plein jusqu’au bouchon', 'Jauge ~capacite − marge', 'PASS (73.2/80)'],
    ['Budget apres plein', '€ augmente', 'PASS (249.53)'],
    ['Pas de ghost Maps', 'Pas Pause/Terminer au cold open', 'PASS'],
    ['OTA prod aligne', 'api/version = app', 'A FAIRE'],
  ],
  [1.8, 1.8, 1.4]
);

h2('13. Annexes');
h3('13.1 Comptes & packages');
bullets([
  'QA : com.gasoiltracking.qa · qa.lab@maily.ovh',
  'Prod : com.gasoiltracking.app · compte perso',
  'Scheme QA : gasoiltracking-qa://trip?tab=live&runSim=1&simPace=fast',
]);
h3('13.2 Commandes utiles');
bullets([
  './scripts/build-flavor-apk.sh qa',
  'adb -s R5CT7263YJL install -r dist/gasoil-tracking-qa-1.4.133.apk',
  './scripts/reports/run-report.sh generators/2026-09-14-qa-samsung-complet-soir.js --mail',
  'make deploy  (apres commit/push)',
  'FORCE_UPDATE=1 ./scripts/upload-release-apk.sh',
]);
h3('13.3 Artefacts session');
bullets([
  'APK : dist/gasoil-tracking-qa-1.4.133.apk',
  'Logs tests : /tmp/qa-samsung-133.log · /tmp/qa-samsung-full.log',
  'Generateur PDF : scripts/reports/generators/2026-09-14-qa-samsung-complet-soir.js',
]);

callout(
  'Conclusion',
  'Sur Samsung QA, le cycle critique marche enfin de facon prouvable : Sim labo brule la jauge, Terminer coupe vraiment le suivi, un plein met a jour budget+jauge. Il reste surtout clarifier les deux consos a l’Accueil, calmer les alertes 806, et deployer 1.4.133 en prod/OTA.',
  ACCENT
);
note(
  'PDF genere via scripts/reports (pdfkit-safe) — verify-overflow obligatoire avant envoi mail.'
);

const pages = writeFooters('Gasoil Tracking — QA Samsung 2026-09-14');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
