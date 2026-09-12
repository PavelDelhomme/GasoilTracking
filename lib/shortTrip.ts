/**
 * Règle trajet trop court : peu ou pas d’avancée GPS.
 * Seuil aligné plan (< 500 m) — dialog UI côté trip.tsx.
 */

/** Distance sous laquelle on propose de supprimer le trajet. */
export const SHORT_TRIP_DELETE_KM = 0.5;

/** true si distanceKm < 0,5 km (trajet sans avancée réelle).
 *  Un trajet long (durée ≥ 5 min) n’est jamais traité comme « oubli » :
 *  le GPS a pu rater les points — on conserve l’entrée. */
export function shouldDeleteShortTrip(
  distanceKm: number,
  durationMinutes?: number
): boolean {
  if (!Number.isFinite(distanceKm)) return false;
  if (
    durationMinutes != null &&
    Number.isFinite(durationMinutes) &&
    durationMinutes >= 5
  ) {
    return false;
  }
  return distanceKm < SHORT_TRIP_DELETE_KM;
}
