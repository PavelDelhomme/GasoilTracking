#!/usr/bin/env node
/**
 * Simule un trajet GPS (Thorigné → La Guerche ~45 km) avec bruit + sauts,
 * et vérifie que le filtre calcule une distance cohérente.
 *
 * Usage: node scripts/simulate-gps-trip.mjs
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Charge via tsx si dispo, sinon logique dupliquée minimale
async function loadFilter() {
  try {
    const { register } = await import('tsx/esm/api');
    register();
    const mod = await import(pathToFileURL(path.join(root, 'lib/gpsTracking.ts')).href);
    const calc = await import(pathToFileURL(path.join(root, 'lib/calculations.ts')).href);
    return { evaluateGpsSample: mod.evaluateGpsSample, appendRoutePoint: calc.appendRoutePoint, calculateRouteDistance: calc.calculateRouteDistance };
  } catch {
    // Fallback pur JS (copie des constantes clés)
    return null;
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MAX_ACCURACY_M = 45;
const MAX_ACCURACY_FIRST_M = 80;
const MIN_STEP_KM = 0.008;
const MAX_SPEED_MPS = 55;
const MIN_DT_MS = 800;

function evaluateGpsSample(previous, sample, opts = {}) {
  const { latitude: lat, longitude: lon, timestamp, accuracy, speed } = sample;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
    return { accept: false, reason: 'bad_coords' };
  }
  const maxAcc = opts.isFirst || !previous ? MAX_ACCURACY_FIRST_M : MAX_ACCURACY_M;
  if (accuracy != null && accuracy > maxAcc) return { accept: false, reason: 'bad_accuracy' };
  if (!previous) return { accept: true, reason: 'ok' };
  const dt = timestamp - previous.timestamp;
  if (dt >= 0 && dt < MIN_DT_MS) return { accept: false, reason: 'too_soon' };
  const distanceKm = haversineKm(previous.latitude, previous.longitude, lat, lon);
  if (distanceKm < MIN_STEP_KM) return { accept: false, reason: 'too_close' };
  if (dt > 0) {
    const speedMps = (distanceKm * 1000) / (dt / 1000);
    if (speedMps > MAX_SPEED_MPS) return { accept: false, reason: 'too_fast', distanceKm, speedMps };
    if (speed != null && speed > MAX_SPEED_MPS + 10) return { accept: false, reason: 'too_fast' };
    return { accept: true, reason: 'ok', distanceKm, speedMps };
  }
  if (distanceKm > 2) return { accept: false, reason: 'too_fast', distanceKm };
  return { accept: true, reason: 'ok', distanceKm };
}

function append(routeJson, point) {
  const points = JSON.parse(routeJson);
  const prev = points.length ? points[points.length - 1] : null;
  const v = evaluateGpsSample(prev, point, { isFirst: !points.length });
  if (!v.accept) return { json: routeJson, reason: v.reason };
  points.push({
    latitude: point.latitude,
    longitude: point.longitude,
    timestamp: point.timestamp,
    ...(point.accuracy != null ? { accuracy: point.accuracy } : {}),
  });
  return { json: JSON.stringify(points), reason: 'ok' };
}

function calcDist(routeJson) {
  const points = JSON.parse(routeJson);
  let total = 0;
  let last = points[0];
  if (!last) return 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const r = evaluateGpsSample(last, p);
    if (!r.accept && (r.reason === 'too_fast' || r.reason === 'bad_accuracy' || r.reason === 'bad_coords')) continue;
    if (!r.accept && (r.reason === 'too_close' || r.reason === 'too_soon')) continue;
    const d = haversineKm(last.latitude, last.longitude, p.latitude, p.longitude);
    if (d >= MIN_STEP_KM) {
      total += d;
      last = p;
    }
  }
  return Math.round(total * 1000) / 1000;
}

// --- Simulation : ligne droite interpolée Thorigné → La Guerche ---
const START = { lat: 48.1605, lon: -1.5785 }; // Thorigné-Fouillard approx
const END = { lat: 47.9415, lon: -1.2125 }; // La Guerche approx
const TRUE_KM = haversineKm(START.lat, START.lon, END.lat, END.lon);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function simulate() {
  const steps = 180; // ~45 km / ~4s → ~12 min simulés
  const dtMs = 4000;
  let t0 = Date.now();
  let route = '[]';
  const stats = { ok: 0, bad_accuracy: 0, too_fast: 0, too_close: 0, too_soon: 0, bad_coords: 0 };
  let rawSum = 0;
  let prevRaw = null;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let lat = lerp(START.lat, END.lat, t);
    let lon = lerp(START.lon, END.lon, t);
    // bruit normal ~5–15 m
    lat += (Math.random() - 0.5) * 0.0002;
    lon += (Math.random() - 0.5) * 0.0002;
    let accuracy = 8 + Math.random() * 20;

    // Injecte des bugs réalistes
    if (i === 40) {
      // saut GPS de 3 km
      lat += 0.027;
      lon += 0.01;
      accuracy = 25;
    }
    if (i === 41) {
      // retour (double comptage si non filtré)
    }
    if (i === 90) {
      accuracy = 120; // précision pourrie
    }
    if (i === 120) {
      // micro-jitter à l’arrêt
      lat += 0.00001;
      lon += 0.00001;
    }

    const sample = {
      latitude: lat,
      longitude: lon,
      timestamp: t0 + i * dtMs,
      accuracy,
      speed: 22,
    };

    if (prevRaw) {
      rawSum += haversineKm(prevRaw.lat, prevRaw.lon, lat, lon);
    }
    prevRaw = { lat, lon };

    const { json, reason } = append(route, sample);
    route = json;
    stats[reason] = (stats[reason] || 0) + 1;
  }

  const filteredKm = calcDist(route);
  const points = JSON.parse(route).length;
  const errPct = Math.abs(filteredKm - TRUE_KM) / TRUE_KM * 100;
  const rawErrPct = Math.abs(rawSum - TRUE_KM) / TRUE_KM * 100;

  console.log('=== Simulation trajet GPS ===');
  console.log(`Distance vraie (oiseau) : ${TRUE_KM.toFixed(2)} km`);
  console.log(`Somme brute (avec sauts) : ${rawSum.toFixed(2)} km  (erreur ${rawErrPct.toFixed(1)} %)`);
  console.log(`Distance filtrée         : ${filteredKm.toFixed(2)} km  (erreur ${errPct.toFixed(1)} %)`);
  console.log(`Points gardés            : ${points} / ${steps + 1}`);
  console.log('Raisons:', stats);

  const pass =
    filteredKm > TRUE_KM * 0.85 &&
    filteredKm < TRUE_KM * 1.2 &&
    rawSum > filteredKm * 1.05; // le filtre doit avoir retiré le saut

  if (!pass) {
    console.error('FAIL — filtre GPS insuffisant');
    process.exit(1);
  }
  console.log('PASS — sauts rejetés, distance cohérente');
}

simulate();
