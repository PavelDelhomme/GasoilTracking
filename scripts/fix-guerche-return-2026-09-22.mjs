/**
 * Reconstruit le retour La Guerche → Thorigné du 22/09 (trajet 156 zombie 0 km)
 * et aligne la conso Peugeot 806 à 8,06 L/100. GET → patch → PUT. Pas de down -v.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const v = m[2].replace(/^["']|["']$/g, '');
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

const API = process.env.API_URL || 'https://gasoil-tracking.delhomme.ovh/api';
const email = process.env.PERSONAL_MAIL;
const password = process.env.PERSONAL_PASSWORD || process.env.HUBERA_OWNER_PASSWORD;
const CONSO = 8.06;
const DIESEL = 2.385;
const HOME = { lat: 48.1571969, lng: -1.586983 };
const WORK = { lat: 47.9483893, lng: -1.2237387 };

function fuelL(km) {
  return Math.round((km * CONSO) / 10) / 10;
}
function cost(l) {
  return Math.round(l * DIESEL * 100) / 100;
}

async function osrm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const r = await fetch(url);
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) return null;
  return {
    distanceKm: Math.round((route.distance / 1000) * 1000) / 1000,
    durationSec: route.duration,
    coords: route.geometry.coordinates.map(([lng, lat]) => ({
      latitude: Math.round(lat * 1e6) / 1e6,
      longitude: Math.round(lng * 1e6) / 1e6,
    })),
  };
}

function downsample(pts, max = 90) {
  if (pts.length <= max) return pts;
  const out = [];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

function stamp(coords, t0, t1) {
  const n = Math.max(coords.length - 1, 1);
  return coords.map((c, i) => ({
    ...c,
    timestamp: Math.round(t0 + ((t1 - t0) * i) / n),
  }));
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
const token = login.token;
if (!token) {
  console.error('login fail');
  process.exit(1);
}

const sync = await fetch(`${API}/sync`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
const data = sync.data;
if (!data?.trips) {
  console.error('no sync data');
  process.exit(1);
}

const v806 = data.vehicles.find((v) => Number(v.id) === 1);
const aller = data.trips.find((t) => Number(t.id) === 155);
const retour = data.trips.find((t) => Number(t.id) === 156);
if (!v806 || !aller || !retour) {
  console.error('missing 806 or trips 155/156');
  process.exit(1);
}

const route = await osrm(WORK, HOME);
if (!route) {
  console.error('OSRM fail');
  process.exit(1);
}

const t0 = Date.parse(retour.startTime);
const t1 = Date.parse(retour.endTime) > t0 ? Date.parse(retour.endTime) : t0 + Math.round(route.durationSec * 1000);
const km = route.distanceKm;
const litres = fuelL(km);
const pts = downsample(stamp(route.coords, t0, t1));

const oldAllerFuel = Number(aller.estimatedFuelUsed) || 0;
const oldRetourFuel = Number(retour.estimatedFuelUsed) || 0;
aller.estimatedFuelUsed = fuelL(Number(aller.distanceKm) || 0);
aller.estimatedCost = cost(aller.estimatedFuelUsed);
aller.status = 'confirmed';

Object.assign(retour, {
  vehicleId: 1,
  distanceKm: km,
  estimatedFuelUsed: litres,
  estimatedCost: cost(litres),
  routePoints: JSON.stringify(pts),
  originName: 'Intermarché La Guerche',
  destinationName: 'Rue Maurice Ravel, Thorigné-Fouillard',
  isActive: false,
  isPaused: false,
  status: 'confirmed',
  source: 'maps_import',
  note:
    'Retour travail 22/09 reconstruit (GPS zombie 0 km) · OSRM + horodatage session · conso 8,06 L/100 806',
});

const prevConso = v806.consumptionPer100;
v806.consumptionPer100 = CONSO;
v806.consumptionLearnFactor = 1;
v806.consumptionAutoAdapt = false;
const deltaBurn = aller.estimatedFuelUsed + litres - oldAllerFuel - oldRetourFuel;
if (typeof v806.estimatedFuelLiters === 'number') {
  v806.estimatedFuelLiters = Math.max(0, Math.round((v806.estimatedFuelLiters - deltaBurn) * 10) / 10);
}

data.exportedAt = new Date().toISOString();
data.appVersion = data.appVersion || '1.4.145';

const put = await fetch(`${API}/sync`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ data }),
}).then((r) => r.json());

console.log(
  JSON.stringify({
    ok: Boolean(put?.ok || put?.data || put?.updatedAt),
    prevConso,
    newConso: CONSO,
    allerKm: aller.distanceKm,
    allerFuel: aller.estimatedFuelUsed,
    retourKm: km,
    retourFuel: litres,
    tank: v806.estimatedFuelLiters,
    updatedAt: put?.updatedAt || put?.data?.exportedAt,
  }),
);
