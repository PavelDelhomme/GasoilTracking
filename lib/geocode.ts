/**
 * Géocodage inverse via Nominatim (OpenStreetMap) — gratuit, sans clé.
 * Respecte ~1 req/s : à utiliser au démarrage / fin de trajet, pas en boucle.
 */
import { searchPlaces } from '@/lib/placeSearch';

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

type ReverseResult = { label: string; countryCode: string | null };

const reverseCache = new Map<string, ReverseResult>();

/** Géocodage inverse complet (label + pays ISO). */
export async function reverseGeocodeDetails(
  lat: number,
  lon: number
): Promise<ReverseResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = cacheKey(lat, lon);
  if (reverseCache.has(key)) return reverseCache.get(key)!;
  // Ancien cache label-only : on refetch pour récupérer le pays

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Nominatim demande un User-Agent identifiable
        'User-Agent': 'GasoilTracking/1.4 (personal fuel app)',
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
    if (!label) return null;
    const cc = (a.country_code || '').toUpperCase() || null;
    const result = { label, countryCode: cc };
    cache.set(key, label);
    reverseCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/** Adresse courte lisible depuis des coords GPS. */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const details = await reverseGeocodeDetails(lat, lon);
  return details?.label ?? null;
}

/** Code pays ISO (ex. FR) depuis GPS — pour devise auto. */
export async function reverseCountryCode(lat: number, lon: number): Promise<string | null> {
  const details = await reverseGeocodeDetails(lat, lon);
  return details?.countryCode ?? null;
}

/** Géocodage direct : ville / adresse / POI → coordonnées (Photon + Nominatim). */
export async function forwardGeocode(
  query: string,
  bias?: { latitude: number; longitude: number } | null
): Promise<{ latitude: number; longitude: number; label: string } | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  try {
    const hits = await searchPlaces(q, { limit: 5, bias });
    const hit = hits.find((h) => h.latitude != null && h.longitude != null);
    if (!hit || hit.latitude == null || hit.longitude == null) return null;
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      label: hit.label || q,
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
