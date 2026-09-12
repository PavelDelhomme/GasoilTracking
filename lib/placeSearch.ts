/**
 * Recherche de lieux — Photon (POI / abréviations) + Nominatim, sans React Native.
 * Debounce côté UI : ne pas appeler à chaque frappe.
 */

export type SuggestHit = {
  id: string;
  label: string;
  subtitle?: string;
  source: 'geo' | 'contact' | 'place';
  /** POI nommé (parc expo, gare…) vs simple adresse */
  kind?: 'address' | 'poi';
  latitude?: number;
  longitude?: number;
};

export type PlaceBias = { latitude: number; longitude: number };

export const PLACE_SEARCH_DEBOUNCE_MS = 550;

const UA = {
  Accept: 'application/json',
  'User-Agent': 'GasoilTracking/1.4 (personal fuel app)',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Développe les abréviations FR fréquentes (« expo » → expositions)
 * pour Nominatim / Photon.
 */
export function expandPlaceQuery(query: string): string {
  let q = query.trim().replace(/\s+/g, ' ');
  const rules: [RegExp, string][] = [
    [/\bparc(?:\s+des)?\s+expos?\b/gi, 'parc des expositions'],
    [/\bexpos?\b/gi, 'expositions'],
    [/\bccial\b/gi, 'centre commercial'],
    [/\bcentre[\s-]?com(?:mercial)?\b/gi, 'centre commercial'],
    [/\baeroports?\b/gi, 'aéroport'],
    [/\bhopitaux\b/gi, 'hôpitaux'],
    [/\bhopital\b/gi, 'hôpital'],
    [/\buniv(?:ersit[ée]s?)?\b/gi, 'université'],
    [/\bintermarche\b/gi, 'Intermarché'],
    [/\bleclerc\b/gi, 'E.Leclerc'],
  ];
  for (const [re, to] of rules) q = q.replace(re, to);
  return q.replace(/\s+/g, ' ').trim();
}

/** Requêtes à lancer : développée d’abord, originale si différente. */
export function placeQueryVariants(query: string): string[] {
  const raw = query.trim();
  if (!raw) return [];
  const expanded = expandPlaceQuery(raw);
  if (!expanded) return [raw];
  if (normalize(expanded) === normalize(raw)) return [raw];
  return [expanded, raw];
}

type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    type?: string;
  };
};

function isPoiKey(osmKey?: string): boolean {
  const k = (osmKey || '').toLowerCase();
  return (
    k === 'amenity' ||
    k === 'tourism' ||
    k === 'leisure' ||
    k === 'shop' ||
    k === 'building' ||
    k === 'landuse' ||
    k === 'office' ||
    k === 'aeroway' ||
    k === 'railway'
  );
}

