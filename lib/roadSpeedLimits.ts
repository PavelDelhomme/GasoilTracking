/**
 * Limites de vitesse (panneaux) via OpenStreetMap / Overpass.
 * Gratuit, open data — pas une API commerciale.
 */
import { haversineDistance } from '@/lib/geoMath';

export type SpeedLimitInfo = {
  limitKmh: number;
  raw: string;
  source: 'overpass';
  at: { latitude: number; longitude: number };
  fetchedAt: number;
};

const FR_IMPLIED: Record<string, number> = {
  'FR:urban': 50,
  'FR:rural': 80,
  'FR:zone30': 30,
  'FR:motorway': 130,
  'FR:trunk': 110,
  'FR:living_street': 20,
};

/** Parse un tag maxspeed OSM → km/h. */
export function parseOsmMaxspeed(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === 'none' || s === 'signals') return null;
  if (FR_IMPLIED[s]) return FR_IMPLIED[s];
  const fr = s.match(/^FR:(\w+)/i);
  if (fr && FR_IMPLIED[`FR:${fr[1].toLowerCase()}`]) {
    return FR_IMPLIED[`FR:${fr[1].toLowerCase()}`];
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(km\/h|kmh)?$/i);
  if (m) {
    const v = Number(m[1]);
    if (v >= 5 && v <= 140) return Math.round(v);
  }
  const mph = s.match(/^(\d+)\s*mph$/i);
  if (mph) return Math.round(Number(mph[1]) * 1.609);
  return null;
}

function cacheKey(lat: number, lon: number): string {
  // ~55 m de cellule — assez fin pour suivre les changements de panneau
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

const hitCache = new Map<string, SpeedLimitInfo>();
/** Misses : TTL court pour réessayer (Overpass rate-limit / zone sans tag). */
const missUntil = new Map<string, number>();
let lastNetworkAt = 0;
let lastGood: SpeedLimitInfo | null = null;

/**
 * Limite près d’un point. Conserve la dernière valeur connue si Overpass rate-limite
 * ou si la cellule n’a pas de maxspeed (évite le panneau qui disparaît).
 */
export async function fetchSpeedLimitNear(
  latitude: number,
  longitude: number,
  opts?: { force?: boolean }
): Promise<SpeedLimitInfo | null> {
  const key = cacheKey(latitude, longitude);
  const now = Date.now();

  const cached = hitCache.get(key);
  if (!opts?.force && cached && now - cached.fetchedAt < 180_000) {
    lastGood = cached;
    return cached;
  }

  // Dernière bonne limite proche (< 250 m) encore fraîche
  if (
    !opts?.force &&
    lastGood &&
    now - lastGood.fetchedAt < 90_000 &&
    haversineDistance(latitude, longitude, lastGood.at.latitude, lastGood.at.longitude) < 0.25
  ) {
    return lastGood;
  }

  const missTs = missUntil.get(key);
  if (!opts?.force && missTs && now < missTs) {
    return lastGood;
  }

  // Throttle réseau Overpass (~1 req / 8 s)
  if (!opts?.force && now - lastNetworkAt < 8000) {
    return lastGood;
  }
  lastNetworkAt = now;

  const query = `
[out:json][timeout:10];
(
  way(around:80,${latitude.toFixed(5)},${longitude.toFixed(5)})[highway][maxspeed];
  node(around:80,${latitude.toFixed(5)},${longitude.toFixed(5)})[highway=speed_camera][maxspeed];
);
out tags 12;
`.trim();

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 11_000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
        'User-Agent': 'GasoilTracking/1.4 (personal fuel app)',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl?.signal,
    });
    if (!res.ok) {
      missUntil.set(key, now + 25_000);
      return lastGood;
    }
    const data = (await res.json()) as {
      elements?: Array<{ tags?: Record<string, string> }>;
    };
    const elements = data.elements || [];
    let best: SpeedLimitInfo | null = null;
    for (const el of elements) {
      const raw = el.tags?.maxspeed;
      const limit = parseOsmMaxspeed(raw);
      if (limit == null || !raw) continue;
      if (!best || limit < best.limitKmh) {
        best = {
          limitKmh: limit,
          raw,
          source: 'overpass',
          at: { latitude, longitude },
          fetchedAt: now,
        };
      }
    }
    if (best) {
      hitCache.set(key, best);
      missUntil.delete(key);
      lastGood = best;
      return best;
    }
    // Pas de tag : miss court, garder l’ancien panneau
    missUntil.set(key, now + 40_000);
    return lastGood;
  } catch {
    missUntil.set(key, now + 20_000);
    return lastGood;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSpeedLimitAlongRoute(
  points: Array<{ latitude: number; longitude: number }>
): Promise<SpeedLimitInfo | null> {
  if (points.length < 2) return null;
  const samples = [
    points[Math.floor(points.length * 0.15)],
    points[Math.floor(points.length * 0.5)],
    points[Math.floor(points.length * 0.85)],
  ].filter(Boolean);
  for (const p of samples) {
    const info = await fetchSpeedLimitNear(p.latitude, p.longitude);
    if (info) return info;
  }
  return null;
}
