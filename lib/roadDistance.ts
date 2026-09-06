/**
 * Itinéraires routiers OSRM + alternatives génériques (rapide / éco / autres).
 * Style Google Maps : 1 à N propositions selon ce que le réseau offre — jamais de via local hardcodé.
 */
import { haversineDistance } from '@/lib/calculations';
import { forwardGeocode } from '@/lib/geocode';
import type { Place } from '@/types';

export type Geo = { latitude: number; longitude: number };

export type DrivingRoute = {
  id: string;
  label: string;
  kind: 'fastest' | 'eco' | 'alternate';
  distanceKm: number;
  durationMinutes: number | null;
  coordinates: Geo[];
  /** Points intermédiaires utiles pour ouvrir Maps sur le même passage */
  via?: Geo[];
  source: 'osrm' | 'estimate';
};

export type RoadDistanceResult = {
  distanceKm: number;
  durationMinutes: number | null;
  source: 'osrm' | 'estimate';
};

type RawRoute = {
  distanceKm: number;
  durationMinutes: number | null;
  coordinates: Geo[];
  via?: Geo[];
};

function downsampleGeo(pts: Geo[], max = 160): Geo[] {
  if (pts.length <= max) return pts;
  const out: Geo[] = [pts[0]];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function toCoords(geometry?: { coordinates?: [number, number][] }): Geo[] {
  const raw = (geometry?.coordinates || []).map(([lon, lat]) => ({
    latitude: lat,
    longitude: lon,
  }));
  return downsampleGeo(raw, 160);
}

async function osrmRoute(points: Geo[], maxAlternatives: number): Promise<RawRoute[]> {
  if (points.length < 2) return [];
  const path = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const alt =
    maxAlternatives <= 0 ? 'false' : String(Math.max(1, Math.min(3, maxAlternatives)));
  const url =
    `https://router.project-osrm.org/route/v1/driving/${path}` +
    `?overview=full&geometries=geojson&alternatives=${alt}&steps=false`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'GasoilTracking/1.4' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    code?: string;
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: [number, number][] };
    }>;
  };
  if (data.code !== 'Ok' || !data.routes?.length) return [];
  return data.routes
    .filter((r) => r.distance != null && r.distance > 0)
    .map((r) => ({
      distanceKm: Math.round((r.distance! / 1000) * 10) / 10,
      durationMinutes: r.duration != null ? Math.round(r.duration / 60) : null,
      coordinates: toCoords(r.geometry),
    }));
}

/**
 * Via historique perso (réparation trajets domicile↔travail) — PAS utilisé pour le picker public.
 */
export const VIA_CHATEAUGIRON: Geo = { latitude: 48.04867, longitude: -1.50282 };

function routeFingerprint(r: { distanceKm: number; durationMinutes: number | null }): string {
  return `${r.distanceKm.toFixed(1)}:${r.durationMinutes ?? 0}`;
}

function isSameish(a: RawRoute, b: RawRoute): boolean {
  if (routeFingerprint(a) === routeFingerprint(b)) return true;
  return (
    Math.abs(a.distanceKm - b.distanceKm) < 1.2 &&
    Math.abs((a.durationMinutes ?? 0) - (b.durationMinutes ?? 0)) < 3
  );
}

/** Points de passage génériques : décalage perpendiculaire au corridor A→B. */
function corridorOffsetVias(from: Geo, to: Geo): Geo[] {
  const bird = haversineDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  if (bird < 10) return [];
  const dLat = to.latitude - from.latitude;
  const dLon = to.longitude - from.longitude;
  const len = Math.sqrt(dLat * dLat + dLon * dLon) || 1;
  const pLat = -dLon / len;
  const pLon = dLat / len;
  // ~3–12 km de décalage selon la longueur du trajet
  const offsetDeg = Math.min(0.11, Math.max(0.028, bird * 0.0018));
  const out: Geo[] = [];
  for (const t of [0.4, 0.55]) {
    for (const sign of [-1, 1] as const) {
      out.push({
        latitude: from.latitude + t * dLat + sign * pLat * offsetDeg,
        longitude: from.longitude + t * dLon + sign * pLon * offsetDeg,
      });
    }
  }
  return out;
}

function dedupeRoutes(collected: RawRoute[], max = 6): RawRoute[] {
  const unique: RawRoute[] = [];
  for (const r of [...collected].sort(
    (a, b) => (a.durationMinutes ?? 999) - (b.durationMinutes ?? 999)
  )) {
    if (unique.some((u) => isSameish(u, r))) continue;
    unique.push(r);
    if (unique.length >= max) break;
  }
  return unique;
}

