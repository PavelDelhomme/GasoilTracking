import { haversineDistance } from '@/lib/calculations';
import { forwardGeocode } from '@/lib/geocode';
import type { Place } from '@/types';

export type RoadDistanceResult = {
  distanceKm: number;
  durationMinutes: number | null;
  source: 'osrm' | 'estimate';
};

/**
 * Distance routière aller (voiture) via OSRM public — sans clé API.
 * Fallback : haversine × 1.3 (approximation route).
 */
export async function fetchDrivingDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<RoadDistanceResult> {
  const r = await fetchDrivingRoute(from, to);
  return {
    distanceKm: r.distanceKm,
    durationMinutes: r.durationMinutes,
    source: r.source,
  };
}

/** Itinéraire complet (géométrie) pour affichage carte. */
export async function fetchDrivingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<{
  distanceKm: number;
  durationMinutes: number | null;
  coordinates: { latitude: number; longitude: number }[];
  source: 'osrm' | 'estimate';
}> {
  const bird = haversineDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson&alternatives=false`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'GasoilTracking/1.4' },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        code?: string;
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: [number, number][] };
        }>;
      };
      const route = data.routes?.[0];
      const coords = (route?.geometry?.coordinates || []).map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon,
      }));
      if (data.code === 'Ok' && route?.distance != null && route.distance > 0) {
        return {
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMinutes: route.duration != null ? Math.round(route.duration / 60) : null,
          coordinates: coords,
          source: 'osrm',
        };
      }
    }
  } catch {
    /* fallback */
  }
  return {
    distanceKm: Math.round(bird * 1.3 * 10) / 10,
    durationMinutes: null,
    coordinates: [
      { latitude: from.latitude, longitude: from.longitude },
      { latitude: to.latitude, longitude: to.longitude },
    ],
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

  // Paires restantes limitées
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
