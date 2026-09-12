/** Plein réel 206 — Intermarché La Guerche, 12 sept. 2026. */
export const INTERMARCHE_GUERCHE_FILL = {
  day: '2026-09-12',
  liters: 34.62,
  totalCost: 75.09,
  pricePerLiter: 2.169,
  stationName: 'Intermarché Super La Guerche de Bretagne',
};

export const PERSONAL_DAY_TRIPS_2026_09_12 = [
  {
    key: 'home-inter',
    startTime: '2026-09-12T11:55:00+02:00',
    endTime: '2026-09-12T12:39:00+02:00',
    distanceKm: 49,
    originName: 'Domicile — 1 Rue Camille Saint-Saëns, Thorigné-Fouillard',
    destinationName: 'Intermarché Super La Guerche de Bretagne',
    originRe: /thorign|domicile|saint-sa[eë]ns|camille/i,
    destRe: /guerche|inter/i,
    note: 'Saisie cloud — aller domicile → Intermarché (12 sept. 2026)',
  },
  {
    key: 'inter-beaujoire',
    startTime: '2026-09-12T13:20:00+02:00',
    endTime: '2026-09-12T14:52:00+02:00',
    distanceKm: 82,
    originName: 'Intermarché Super La Guerche de Bretagne',
    destinationName: 'Carrefour Nantes La Beaujoire',
    originRe: /guerche|inter/i,
    destRe: /carrefour/i,
    note: 'Après le plein — La Guerche → aire Forges-la-Forêt (35640, ~12 km) → Carrefour Beaujoire (82 km)',
  },
  {
    key: 'carrefour-expo',
    startTime: '2026-09-12T14:55:00+02:00',
    endTime: '2026-09-12T15:01:00+02:00',
    distanceKm: 3.5,
    originName: 'Carrefour Nantes La Beaujoire',
    destinationName: 'Parc des expositions de la Beaujoire',
    originRe: /carrefour/i,
    destRe: /expo|exposition/i,
    note: 'Carrefour Beaujoire → Parc des expositions de la Beaujoire (3,5 km)',
  },
] as const;

export function hasMatchingTrip(
  trips: Array<{ vehicleId: number; startTime?: string; originName?: string; destinationName?: string }>,
  vehicleId: number,
  spec: { originRe: RegExp; destRe: RegExp; day?: string }
): boolean {
  const day = spec.day || '2026-09-12';
  return trips.some((t) => {
    if (Number(t.vehicleId) !== Number(vehicleId)) return false;
    if (String(t.startTime || '').slice(0, 10) !== day) return false;
    return spec.originRe.test(`${t.originName || ''}`) && spec.destRe.test(`${t.destinationName || ''}`);
  });
}

export function hasMatchingFillUp(
  fills: Array<{ vehicleId: number; date: string; liters: number; totalCost: number }>,
  vehicleId: number,
  spec: { day: string; liters: number; totalCost: number },
  eps = 0.05
): boolean {
  return fills.some((f) => {
    if (Number(f.vehicleId) !== Number(vehicleId)) return false;
    if (String(f.date).slice(0, 10) !== spec.day) return false;
    return (
      Math.abs(Number(f.liters) - spec.liters) <= eps &&
      Math.abs(Number(f.totalCost) - spec.totalCost) <= eps
    );
  });
}