/**
 * Propositions d’itinéraires (1 à 4) : plus rapide, économique, puis alternatives distinctes.
 * Aucun via géographique hardcodé — uniquement OSRM + corridors génériques si besoin.
 */
export async function fetchDrivingRouteAlternatives(
  from: Geo,
  to: Geo,
  opts?: { vias?: Geo[] }
): Promise<DrivingRoute[]> {
  const bird = haversineDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  let collected: RawRoute[] = [];

  try {
    const direct = await osrmRoute([from, to], 3);
    collected.push(...direct);

    // Via explicites (caller) uniquement — jamais de villes en dur
    for (const via of opts?.vias || []) {
      const viaRoutes = await osrmRoute([from, via, to], 0);
      for (const r of viaRoutes) collected.push({ ...r, via: [via] });
    }

    // Si OSRM ne donne qu’1–2 routes, explorer des corridors décalés (générique)
    if (dedupeRoutes(collected).length < 3 && bird >= 10) {
      for (const via of corridorOffsetVias(from, to)) {
        const viaRoutes = await osrmRoute([from, via, to], 0);
        for (const r of viaRoutes) {
          collected.push({ ...r, via: [via] });
        }
        if (dedupeRoutes(collected).length >= 4) break;
      }
    }
  } catch {
    /* fallback below */
  }

  const unique = dedupeRoutes(collected, 6);

  if (!unique.length) {
    return [
      {
        id: 'estimate',
        label: 'Estimé',
        kind: 'fastest',
        distanceKm: Math.round(bird * 1.3 * 10) / 10,
        durationMinutes: null,
        coordinates: [from, to],
        source: 'estimate',
      },
    ];
  }

  const byTime = [...unique].sort(
    (a, b) => (a.durationMinutes ?? 999) - (b.durationMinutes ?? 999)
  );
  const byDist = [...unique].sort((a, b) => a.distanceKm - b.distanceKm);

  const pick: DrivingRoute[] = [];
  const used = new Set<string>();

  const add = (r: RawRoute, kind: DrivingRoute['kind'], label: string) => {
    const fp = routeFingerprint(r);
    if (used.has(fp)) return false;
    used.add(fp);
    pick.push({
      id: `${kind}-${fp}`,
      label,
      kind,
      distanceKm: r.distanceKm,
      durationMinutes: r.durationMinutes,
      coordinates: r.coordinates,
      // Uniquement un via OSRM réel — jamais un point milieu (ça devient un stop Maps)
      via: r.via?.length ? r.via : undefined,
      source: 'osrm',
    });
    return true;
  };

  const fastest = byTime[0];
  const eco = byDist[0];

  if (fastest && eco && isSameish(fastest, eco)) {
    add(fastest, 'fastest', 'Plus rapide');
  } else {
    if (eco) add(eco, 'eco', 'Économique');
    if (fastest) add(fastest, 'fastest', 'Plus rapide');
  }

  // Alternatives restantes (souvent un 3e trajet plus long / différent)
  const rest = unique
    .filter((r) => !used.has(routeFingerprint(r)))
    .sort((a, b) => {
      // Préférer ceux bien distincts du plus rapide (écart durée puis distance)
      const dtA = Math.abs((a.durationMinutes ?? 0) - (fastest?.durationMinutes ?? 0));
      const dtB = Math.abs((b.durationMinutes ?? 0) - (fastest?.durationMinutes ?? 0));
      if (dtB !== dtA) return dtB - dtA;
      return Math.abs(b.distanceKm - (fastest?.distanceKm ?? 0)) - Math.abs(a.distanceKm - (fastest?.distanceKm ?? 0));
    });

  let altIdx = 0;
  for (const r of rest) {
    if (pick.length >= 4) break;
    altIdx += 1;
    const dMin = (r.durationMinutes ?? 0) - (fastest?.durationMinutes ?? 0);
    const label =
      altIdx === 1
        ? dMin >= 4
          ? 'Alternatif'
          : 'Autre itinéraire'
        : `Autre ${altIdx}`;
    add(r, 'alternate', label);
  }

  // Ordre UX : éco → rapide → alternatives (comme souvent sur Maps)
  return [...pick].sort((a, b) => {
    const rank = (k: DrivingRoute['kind']) => (k === 'eco' ? 0 : k === 'fastest' ? 1 : 2);
    return rank(a.kind) - rank(b.kind);
  });
}

