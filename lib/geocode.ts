/**
 * Géocodage inverse via Nominatim (OpenStreetMap) — gratuit, sans clé.
 * Respecte ~1 req/s : à utiliser au démarrage / fin de trajet, pas en boucle.
 */

export type GeoAddress = {
  label: string;
  road?: string;
  city?: string;
  postcode?: string;
};

const cache = new Map<string, string>();

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/** Adresse courte lisible depuis des coords GPS. */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = cacheKey(lat, lon);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Nominatim demande un User-Agent identifiable
        'User-Agent': 'GasoilTracking/1.1 (personal fuel app)',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      name?: string;
      address?: Record<string, string>;
    };
    const a = data.address || {};
    const road = a.road || a.pedestrian || a.footway || a.residential || a.hamlet;
    const num = a.house_number;
    const city = a.city || a.town || a.village || a.municipality || a.suburb;
    const parts: string[] = [];
    if (road) parts.push(num ? `${num} ${road}` : road);
    if (city) parts.push(city);
    const label =
      parts.length > 0
        ? parts.join(', ')
        : data.name ||
          (data.display_name ? data.display_name.split(',').slice(0, 3).join(',').trim() : null);
    if (label) cache.set(key, label);
    return label;
  } catch {
    return null;
  }
}

/** Géocodage direct : ville / adresse → coordonnées (Nominatim). */
export async function forwardGeocode(
  query: string
): Promise<{ latitude: number; longitude: number; label: string } | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2` +
      `&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&countrycodes=fr`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GasoilTracking/1.3 (personal fuel app)',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      name?: string;
      address?: Record<string, string>;
    }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    const a = hit.address || {};
    const city = a.city || a.town || a.village || a.municipality || hit.name;
    const label =
      city ||
      (hit.display_name ? hit.display_name.split(',').slice(0, 2).join(',').trim() : q);
    return {
      latitude: Number(hit.lat),
      longitude: Number(hit.lon),
      label,
    };
  } catch {
    return null;
  }
}

/** Libellé lieu pour affichage trajet (évite « Départ » / « Arrivée » génériques). */
export function tripPlaceLabel(
  name: string | undefined | null,
  fallbackCoords?: { latitude: number; longitude: number } | null,
  role: 'origin' | 'destination' = 'origin'
): string {
  const n = (name || '').trim();
  if (n && !/^départ$/i.test(n) && !/^arrivée$/i.test(n) && n !== '?') {
    // Évite d’afficher des coords brutes déjà stockées comme nom
    if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(n)) {
      return role === 'origin' ? 'Lieu de départ' : 'Lieu d’arrivée';
    }
    return n;
  }
  if (fallbackCoords) {
    return role === 'origin' ? 'Lieu de départ' : 'Lieu d’arrivée';
  }
  return role === 'origin' ? 'Lieu de départ' : 'Lieu d’arrivée';
}

/** Source trajet → libellé FR court. */
export function tripSourceLabel(source?: string | null): string {
  switch ((source || '').toLowerCase()) {
    case 'gps':
      return 'GPS';
    case 'manual':
      return 'Manuel';
    case 'maps_import':
    case 'maps':
      return 'Import Maps';
    case 'detected':
      return 'Détecté';
    case 'takeout':
    case 'timeline':
      return 'Timeline';
    default:
      return source ? source : '';
  }
}
