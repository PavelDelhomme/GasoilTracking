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

/** Libellé lieu pour affichage trajet (évite « Départ » / « Arrivée » génériques). */
export function tripPlaceLabel(
  name: string | undefined | null,
  fallbackCoords?: { latitude: number; longitude: number } | null,
  role: 'origin' | 'destination' = 'origin'
): string {
  const n = (name || '').trim();
  if (n && !/^départ$/i.test(n) && !/^arrivée$/i.test(n) && n !== '?') return n;
  if (fallbackCoords) {
    return `${fallbackCoords.latitude.toFixed(5)}, ${fallbackCoords.longitude.toFixed(5)}`;
  }
  return role === 'origin' ? 'Lieu de départ' : 'Lieu d’arrivée';
}
