'use strict';
/**
 * Générateur de rapport PDF — utilise scripts/reports/pdfkit-safe.js
 * Ne pas écrire de doc.text() sans LEFT()/WIDTH() après kvList/table.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bindPdfHelpers } = require('../pdfkit-safe');

const OUT_NAME = process.env.REPORT_OUT || 'GasoilTracking-Rapport-complet-1-7-septembre-2026.pdf';
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
    Title: 'Gasoil Tracking — Rapport complet 1–7 septembre 2026',
    Author: 'Gasoil Tracking',
    Subject: 'Semaine + week-end + suite 1.4.50–60 — sans débordement',
  },
});

const stream = fs.createWriteStream(out);
doc.pipe(stream);

const {
  ACCENT,
  DARK,
  MUTED,
  LIGHT,
  LEFT,
  RIGHT,
  WIDTH,
  clean,
  resetX,
  need,
  h2,
  h3,
  para,
  note,
  bullets,
  callout,
  table,
  kvList,
  writeFooters,
} = bindPdfHelpers(doc);

// ===================== COVER =====================
doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
doc.moveDown(1.1);
doc
  .font('Helvetica-Bold')
  .fontSize(8)
  .fillColor(ACCENT)
  .text('RAPPORT TECHNIQUE & PRODUIT — PDF CADRÉ (SANS DÉBORDEMENT)', LEFT(), doc.y, {
    width: WIDTH(),
  });
doc.moveDown(0.2);
doc.font('Helvetica-Bold').fontSize(17).fillColor(DARK).text('Gasoil Tracking', LEFT(), doc.y, {
  width: WIDTH(),
});
doc
  .font('Helvetica')
  .fontSize(10.5)
  .fillColor('#334155')
  .text('Rapport récapitulatif complet — 1er au 7 septembre 2026', LEFT(), doc.y, {
    width: WIDTH(),
  });
note('Semaine intensive + week-end · suite 1.4.50–60 · Mobile · API · Web · Infra · Labo QA');
callout(
  'Version live au moment du rapport',
  '1.4.60 (force-update) — https://gasoil-tracking.delhomme.ovh\nAPK : …/api/download/gasoil-tracking-1.4.60.apk\nLabo QA : Nothing / Blackview BV9700 / Samsung SM-G990B2 uniquement\nFlavors : prod · preprod · qa · admin · dev (packages séparés)',
  '#16a34a'
);
kvList([
  ['Destinataire', 'paveldelhomme@gmail.com'],
  ['Branche Git', 'prod'],
  ['Période', 'Mardi 2 → Lundi 7 septembre 2026'],
  ['Surfaces', 'App Android (Expo), API Node, site web / PWA, Docker Portainer VPS'],
  ['Devices', 'Nothing · Blackview BV9700 · Samsung SM-G990B2 · Xiaomi = ne pas installer'],
  ['Compte QA', 'qa.lab@maily.ovh (jetable — create/reset/delete via script / admin)'],
]);
para(
  'Ce PDF reprend le rapport technique & produit densifié du 6 septembre (20:05) — semaine entière, features, données, infra, checklist — et y ajoute la vague 1.4.50→1.4.60 (multi-apps labo, backlog entretien/conso/photos, sim commute). Les tableaux sont clipés avec retour à la ligne : plus de débordement à droite.'
);
callout(
  'Mails / PDF déjà envoyés (contexte)',
  'Rapport complet v2 du 6 sept. ~20:05 (contenu riche, mais colonnes qui débordaient) → remplacé ici par CE document (même richesse + cadrage).\nRécaps courts 1.4.50–56 → ce fichier les absorbe aussi.',
  ACCENT
);

// ===================== TOC =====================
h2('Sommaire');
bullets([
  '1. Synthèse exécutive & chiffres clés',
  '2. État de la production (URLs, force-update, stack)',
  '3. Chronologie détaillée des versions (1.0 → 1.4.60)',
  '4. Semaine Mardi–Vendredi (2–4 septembre)',
  '5. Week-end Vendredi soir–Dimanche (5–6 septembre)',
  '6. Suite lundi 7 septembre (1.4.50 → 1.4.60)',
  '7. Fonctionnalités majeures (Maps, jauge, QR, budget, sync)',
  '8. Correction données : pleins 806 / Touran / 206 & budget 250 €',
  '9. Accessibilité, polish UX, messages API',
  '10. Déploiement, Docker, Portainer, releases APK',
  '11. Devices, flavors multi-apps, signature EAS, Labo QA',
  '12. Checklist de vérification terrain',
  '13. Inventaire API / modèle données / runbook ops',
  '14. Annexe commits & pistes suivantes',
  '15. Backlog terrain : conso, CT photo, carte grise, entretien (état 1.4.60)',
]);

// ===================== 1 =====================
h2('1. Synthèse exécutive & chiffres clés');
para(
  'En moins d’une semaine, Gasoil Tracking est passé d’une base déjà en production à une application nettement plus aboutie au quotidien : GPS stable, navigation Maps réelle, jauge visuelle, enveloppe budget unique, connexion web par QR, OTA force-update, et une vague continue de polish / accessibilité — sans casser les flux métier existants.'
);
table(
  ['Indicateur', 'Valeur'],
  [
    ['Versions livrées (période)', '~60+ commits majeurs / releases 1.x→1.4.60'],
    ['Version live', '1.4.60 (forceUpdate = true)'],
    ['Budget carburant mensuel', '250 € total (806 + Touran + 206 cumulés)'],
    ['Surfaces touchées', 'Mobile + API + Web + Infra VPS'],
    ['Nouveauté auth', 'QR login web scanné depuis l’app'],
    ['Labo QA', 'Appareils labo + compte qa.lab@maily.ovh'],
    ['Icône app', 'Pompe à essence rouge rosé (depuis 1.4.49)'],
  ],
  [1.1, 2.2]
);
h3('Axes de travail');
bullets([
  'Trajet : démarrage 1-tap, suggestions horaires, alternatives OSRM, Maps nav, récap arrivée, historique + mini-cartes',
  'Carburant : jauge glissable, bandeau, stations open data FR, pleins liés véhicule, édition véhicule',
  'Compte & cloud : invite, JWT refresh, sync pulled/pushed/skipped, QR login, admin, RGPD',
  'Qualité : a11y, empty states CTA, toasts sync, erreurs API FR, page download',
  'Ops : Portainer Git, rebuild Docker forcé, /api/ci/releases, keystore EAS obligatoire',
]);

// ===================== 2 =====================
h2('2. État de la production');
table(
  ['Élément', 'Détail'],
  [
    ['URL app/web', 'https://gasoil-tracking.delhomme.ovh'],
    ['Download', 'https://gasoil-tracking.delhomme.ovh/download'],
    ['APK 1.4.60', '…/api/download/gasoil-tracking-1.4.60.apk'],
    ['API version', 'GET /api/version (forceUpdate, releaseNotes, apkUrl)'],
    ['Health', 'GET /health → « ok » ; JSON {status,version}'],
    ['Stack', 'Docker Compose api + web · Portainer Git refs/heads/prod'],
    ['Git', 'Branche prod · VPS pavel-server:/home/pavel/apps/gasoil-tracking'],
    ['Signature APK', 'Keystore EAS — SHA-256 13c3be90… (refus debug)'],
    ['Compte QA', 'qa.lab@maily.ovh · ./scripts/qa-lab-account.sh'],
  ],
  [1, 2.4]
);

// ===================== 3 =====================
h2('3. Chronologie détaillée des versions');
note('Tableau synthétique puis détail week-end (le plus « produit »).');
table(
  ['Plage', 'Quand', 'Thèmes'],
  [
    ['1.0.2 → 1.2.x', '2 sept.', 'Auth invite, API sync, Portainer, GPS libre, historique cartes'],
    ['1.3.x', '2 sept.', 'Devises Europe, cloud refresh, multi-voitures, admin multi-canal'],
    ['1.4.5 → 1.4.13', '2–3 sept.', 'OTA in-app, FAB, CT, cartes historique, jauges, trajets rapides'],
    ['1.4.14 → 1.4.19', '4 sept.', 'Builds EAS annoncés, CT/plein, Takeout, polish FR, logout'],
    ['1.4.20 → 1.4.26', '4–5 sept.', 'GPS précision, FGS, conso réaliste, tests auto, purge simulateur'],
    ['1.4.28 → 1.4.31', '5–6 sept.', 'Signature EAS, Leaflet/OSM, mini-cartes, fluidité historique'],
    ['1.4.32 → 1.4.41', '6 sept. matin', 'Maps nav, jauge visuelle, bilan jour (1er mail récap)'],
    ['1.4.42 → 1.4.49', '6 sept. soir', 'Itinéraires génériques, QR, a11y, budget 250€, icône pompe'],
    ['1.4.50 → 1.4.56', '6–7 sept.', 'Prix 2,25 €/L, trajets/offline, jauge confirm, Labo QA, PDF cadré'],
    ['1.4.57 → 1.4.58', '7 sept.', '502 nginx DNS, multi-apps flavors, pipeline PDF'],
    ['1.4.59', '7 sept.', 'Entretien checklist, conso accel/stop-go, photos CT/carte grise'],
    ['1.4.60', '7 sept. soir', 'Sim commute anti-zombie Samsung, conso live, FAB Accueil'],
  ],
  [1.1, 0.9, 2.2]
);

h3('Détail productif week-end (1.4.31 → 1.4.49)');
table(
  ['Ver.', 'Contenu livré'],
  [
    ['1.4.31', 'Mini-cartes tracé complet, détail trajet, FlatList historique fluide'],
    ['1.4.32', 'Icônes / boutons supprimer (lieux, routes, budgets, entretien)'],
    ['1.4.33', 'Destinations rapides sous suivi + barre direction live'],
    ['1.4.34', 'Niveau réservoir clarifié ; « depuis dernier plein » lié au véhicule actif'],
    ['1.4.35', 'Alternatives avant Maps + purge micro-trajets / vitesses aberrantes'],
    ['1.4.36', 'Maps en navigation sur l’itinéraire choisi + récap à l’arrivée'],
    ['1.4.37', 'Fix Maps Blackview (google.navigation) + suggestions selon l’heure'],
    ['1.4.38', 'Go 1-tap, jauge soft-skip, fin arrivée, Relancer+plein, mode nav mémorisé'],
    ['1.4.39', 'Bilan du jour km/L/€, retour inverse, raccourcis plein/station/budget'],
    ['1.4.40', 'Jauge visuelle glissable Vide→Plein (remplace pastilles)'],
    ['1.4.41', 'Jauge compacte sur véhicule sélectionné à l’accueil'],
    ['1.4.42', 'Itinéraires génériques : Plus rapide / Économique / Alternatif'],
    ['1.4.43', 'Polish Trajet/Budget/chargements + accessibilité'],
    ['1.4.44', 'Feedback offline/Maps, bandeau carburant bas'],
    ['1.4.45', 'Connexion web par QR (API challenges + scan app)'],
    ['1.4.46', 'Dates relatives, toast plein, tap budget→onglet, a11y étendue'],
    ['1.4.47', 'Pleins 806/Touran corrigés + enveloppe budget 250 € unique'],
    ['1.4.48', 'Empty states CTA, toasts sync, /health versionné, erreurs API FR'],
    ['1.4.49', 'Icône pompe à essence rouge rosé (assets + mipmaps Android)'],
  ],
  [0.7, 3.3]
);

// ===================== 4 =====================
h2('4. Semaine — mardi 2 → vendredi 4 septembre');
h3('4.1 Production & auth');
bullets([
  'Stack Portainer Git (branche prod) + reverse proxy domaine gasoil-tracking.delhomme.ovh',
  'Inscription invite-only, validation email en 2 étapes (anti pré-scan Gmail/Outlook)',
  'JWT access/refresh rotatif, rate-limit auth, bootstrap compte admin',
  'Sync cloud GET/PUT /api/sync (blob JSON : vehicles, fillUps, budgets, trips, places…)',
  'Web : AsyncStorage (pas SQLite), hydratation SPA, thème clair/sombre',
  'Catalogue véhicules, liens APK sécurisés, pipeline CI / releases',
]);
h3('4.2 Trajets & GPS');
bullets([
  'Suivi GPS libre en arrière-plan + pause station/plein',
  'Carte OSM live, historique avec mini-cartes, suppression trajets',
  'Suggestions domicile/travail, import Timeline fichier / Takeout ZIP',
  'Filtres sauts GPS, BestForNavigation, lissage, anti-stationnaire',
  'Stabilisation foreground service (plus de double suivi / spam notif)',
  'Conso réaliste (relief, âge véhicule, jauge), vitesse en mouvement',
]);
h3('4.3 Pleins, budget, véhicules, CT');
bullets([
  'Date picker JJ/MM, station GPS, prix/L auto (open data stations FR)',
  'Enveloppe mensuelle, reste budget mis en avant à l’accueil',
  'Niveau carburant multi-voitures, couleurs autonomie vert/orange/rouge',
  'Entretien CT / contre-visite + notifications',
  'Trajets réguliers flexibles, km trackés GPS + compteur (base+GPS)',
]);
h3('4.4 Mises à jour & admin');
bullets([
  'MAJ APK in-app (téléchargement serveur + session) sans perte de données',
  'Annonce builds EAS « en cours » pour éviter le faux message « à jour »',
  'Admin multi-canal, PWA iOS, compte / suppression RGPD, déconnexion',
  'Formulations FR (vouvoiement), polish historique / depuis-le-plein',
]);

h3('4.5 Points d’attention rencontrés en semaine');
bullets([
  'Hydratation web Expo Router (#418/#422) → ClientOnly + output single',
  'SQLite indisponible sur navigateur → AsyncStorage (database.web.ts)',
  'Pré-scan Gmail des liens de vérif → page intermédiaire + bouton « Confirmer »',
  'MAJ web / service worker : cache stampé par version (gasoil-shell-vX.Y.Z)',
  'GPS FGS : éviter double enregistrement et spam de notification système',
  'Import Takeout ZIP Google Timeline : parsing + mapping trajets',
]);
h3('4.6 Ce que l’utilisateur voit concrètement (semaine)');
bullets([
  'Accueil : reste budget, véhicule actif, jauge/autonomie, trajets rapides',
  'Onglet Trajet : live + historique avec cartes',
  'Onglet Pleins : rail de mois, stations, édition',
  'Onglet Budget : dépenses mensuelles, projection',
  'Véhicules : catalogue, entretien CT, compteur / tracked km',
  'Mon compte : sync, MAJ, admin si manager, déconnexion',
]);

// ===================== 5 =====================
h2('5. Week-end — vendredi 5 → dimanche 6 septembre');
para(
  'Le week-end concentre les gains « usage quotidien » : navigation Maps réelle, jauge visuelle, bilan du jour, QR login, correction des associations plein↔véhicule, et icône app.'
);
h3('5.1 Vendredi soir / nuit (1.4.28 → 1.4.31)');
bullets([
  'Signature release EAS obligatoire — scripts refusent un APK debug-signed',
  'Mini-cartes : tracé complet, zoom calé sur départs/arrivées, précharge',
  'Correctif aller manquant 05/09, devise auto',
  'Passage des tuiles / tracés vers une approche plus fiable (OSM + géométrie)',
]);
h3('5.2 Dimanche matin (1.4.32 → 1.4.41) — contenu du 1er mail');
callout(
  'Périmètre du 1er mail récap',
  'Le mail « récap du dimanche 6 septembre » s’arrêtait volontairement à la v1.4.41. Tout ce qui suit (1.4.42+) est postérieur à ce mail.',
  '#2563eb'
);
bullets([
  'Suppressions visibles partout (lieux, routes, budgets, entretien)',
  'Démarrage trajet : destinations rapides, barre direction, Go 1-tap',
  'Alternatives d’itinéraire avant Maps puis lancement navigation',
  'Fix ouverture Maps sur Blackview',
  'Suggestions selon l’heure, récap arrivée, Relancer + CTA plein',
  'Bilan du jour, retour inverse, jauge glissable + compacte accueil',
  'Habitudes / trajets similaires : moyennes et comparaison',
]);
h3('5.3 Dimanche après-midi / soir (1.4.42 → 1.4.49)');
bullets([
  '1.4.42 — fin du hardcode « via Châteaugiron » → labels génériques OSRM',
  '1.4.43–44 — polish UX + feedback offline/Maps + bandeau carburant',
  '1.4.45 — QR login : start / approve / poll + table qr_login_challenges + rebuild Docker forcé',
  '1.4.46 — « Aujourd’hui/Hier », toast plein, raccourci budget, a11y',
  '1.4.47 — données pleins/budget (section 7) + changer véhicule sur détail plein',
  '1.4.48 — empty states, toasts sync précis, health versionné, erreurs FR',
  '1.4.49 — icône pompe à essence rouge rosé (icon, adaptive, splash, mipmaps)',
]);
h3('5.4 Déploiements & tests devices le week-end');
bullets([
  'Chaque release : build APK signé → upload forceUpdate → rebuild VPS api/web',
  'Nothing Phone : installé régulièrement ; utilisateur peut aussi installer via force-update',
  'Blackview : install parfois via push+pm (plus fiable que adb install streamé)',
  'Xiaomi : explicitement exclu des installs',
  'Mails récap SMTP OVH envoyés à PERSONAL_MAIL (paveldelhomme@gmail.com)',
]);

// ===================== 6 =====================
h2('5 bis. Suite lundi 7 septembre (1.4.50 → 1.4.60)');
para(
  'Après le rapport du 6 sept. ~20:05 (jusqu’à 1.4.49), une vague de correctifs usage a suivi : données gazole réalistes, trajets/Maps/offline, jauge type tableau de bord, budget, stations, puis Labo QA réservé aux appareils labo.'
);
table(
  ['Ver.', 'Contenu'],
  [
    ['1.4.50', 'Gazole Total Thorigné 2,25 €/L — litres recalculés, niveaux, défaut véhicule'],
    ['1.4.51', 'Jauge → autonomie + stats liées + polish UX'],
    ['1.4.52', 'Seuils autonomie basse ≈ ⅓, critique ≈ ¼'],
    ['1.4.53', 'Sync 413, Maps waypoints, Terminer in-app, budgetOutlook'],
    ['1.4.54', 'Skip jauge Terminer, suivi libre, alts carte, messages sync'],
    ['1.4.55', 'Offline/ping, jauge 0·¼·½·1 + confirm, swipe, Voir véhicule, stations cache, conso trafic'],
    ['1.4.56', 'Labo QA gated (Nothing/BV9700/G990B2), checklist, compte qa.lab, PDF cadrés'],
    ['1.4.57–58', 'Fix 502 nginx, flavors multi-apps (prod/preprod/qa/admin/dev), PDF pipeline'],
    ['1.4.59', 'Entretien Oui/Non+checklist, conso accel/stop-go+calibration pleins, photos CT/CG'],
    ['1.4.60', 'Sim commute A/R fiable (Samsung), conso live trajet actif, FAB Accueil'],
  ],
  [0.7, 3.3]
);
h3('Labo QA & compte jetable');
bullets([
  'Écran Mon compte → Labo QA : visible seulement sur appareils labo',
  'Compte qa.lab@maily.ovh — create / reset / delete : ./scripts/qa-lab-account.sh',
  'Mot de passe stocké dans .env (QA_LAB_PASSWORD), générable aléatoirement',
  'Données de test cloud : à supprimer après validation terrain (pas avant)',
]);
table(
  ['Date', 'Ticket', 'Avant', 'Après', 'Véh.'],
  [
    ['25/08', '104,03 €', '~60,5 L', '46,24 L', '806'],
    ['18/08', '78,37 €', '~45,6 L', '34,83 L', '806'],
    ['02/09', '70,04 €', '~40,7 L', '31,13 L', '806'],
    ['12/08', '76,39 €', '~45,2 L', '33,95 L', 'Touran'],
  ],
  [0.9, 1.0, 1.0, 1.0, 0.8]
);

h2('6. Fonctionnalités majeures');
h3('6.1 Trajets & Maps');
bullets([
  'Modes suivi libre et navigation guidée',
  'Picker d’itinéraires OSRM (rapide / éco / alternatif) avant Maps',
  'Intent navigation Android fiable (y compris Blackview)',
  'Récap à l’arrivée, relancer, retour inverse',
  'Historique : mini-cartes, durée, vitesses, suppression, précharge',
  'Suggestions domicile ↔ travail selon l’heure',
  'Purge trajets simulateur / micro-trajets aberrants',
]);
h3('6.2 Carburant & jauge');
bullets([
  'Jauge visuelle glissable Vide → Plein (+ a11y marques)',
  'Jauge compacte sur l’accueil pour le véhicule sélectionné',
  'Stations open data FR, prix/L, Δ ct/L entre pleins',
  'Pleins liés au véhicule ; édition du véhicule depuis le détail',
  'Adaptation conso véhicule après pleins complets (samples)',
]);
h3('6.3 Budget');
bullets([
  'Enveloppe globale mensuelle 250 € (tous véhicules cumulés)',
  'Budgets par véhicule désactivés (évite le double compteur)',
  'ensureDefaultBudgets : uniquement enveloppe globale',
  'Vue mensuelle, projection, reste / dépassement, CTA empty state',
  'spent recalculé dynamiquement (pleins + entretiens dans la période)',
]);
h3('6.4 Compte, sync, QR');
bullets([
  'Auth invite + email + admin pending',
  'SyncPreferNewer → toasts « Cloud téléchargé » / « Sauvegarde envoyée » / « à jour »',
  'QR : Mon compte → Scanner le QR du site → navigateur connecté',
  'Force-update via /api/version + upload /api/ci/releases',
  'Backup local + recover après MAJ APK',
]);

// ===================== 6b stack technique =====================
h2('6 bis. Architecture & fichiers clés (aperçu)');
table(
  ['Domaine', 'Fichiers / endpoints notables'],
  [
    ['Auth / QR', 'api/src/index.js · app/auth.tsx · app/qr-login.tsx · QrWebLoginPanel'],
    ['Sync', 'lib/backup.ts · lib/dataSnapshot.ts · GET/PUT /api/sync'],
    ['Trajets', 'app/(tabs)/trip.tsx · lib/mapsNavigation.ts · lib/roadDistance.ts'],
    ['Pleins', 'app/fillup/* · lib/fuelLevel.ts · lib/fuelPrices.ts'],
    ['Budget', 'app/(tabs)/budget.tsx · lib/calculations.ts (ensureDefaultBudgets)'],
    ['Réparation data', 'lib/repairFillUpVehicles.ts · context/AppContext.tsx'],
    ['Icons', 'assets/icon.png · adaptive-icon.png · android mipmaps'],
    ['Release', 'scripts/build-release-apk.sh · POST /api/ci/releases'],
  ],
  [1, 2.6]
);

// ===================== 7 =====================
h2('7. Correction données — pleins & budget (1.4.47)');
para(
  'Sur le sync cloud du compte, le plein du 12/08 était encore associé au 806, ce qui gonflait le total août 806 (~258,79 €). Correction côté serveur + réparation locale idempotente à l’ouverture de l’app (lib/repairFillUpVehicles.ts).'
);
table(
  ['Date', 'Véhicule', 'Montant', 'Statut'],
  [
    ['02/09/2026', 'Peugeot 806', '70,04 €', 'OK'],
    ['25/08/2026', 'Peugeot 806', '104,03 €', 'OK'],
    ['18/08/2026', 'Peugeot 806', '78,37 €', 'OK (1er des deux)'],
    ['12/08/2026', 'Volkswagen Touran', '76,39 €', 'Corrigé (était 806)'],
    ['20/08/2026', 'Peugeot 206', '58,18 €', 'Essence — inchangé'],
  ],
  [1.1, 1.4, 0.9, 1.4]
);
callout(
  'Règle budget',
  'Une seule enveloppe active « Carburant total » = 250 € / mois, que ce soit 806 seul ou 806+Touran+206 cumulés. Les anciens budgets mensuels par véhicule sont désactivés.',
  '#16a34a'
);
para(
  'Août après correction : 806 ≈ 182,40 € · Touran 76,39 € · 206 58,18 € · total ≈ 316,97 € (au-dessus du plafond 250 € — le plafond reste la règle d’enveloppe, pas une interdiction de dépasser).'
);

// ===================== 8 =====================
h2('8. Accessibilité, polish UX, messages API');
bullets([
  'Labels a11y : Input, DatePicker, TimePicker, jauge, chips mois, cartes pleins',
  'Drawer compte, PlaceSuggestField, TripHistoryCard, InstallAppHint',
  'Toasts : accessibilityLiveRegion / role alert',
  'StatCards + ProgressBar (role progressbar + valeur)',
  'Empty states Budget & Historique avec CTA',
  'Dates relatives « Aujourd’hui / Hier / Demain »',
  'confirm() web appelle onCancel si Annuler',
  'Auth web : erreur en role alert',
  'API : messages FR explicites (forgot-password, renvoi mail, download, validation…)',
  'Page /download : indique un build en cours (buildingVersion)',
]);

// ===================== 9 =====================
h2('9. Déploiement, Docker, Portainer, releases');
bullets([
  'Workflow : commit prod → git push → POST /api/ci/releases (APK + forceUpdate=1)',
  'VPS : git fetch/reset origin/prod puis docker compose build api web + up --force-recreate',
  'Piège connu : recreate Portainer sans rebuild → anciennes images ; d’où rebuild SSH',
  'gasoil-network marqué external:true pour redeploys propres',
  'scripts/build-release-apk.sh vérifie le SHA-256 du certificat EAS',
  'SMTP OVH : secure port 465, requireTLS sur 587 (mails vérif / récaps)',
]);

// ===================== 10 =====================
h2('10. Devices, signature, politique d’install');
bullets([
  'Cible principale : Nothing Phone — installer en priorité',
  'Labo : Blackview BV9700 + Samsung SM-G990B2 (Labo QA visible)',
  'Xiaomi : ne pas installer (politique produit)',
  'Keystore EAS obligatoire — scripts refusent un APK debug-signed',
  'SHA-256 cert attendu documenté dans build-release-apk.sh',
  '.env réorganisé : ADMIN_EMAIL / ADMIN_PASSWORD côte à côte (évite confusions login)',
]);
h3('Labo QA (1.4.56+)');
bullets([
  'Allowlist modèle : Nothing · BV9700 · SM-G990B2',
  'Checklist + smoke in-app ; autres users ne voient pas l’entrée',
  'Script : ./scripts/qa-lab-account.sh status|create|reset|delete',
]);

h2('11. Checklist de vérification terrain');
para(
  'Cocher aussi dans l’app : Compte → Labo QA (appareils labo). Attendre la fin du rate-limit login (15 min) si trop de tentatives web.'
);
table(
  ['#', 'À vérifier', 'Où'],
  [
    ['1', 'Version 1.4.60+', 'Compte'],
    ['2', 'Pas de faux hors-ligne', 'Sync header'],
    ['3', 'Routes multi carte', 'Trajet → destination'],
    ['4', 'Maps sans arrêt fantôme', 'Démarrer + Maps'],
    ['5', 'Terminer trajet', 'Nav puis free'],
    ['6', 'Suivi libre', 'Mode free'],
    ['7', 'Swipe onglets', 'En cours / Historique'],
    ['8', 'Jauge confirm', '0·¼·½·1'],
    ['9', 'Voir véhicule', 'Onglet Véhicules'],
    ['10', 'Pleins tous véh.', 'Chips filtre'],
    ['11', 'Reste budget', 'Accueil'],
    ['12', 'Stations', 'Budget'],
    ['13', 'Labo QA gated', 'Compte'],
    ['14', 'Compte qa.lab', 'Login test puis perso'],
    ['15', 'Login admin .env', 'ADMIN_EMAIL + ADMIN_PASSWORD'],
  ],
  [0.35, 1.5, 2.1]
);
table(
  ['Appareil', 'Rôle', 'État'],
  [
    ['Nothing Phone', 'Usage quotidien + Labo QA (prod/preprod/qa/admin)', 'Installer 1.4.60 (force-update)'],
    ['Blackview BV9700 Pro', 'Labo QA / GPS / Maps / toutes flavors', '1.4.60 installé'],
    ['Samsung SM-G990B2', 'Labo QA (sim commute validée)', '1.4.60 installé'],
    ['Xiaomi', 'Exclu (consigne)', 'Ne pas installer'],
  ],
  [1.4, 1.6, 1.4]
);
para(
  'Toute APK publiée doit être signée EAS (SHA-256 attendu 13c3be90…). Un APK debug est refusé par le script de build.'
);

// ===================== 12 =====================
h2('12. Inventaire API, données & runbook ops');
h3('12.1 Endpoints utiles (échantillon)');
table(
  ['Méthode', 'Route', 'Rôle'],
  [
    ['GET', '/health', 'Liveness + version (JSON si Accept)'],
    ['GET', '/api/version', 'OTA : version, forceUpdate, apkUrl, notes'],
    ['POST', '/api/auth/register|login', 'Inscription invite + login JWT'],
    ['GET', '/api/auth/verify-email', 'Page confirm (anti pré-scan)'],
    ['POST', '/api/auth/qr/start|approve', 'Challenge QR + approbation app'],
    ['GET', '/api/auth/qr/poll', 'Statut challenge (pending/approved…)'],
    ['GET/PUT', '/api/sync', 'Blob sync cloud (PreferNewer)'],
    ['POST', '/api/ci/releases', 'Upload APK + forceUpdate flag'],
    ['GET', '/api/download/:file', 'Téléchargement APK / assets'],
    ['GET', '/api/admin/overview', 'Users, pending, liens download'],
  ],
  [0.7, 1.4, 2.1]
);
h3('12.2 Modèle données sync (blob JSON)');
bullets([
  'vehicles[] — id, name, tankCapacity, consumption, odometer, color…',
  'fillUps[] — id, vehicleId, date, liters, pricePerLiter, station, fuelLevel…',
  'budgets[] — id, amount, period, vehicleId (null = global), active',
  'trips[] — points GPS, distances, durée, mode nav, start/end labels',
  'places[] / regularRoutes[] — domicile, travail, favoris, trajets flex',
  'maintenance[] — CT / contre-visite / échéances',
  'settings — devise, préférences Maps, jauge, thème…',
]);
h3('12.3 Runbook déploiement (prod)');
bullets([
  '1. Commit + push branche prod (origin)',
  '2. scripts/build-release-apk.sh → APK signé EAS (refuse debug)',
  '3. POST /api/ci/releases avec forceUpdate=1 + notes',
  '4. SSH pavel-server → cd /home/pavel/apps/gasoil-tracking',
  '5. git pull && docker compose build api web && docker compose up -d api web',
  '6. Vérifier GET /api/version + /health ; smoke Nothing (force-update)',
  'Piège : recreate Portainer seul ≠ rebuild image → routes manquantes (ex. QR)',
]);
h3('12.4 Matrice devices');
table(
  ['Device', 'Rôle', 'Politique'],
  [
    ['Nothing Phone', 'Cible principale install + smoke Maps/QR/OTA', 'Installer (utilisateur OK)'],
    ['Blackview', 'GPS / Maps / FGS / navigation intent', 'Installer si dispo adb'],
    ['Xiaomi', 'Hors périmètre', 'Ne jamais installer'],
  ],
  [1.1, 2.2, 1.3]
);
h3('12.5 Correctifs données Pavel (détail chiffré)');
para(
  'Avant correction, le plein Touran du 12/08 était rattaché au 806, ce qui gonflait la dépense août 806 (~258 €). Après réparation locale + cloud :'
);
table(
  ['Date', 'Véhicule correct', 'Note'],
  [
    ['02/09', '806', 'OK — inchangé'],
    ['25/08', '806', 'OK — inchangé'],
    ['18/08', '806', 'OK — inchangé'],
    ['12/08', 'Touran', 'Était sur 806 → réaffecté'],
    ['20/08', '206', 'OK — inchangé'],
  ],
  [0.9, 1.1, 2.2]
);
bullets([
  'Août après correction : 806 ~182,40 € · Touran ~76,39 € · 206 (plein 20/08) séparément',
  'Budget actif unique : « Carburant total » = 250 € / mois (tous véhicules)',
  'Budgets par véhicule désactivés pour éviter double comptage dans l’UI',
]);
h3('12.6 Ce que le PDF v1 faisait mal (et pourquoi v2)');
bullets([
  'Pieds de page écrits dans la marge basse → PDFKit créait des pages ne contenant que « n/N »',
  'Résultat : ~16 pages dont ~7 blanches / quasi vides ; contenu utile ~5–9 pages',
  'Tables avec lineBreak:false sur cellules longues → débordement à droite hors A4',
  'v2 : wrap des cellules, footer hors marge (margins.bottom=0 temporaire), contenu densifié',
]);

// ===================== 13 =====================
h2('13. Annexe — commits & suites possibles');
note('Extrait git log prod (chronologie inverse, sélection).');
table(
  ['Hash', 'Date', 'Message'],
  [
    ['b785a18', '06/09 19:54', 'Icône pompe rouge rosé (1.4.49)'],
    ['43ee587', '06/09 19:16', 'Polish a11y / sync / API (1.4.48)'],
    ['102043f', '06/09 19:07', 'Pleins Touran/806 + budget 250 € (1.4.47)'],
    ['2113ceb', '06/09 18:25', 'Dates relatives, a11y (1.4.46)'],
    ['064ffe2', '06/09 18:04', 'QR login web (1.4.45)'],
    ['6232cb5', '06/09 16:24', 'Itinéraires génériques (1.4.42)'],
    ['d017dad', '06/09 15:58', 'Jauge compacte (1.4.41)'],
    ['dbc13fe', '06/09 15:43', 'Jauge glissable (1.4.40)'],
    ['342f583', '06/09 15:35', 'Bilan du jour (1.4.39)'],
    ['9c71a29', '06/09 13:37', 'Fix Maps + suggestions (1.4.37)'],
    ['b660654', '06/09 12:51', 'Maps nav + récap (1.4.36)'],
    ['76dfd39', '06/09 09:44', 'Mini-cartes (1.4.31)'],
    ['bcf30de', '05/09 23:25', 'EAS + Leaflet (1.4.28)'],
    ['e07b684', '05/09 14:14', 'Conso réaliste (1.4.24)'],
    ['…', '04/09', 'GPS, FGS, CT, Takeout, polish (1.4.13–23)'],
    ['…', '02–03/09', 'Auth, sync, Portainer, OTA, trajets, budget'],
  ],
  [0.9, 0.9, 2.4]
);
h3('Détails techniques QR login (1.4.45)');
bullets([
  'POST /api/auth/qr/start → challengeId + qrDataUrl (TTL ~2 min) + deep link gasoiltracking://qr-login',
  'GET /api/auth/qr/poll?challengeId=… → pending | approved | expired | consumed',
  'POST /api/auth/qr/approve (Bearer) → lie le user_id au challenge',
  'Table SQLite qr_login_challenges (hash challenge, statut, timestamps)',
  'Web : QrWebLoginPanel sur app/auth.tsx · Mobile : app/qr-login.tsx (expo-camera)',
  'Entrée UI : Mon compte → « Scanner le QR du site »',
  'Piège ops : recreate Portainer sans rebuild → API sans routes QR ; fix = docker compose build api web',
]);
h3('Détails réparation données (1.4.47)');
bullets([
  'Fichier lib/repairFillUpVehicles.ts — mapping par date YYYY-MM-DD (pas seulement par id)',
  'Appelé une fois au boot via AppContext (ref fillBudgetRepaired)',
  'updateFillUp accepte vehicleId (SQLite + AsyncStorage web)',
  'deactivateVehicleScopedBudgets() désactive les budgets vehicle_id IS NOT NULL',
  'ensureDefaultBudgets : uniquement enveloppe globale 250 € « Carburant total »',
  'Sync cloud Pavel mis à jour directement en base API (sync_data) puis réparation locale',
]);
h3('Détails icône (1.4.49)');
bullets([
  'assets/icon.png + splash-icon.png : pompe #e94560 sur fond #1a1a2e (1024²)',
  'assets/adaptive-icon.png : pompe seule (alpha) pour adaptive Android',
  'Mipmaps mdpi→xxxhdpi : ic_launcher, round, foreground (webp)',
  'Splash logos drawable-* mis à jour · iconBackground / splashscreen_background = #1a1a2e',
]);
h3('Pistes suivantes / backlog terrain (état 1.4.60)');
para(
  'Etat au soir du 7 septembre 2026 (v1.4.60) : une grande partie du backlog terrain est livrée en v1. Ce qui reste est surtout OCR texte auto et raffinements conso.'
);
h3('A) Consommation carburant plus réaliste');
bullets([
  'FAIT (1.4.59) : accélération / freinage (accelAggressionFactor), stop-and-go, calibration après pleins (learnFactor)',
  'DEJA : dénivelé (ascent), idle/bouchons, âge véhicule, nb rapports, vitesse moyenne',
  'A FAIRE : température / clim, charge (passagers / coffre), type de route plus fin, boîte auto vs manuelle + régime',
]);
h3('B) Entretien régulier');
bullets([
  'FAIT (1.4.59) : Oui / Non / N/R « entretien à jour » + checklist cochable par véhicule',
  'DEJA : rappels CT / entretien (dates, urgences, écran vehicle/maintenance)',
  'A FAIRE : rappels kilométriques + calendaires plus configurables',
]);
h3('C) Contrôle technique en photo');
bullets([
  'FAIT (1.4.59) : photo CT attachée au véhicule (expo-image-picker)',
  'A FAIRE : OCR texte auto (date, résultat, prochain CT, km, observations) → préremplir',
  'A FAIRE : alerte si prochain CT approche (déjà partiel via rappels manuels)',
]);
h3('D) Carte grise / infos véhicule');
bullets([
  'FAIT (1.4.59) : photo carte grise + champ immatriculation saisie manuelle',
  'A FAIRE : OCR carte grise (immat, marque, modèle, année…) → préremplir fiche',
]);
h3('E) Labo / sim / multi-apps (livré 1.4.58–60)');
bullets([
  'FAIT : flavors prod/preprod/qa/admin/dev (packages + sessions séparées)',
  'FAIT : sim commute A/R + feux + finalisation anti-zombie (Samsung Freecess)',
  'FAIT : pipeline PDF mail avec gate overflow PASS obligatoire',
]);
bullets([
  'Export CSV / PDF mensuel des dépenses carburant',
  'Rollover automatique des périodes de budget mois par mois',
  'Widget Android niveau réservoir / reste budget',
  'Stats comparatives mois N vs N-1 plus poussées',
  'Notifications push pleins / CT / budget seuil',
  'Mode hors-ligne renforcé (file d’attente sync + conflits)',
]);
callout(
  'Document v7 - rapport complet à jour 1.4.60 + PDF sans débordement',
  'Contenu densifié type 6 sept. 20:05 + vague 1.4.50-60 (multi-apps, backlog partiel livré, sim commute).\nPDF : helpers marges forcées + test auto 0 encre marge droite.\nGénéré le 7 septembre 2026 soir - paveldelhomme@gmail.com',
  ACCENT
);

// Footers: must NOT trigger new pages (PDFKit paginates if y is in bottom margin)
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(range.start + i);
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      `Gasoil Tracking — Rapport complet 1–7 sept. 2026 (v7 · 1.4.60 · marges OK) — ${i + 1}/${range.count}`,
      LEFT(),
      doc.page.height - 28,
      { width: WIDTH(), align: 'center', lineBreak: false, height: 12 }
    );
  doc.page.margins.bottom = bottom;
}

doc.end();
stream.on('finish', () => {
  const st = fs.statSync(out);
  console.log(JSON.stringify({ ok: true, out, kb: Math.round(st.size / 1024), pages: range.count }));
});
stream.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
