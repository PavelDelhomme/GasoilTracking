/**
 * Limites de vitesse (panneaux) via OpenStreetMap / Overpass.
 * Gratuit, open data — pas une API commerciale.
 * (évite d’importer calculations → database pour rester testable)
 */

export type SpeedLimitInfo = {
  /** km/h numérique (ex. 50, 80, 90, 110, 130) */
  limitKmh: number;
  /** Tag OSM brut (ex. "50", "FR:urban") */
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

const cache = new Map<string, SpeedLimitInfo | null>();
let lastFetchAt = 0;

/**
 * Limite près d’un point (rayon ~45 m). Cache ~cellule 11 m + throttle réseau.
 */
export async function fetchSpeedLimitNear(
  latitude: number,
  longitude: number,
  opts?: { force?: boolean }
): Promise<SpeedLimitInfo | null> {
  const key = cacheKey(latitude, longitude);
  if (!opts?.force && cache.has(key)) return cache.get(key) ?? null;
  const now = Date.now();
  if (!opts?.force && now - lastFetchAt < 12_000) {
    for (const [k, v] of cache) {
      const [la, lo] = k.split(',').map(Number);
      if (haversineKm(latitude, longitude, la, lo) < 0.08 && v && now - v.fetchedAt < 120_000) {
        return v;
      }
    }
  }
  lastFetchAt = now;

  const query = `
[out:json][timeout:8];
way(around:45,${latitude.toFixed(5)},${longitude.toFixed(5)})[highway][maxspeed];
out tags 8;
`.trim();

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 9000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
        'User-Agent': 'GasoilTracking/1.4',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl?.signal,
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
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
    cache.set(key, best);
    return best;
  } catch {
    cache.set(key, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Échantillonne quelques points du tracé pour une limite « moyenne » de corridor. */
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
