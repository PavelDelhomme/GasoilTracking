#!/usr/bin/env node
/**
 * Simulateur trajet (Node) — vérifie distance / vitesse / conso sans téléphone.
 * Usage: node scripts/simulate-car-gps.mjs
 */
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
  const age = Math.max(0, nowYear - year);
  if (age <= 3) return 1;
  if (age <= 8) return 1 + (age - 3) * 0.012;
  if (age <= 15) return 1.06 + (age - 8) * 0.018;
  return Math.min(1.35, 1.186 + (age - 15) * 0.015);
}

function estimateFuel(conso, year, km, learn = 1.05, gears = 5) {
  const gear = gears <= 4 ? 1.06 : gears === 5 ? 1.02 : 1;
  const l100 = conso * vehicleAgeFactor(year) * gear * 1.18 * learn;
  return Math.round(((km * l100) / 100) * 100) / 100;
}

function movingSpeed(points, distanceKm) {
  let ms = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > 180000) continue;
    const d = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const sp = d / (dt / 3600000);
    if (sp < 5) continue;
    ms += dt;
  }
  const mins = ms / 60000;
  return mins > 0 ? (distanceKm / mins) * 60 : 0;
}

function buildRoute(from, via, to, speedKmh = 72, stepM = 90) {
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
        lat: a.lat + (b.lat - a.lat) * t + bend * 0.25,
        lon: a.lon + (b.lon - a.lon) * t + bend,
      });
    }
  }
  const msPer = (stepM / 1000 / speedKmh) * 3600 * 1000;
  const withT = pts.map((p, i) => ({ ...p, t: Math.round(start + i * msPer) }));
  let dist = 0;
  for (let i = 1; i < withT.length; i++) {
    dist += haversineKm(withT[i - 1].lat, withT[i - 1].lon, withT[i].lat, withT[i].lon);
  }
  return { pts: withT, dist: Math.round(dist * 10) / 10 };
}

const home = { lat: 48.1465, lon: -1.579 };
const via = { lat: 48.0, lon: -1.55 };
const work = { lat: 47.9415, lon: -1.2295 };
const { pts, dist } = buildRoute(home, via, work, 72);
const speed = movingSpeed(pts, dist);
const fuel = estimateFuel(8.2, 2000, dist);
const wallMin = (pts[pts.length - 1].t - pts[0].t) / 60000;

console.log('=== Simulateur trajet domicile → Inter ===');
console.log(`Points: ${pts.length}`);
console.log(`Distance filtrée: ${dist} km`);
console.log(`Vitesse en mouvement: ${speed.toFixed(1)} km/h`);
console.log(`Conso estimée 806 (2000, +âge/marge): ${fuel} L`);
console.log(`Durée sim: ${wallMin.toFixed(1)} min`);

if (dist < 35 || dist > 55) {
  console.error('FAIL: distance hors plage attendue ~40–50 km');
  process.exit(1);
}
if (speed < 55 || speed > 90) {
  console.error('FAIL: vitesse mouvement hors plage ~72 km/h');
  process.exit(1);
}
if (fuel < 4.5 || fuel > 9) {
  console.error('FAIL: conso hors plage réaliste');
  process.exit(1);
}
console.log('OK — simulateur cohérent');
