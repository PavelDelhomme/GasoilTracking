/**
 * Itinéraires routiers OSRM + alternatives (rapide / éco / via).
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

function toCoords(geometry?: { coordinates?: [number, number][] }): Geo[] {
  return (geometry?.coordinates || []).map(([lon, lat]) => ({
    latitude: lat,
    longitude: lon,
  }));
}

async function osrmRoute(
  points: Geo[],
  alternatives: boolean
): Promise<
  Array<{
    distanceKm: number;
    durationMinutes: number | null;
    coordinates: Geo[];
  }>
> {
  if (points.length < 2) return [];
  const path = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const url =
    `https://router.project-osrm.org/route/v1/driving/${path}` +
    `?overview=full&geometries=geojson&alternatives=${alternatives ? 'true' : 'false'}`;
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

/** Via typiques Ille-et-Vilaine (domicile Rennes Est ↔ Guerche). */
export const VIA_CHATEAUGIRON: Geo = { latitude: 48.04867, longitude: -1.50282 };
export const VIA_VITRE_SUD: Geo = { latitude: 48.05, longitude: -1.25 };

function routeFingerprint(r: { distanceKm: number; durationMinutes: number | null }): string {
  return `${r.distanceKm.toFixed(1)}:${r.durationMinutes ?? 0}`;
}

/**
 * Jusqu’à 3 propositions : plus rapide, économique (plus court), alternatif (via / plus long).
 */
export async function fetchDrivingRouteAlternatives(
  from: Geo,
  to: Geo,
  opts?: { vias?: Geo[] }
): Promise<DrivingRoute[]> {
  const bird = haversineDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  const collected: Array<{
    distanceKm: number;
    durationMinutes: number | null;
    coordinates: Geo[];
    via?: Geo[];
  }> = [];

  try {
    const direct = await osrmRoute([from, to], true);
    for (const r of direct) collected.push(r);

    const vias = opts?.vias?.length
      ? opts.vias
      : bird > 15
        ? [VIA_CHATEAUGIRON, VIA_VITRE_SUD]
        : [];
    for (const via of vias) {
      const viaRoutes = await osrmRoute([from, via, to], false);
      for (const r of viaRoutes) {
        collected.push({ ...r, via: [via] });
      }
    }
  } catch {
    /* fallback below */
  }

  // Dédupliquer (distance/durée proches)
  const unique: typeof collected = [];
  for (const r of collected.sort(
    (a, b) => (a.durationMinutes ?? 999) - (b.durationMinutes ?? 999)
  )) {
    const fp = routeFingerprint(r);
    if (unique.some((u) => routeFingerprint(u) === fp)) continue;
    if (
      unique.some(
        (u) =>
          Math.abs(u.distanceKm - r.distanceKm) < 1.2 &&
          Math.abs((u.durationMinutes ?? 0) - (r.durationMinutes ?? 0)) < 3
      )
    ) {
      continue;
    }
    unique.push(r);
    if (unique.length >= 5) break;
  }

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
  const byLong = [...unique].sort(
    (a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0)
  );

  const pick: DrivingRoute[] = [];
  const used = new Set<string>();

  const add = (
    r: (typeof unique)[0],
    kind: DrivingRoute['kind'],
    label: string
  ) => {
    const fp = routeFingerprint(r);
    if (used.has(fp)) return;
    used.add(fp);
    pick.push({
      id: `${kind}-${fp}`,
      label,
      kind,
      distanceKm: r.distanceKm,
      durationMinutes: r.durationMinutes,
      coordinates: r.coordinates,
      via: r.via,
      source: 'osrm',
    });
  };

  add(byDist[0], 'eco', 'Économique');
  add(byTime[0], 'fastest', 'Plus rapide');
  // Alternatif : via Châteaugiron en priorité, sinon le plus long distinct
  const viaCg = unique.find(
    (u) =>
      u.via?.some(
        (v) =>
          Math.abs(v.latitude - VIA_CHATEAUGIRON.latitude) < 0.02 &&
          Math.abs(v.longitude - VIA_CHATEAUGIRON.longitude) < 0.02
      )
  );
  const viaPref = viaCg || unique.find((u) => u.via?.length);
  if (viaPref) {
    add(
      viaPref,
      'alternate',
      viaCg ? 'Via Châteaugiron' : 'Alternatif'
    );
  } else if (byLong[0]) add(byLong[0], 'alternate', 'Plus long');

  // Garantir 2–3 options si possible
  for (const r of unique) {
    if (pick.length >= 3) break;
    add(r, 'alternate', 'Autre itinéraire');
  }

  // Éco en premier (défaut UX / proche Google Maps)
  return [...pick].sort((a, b) => {
    const rank = (k: DrivingRoute['kind']) =>
      k === 'eco' ? 0 : k === 'fastest' ? 1 : 2;
    return rank(a.kind) - rank(b.kind);
  }).slice(0, 3);
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

/** Itinéraire complet (géométrie) pour affichage carte — 1er = plus rapide. */
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
    const hit = alts.find((a) => a.via?.length) || alts[0];
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
  const best = alts[0];
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
