/**
 * Règle trajet trop court : peu ou pas d’avancée GPS.
 * Seuil aligné plan (< 500 m) — dialog UI côté trip.tsx.
 */

/** Distance sous laquelle on propose de supprimer le trajet. */
export const SHORT_TRIP_DELETE_KM = 0.5;

/** true si distanceKm < 0,5 km (trajet sans avancée réelle). */
export function shouldDeleteShortTrip(distanceKm: number): boolean {
  if (!Number.isFinite(distanceKm)) return false;
  return distanceKm < SHORT_TRIP_DELETE_KM;
}
