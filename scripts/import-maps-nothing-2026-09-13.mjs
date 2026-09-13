/**
 * Import Timeline Maps (Nothing) 12–13/09 + purge trajets 0 km + jauge 1/4.
 * Source : UI « Vos trajets » sur le téléphone (pas le PC).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const v = m[2].replace(/^["']|["']$/g, '');
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

const API = process.env.API_URL || 'https://gasoil-tracking.delhomme.ovh/api';
const email = process.env.PERSONAL_MAIL;
const password = process.env.PERSONAL_PASSWORD || process.env.NPM_PASSWORD;

function localIso(ymd, hm) {
  const [h, mi] = hm.split(':').map(Number);
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0).toISOString();
}

async function osrm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const r = await fetch(url);
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) return null;
  const coords = route.geometry.coordinates.map(([lng, lat], i) => ({
    latitude: Math.round(lat * 1e6) / 1e6,
    longitude: Math.round(lng * 1e6) / 1e6,
    timestamp: 0,
  }));
  return {
    distanceKm: Math.round((route.distance / 1000) * 1000) / 1000,
    coordinates: coords,
  };
}

function stamp(coords, startIso, endIso) {
  const t0 = Date.parse(startIso);
  const t1 = Date.parse(endIso);
  const n = Math.max(coords.length - 1, 1);
  return coords.map((c, i) => ({
    ...c,
    timestamp: Math.round(t0 + ((t1 - t0) * i) / n),
  }));
}

function downsample(pts, max = 72) {
  if (pts.length <= max) return pts;
  const out = [];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

async function buildTrip({
  id,
  vehicleId,
  originName,
  destinationName,
  ymd,
  startHm,
  endHm,
  distanceKmMaps,
  from,
  to,
  note,
}) {
  const startTime = localIso(ymd, startHm);
  const endTime = localIso(ymd, endHm);
  let route = await osrm(from, to);
  let distanceKm = distanceKmMaps;
  let pts = [];
  if (route?.coordinates?.length >= 2) {
    pts = downsample(stamp(route.coordinates, startTime, endTime));
    // garder km Maps (vérité Timeline) ; OSRM pour le tracé
  } else {
    pts = downsample(
      stamp(
        [
          { latitude: from.lat, longitude: from.lng, timestamp: 0 },
          { latitude: to.lat, longitude: to.lng, timestamp: 0 },
        ],
        startTime,
        endTime
      )
    );
  }
  const fuel = Math.round(distanceKm * 0.079 * 10) / 10; // ~7.9 L/100 approx
  return {
    id,
    vehicleId,
    startTime,
    endTime,
    distanceKm,
    estimatedFuelUsed: fuel,
    estimatedCost: Math.round(fuel * 2.169 * 100) / 100,
    routePoints: JSON.stringify(pts),
    originName,
    destinationName,
    isActive: false,
    isPaused: false,
    status: 'confirmed',
    source: 'maps_import',
    fillUpId: null,
    note,
  };
}

const P = {
  home: { lat: 47.86062, lng: -1.28092 },
  guerche: { lat: 47.94866, lng: -1.22365 },
  forges: { lat: 47.856, lng: -1.3 }, // approx aire Forges-la-Forêt RN
  beaujoire: { lat: 47.25768, lng: -1.50974 },
  parc: { lat: 47.25877, lng: -1.53402 },
  fresnel: { lat: 47.24134, lng: -1.52356 },
  croquem: { lat: 47.23963, lng: -1.53039 },
  dominos: { lat: 47.2398, lng: -1.5285 },
  treillieres: { lat: 47.333, lng: -1.62 },
};

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'GasoilTracking/1.0' } });
  const j = await r.json();
  if (!j[0]) return null;
  return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
const token = login.token || login.accessToken;
if (!token) {
  console.error('login fail', login);
  process.exit(1);
}

const sync = await fetch(`${API}/sync`, {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());
const data = sync.data;
if (!data) {
  console.error('no sync data');
  process.exit(1);
}

const gForges =
  (await geocode('Aire de repos Forges-la-Forêt RN137')) ||
  (await geocode('Forges-la-Forêt France')) ||
  P.forges;
const gTreill =
  (await geocode('Aire de Lambrecy Est Treillières TotalEnergies')) ||
  (await geocode('Treillières aire Lambrecy')) ||
  P.treillieres;
P.forges = gForges;
P.treillieres = gTreill;
console.log('geocode forges', P.forges, 'treillieres', P.treillieres);

const maxId = Math.max(0, ...data.trips.map((t) => Number(t.id) || 0));
let nextId = maxId + 1;

// Purge 0 km GPS zombies + anciennes saisie cloud 12/09 (99–101) remplacées par Maps
const purgeIds = new Set(
  data.trips
    .filter((t) => {
      const d = Number(t.distanceKm) || 0;
      const note = t.note || '';
      if (d < 0.25 && (t.source === 'gps' || /Suivi GPS libre/i.test(note))) return true;
      if ([99, 100, 101].includes(t.id)) return true;
      return false;
    })
    .map((t) => t.id)
);
console.log('purge', [...purgeIds]);

const kept = data.trips.filter((t) => !purgeIds.has(t.id));

const specs = [
  {
    originName: 'Domicile — 1 Rue Camille Saint-Saëns, Thorigné-Fouillard',
    destinationName: 'Intermarché SUPER La Guerche de Bretagne',
    ymd: '2026-09-12',
    startHm: '04:03',
    endHm: '04:43',
    distanceKmMaps: 49,
    from: P.home,
    to: P.guerche,
    note:
      'Maps Timeline Nothing — aller voie rapide · arrivée ~1/4 réservoir · puis plein Intermarché',
  },
  {
    originName: 'Intermarché SUPER La Guerche de Bretagne',
    destinationName: 'Aire de repos Forges-la-Forêt',
    ymd: '2026-09-12',
    startHm: '12:47',
    endHm: '12:58',
    distanceKmMaps: 12,
    from: P.guerche,
    to: P.forges,
    note: 'Maps Timeline Nothing — après plein · vers aire Forges-la-Forêt',
  },
  {
    originName: 'Aire de repos Forges-la-Forêt',
    destinationName: 'Carrefour Nantes La Beaujoire',
    ymd: '2026-09-12',
    startHm: '13:06',
    endHm: '14:29',
    distanceKmMaps: 82,
    from: P.forges,
    to: P.beaujoire,
    note: 'Maps Timeline Nothing — aire Forges → Beaujoire',
  },
  {
    originName: 'Parc des Expositions de Nantes',
    destinationName: "Domino's Nantes - Est (Bd Jules Verne)",
    ymd: '2026-09-12',
    startHm: '22:09',
    endHm: '22:15',
    distanceKmMaps: 2.5,
    from: P.parc,
    to: P.dominos,
    note: 'Maps Timeline Nothing — Parc expo → Domino’s',
  },
  {
    originName: "Domino's Nantes - Est",
    destinationName: '8 Rue Augustin Fresnel, Nantes',
    ymd: '2026-09-12',
    startHm: '22:28',
    endHm: '22:34',
    distanceKmMaps: 1.3,
    from: P.dominos,
    to: P.fresnel,
    note: 'Maps Timeline Nothing — Domino’s → Fresnel',
  },
  {
    originName: '8 Rue Augustin Fresnel, Nantes',
    destinationName: 'Le Croquembouche — 76 Bd Jules Verne, Nantes',
    ymd: '2026-09-13',
    startHm: '14:20',
    endHm: '14:21',
    distanceKmMaps: 0.7,
    from: P.fresnel,
    to: P.croquem,
    note: 'Maps Timeline Nothing',
  },
  {
    originName: 'Le Croquembouche — Bd Jules Verne, Nantes',
    destinationName: 'Visite (Nantes) — Maps « visite manquante »',
    ymd: '2026-09-13',
    startHm: '14:27',
    endHm: '14:35',
    distanceKmMaps: 1.6,
    from: P.croquem,
    to: { lat: 47.245, lng: -1.535 },
    note: 'Maps Timeline Nothing — destination non labellisée',
  },
  {
    originName: 'Visite (Nantes)',
    destinationName: '8 Rue Augustin Fresnel, Nantes',
    ymd: '2026-09-13',
    startHm: '16:45',
    endHm: '16:51',
    distanceKmMaps: 1.5,
    from: { lat: 47.245, lng: -1.535 },
    to: P.fresnel,
    note: 'Maps Timeline Nothing — retour Fresnel',
  },
  {
    originName: '8 Rue Augustin Fresnel, Nantes',
    destinationName: 'TotalEnergies — Aire de Lambrecy Est, Treillières',
    ymd: '2026-09-13',
    startHm: '17:37',
    endHm: '17:53',
    distanceKmMaps: 16,
    from: P.fresnel,
    to: P.treillieres,
    note: 'Maps Timeline Nothing — départ retour domicile',
  },
  {
    originName: 'TotalEnergies — Aire de Lambrecy Est, Treillières',
    destinationName: 'Domicile — 1 Rue Camille Saint-Saëns, Thorigné-Fouillard',
    ymd: '2026-09-13',
    startHm: '18:12',
    endHm: '19:20',
    distanceKmMaps: 100,
    from: P.treillieres,
    to: P.home,
    note: 'Maps Timeline Nothing — retour domicile (~100 km)',
  },
];

const created = [];
for (const s of specs) {
  const t = await buildTrip({ ...s, id: nextId++, vehicleId: 2 });
  created.push(t);
  console.log('+', t.id, t.distanceKm, 'km', t.originName.slice(0, 40), '→', t.destinationName.slice(0, 40));
  await new Promise((r) => setTimeout(r, 200));
}

data.trips = [...kept, ...created];

const v206 = data.vehicles.find((v) => v.id === 2);
if (v206) {
  // Jauge réelle : ~1/4 maintenant (signal utilisateur).
  v206.estimatedFuelLiters = 12.5;
  // Km depuis le plein (12/09 ~12:50) = trajets Maps après le plein
  const postFill = created.filter((t) => Date.parse(t.startTime) >= Date.parse('2026-09-12T10:50:00.000Z'));
  const postFillKm = Math.round(postFill.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10;
  v206.trackedKm = postFillKm;
  console.log('206 fuel→', v206.estimatedFuelLiters, 'trackedKm→', v206.trackedKm);
}

data.exportedAt = new Date().toISOString();
data.appVersion = '1.4.124';

const put = await fetch(`${API}/sync`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ data }),
}).then((r) => r.json());
console.log('put', put);
console.log('DONE trips', data.trips.length, 'created', created.length);
