#!/usr/bin/env node
/**
 * Suite de tests GasoilTracking (sans téléphone).
 * Usage: node scripts/test-suite.mjs
 * Exit 0 si tout OK.
 */
import assert from 'node:assert/strict';

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

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function vehicleAgeFactor(year, nowYear = 2026) {
  if (!year || year < 1970) return 1.08;
  const age = Math.max(0, nowYear - year);
  if (age <= 3) return 1;
  if (age <= 8) return 1 + (age - 3) * 0.012;
  if (age <= 15) return 1.06 + (age - 8) * 0.018;
  return Math.min(1.35, 1.186 + (age - 15) * 0.015);
}

function transmissionFactor(gears) {
  if (gears == null || gears <= 0) return 1;
  if (gears <= 4) return 1.06;
  if (gears === 5) return 1.02;
  return 1;
}

function elevationFactor(ascentM, distanceKm) {
  if (ascentM <= 0 || distanceKm <= 0) return 1;
  const per10km = (ascentM / Math.max(distanceKm, 1)) * 10;
  return Math.min(1.45, 1 + (per10km / 100) * 0.08);
}

function estimateTripFuelLiters(vehicle, distanceKm, ctx = {}) {
  if (distanceKm <= 0) return 0;
  const base = vehicle.consumptionPer100 > 0 ? vehicle.consumptionPer100 : 7.5;
  const age = vehicleAgeFactor(vehicle.year);
  const gear = transmissionFactor(ctx.gears ?? vehicle.transmissionGears);
  const learned =
    ctx.learnedFactor && ctx.learnedFactor > 0.5
      ? ctx.learnedFactor
      : vehicle.consumptionLearnFactor && vehicle.consumptionLearnFactor > 0.5
        ? vehicle.consumptionLearnFactor
        : 1;
  const elev = elevationFactor(ctx.ascentM ?? 0, distanceKm);
  const l100 = base * age * gear * 1.18 * learned * elev;
  return Math.round(((distanceKm * l100) / 100) * 100) / 100;
}

function movingDurationMinutes(points) {
  if (points.length < 2) return 0;
  let ms = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.timestamp - a.timestamp;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 180_000) continue;
    const dKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const speedKmh = dKm / (dt / 3600000);
    if (speedKmh < 5) continue;
    ms += dt;
  }
  return ms / 60000;
}

function averageMovingSpeedKmh(distanceKm, points) {
  const mins = movingDurationMinutes(points);
  if (mins <= 0 || distanceKm <= 0) return 0;
  return (distanceKm / mins) * 60;
}

function learnedFactorFromGauge(estimatedLitersBurned, gaugeDropLiters) {
  if (estimatedLitersBurned <= 0.2 || gaugeDropLiters <= 0) return 1;
  const raw = gaugeDropLiters / estimatedLitersBurned;
  return Math.min(1.55, Math.max(0.85, raw));
}

const MAX_ACCURACY_M = 32;
const MIN_STEP_KM = 0.006;
const MAX_SPEED_MPS = 50;
const MIN_DT_MS = 600;
const STATIONARY_SPEED_MPS = 0.8;
const STATIONARY_MAX_STEP_KM = 0.025;

function evaluateGpsSample(previous, raw, opts = {}) {
  if (!Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) {
    return { accept: false, reason: 'bad_coords' };
  }
  const acc = raw.accuracy;
  const maxAcc = opts.isFirst || !previous ? 55 : MAX_ACCURACY_M;
  if (acc != null && Number.isFinite(acc) && acc > maxAcc) {
    return { accept: false, reason: 'bad_accuracy' };
  }
  if (!previous) return { accept: true, reason: 'ok' };
  const dt = raw.timestamp - previous.timestamp;
  if (Number.isFinite(dt) && dt >= 0 && dt < MIN_DT_MS) {
    return { accept: false, reason: 'too_soon' };
  }
  const distanceKm = haversineKm(
    previous.latitude,
    previous.longitude,
    raw.latitude,
    raw.longitude
  );
  if (distanceKm < MIN_STEP_KM) return { accept: false, reason: 'too_close' };
  const deviceSpeed = raw.speed;
  if (
    deviceSpeed != null &&
    deviceSpeed >= 0 &&
    deviceSpeed < STATIONARY_SPEED_MPS &&
    distanceKm < STATIONARY_MAX_STEP_KM
  ) {
    return { accept: false, reason: 'stationary' };
  }
  if (dt > 0) {
    const speedMps = (distanceKm * 1000) / (dt / 1000);
    if (speedMps > MAX_SPEED_MPS) return { accept: false, reason: 'too_fast' };
  }
  return { accept: true, reason: 'ok', distanceKm };
}

