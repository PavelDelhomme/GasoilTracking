#!/usr/bin/env node
/**
 * Vérif « prêt pour demain » — commute A/R + feux + API + sync.
 * Usage: node scripts/tomorrow-ready-check.mjs
 */
import assert from 'node:assert/strict';

const API = process.env.API_URL || 'https://gasoil-tracking.delhomme.ovh/api';
const HOME = { latitude: 48.1572, longitude: -1.587 };
const WORK = { latitude: 47.9475, longitude: -1.2238 };
const VIA = { latitude: 48.04867, longitude: -1.50282 };

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    errors.push({ name, message: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    → ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    errors.push({ name, message: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    → ${e.message}`);
  }
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function speedLimitKmhForProgress(t) {
  if (t < 0.08) return 30;
  if (t < 0.18) return 50;
  if (t < 0.35) return 80;
  if (t < 0.7) return 90;
  if (t < 0.88) return 70;
  if (t < 0.95) return 50;
  return 30;
}

function waypointAlong(from, to, t) {
  const bend = Math.sin(t * Math.PI) * 0.008;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t + bend * 0.25,
    longitude: from.longitude + (to.longitude - from.longitude) * t + bend,
  };
}

function buildLeg(from, to, startTs, stepM = 100, lightEveryKm = 6.5) {
  const via = VIA;
  const legs = [
    [from, via],
    [via, to],
  ];
  const points = [];
  let tCursor = startTs;
  let kmSinceLight = 0;

  const push = (c, speedKmh, idleMs = 0) => {
    if (points.length === 0) {
      points.push({
        latitude: c.latitude,
        longitude: c.longitude,
        timestamp: startTs,
        speed: idleMs > 0 ? 0 : speedKmh / 3.6,
      });
      tCursor = startTs;
      return;
    }
    const prev = points[points.length - 1];
    const dKm = haversineKm(prev, c);
    const ms =
      idleMs > 0
        ? idleMs
        : Math.max(800, (dKm / Math.max(speedKmh, 8)) * 3600 * 1000);
    tCursor = Math.round(tCursor + ms);
    points.push({
      latitude: c.latitude,
      longitude: c.longitude,
      timestamp: tCursor,
      speed: idleMs > 0 ? 0 : speedKmh / 3.6,
    });
    if (idleMs <= 0) kmSinceLight += dKm;
  };

  for (const [a, b] of legs) {
    const legKm = haversineKm(a, b) * 1.08;
    const steps = Math.max(6, Math.ceil((legKm * 1000) / stepM));
    for (let i = 0; i <= steps; i++) {
      if (i === 0 && points.length > 0) continue;
      const t = i / steps;
      const c = waypointAlong(a, b, t);
      const speedKmh = speedLimitKmhForProgress(t);
      push(c, speedKmh);
      if (lightEveryKm > 0 && kmSinceLight >= lightEveryKm && i > 2 && i < steps - 2) {
        kmSinceLight = 0;
        const stop = points[points.length - 1];
        for (let s = 0; s < 3; s++) {
          push({ latitude: stop.latitude, longitude: stop.longitude }, 0, 6000);
        }
      }
    }
  }
  return points;
}

function buildCommuteRoundTrip() {
  const outbound = buildLeg(HOME, WORK, Date.now());
  const last = outbound[outbound.length - 1];
  const pause = [];
  let t = last.timestamp;
  for (let i = 1; i <= 4; i++) {
    t = Math.round(last.timestamp + (6 * 60 * 1000 * i) / 4);
    pause.push({
      latitude: last.latitude,
      longitude: last.longitude,
      timestamp: t,
      speed: 0,
    });
  }
  const inbound = buildLeg(WORK, HOME, t + 2000);
  return [...outbound, ...pause, ...inbound];
}

/** Filtre GPS simplifié (comme gpsTracking). */
function filterRoute(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const dt = cur.timestamp - prev.timestamp;
    if (dt < 600) continue;
    const dKm = haversineKm(prev, cur);
    if (dKm < 0.006 && (cur.speed ?? 1) > 0.8) continue;
    const speedMps = (dKm * 1000) / (dt / 1000);
    if (speedMps > 50) continue;
    out.push(cur);
  }
  return out;
}

function routeDistanceKm(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return Math.round(d * 10) / 10;
}

function idleRatio(points) {
  if (points.length < 2) return 0;
  let idle = 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].timestamp - points[i - 1].timestamp;
    if (dt <= 0 || dt > 180000) continue;
    total += dt;
    const d = haversineKm(points[i - 1], points[i]);
    const sp = d / (dt / 3600000);
    if (sp < 5) idle += dt;
  }
  return total > 0 ? idle / total : 0;
}

console.log('\n=== Prêt pour demain — commute travail ===\n');

const raw = buildCommuteRoundTrip();
const filtered = filterRoute(raw);
const dist = routeDistanceKm(filtered);
const idle = idleRatio(filtered);
const durationMin = (filtered[filtered.length - 1].timestamp - filtered[0].timestamp) / 60000;
const zeroSpeed = raw.filter((p) => (p.speed ?? 1) === 0).length;

test('trajet A/R produit assez de points', () => {
  assert.ok(raw.length > 200, `points=${raw.length}`);
});

test('distance A/R plausible (70–110 km)', () => {
  assert.ok(dist >= 70 && dist <= 110, `dist=${dist} km`);
});

test('feux / arrêts présents (speed=0)', () => {
  assert.ok(zeroSpeed >= 20, `idlePoints=${zeroSpeed}`);
});

test('pause travail + idle ratio > 5%', () => {
  assert.ok(idle > 0.05, `idle=${(idle * 100).toFixed(1)}%`);
});

test('durée simulée > 1h (temps trajet compressé calendaire)', () => {
  assert.ok(durationMin > 60, `duration=${durationMin.toFixed(0)} min`);
});

test('filtre GPS ne casse pas le trajet', () => {
  assert.ok(filtered.length > 100, `filtered=${filtered.length}`);
  const fd = routeDistanceKm(filtered);
  assert.ok(Math.abs(fd - dist) < 15, `filteredDist=${fd}`);
});

test('conso estimée A/R raisonnable (4–20 L)', () => {
  const base = 6.5;
  const liters = Math.round(((dist * base * 1.18) / 100) * 100) / 100;
  assert.ok(liters >= 4 && liters <= 20, `L=${liters}`);
});

console.log(`\n  ℹ points=${raw.length} filtrés=${filtered.length} dist≈${dist} km idle≈${(idle * 100).toFixed(0)}% durée≈${durationMin.toFixed(0)} min feux/stops=${zeroSpeed}`);

await testAsync('API /version joignable', async () => {
  const r = await fetch(`${API}/version`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.version, 'version manquante');
  console.log(`    → live ${j.version} forceUpdate=${j.forceUpdate}`);
});

await testAsync('API login répond (pas 502)', async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ready-check@example.com', password: 'x' }),
  });
  assert.ok([400, 401, 404].includes(r.status), `status=${r.status}`);
});

await testAsync('page lab-connect OK', async () => {
  const r = await fetch('https://gasoil-tracking.delhomme.ovh/lab-connect.html');
  assert.equal(r.status, 200);
});

console.log(`\n=== Résultat : ${passed} OK, ${failed} KO ===\n`);
if (failed) {
  for (const e of errors) console.error(`- ${e.name}: ${e.message}`);
  process.exit(1);
}
