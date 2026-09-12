#!/usr/bin/env node
/**
 * Écrit le plein 206 Intermarché (et l’aller du jour s’il manque) dans le
 * blob sync cloud du compte perso — via les routes déjà live :
 *   POST /api/auth/login  →  GET/PUT /api/sync
 *
 * Fallback : POST /api/ci/personal-fillup si l’API a été reconstruite.
 *
 * Env : API_URL, PERSONAL_MAIL, PERSONAL_PASSWORD, RELEASE_UPLOAD_TOKEN (opt)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPersonalFillUp, fetchCommuteRoute } from '../../api/src/personalCommute.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = (process.env.API_URL || 'https://gasoil-tracking.delhomme.ovh').replace(/\/$/, '');
const email = String(process.env.PERSONAL_MAIL || 'paveldelhomme@gmail.com')
  .toLowerCase()
  .trim();
const password = String(process.env.PERSONAL_PASSWORD || '');
const releaseToken = String(process.env.RELEASE_UPLOAD_TOKEN || '');
const specPath = path.join(__dirname, 'personal-fillup-once.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

function summarize(result, extra = {}) {
  const { snapshot: _omit, ...rest } = result || {};
  return { ...rest, ...extra };
}

async function http(method, url, { token, release, body } = {}) {
  const headers = { Accept: 'application/json', 'User-Agent': 'GasoilTracking-CI-fillup' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (release) headers['X-Release-Token'] = release;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function tryCiEndpoint() {
  if (!releaseToken) return null;
  const r = await http('POST', `${API}/api/ci/personal-fillup`, {
    release: releaseToken,
    body: spec,
  });
  if (r.status === 200 && r.json?.ok) {
    console.log('OK via /api/ci/personal-fillup', summarize(r.json));
    return true;
  }
  console.log(`CI endpoint HTTP ${r.status} — fallback login+sync`, r.json?.error || r.json?.raw || '');
  return false;
}

async function commuteRoute() {
  try {
    return await fetchCommuteRoute();
  } catch (e) {
    console.warn('OSRM indispo, trajet fallback 44,7 km', e?.message || e);
    return { distanceKm: 44.7, durationMinutes: 53, coordinates: [] };
  }
}

async function applyViaSync() {
  if (!password) {
    throw new Error(
      'PERSONAL_PASSWORD manquant (secret GitHub Actions) — impossible d’écrire le sync cloud'
    );
  }
  const login = await http('POST', `${API}/api/auth/login`, {
    body: { email, password },
  });
  if (login.status !== 200 || !login.json?.token) {
    throw new Error(`login HTTP ${login.status} ${login.json?.error || JSON.stringify(login.json)}`);
  }
  const token = login.json.token;

  const got = await http('GET', `${API}/api/sync`, { token });
  if (got.status !== 200) {
    throw new Error(`GET /api/sync HTTP ${got.status} ${got.json?.error || ''}`);
  }
  const snapshot = got.json?.data && typeof got.json.data === 'object' ? got.json.data : {};
  const vehicles = Array.isArray(snapshot.vehicles) ? snapshot.vehicles.length : 0;
  const fillUps = Array.isArray(snapshot.fillUps) ? snapshot.fillUps.length : 0;
  const trips = Array.isArray(snapshot.trips) ? snapshot.trips.length : 0;
  console.log(`sync avant : véhicules=${vehicles} pleins=${fillUps} trajets=${trips}`);

  const route = await commuteRoute();
  const result = applyPersonalFillUp(snapshot, route, spec);
  if (!result.ok) {
    throw new Error(`applyPersonalFillUp: ${result.reason || 'ko'}`);
  }

  const put = await http('PUT', `${API}/api/sync`, {
    token,
    body: { data: result.snapshot },
  });
  if (put.status !== 200 || !put.json?.ok) {
    throw new Error(`PUT /api/sync HTTP ${put.status} ${put.json?.error || JSON.stringify(put.json)}`);
  }

  const verify = await http('GET', `${API}/api/sync`, { token });
  const after = verify.json?.data || {};
  const v206 = (after.vehicles || []).find(
    (v) => /206/.test(`${v?.name || ''} ${v?.brand || ''} ${v?.model || ''}`)
  );
  const fills206 = (after.fillUps || []).filter((f) => Number(f.vehicleId) === Number(v206?.id));
  const match = fills206.find(
    (f) =>
      String(f.date || '').slice(0, 10) === (spec.day || '2026-09-12') &&
      Math.abs(Number(f.liters) - Number(spec.fillUp.liters)) < 0.05 &&
      Math.abs(Number(f.totalCost) - Number(spec.fillUp.totalCost)) < 0.05
  );
  if (!match) {
    throw new Error('Vérif GET : plein 34,62 L / 75,09 € introuvable après écriture');
  }

  console.log(
    'OK via login+sync',
    summarize(result, {
      updatedAt: put.json.updatedAt,
      verifiedFillUpId: match.id,
      verifiedFuelL: v206?.estimatedFuelLiters,
      verifiedOdo: v206?.currentOdometer,
      verifiedPrice: v206?.defaultFuelPrice,
    })
  );
}

const ciOk = await tryCiEndpoint();
if (ciOk === true) {
  process.exit(0);
}

try {
  await applyViaSync();
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
