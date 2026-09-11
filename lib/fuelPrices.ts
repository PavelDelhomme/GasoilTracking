import type { FuelType } from '@/types';

export type FuelStationPrice = {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  prices: Partial<Record<'gazole' | 'sp95' | 'e10' | 'sp98' | 'e85' | 'gplc', number>>;
  distanceKm?: number;
};

function mapAppFuel(fuel: FuelType): keyof FuelStationPrice['prices'] {
  if (fuel === 'diesel') return 'gazole';
  if (fuel === 'gpl') return 'gplc';
  if (fuel === 'electrique') return 'e10'; // fallback display
  return 'e10';
}

/** Clé prix open-data pour le type de carburant app. */
export function fuelPriceKey(fuel: FuelType): keyof FuelStationPrice['prices'] {
  return mapAppFuel(fuel);
}

export function fuelLabel(key: string): string {
  const labels: Record<string, string> = {
    gazole: 'Gazole',
    sp95: 'SP95',
    e10: 'E10',
    sp98: 'SP98',
    e85: 'E85',
    gplc: 'GPLc',
  };
  return labels[key] || key;
}

/**
 * Prix au litre raisonnable (EUR-like). Évite les saisies absurdes
 * du type 22 €/L dues à une virgule / conversion.
 */
export function isSaneFuelPricePerLiter(ppl: number, countryCode = 'FR'): boolean {
  if (!Number.isFinite(ppl) || ppl <= 0) return false;
  if (countryCode === 'NO' || countryCode === 'SE') return ppl >= 5 && ppl <= 40;
  if (countryCode === 'DK') return ppl >= 4 && ppl <= 30;
  if (countryCode === 'PL') return ppl >= 2 && ppl <= 12;
  if (countryCode === 'CZ') return ppl >= 10 && ppl <= 60;
  if (countryCode === 'HU') return ppl >= 200 && ppl <= 1200;
  if (countryCode === 'IS') return ppl >= 100 && ppl <= 500;
  return ppl >= 0.7 && ppl <= 3.8;
}

/** Recalcule litres à partir du ticket + prix station (arrondi 2 décimales). */
export function litersFromTicket(totalCost: number, pricePerLiter: number): number {
  if (totalCost <= 0 || pricePerLiter <= 0) return 0;
  return Math.round((totalCost / pricePerLiter) * 100) / 100;
}

/**
 * Stations autour d’un point — open data data.economie.gouv.fr (France uniquement).
 */
export function isFrenchFuelOpenDataAvailable(countryCode: string): boolean {
  return countryCode === 'FR';
}

/** Coords open-data : geom WGS84, sinon latitude/longitude parfois en micro-degrés. */
function parseStationCoords(r: Record<string, unknown>): { lat: number; lon: number } | null {
  const geom = r.geom as { lat?: number; lon?: number } | undefined;
  if (geom && Number.isFinite(geom.lat) && Number.isFinite(geom.lon)) {
    return { lat: Number(geom.lat), lon: Number(geom.lon) };
  }
  let lat = Number(r.latitude);
  let lon = Number(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Jeu de données : 4806000 = 48.06000°
  if (Math.abs(lat) > 180 || Math.abs(lon) > 180) {
    lat = lat / 100000;
    lon = lon / 100000;
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function stationDisplayName(r: Record<string, unknown>, city: string, address: string): string {
  const brand = String(r.enseigne || r.nom || r.name || '').trim();
  if (brand && brand.toLowerCase() !== 'station') return brand;
  if (address && city) return `${address} · ${city}`;
  if (city) return `Station · ${city}`;
  if (address) return address;
  return 'Station';
}

function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function fetchStationsRaw(
  latitude: number,
  longitude: number,
  radiusKm: number,
  limit: number
): Promise<Record<string, unknown>[]> {
  const where = `within_distance(geom,geom'POINT(${longitude} ${latitude})',${radiusKm}km)`;
  const url =
    'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
    'prix-des-carburants-en-france-flux-instantane-v2/records' +
    `?where=${encodeURIComponent(where)}&limit=${Math.min(100, Math.max(limit * 3, 20))}`;

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
  let res: Response;
  try {
    res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`API prix carburants ${res.status}`);
  const data = await res.json();
  return (data.results || []) as Record<string, unknown>[];
}

function mapResults(
  results: Record<string, unknown>[],
  opts: { latitude: number; longitude: number; fuelKey: keyof FuelStationPrice['prices']; limit: number }
): FuelStationPrice[] {
  const stations: FuelStationPrice[] = [];
  for (const r of results) {
    const coords = parseStationCoords(r);
    if (!coords) continue;
    const { lat, lon } = coords;
    const prices: FuelStationPrice['prices'] = {};
    if (r.gazole_prix != null) prices.gazole = Number(r.gazole_prix);
    if (r.sp95_prix != null) prices.sp95 = Number(r.sp95_prix);
    if (r.e10_prix != null) prices.e10 = Number(r.e10_prix);
    if (r.sp98_prix != null) prices.sp98 = Number(r.sp98_prix);
    if (r.e85_prix != null) prices.e85 = Number(r.e85_prix);
    if (r.gplc_prix != null) prices.gplc = Number(r.gplc_prix);

    const address = String(r.adresse || r.address || '');
    const city = String(r.ville || r.city || '');
    stations.push({
      id: String(r.id || `${lat},${lon}`),
      name: stationDisplayName(r, city, address),
      address,
      city,
      latitude: lat,
      longitude: lon,
      prices,
      distanceKm: Math.round(haversineKm(opts.latitude, opts.longitude, lat, lon) * 10) / 10,
    });
  }

  const withFuel = stations.filter((s) => s.prices[opts.fuelKey] != null);
  const pool = withFuel.length ? withFuel : stations; // fallback : montrer quand même
  return pool
    .sort(
      (a, b) =>
        (a.prices[opts.fuelKey] ?? 99) - (b.prices[opts.fuelKey] ?? 99) ||
        (a.distanceKm ?? 99) - (b.distanceKm ?? 99)
    )
    .slice(0, opts.limit);
}

export async function fetchCheapestStations(opts: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  fuel?: FuelType;
  limit?: number;
  countryCode?: string;
}): Promise<FuelStationPrice[]> {
  if (opts.countryCode && !isFrenchFuelOpenDataAvailable(opts.countryCode)) {
    throw new Error(
      'Les prix stations open data ne sont disponibles qu’en France. Saisissez le montant manuellement.'
    );
  }
  const baseRadius = Math.max(1, Math.min(opts.radiusKm ?? 12, 30));
  const limit = opts.limit ?? 15;
  const fuelKey = mapAppFuel(opts.fuel || 'diesel');

  // 1ʳᵉ passe + élargissement auto si zone trop vide (ex. GPS imprécis / campagne)
  const radii = Array.from(
    new Set([baseRadius, Math.min(30, Math.max(baseRadius, 15)), Math.min(30, Math.max(baseRadius, 25))])
  ).sort((a, b) => a - b);

  let last: FuelStationPrice[] = [];
  let lastErr: Error | null = null;
  for (const radius of radii) {
    try {
      const results = await fetchStationsRaw(opts.latitude, opts.longitude, radius, limit);
      last = mapResults(results, {
        latitude: opts.latitude,
        longitude: opts.longitude,
        fuelKey,
        limit,
      });
      if (last.length > 0) return last;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error('API stations');
    }
  }
  if (lastErr && !last.length) throw lastErr;
  return last;
}