function buildDrivingPoints(from, via, to, speedKmh = 72, stepM = 90) {
  const legs = [
    [from, via],
    [via, to],
  ];
  const start = Date.now();
  const pts = [];
  for (const [a, b] of legs) {
    const legKm = haversineKm(a.lat, a.lon, b.lat, b.lon) * 1.08;
    const steps = Math.max(6, Math.ceil((legKm * 1000) / stepM));
    for (let i = 0; i <= steps; i++) {
      if (i === 0 && pts.length > 0) continue;
      const t = i / steps;
      const bend = Math.sin(t * Math.PI) * 0.008;
      pts.push({
        latitude: a.lat + (b.lat - a.lat) * t + bend * 0.25,
        longitude: a.lon + (b.lon - a.lon) * t + bend,
        speed: speedKmh / 3.6,
        accuracy: 8,
      });
    }
  }
  const msPer = (stepM / 1000 / speedKmh) * 3600 * 1000;
  return pts.map((p, i) => ({ ...p, timestamp: Math.round(start + i * msPer) }));
}

function filterAppend(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const prev = out.length ? out[out.length - 1] : null;
    const r = evaluateGpsSample(prev, points[i], { isFirst: out.length === 0 });
    if (r.accept) out.push(points[i]);
  }
  let dist = 0;
  for (let i = 1; i < out.length; i++) {
    dist += haversineKm(
      out[i - 1].latitude,
      out[i - 1].longitude,
      out[i].latitude,
      out[i].longitude
    );
  }
  return { out, dist: Math.round(dist * 10) / 10 };
}

console.log('\n=== 1. Modèle consommation ===');
const v806 = {
  consumptionPer100: 8.2,
  year: 2000,
  transmissionGears: 5,
  consumptionLearnFactor: 1.05,
};
test('âge 806 (2000) majore la conso', () => {
  assert.ok(vehicleAgeFactor(2000) > 1.2);
  assert.ok(vehicleAgeFactor(2000) <= 1.35);
});
test('voiture neuve ≈ facteur 1', () => {
  assert.equal(vehicleAgeFactor(2025), 1);
});
test('boîte 4 > boîte 5 > 6+', () => {
  assert.ok(transmissionFactor(4) > transmissionFactor(5));
  assert.ok(transmissionFactor(5) > transmissionFactor(6));
});
test('dénivelé augmente la conso', () => {
  assert.ok(elevationFactor(200, 40) > 1);
  assert.ok(elevationFactor(0, 40) === 1);
});
test('conso 44 km 806 > catalogue brut', () => {
  const raw = (44 * 8.2) / 100;
  const est = estimateTripFuelLiters(v806, 44);
  assert.ok(est > raw * 1.15, `est=${est} raw=${raw}`);
  assert.ok(est < 9, `trop haut: ${est}`);
});
test('jauge apprend dans les bornes', () => {
  const f = learnedFactorFromGauge(5, 7);
  assert.ok(f >= 0.85 && f <= 1.55);
  assert.ok(f > 1);
});

console.log('\n=== 2. Vitesse en mouvement ===');
test('ignore les pauses longues', () => {
  const t0 = Date.now();
  const points = [
    { latitude: 48.14, longitude: -1.58, timestamp: t0 },
    { latitude: 48.145, longitude: -1.575, timestamp: t0 + 60_000 }, // ~40 km/h
    { latitude: 48.145, longitude: -1.575, timestamp: t0 + 60_000 + 600_000 }, // pause 10 min
    { latitude: 48.15, longitude: -1.57, timestamp: t0 + 60_000 + 600_000 + 60_000 },
  ];
  const d =
    haversineKm(48.14, -1.58, 48.145, -1.575) + haversineKm(48.145, -1.575, 48.15, -1.57);
  const moving = averageMovingSpeedKmh(d, points);
  const wall = (d / ((points[3].timestamp - t0) / 60000)) * 60;
  assert.ok(moving > wall * 1.5, `moving=${moving.toFixed(1)} wall=${wall.toFixed(1)}`);
});

