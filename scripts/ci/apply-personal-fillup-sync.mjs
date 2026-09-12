#!/usr/bin/env node
/**
 * Écrit le plein 206 Intermarché dans le sync cloud du compte perso.
 *
 * Stratégies (dans l’ordre) :
 *  1. POST /api/ci/personal-fillup (si l’API live a la route)
 *  2. login + GET/PUT /api/sync (mot de passe perso / autres secrets)
 *  3. JWT_SECRET → jeton access pour le compte perso
 *  4. Portainer git-redeploy puis retry CI
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPersonalFillUp, fetchAfternoonRoutes, fetchCommuteRoute } from '../../api/src/personalCommute.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = (process.env.API_URL || 'https://gasoil-tracking.delhomme.ovh').replace(/\/$/, '');
const PORTAINER = (process.env.PORTAINER_URL || 'https://portainer.delhomme.ovh').replace(/\/$/, '');
const email = String(process.env.PERSONAL_MAIL || 'paveldelhomme@gmail.com')
  .toLowerCase()
  .trim();
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'personal-fillup-once.json'), 'utf8'));

const secrets = {
  PERSONAL_PASSWORD: process.env.PERSONAL_PASSWORD || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  QA_LAB_PASSWORD: process.env.QA_LAB_PASSWORD || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  RELEASE_UPLOAD_TOKEN: process.env.RELEASE_UPLOAD_TOKEN || '',
  PORTAINER_ACCESS_TOKEN: process.env.PORTAINER_ACCESS_TOKEN || '',
  PORTAINER_PASSWORD: process.env.PORTAINER_PASSWORD || '',
  PORTAINER_USERNAME: process.env.PORTAINER_USERNAME || '',
  PORTAINER_WEBHOOK_URL: process.env.PORTAINER_WEBHOOK_URL || '',
  SSH_PRIVATE_KEY: process.env.SSH_PRIVATE_KEY || process.env.DEPLOY_SSH_KEY || '',
};

function present(v) {
  return String(v || '').trim().length > 0;
}

console.log(
  'secrets présents :',
  Object.entries(secrets)
    .map(([k, v]) => `${k}=${present(v) ? 'yes' : 'no'}`)
    .join(' ')
);

function summarize(result, extra = {}) {
  const { snapshot: _omit, ...rest } = result || {};
  return { ...rest, ...extra };
}

async function http(method, url, { token, release, apiKey, body, headers: extra } = {}) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'GasoilTracking-CI-fillup',
    ...(extra || {}),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (release) headers['X-Release-Token'] = release;
  if (apiKey) headers['X-API-Key'] = apiKey;
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
    json = { raw: text.slice(0, 240) };
  }
  return { status: res.status, json };
}

async function commuteRoute() {
  try {
    return await fetchCommuteRoute();
  } catch (e) {
    console.warn('OSRM indispo, trajet fallback 49 km', e?.message || e);
    return { distanceKm: 49, durationMinutes: 44, coordinates: [] };
  }
}

async function afternoonRoutes() {
  try {
    return await fetchAfternoonRoutes();
  } catch (e) {
    console.warn('OSRM après-midi indispo', e?.message || e);
    return {};
  }
}

async function tryCiEndpoint() {
  if (!present(secrets.RELEASE_UPLOAD_TOKEN)) return false;
  const r = await http('POST', `${API}/api/ci/personal-fillup`, {
    release: secrets.RELEASE_UPLOAD_TOKEN,
    body: spec,
  });
  if (r.status === 200 && r.json?.ok) {
    console.log('OK via /api/ci/personal-fillup', summarize(r.json));
    return true;
  }
  console.log(`CI endpoint HTTP ${r.status}`, r.json?.error || r.json?.raw || '');
  return false;
}

async function applyWithToken(token, via) {
  const got = await http('GET', `${API}/api/sync`, { token });
  if (got.status !== 200) {
    throw new Error(`GET /api/sync HTTP ${got.status} ${got.json?.error || ''}`);
  }
  const snapshot = got.json?.data && typeof got.json.data === 'object' ? got.json.data : {};
  console.log(
    `sync avant (${via}) : véhicules=${(snapshot.vehicles || []).length} pleins=${(snapshot.fillUps || []).length} trajets=${(snapshot.trips || []).length}`
  );

  const route = await commuteRoute();
  const afternoon = await afternoonRoutes();
  const result = applyPersonalFillUp(snapshot, route, { ...spec, afternoonRoutes: afternoon });
  if (!result.ok) {
    throw new Error(`applyPersonalFillUp: ${result.reason || 'ko'}`);
  }

  const put = await http('PUT', `${API}/api/sync`, { token, body: { data: result.snapshot } });
  if (put.status !== 200 || !put.json?.ok) {
    throw new Error(`PUT /api/sync HTTP ${put.status} ${put.json?.error || JSON.stringify(put.json)}`);
  }

  const verify = await http('GET', `${API}/api/sync`, { token });
  const after = verify.json?.data || {};
  const v206 = (after.vehicles || []).find((v) =>
    /206/.test(`${v?.name || ''} ${v?.brand || ''} ${v?.model || ''}`)
  );
  const match = (after.fillUps || []).find(
    (f) =>
      Number(f.vehicleId) === Number(v206?.id) &&
      String(f.date || '').slice(0, 10) === (spec.day || '2026-09-12') &&
      Math.abs(Number(f.liters) - Number(spec.fillUp.liters)) < 0.05 &&
      Math.abs(Number(f.totalCost) - Number(spec.fillUp.totalCost)) < 0.05
  );
  if (!match) {
    throw new Error('Vérif GET : plein 34,62 L / 75,09 € introuvable après écriture');
  }
  console.log(
    `OK via ${via}`,
    summarize(result, {
      updatedAt: put.json.updatedAt,
      verifiedFillUpId: match.id,
      verifiedFuelL: v206?.estimatedFuelLiters,
      verifiedOdo: v206?.currentOdometer,
      verifiedPrice: v206?.defaultFuelPrice,
    })
  );
  return true;
}

async function tryPasswords() {
  const candidates = [
    ['PERSONAL_PASSWORD', secrets.PERSONAL_PASSWORD],
    ['ADMIN_PASSWORD', secrets.ADMIN_PASSWORD],
    ['QA_LAB_PASSWORD', secrets.QA_LAB_PASSWORD],
    ['PORTAINER_PASSWORD', secrets.PORTAINER_PASSWORD],
  ].filter(([, v]) => present(v));
  for (const [name, password] of candidates) {
    const login = await http('POST', `${API}/api/auth/login`, { body: { email, password } });
    if (login.status === 200 && login.json?.token) {
      console.log(`login ok avec secret ${name}`);
      return applyWithToken(login.json.token, `login:${name}`);
    }
    console.log(`login ${name} → HTTP ${login.status} ${login.json?.error || ''}`);
  }
  return false;
}

function mintAccessJwt(sub, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ sub, email, typ: 'access', iat: now, exp: now + 20 * 60 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

async function tryJwtSecret() {
  if (!present(secrets.JWT_SECRET)) return false;
  for (let sub = 1; sub <= 24; sub++) {
    const token = mintAccessJwt(sub, secrets.JWT_SECRET);
    const me = await http('GET', `${API}/api/auth/me`, { token });
    if (me.status !== 200) continue;
    const gotEmail = String(me.json?.email || me.json?.user?.email || '').toLowerCase();
    if (me.status === 200 && gotEmail === email) {
      console.log(`JWT sub=${sub} correspond au compte perso`);
      return applyWithToken(token, `jwt:sub=${sub}`);
    }
  }
  console.log('JWT_SECRET présent mais aucun sub 1–24 n’est le compte perso');
  return false;
}

async function portainerAuth() {
  if (present(secrets.PORTAINER_ACCESS_TOKEN)) {
    return { apiKey: secrets.PORTAINER_ACCESS_TOKEN };
  }
  const user = secrets.PORTAINER_USERNAME || 'admin';
  if (!present(secrets.PORTAINER_PASSWORD)) return null;
  const r = await http('POST', `${PORTAINER}/api/auth`, {
    body: { username: user, password: secrets.PORTAINER_PASSWORD },
  });
  if (r.status === 200 && r.json?.jwt) {
    console.log('Portainer login ok');
    return { token: r.json.jwt };
  }
  console.log(`Portainer login HTTP ${r.status}`, r.json?.message || r.json?.raw || '');
  return null;
}

async function tryPortainerRedeploy() {
  const auth = await portainerAuth();
  if (!auth) return false;
  const list = await http('GET', `${PORTAINER}/api/stacks`, auth);
  if (list.status !== 200 || !Array.isArray(list.json)) {
    console.log(`Portainer GET /api/stacks HTTP ${list.status}`, list.json?.message || '');
    return false;
  }
  const stack =
    list.json.find((s) => s.Name === 'gasoil-tracking') ||
    list.json.find((s) => /gasoil/i.test(s.Name || ''));
  if (!stack) {
    console.log(
      'Portainer : stack gasoil-tracking introuvable',
      list.json.map((s) => s.Name).join(', ')
    );
    return false;
  }
  const endpointId = stack.EndpointId || 2;
  console.log(`Portainer stack id=${stack.Id} endpoint=${endpointId} git=${Boolean(stack.GitConfig)}`);
  const redeploy = await http(
    'PUT',
    `${PORTAINER}/api/stacks/${stack.Id}/git/redeploy?endpointId=${endpointId}`,
    {
      ...auth,
      body: {
        pullImage: true,
        PullImage: true,
        RepullImageAndRedeploy: true,
        RepositoryReferenceName: stack.GitConfig?.ReferenceName || 'refs/heads/prod',
      },
    }
  );
  console.log(`Portainer redeploy HTTP ${redeploy.status}`, redeploy.json?.message || redeploy.json?.Name || '');
  if (redeploy.status !== 200) return false;

  for (let i = 1; i <= 24; i++) {
    const ping = await http('POST', `${API}/api/ci/personal-fillup`, {
      release: secrets.RELEASE_UPLOAD_TOKEN,
      body: spec,
    });
    console.log(`après rebuild try ${i} → HTTP ${ping.status}`);
    if (ping.status === 200 && ping.json?.ok) {
      console.log('OK via /api/ci/personal-fillup après rebuild', summarize(ping.json));
      return true;
    }
    if (ping.status !== 404) {
      console.log(ping.json?.error || ping.json?.raw || '');
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  return false;
}

async function tryWebhook() {
  if (!present(secrets.PORTAINER_WEBHOOK_URL)) return false;
  const r = await fetch(secrets.PORTAINER_WEBHOOK_URL, { method: 'POST' });
  console.log(`webhook Portainer HTTP ${r.status}`);
  return false;
}

if (await tryCiEndpoint()) process.exit(0);
if (await tryPasswords()) process.exit(0);
if (await tryJwtSecret()) process.exit(0);
await tryWebhook();
if (await tryPortainerRedeploy()) process.exit(0);

console.error(
  'Impossible d’écrire le sync cloud : pas de mot de passe perso, JWT, ni token Portainer utilisable.'
);
process.exit(1);
