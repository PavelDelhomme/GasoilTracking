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
 * Stations autour d’un point — open data data.economie.gouv.fr
 */
export async function fetchCheapestStations(opts: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  fuel?: FuelType;
  limit?: number;
}): Promise<FuelStationPrice[]> {
  const radius = Math.max(1, Math.min(opts.radiusKm ?? 10, 30));
  const limit = opts.limit ?? 15;
  const fuelKey = mapAppFuel(opts.fuel || 'diesel');

  const where = `within_distance(geom,geom'POINT(${opts.longitude} ${opts.latitude})',${radius}km)`;
  const url =
    'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
    'prix-des-carburants-en-france-flux-instantane-v2/records' +
    `?where=${encodeURIComponent(where)}&limit=${limit * 2}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API prix carburants ${res.status}`);
  const data = await res.json();
  const results = (data.results || []) as Record<string, unknown>[];

  const stations: FuelStationPrice[] = results.map((r) => {
    const geom = r.geom as { lat?: number; lon?: number } | undefined;
    const lat = geom?.lat ?? Number(r.latitude) ?? 0;
    const lon = geom?.lon ?? Number(r.longitude) ?? 0;
    const prices: FuelStationPrice['prices'] = {};
    if (r.gazole_prix != null) prices.gazole = Number(r.gazole_prix);
    if (r.sp95_prix != null) prices.sp95 = Number(r.sp95_prix);
    if (r.e10_prix != null) prices.e10 = Number(r.e10_prix);
    if (r.sp98_prix != null) prices.sp98 = Number(r.sp98_prix);
    if (r.e85_prix != null) prices.e85 = Number(r.e85_prix);
    if (r.gplc_prix != null) prices.gplc = Number(r.gplc_prix);

    const dLat = ((lat - opts.latitude) * Math.PI) / 180;
    const dLon = ((lon - opts.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((opts.latitude * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return {
      id: String(r.id || `${lat},${lon}`),
      name: String(r.enseigne || r.nom || r.name || 'Station'),
      address: String(r.adresse || r.address || ''),
      city: String(r.ville || r.city || ''),
      latitude: lat,
      longitude: lon,
      prices,
      distanceKm: Math.round(distanceKm * 10) / 10,
    };
  });

  return stations
    .filter((s) => s.prices[fuelKey] != null)
    .sort((a, b) => (a.prices[fuelKey]! - b.prices[fuelKey]!) || (a.distanceKm! - b.distanceKm!))
    .slice(0, limit);
}
