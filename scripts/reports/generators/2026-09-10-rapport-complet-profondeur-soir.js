'use strict';
/**
 * Rapport complet profondeur — salve 1.4.95 → 1.4.101 + mails/PDF + batterie PLM
 * 2026-09-10 soir
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME =
  process.env.REPORT_OUT || 'GasoilTracking-Rapport-complet-profondeur-2026-09-10-soir.pdf';
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
    Title: 'Gasoil Tracking — Rapport complet profondeur 2026-09-10',
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
  'Rapport complet en profondeur (soir 2026-09-10) : tout ce qui a ete livre, corrige, teste, envoye par mail, et ce qui reste. Inclut Accueil/Maps/pleins, Intermarche vs Travail, sim live + batterie Samsung avec PLM, securite mot de passe, Systeme D Cx/SCx, incidents deploy, backlog.'
);
callout(
  'Etat live (instant rapport)',
  'API / OTA reference : 1.4.100 vc126 forceUpdate · QA Samsung : 1.4.101 (sim live) · PLM Samsung : musique PLAYING en parallele · Batterie monitor demarree 23:29',
  ACCENT
);

kvList([
  ['Date', '2026-09-10 (soir)'],
  ['Branche', 'prod'],
  ['Commits cles', '977e834 · abdaf94 · aa3f7bd · 6b279f0'],
  ['Site', 'https://gasoil-tracking.delhomme.ovh'],
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Appareil batterie', 'Samsung SM-G990B2 (ADB TLS) UNIQUEMENT'],
  ['Compte batterie', 'qa.lab@maily.ovh · package com.gasoiltracking.qa'],
  ['PLM', 'ovh.delhomme.ytmusic (prod p+1.3.205+)'],
]);

h2('Sommaire');
bullets([
  '1. Fil chronologique de la soiree',
  '2. Tableau versions 1.4.95 → 1.4.101',
  '3. Detail 1.4.99 — Accueil, plein, Maps hub',
  '4. Detail 1.4.100 — Intermarche / eco / chips',
  '5. Detail 1.4.101 — Sim live + cohabitation PLM',
  '6. Batterie Samsung : protocole, etat, moniteur',
  '7. Mails PDF deja envoyes (index)',
  '8. Securite mot de passe (rappel)',
  '9. Systeme D Cx/SCx (rappel + suite)',
  '10. Incidents deploy / API 502 — lecons',
  '11. Problemes rencontres & solutions',
  '12. Integration future Gasoil + PLM (prod)',
  '13. Backlog priorise',
  '14. Checklist validation',
  '15. Annexes (packages, comptes, commandes)',
]);

h2('1. Fil chronologique de la soiree');
table(
  ['Heure approx.', 'Action'],
  [
    ['~22:15', '1.4.99 : Accueil clics, plein GPS/verrou, Maps hub, onglet Trajet cache'],
    ['~22:25', 'Mail recap 1.4.99 + securite MDP'],
    ['~22:30', 'Mail PDF Systeme D Cx/SCx (7 puis 10 pages v2)'],
    ['~22:35', 'Samsung : clear prod perso, install/login QA'],
    ['~22:50', 'Demande PLM + Gasoil + fix Intermarche/eco'],
    ['~22:58', '1.4.100 : Intermarche≠Travail, eco defaut, chips'],
    ['~23:02', 'QA 1.4.100 sur Samsung ; deploy Portainer fragile'],
    ['~23:06', '1.4.101 : sim live duree reelle (playCarSimulation)'],
    ['~23:11', 'API down 502 — stack Portainer inactive'],
    ['~23:16', 'Remonte compose VPS + seed vehicule QA cloud'],
    ['~23:19', 'QA 1.4.101 installe Samsung'],
    ['~23:29', 'Batterie live : sim 2.6 km + PLM PLAYING + monitor 90 min'],
  ],
  [1.2, 3.8]
);

h2('2. Tableau versions');
table(
  ['Ver', 'vc', 'Theme'],
  [
    ['1.4.101', '127', 'Sim live PLM · fix keep-awake build'],
    ['1.4.100', '126', 'Intermarche≠Travail · eco · chips dest'],
    ['1.4.99', '125', 'Accueil/plein/Maps hub'],
    ['1.4.98', '124', 'Page Aide'],
    ['1.4.97', '123', 'HUD trajet / historique drawer'],
    ['1.4.96', '122', 'Maps suivi + stations refusables'],
    ['1.4.95', '121', 'Maps + OSM + OSRM'],
    ['1.4.90', '116', 'Modele physique conso'],
  ],
  [1.1, 0.7, 3.2]
);
note(
  'OTA force prod pointe encore 1.4.100 au moment du rapport ; le code 1.4.101 est sur Git + APK QA. Rebuild/upload prod OTA 1.4.101 a faire si besoin utilisateurs.'
);

h2('3. Detail 1.4.99 — Accueil, plein, Maps');
h3('3.1 Accueil');
bullets([
  'Clic « Carburant total » → Budget.',
  'Carte « Depuis le plein » → historique filtre sinceFill.',
  'FAB Demarrer trajet → Maps (si trajet actif → Voir trajet).',
]);
h3('3.2 Nouveau plein');
bullets([
  'Station par defaut = plus proche GPS (pas derniere).',
  'Cluster proches → choix obligatoire.',
  'Champs verrouilles + crayon.',
  'Prix : -- auto + hint €/L.',
  'Plafond litres = place libre × 1.12.',
  'Hint GPS redondant retire entre odo et km.',
]);
h3('3.3 Maps hub');
bullets([
  'Onglet Trajet retire de la barre (href null).',
  'Header : « Tapez une adresse… ».',
  'Sheet : Lieux & recents (plus texte suivi libre bas).',
]);

h2('4. Detail 1.4.100 — Intermarche / eco / chips');
h3('4.1 Bug Intermarche → Travail');
para(
  'Cause racine : PlaceSuggestField matchesQuery utilisait /inter/ dans les alias Travail, et expandAlias mapait « intermarche » vers le lieu work. Resultat : destination Intermarche La Guerche + suggestion/chip Travail en rouge.'
);
bullets([
  'Fix : alias work = travail|bureau|boulot|work|office uniquement (word boundary).',
  'Retrait intermarche de expandAlias.',
  'Chips : seul le lieu dont coords/label matchent la destination est accentue.',
]);
h3('4.2 Itineraire eco par defaut');
bullets([
  'loadRouteAlternatives : prefer eco puis fastest.',
  'handleStartTrip multi-routes : meme ordre.',
]);

h2('5. Detail 1.4.101 — Sim live + PLM');
para(
  'Avant : injection GPS synchrone (secondes) — inutile pour voir la musique durer pendant un trajet. Maintenant : playCarSimulation avec maxWaitMs illimite et timeScale 1 (temps reel) ou 2 (~45 min).'
);
bullets([
  'Boutons QA : Sim live ×1 (~90 min A/R) · Sim live ×2 · Sim rapide.',
  'Deep link : runSim=1&simPace=live&timeScale=1.',
  'Keep-awake expo retire (Metro ne resolvait pas le module) → svc power stayon + moniteur.',
  'Package QA conserve le simulateur (enableGpsSimulator flavors non-prod).',
]);

h2('6. Batterie Samsung (protocole & etat)');
h3('6.1 Pourquoi Samsung seulement');
bullets([
  'Demande explicite : ne pas deborder sur Nothing pour cette batterie.',
  'Samsung = labo autorise + multi-apps (QA + PLM prod).',
]);
h3('6.2 Setup');
bullets([
  'Clear session perso sur com.gasoiltracking.app.',
  'Install Gasoil QA 1.4.101 · login qa.lab@maily.ovh.',
  'Seed cloud sync : vehicule 206 puis ajout UI Peugeot 208 actif.',
  'Lieux home/work (Thorigné / Intermarche Guerche) en sync.',
  'Permissions localisation accordees.',
]);
h3('6.3 Deroulement');
bullets([
  'Sim live demarree (trajet Domicile sim).',
  'A ~23:28 : 2.6 km · ~31 km/h · 5 min · Suivi en cours.',
  'PLM : state PLAYING (piste Aléatoire / Unstoppable etc.).',
  'Moniteur /tmp/gasoil-battery/monitor.log : tick 1/min, Gasoil au premier plan toutes les 5 min (anti-Freecess).',
  'Duree cible batterie : ~90 min mur (timeScale 1).',
]);
h3('6.4 Risques observes pendant la batterie');
bullets([
  'Freecess Samsung peut geler le JS si Gasoil reste trop longtemps en arriere-plan → poke periodique.',
  'Deep link avec (tabs) cassait le shell si mal quote.',
  'MainActivity = com.gasoiltracking.qa/com.gasoiltracking.app.MainActivity (pas .MainActivity).',
  'Trajet zombie 0 m si sim partiellement lancee → Terminer / Continuer selon contexte.',
  'Musique parfois STOPPED si play non engage dans PLM — relancer Aléatoire / MEDIA_PLAY.',
]);
callout(
  'Integration apps',
  'Aujourd’hui : coexistence processuelle (audio focus PLM + GPS/sim Gasoil). Pas encore d’API croisee. Plus tard : MediaSession, intents, eventuel ecran « conduite » unifie — hors scope de cette batterie.',
  ACCENT
);

h2('7. Index des mails PDF deja envoyes');
table(
  ['Sujet', 'Pages', 'Contenu'],
  [
    ['Recap 1.4.99 + MDP', '2', 'Livraisons + lien reset securise'],
    ['Cx/SCx Systeme D', '7', 'Sources, scraping, schema'],
    ['Cx/SCx v2 complet', '10', 'Risques, solutions, backlog'],
    ['CE rapport profondeur', '—', 'Salve complete soir + batterie'],
  ],
  [2.0, 0.7, 2.3]
);

h2('8. Securite mot de passe (rappel)');
bullets([
  'Oublie : email + token crypto.randomBytes(32) hex, hash SHA-256 en base, 2 h, one-shot, anti-enumeration.',
  'URL : /reset-password?token=…',
  'Connecte : change-password (JWT + MDP actuel).',
  'Verdict : le lien email est le bon niveau « URL ultra aleatoire » — pas de refactor urgent.',
]);

h2('9. Systeme D Cx/SCx (rappel + suite)');
bullets([
  'Runtime utilise dragAreaScx (F_air = 0.5 rho SCx v^2).',
  'APIs gratuites : masse parfois, Cx rare.',
  'Pipeline : CSV → scxCache d’abord ; scrape poli ensuite ; DrivAer = labo segments.',
  'Fichiers : lib/scxCache.ts, scripts/enrich-scx-cache.mjs (stub).',
  'Suite : Phase 1 import CSV prioritaire vehicules reels.',
]);

h2('10. Incidents deploy / API 502');
para(
  'make deploy via Portainer (delete+recreate stack) a renvoye OK Id 123/124 mais Status=4 (inactive) : images web:1.4.101 manquantes au build, conteneurs absents → 502 openresty.'
);
bullets([
  'Remede : docker tag web/api 1.4.100→1.4.101 sur VPS + git reset hard origin/prod dans /home/pavel/apps/gasoil-tracking + docker compose up -d.',
  'Volume gasoil_api_data preserve (donnees OK).',
  'Lecon : verifier curl /api/version apres deploy ; ne pas se fier au seul HTTP 200 create stack.',
  'APP_VERSION dans .env VPS encore ancien — l’endpoint version peut aussi refleter la derniere release APK (1.4.100).',
]);

h2('11. Problemes & solutions (matrice soiree)');
table(
  ['Probleme', 'Solution'],
  [
    ['Intermarche selectionne Travail', 'Retirer alias /inter/ + chips actives'],
    ['Route toujours rapide', 'Prefer eco dans alternatives'],
    ['Sim trop rapide pour musique', 'simPace=live + timeScale 1'],
    ['expo-keep-awake unresolved', 'Retirer import ; stayon ADB'],
    ['API 502 apres Portainer', 'compose up manuel VPS + tag images'],
    ['QA sans vehicule', 'PUT /api/sync + Ajouter 208 UI'],
    ['Deep link shell (tabs)', 'Quotes am start -d \'…\''],
    ['Freecess tue sim BG', 'Poke Gasoil toutes les 5 min'],
    ['Test Nothing non demande', 'Batterie recentree Samsung only'],
  ],
  [2.0, 3.0]
);

h2('12. Integration future Gasoil + PLM (prod)');
bullets([
  'Court terme : coexistence telle quelle (cette batterie valide le pattern conduite + musique).',
  'Moyen terme : documentation Aide « utiliser PLM pendant un trajet ».',
  'Long terme (idees) : intent Gasoil → « demarrer suivi » depuis PLM ; widget partage ; Android Auto / MediaBrowser ; ne jamais scraper Cx depuis le telephone.',
  'Ne pas merger les packages Android (sessions separees volontaires).',
]);

h2('13. Backlog priorise');
table(
  ['#', 'Item', 'Prio'],
  [
    ['1', 'OTA prod 1.4.101 (ou 1.4.100 suffit si Intermarche OK) + align APP_VERSION API', 'Haute'],
    ['2', 'Suivre fin batterie Samsung (monitor.log) + noter km/L finaux', 'Haute'],
    ['3', 'CSV → scxCache (Systeme D Phase 1)', 'Haute'],
    ['4', 'Durcir deploy Portainer (attendre healthy + image tags)', 'Haute'],
    ['5', 'Badge confiance SCx / ne pas ecraser saisie user', 'Moyenne'],
    ['6', 'SCx_learned experimental GPS', 'Basse'],
    ['7', 'Page HTML pure reset MDP (optionnel)', 'Basse'],
  ],
  [0.4, 3.4, 0.8]
);

h2('14. Checklist validation');
bullets([
  '[ ] Accueil : Carburant total → Budget',
  '[ ] Accueil : Depuis le plein → historique filtre',
  '[ ] Maps : search adresse + Lieux & recents',
  '[ ] Clic Intermarche : destination correcte, PAS Travail rouge',
  '[ ] Route proposee = eco (modifiable)',
  '[ ] Plein : station proche, crayon, plafond L, prix -- auto',
  '[ ] QA Samsung : sim live avance (km > 0, duree augmente)',
  '[ ] PLM PLAYING pendant sim',
  '[ ] Fin sim : trajet historique note SIMULATEUR LIVE',
  '[ ] API health 200 apres chaque deploy',
]);

h2('15. Annexes');
h3('15.1 Packages Android');
bullets([
  'com.gasoiltracking.app — prod (perso)',
  'com.gasoiltracking.qa — labo QA',
  'com.gasoiltracking.preprod / .admin / .dev / .feat',
  'ovh.delhomme.ytmusic — PLM prod',
]);
h3('15.2 Comptes');
bullets([
  'Perso : paveldelhomme@gmail.com (prod)',
  'QA : qa.lab@maily.ovh (batterie)',
  'Admin : admin@delhomme.ovh',
]);
h3('15.3 Fichiers cles touches');
bullets([
  'app/(tabs)/index.tsx, maps.tsx, trip.tsx, _layout.tsx',
  'app/fillup/add.tsx · components/Input.tsx · Card.tsx · PlaceSuggestField.tsx',
  'lib/gpsCarSimulator.ts · lib/helpContent.ts · lib/scxCache.ts',
  'scripts/reports/generators/2026-09-10-*.js',
]);
h3('15.4 Commandes utiles');
bullets([
  './scripts/build-flavor-apk.sh qa|prod',
  'FORCE_UPDATE=1 RELEASE_NOTES=… ./scripts/upload-release-apk.sh dist/gasoil-tracking-prod-VERSION.apk',
  './scripts/reports/run-report.sh generators/… --mail --subject "…"',
  'ssh VPS : cd /home/pavel/apps/gasoil-tracking && docker compose up -d',
]);

note(
  'Rapport genere via scripts/reports (pdfkit-safe + verify-overflow). Completitude prioritaire. Aucun secret / JWT / mot de passe dans ce PDF.'
);

const pages = writeFooters('Gasoil Tracking — rapport profondeur 2026-09-10');
doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
