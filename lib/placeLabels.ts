/**
 * Résout un libellé de lieu : place enregistrée proche > reverse geocode > fallback.
 * Garde l’adresse exacte séparément pour le détail trajet.
 */
import type { Place } from '@/types';
import { reverseGeocode } from '@/lib/geocode';

function haversineM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Place enregistrée dans un rayon (m). */
export function nearestRegisteredPlace(
  places: Place[],
  coords: { latitude: number; longitude: number },
  maxMeters = 150
): Place | null {
  let best: { p: Place; d: number } | null = null;
  for (const p of places) {
    if (p.latitude == null || p.longitude == null) continue;
    const d = haversineM(coords, { latitude: p.latitude, longitude: p.longitude });
    if (d <= maxMeters && (!best || d < best.d)) best = { p, d };
  }
  return best?.p ?? null;
}

export type ResolvedPlaceLabel = {
  /** Titre court (Maison, Travail, nom place, ou adresse courte). */
  displayName: string;
  /** Adresse / détail exact (Nominatim ou address place). */
  detailAddress: string | null;
  matchedPlaceId: number | null;
};

/**
 * Nom affichable pour un bout de trajet.
 * - Si place enregistrée à proximité → son nom (Maison / Travail / …)
 * - Sinon reverse geocode (si online)
 * - Sinon fallback générique
 */
export async function resolveTripEndpointLabel(opts: {
  places: Place[];
  coords: { latitude: number; longitude: number } | null | undefined;
  existingName?: string | null;
  role: 'origin' | 'destination';
  /** Timeout reverse geocode ms (offline-friendly). */
  geocodeTimeoutMs?: number;
}): Promise<ResolvedPlaceLabel> {
  const fallback = opts.role === 'origin' ? 'Lieu de départ' : 'Lieu d’arrivée';
  const coords = opts.coords;
  const existing = (opts.existingName || '').trim();

  if (coords) {
    const near = nearestRegisteredPlace(opts.places, coords, 150);
    if (near) {
      return {
        displayName: near.name,
        detailAddress: near.address?.trim() || existing || null,
        matchedPlaceId: near.id,
      };
    }
  }

  // Nom déjà utile (pas générique / pas coords brutes)
  if (
    existing &&
    !/^départ$/i.test(existing) &&
    !/^arrivée$/i.test(existing) &&
    !/^lieu d[’']/i.test(existing) &&
    !/^position de départ$/i.test(existing) &&
    !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(existing)
  ) {
    return { displayName: existing, detailAddress: null, matchedPlaceId: null };
  }

  if (coords) {
    const timeout = opts.geocodeTimeoutMs ?? 3500;
    try {
      const label = await Promise.race([
        reverseGeocode(coords.latitude, coords.longitude),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
      ]);
      if (label && label.trim()) {
        // Si départ ≈ arrivée (même adresse), garder l’adresse mais différencier le rôle
        return {
          displayName: label.trim(),
          detailAddress: label.trim(),
          matchedPlaceId: null,
        };
      }
    } catch {
      /* offline */
    }
  }

  return { displayName: fallback, detailAddress: existing || null, matchedPlaceId: null };
}

/** Si départ et arrivée sont quasi identiques, différencie les titres. */
export function disambiguateSameEndpoints(
  origin: ResolvedPlaceLabel,
  destination: ResolvedPlaceLabel,
  distanceKm: number
): { origin: ResolvedPlaceLabel; destination: ResolvedPlaceLabel } {
  const sameName =
    origin.displayName.trim().toLowerCase() === destination.displayName.trim().toLowerCase();
  const shortHop = distanceKm < 0.4;
  if (!sameName && !shortHop) return { origin, destination };
  if (sameName || (shortHop && origin.matchedPlaceId && origin.matchedPlaceId === destination.matchedPlaceId)) {
    return {
      origin: {
        ...origin,
        displayName:
          origin.matchedPlaceId != null
            ? `${origin.displayName} (départ)`
            : origin.displayName === 'Lieu de départ'
              ? origin.displayName
              : `${origin.displayName} · départ`,
      },
      destination: {
        ...destination,
        displayName:
          destination.matchedPlaceId != null
            ? `${destination.displayName} (retour)`
            : 'Retour · même secteur',
      },
    };
  }
  return { origin, destination };
}