export function photonFeatureToHit(f: PhotonFeature, idx: number): SuggestHit | null {
  const coords = f.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = coords[0];
  const lat = coords[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = f.properties || {};
  const city = p.city || p.district;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ').trim();
  const name = (p.name || '').trim();
  const label =
    name ||
    (street && city ? `${street}, ${city}` : street) ||
    city ||
    'Lieu';
  const extra = [street && name ? street : null, city, p.postcode].filter(Boolean).join(', ');
  const poi = isPoiKey(p.osm_key) || (!!name && p.type !== 'house' && p.type !== 'street');
  return {
    id: `photon-${p.osm_type || 'n'}-${p.osm_id || `${lat},${lon}`}-${idx}`,
    label,
    subtitle: extra && extra !== label ? extra : undefined,
    source: 'geo',
    kind: poi ? 'poi' : 'address',
    latitude: lat,
    longitude: lon,
  };
}

export function parsePhotonFeatures(features: PhotonFeature[] | undefined): SuggestHit[] {
  const out: SuggestHit[] = [];
  for (let i = 0; i < (features || []).length; i++) {
    const hit = photonFeatureToHit(features![i], i);
    if (hit) out.push(hit);
  }
  return out;
}

type NominatimRow = {
  place_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  address?: Record<string, string>;
  class?: string;
  type?: string;
};

export function nominatimRowToHit(h: NominatimRow): SuggestHit | null {
  if (!h.lat || !h.lon) return null;
  const a = h.address || {};
  const road = a.road || a.pedestrian || a.residential;
  const city = a.city || a.town || a.village || a.municipality;
  const label =
    h.name ||
    (road && city ? `${road}, ${city}` : h.display_name?.split(',').slice(0, 3).join(',').trim()) ||
    '';
  if (!label) return null;
  const poi = isPoiKey(h.class) || (!!h.name && h.class !== 'highway' && h.class !== 'place');
  return {
    id: `geo-${h.place_id || `${h.lat},${h.lon}`}`,
    label,
    subtitle: h.display_name,
    source: 'geo',
    kind: poi ? 'poi' : 'address',
    latitude: Number(h.lat),
    longitude: Number(h.lon),
  };
}

function scoreHit(h: SuggestHit, tokens: string[]): number {
  const hay = normalize(`${h.label} ${h.subtitle || ''}`);
  let s = h.kind === 'poi' ? 2 : 0;
  for (const t of tokens) {
    if (!t) continue;
    if (hay.includes(t)) s += t.length >= 4 ? 4 : 2;
    else if (t.length >= 4 && hay.split(/\s+/).some((w) => w.startsWith(t.slice(0, 4)))) s += 1;
  }
  return s;
}

export function mergeSuggestHits(hits: SuggestHit[], query: string, limit: number): SuggestHit[] {
  const seen = new Set<string>();
  const uniq: SuggestHit[] = [];
  for (const h of hits) {
    const key =
      h.latitude != null && h.longitude != null && Number.isFinite(h.latitude) && Number.isFinite(h.longitude)
        ? `${h.latitude.toFixed(4)},${h.longitude.toFixed(4)}`
        : h.id;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(h);
  }
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  uniq.sort((a, b) => scoreHit(b, tokens) - scoreHit(a, tokens));
  return uniq.slice(0, limit);
}

export async function searchPhoton(
  query: string,
  opts?: { limit?: number; bias?: PlaceBias | null }
): Promise<SuggestHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const params = new URLSearchParams({
      q,
      lang: 'fr',
      limit: String(opts?.limit ?? 8),
    });
    if (opts?.bias && Number.isFinite(opts.bias.latitude) && Number.isFinite(opts.bias.longitude)) {
      params.set('lat', String(opts.bias.latitude));
      params.set('lon', String(opts.bias.longitude));
    }
    const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { headers: UA });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return parsePhotonFeatures(data.features);
  } catch {
    return [];
  }
}

export async function searchNominatim(
  query: string,
  opts?: { limit?: number; bias?: PlaceBias | null }
): Promise<SuggestHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    let url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2` +
      `&q=${encodeURIComponent(q)}&limit=${opts?.limit ?? 6}` +
      `&addressdetails=1&countrycodes=fr&accept-language=fr`;
    if (opts?.bias && Number.isFinite(opts.bias.latitude) && Number.isFinite(opts.bias.longitude)) {
      const { latitude: lat, longitude: lon } = opts.bias;
      url += `&viewbox=${lon - 0.45},${lat + 0.35},${lon + 0.45},${lat - 0.35}&bounded=0`;
    }
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimRow[];
    return (data || []).map(nominatimRowToHit).filter((h): h is SuggestHit => h != null);
  } catch {
    return [];
  }
}

/** Photon prioritaire (POI) + Nominatim + variantes d’abréviations. */
export async function searchPlaces(
  query: string,
  opts?: { limit?: number; bias?: PlaceBias | null }
): Promise<SuggestHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const limit = opts?.limit ?? 8;
  const variants = placeQueryVariants(q);
  const primary = variants[0];
  const extra = variants[1];
  const [photonPrimary, nominatimPrimary, photonExtra] = await Promise.all([
    searchPhoton(primary, { limit, bias: opts?.bias }),
    searchNominatim(primary, { limit, bias: opts?.bias }),
    extra ? searchPhoton(extra, { limit, bias: opts?.bias }) : Promise.resolve([] as SuggestHit[]),
  ]);
  return mergeSuggestHits([...photonPrimary, ...photonExtra, ...nominatimPrimary], q, limit);
}
