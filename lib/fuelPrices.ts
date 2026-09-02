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
 * Prix au litre raisonnable (EUR-like). Évite les saisies absurdes
 * du type 22 €/L dues à une virgule / conversion.
 */
export function isSaneFuelPricePerLiter(ppl: number, countryCode = 'FR'): boolean {
  if (!Number.isFinite(ppl) || ppl <= 0) return false;
  // Devises « chères » hors EUR : bornes plus larges
  if (countryCode === 'NO' || countryCode === 'SE') return ppl >= 5 && ppl <= 40;
  if (countryCode === 'DK') return ppl >= 4 && ppl <= 30;
  if (countryCode === 'PL') return ppl >= 2 && ppl <= 12;
  if (countryCode === 'CZ') return ppl >= 10 && ppl <= 60;
  if (countryCode === 'HU') return ppl >= 200 && ppl <= 1200;
  if (countryCode === 'IS') return ppl >= 100 && ppl <= 500;
  // EUR et assimilés
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
