/**
 * Met à jour le compteur 206 → 121920 km + rejoue la jauge depuis le dernier plein.
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
const TARGET_ODO = 121920;

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  const j = await r.json();
  return j.token || j.accessToken;
}

function almostEq(a, b, eps = 0.15) {
  return Math.abs(a - b) <= eps;
}

function recomputeFuel(vehicle, fills, trips) {
  const vf = fills
    .filter((f) => f.vehicleId === vehicle.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const last = vf[0];
  if (!last) return vehicle.estimatedFuelLiters;
  const since = trips.filter(
    (t) =>
      t.vehicleId === vehicle.id &&
      !t.isActive &&
      t.status !== 'rejected' &&
      String(t.startTime) > String(last.date)
  );
  const atFill = last.isFull
    ? vehicle.tankCapacity
    : Math.min(vehicle.tankCapacity, Math.max(0, last.liters));
  let burned = 0;
  for (const t of since) {
    if ((t.estimatedFuelUsed || 0) > 0) burned += t.estimatedFuelUsed;
    else if ((t.distanceKm || 0) > 0 && vehicle.consumptionPer100 > 0) {
      burned += (t.distanceKm * vehicle.consumptionPer100) / 100;
    }
  }
  return Math.max(0, Math.round((atFill - burned) * 10) / 10);
}

async function main() {
  if (!email || !password) throw new Error('PERSONAL_MAIL / password manquants');
  const token = await login();
  const get = await fetch(`${API}/sync`, { headers: { Authorization: `Bearer ${token}` } });
  if (!get.ok) throw new Error(`sync get ${get.status}`);
  const body = await get.json();
  const data = body.data || body;
  const vehicles = data.vehicles || [];
  const v206 = vehicles.find(
    (v) => /206/.test(v.name || '') || /206/.test(v.model || '') || /206/.test(v.brand || '')
  );
  if (!v206) throw new Error('206 introuvable');

  const before = {
    odo: v206.currentOdometer,
    fuel: v206.estimatedFuelLiters,
  };
  v206.currentOdometer = TARGET_ODO;
  if (v206.hasOdometer === false) v206.hasOdometer = true;

  const nextFuel = recomputeFuel(v206, data.fillUps || data.fill || [], data.trips || []);
  if (nextFuel != null) v206.estimatedFuelLiters = nextFuel;

  data.exportedAt = new Date().toISOString();
  const put = await fetch(`${API}/sync`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  if (!put.ok) {
    const t = await put.text();
    throw new Error(`sync put ${put.status} ${t.slice(0, 200)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        vehicleId: v206.id,
        name: v206.name,
        odometer: { before: before.odo, after: TARGET_ODO },
        fuel: { before: before.fuel, after: v206.estimatedFuelLiters },
        sameFuel: almostEq(before.fuel ?? -1, v206.estimatedFuelLiters ?? -2),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