/**
 * Distance routière aller (voiture) via OSRM public — sans clé API.
 */
export async function fetchDrivingDistanceKm(
  from: Geo,
  to: Geo
): Promise<RoadDistanceResult> {
  const r = await fetchDrivingRoute(from, to);
  return {
    distanceKm: r.distanceKm,
    durationMinutes: r.durationMinutes,
    source: r.source,
  };
}

/** Itinéraire complet (géométrie) pour affichage carte — priorise le plus rapide. */
export async function fetchDrivingRoute(
  from: Geo,
  to: Geo,
  opts?: { via?: Geo | Geo[] }
): Promise<{
  distanceKm: number;
  durationMinutes: number | null;
  coordinates: Geo[];
  source: 'osrm' | 'estimate';
}> {
  const vias = opts?.via ? (Array.isArray(opts.via) ? opts.via : [opts.via]) : [];
  if (vias.length) {
    const alts = await fetchDrivingRouteAlternatives(from, to, { vias });
    const hit = alts.find((a) => a.via?.length) || alts.find((a) => a.kind === 'fastest') || alts[0];
    if (hit) {
      return {
        distanceKm: hit.distanceKm,
        durationMinutes: hit.durationMinutes,
        coordinates: hit.coordinates,
        source: hit.source,
      };
    }
  }
  const alts = await fetchDrivingRouteAlternatives(from, to);
  const best = alts.find((a) => a.kind === 'fastest') || alts[0];
  if (best) {
    return {
      distanceKm: best.distanceKm,
      durationMinutes: best.durationMinutes,
      coordinates: best.coordinates,
      source: best.source,
    };
  }
  const bird = haversineDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  return {
    distanceKm: Math.round(bird * 1.3 * 10) / 10,
    durationMinutes: null,
    coordinates: [from, to],
    source: 'estimate',
  };
}

/** Coords d’un lieu : GPS stocké, sinon géocodage de l’adresse / nom. */
export async function resolvePlaceCoords(
  place: Place
): Promise<{ latitude: number; longitude: number; label: string } | null> {
  if (
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  ) {
    return {
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.address?.trim() || place.name,
    };
  }
  const q = [place.address, place.name].filter((x) => x && x.trim()).join(', ');
  if (!q.trim()) return null;
  const hit = await forwardGeocode(q);
  if (!hit) return null;
  return { latitude: hit.latitude, longitude: hit.longitude, label: hit.label };
}

export type SuggestedItinerary = {
  key: string;
  fromId: number;
  toId: number;
  label: string;
  subtitle: string;
  priority: number;
};

/**
 * Itinéraires probables à partir des lieux (domicile↔travail en priorité).
 */
export function buildSuggestedItineraries(places: Place[]): SuggestedItinerary[] {
  const out: SuggestedItinerary[] = [];
  const home = places.find((p) => p.kind === 'home');
  const work = places.find((p) => p.kind === 'work');
  const others = places.filter((p) => p.kind !== 'home' && p.kind !== 'work');

  const push = (from: Place, to: Place, label: string, subtitle: string, priority: number) => {
    if (from.id === to.id) return;
    const key = `${from.id}->${to.id}`;
    if (out.some((x) => x.key === key)) return;
    out.push({
      key,
      fromId: from.id,
      toId: to.id,
      label,
      subtitle,
      priority,
    });
  };

  if (home && work) {
    push(home, work, `${home.name} → ${work.name}`, 'Domicile → Travail (aller)', 0);
    push(work, home, `${work.name} → ${home.name}`, 'Travail → Domicile (retour)', 1);
  }

  if (home) {
    for (const o of others.slice(0, 6)) {
      push(home, o, `${home.name} → ${o.name}`, 'Depuis le domicile', 2);
    }
  }
  if (work) {
    for (const o of others.slice(0, 4)) {
      push(work, o, `${work.name} → ${o.name}`, 'Depuis le travail', 3);
    }
  }

  for (let i = 0; i < places.length; i++) {
    for (let j = 0; j < places.length; j++) {
      if (i === j) continue;
      push(places[i], places[j], `${places[i].name} → ${places[j].name}`, 'Autre trajet', 9);
      if (out.length >= 12) break;
    }
    if (out.length >= 12) break;
  }

  return out.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
}
