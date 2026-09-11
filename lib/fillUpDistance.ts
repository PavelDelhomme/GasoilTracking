import type { FillUp, Trip } from '@/types';

type TripForDistance = Pick<
  Trip,
  'startTime' | 'endTime' | 'distanceKm' | 'isActive' | 'status'
>;

export function fillUpDistance(prev: FillUp, curr: FillUp): number | null {
  if (curr.odometer != null && prev.odometer != null && curr.odometer > prev.odometer) {
    return curr.odometer - prev.odometer;
  }
  if (curr.distanceSinceLastKm != null && curr.distanceSinceLastKm > 0) {
    return curr.distanceSinceLastKm;
  }
  return null;
}

/**
 * Km de trajets confirmés entre deux instants (ISO).
 * `sinceIso` null = depuis le début (ex. premier plein).
 */
export function sumTripKmBetween(
  trips: TripForDistance[],
  sinceIso: string | null,
  untilIso: string
): number {
  const since = sinceIso ? Date.parse(sinceIso) : 0;
  const until = Date.parse(untilIso);
  if (!Number.isFinite(until)) return 0;
  let sum = 0;
  for (const t of trips) {
    if (t.isActive || t.status === 'rejected' || !(t.distanceKm > 0)) continue;
    const when = Date.parse(t.endTime || t.startTime);
    if (!Number.isFinite(when)) continue;
    if (when > since && when <= until) sum += t.distanceKm;
  }
  return Math.round(sum * 10) / 10;
}

/** Compteur / saisie manuelle, sinon somme des trajets GPS entre les deux pleins. */
export function resolveFillUpDistanceKm(
  prev: FillUp | null,
  curr: FillUp,
  trips: TripForDistance[],
  minTripKm = 20
): number | null {
  const saneEnough = (km: number): boolean => {
    if (!(curr.liters > 0) || !(km > 0)) return km > 0;
    const l100 = (curr.liters / km) * 100;
    // Essence/diesel typique : hors 3–18 = distance très probablement incomplète
    if (curr.isFull) return l100 >= 3 && l100 <= 18;
    return l100 >= 2 && l100 <= 25;
  };

  if (prev) {
    const explicit = fillUpDistance(prev, curr);
    if (explicit && explicit > 0 && saneEnough(explicit)) return explicit;
  } else if (curr.distanceSinceLastKm != null && curr.distanceSinceLastKm > 0) {
    if (saneEnough(curr.distanceSinceLastKm)) return curr.distanceSinceLastKm;
  }
  const tripKm = sumTripKmBetween(trips, prev?.date ?? null, curr.date);
  if (tripKm >= minTripKm && saneEnough(tripKm)) return tripKm;
  return null;
}