console.log('\n=== 3. Filtre GPS ===');
test('rejette saut téléportation', () => {
  const a = { latitude: 48.14, longitude: -1.58, timestamp: 1000 };
  const b = { latitude: 48.5, longitude: -1.0, timestamp: 2000, accuracy: 10, speed: 20 };
  const r = evaluateGpsSample(a, b);
  assert.equal(r.accept, false);
  assert.equal(r.reason, 'too_fast');
});
test('rejette stationnaire bruit', () => {
  const a = { latitude: 48.14, longitude: -1.58, timestamp: 1000 };
  const b = {
    latitude: 48.14005,
    longitude: -1.58,
    timestamp: 3000,
    accuracy: 10,
    speed: 0.2,
  };
  const r = evaluateGpsSample(a, b);
  assert.equal(r.accept, false);
  assert.ok(r.reason === 'stationary' || r.reason === 'too_close');
});
test('accepte déplacement normal 70 km/h', () => {
  const a = { latitude: 48.14, longitude: -1.58, timestamp: 0 };
  // ~100 m en 5 s ≈ 72 km/h
  const b = {
    latitude: 48.1409,
    longitude: -1.58,
    timestamp: 5000,
    accuracy: 8,
    speed: 20,
  };
  const r = evaluateGpsSample(a, b);
  assert.equal(r.accept, true, r.reason);
});
test('rejette mauvaise précision', () => {
  const r = evaluateGpsSample(null, {
    latitude: 48.14,
    longitude: -1.58,
    timestamp: 0,
    accuracy: 120,
  });
  assert.equal(r.accept, false);
  assert.equal(r.reason, 'bad_accuracy');
});

console.log('\n=== 4. Simulateur trajet A/R ===');
const home = { lat: 48.1465, lon: -1.579 };
const via = { lat: 48.0, lon: -1.55 };
const work = { lat: 47.9415, lon: -1.2295 };

test('aller ~35–50 km, vitesse ~60–80', () => {
  const pts = buildDrivingPoints(home, via, work, 72);
  const { out, dist } = filterAppend(pts);
  const speed = averageMovingSpeedKmh(dist, out);
  assert.ok(out.length > 50, `points=${out.length}`);
  assert.ok(dist >= 35 && dist <= 50, `dist=${dist}`);
  assert.ok(speed >= 55 && speed <= 85, `speed=${speed.toFixed(1)}`);
  const fuel = estimateTripFuelLiters(v806, dist);
  assert.ok(fuel >= 4.5 && fuel <= 8, `fuel=${fuel}`);
});

test('retour cohérent avec aller', () => {
  const go = filterAppend(buildDrivingPoints(home, via, work, 72)).dist;
  const back = filterAppend(buildDrivingPoints(work, via, home, 70)).dist;
  assert.ok(Math.abs(go - back) < 3, `go=${go} back=${back}`);
});

test('spike GPS ne gonfle pas la distance', () => {
  const pts = buildDrivingPoints(home, via, work, 72);
  const mid = Math.floor(pts.length / 2);
  pts.splice(mid, 0, {
    latitude: 49.5,
    longitude: 0.5,
    timestamp: pts[mid].timestamp + 1000,
    accuracy: 8,
    speed: 20,
  });
  const clean = filterAppend(buildDrivingPoints(home, via, work, 72)).dist;
  const spiked = filterAppend(pts).dist;
  assert.ok(Math.abs(spiked - clean) < 5, `clean=${clean} spiked=${spiked}`);
});

console.log('\n=== 5. Coût au prix du moment ===');
test('coût = litres × prix plein', () => {
  const fuel = estimateTripFuelLiters(v806, 44);
  const price = 1.72;
  const cost = Math.round(fuel * price * 100) / 100;
  assert.ok(cost > 8 && cost < 15, `cost=${cost}`);
});

console.log('\n=== 6. Cas limites ===');
test('distance 0 → 0 L', () => {
  assert.equal(estimateTripFuelLiters(v806, 0), 0);
});
test('learn factor clamp 0.85–1.55', () => {
  assert.equal(learnedFactorFromGauge(1, 100), 1.55);
  assert.equal(learnedFactorFromGauge(10, 1), 0.85);
});
test('filtre ignore point trop tôt (<600ms)', () => {
  const a = { latitude: 48.14, longitude: -1.58, timestamp: 0 };
  const b = { latitude: 48.141, longitude: -1.58, timestamp: 200, accuracy: 8, speed: 15 };
  assert.equal(evaluateGpsSample(a, b).reason, 'too_soon');
});
test('A/R total ~80–100 km', () => {
  const go = filterAppend(buildDrivingPoints(home, via, work, 72)).dist;
  const back = filterAppend(buildDrivingPoints(work, via, home, 68)).dist;
  const total = go + back;
  assert.ok(total >= 70 && total <= 100, `total=${total}`);
});

console.log(`\n=== Résultat : ${passed} OK, ${failed} KO ===`);
if (failed) {
  console.error(errors);
  process.exit(1);
}
console.log('OK — suite logique validée\n');
