/**
 * Guidance navigation (flèche + manœuvres OSRM) à partir du tracé / destination.
 */
import { haversineDistance } from '@/lib/geoMath';

export type Geo = { latitude: number; longitude: number };

/** Manœuvre (compatible OSRM / DrivingRoute.steps). */
export type NavManeuver = {
  instruction: string;
  distanceM: number;
  location: Geo;
  type: string;
  modifier?: string;
  name?: string;
};

export type NavGuidance = {
  /** Rotation de la flèche « navigate » (0 = haut = cible devant) */
  arrowRotateDeg: number;
  title: string;
  subtitle: string;
  distanceLabel: string;
  remainingKm: number;
  /** Limite panneau (si fournie par l’appelant) — affichage HUD séparé */
  nextManeuver?: NavManeuver | null;
};

/** Écart max au corridor prévu avant de considérer un autre itinéraire volontaire. */
export const OFF_CORRIDOR_KM = 0.18;

/** Cap géodésique from→to en degrés [0, 360). */
export function bearingDeg(from: Geo, to: Geo): number {
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Cap relatif cible vs direction de marche (−180…180, 0 = devant). */
export function relativeBearing(headingDeg: number, targetBearingDeg: number): number {
  let d = targetBearingDeg - headingDeg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function formatRemainingKm(km: number): string {
  if (km < 0.05) return '< 50 m';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function turnHint(rel: number, offCorridor: boolean): string {
  const a = Math.abs(rel);
  if (a < 25) return 'Tout droit';
  if (a < 65) return rel > 0 ? 'Légèrement à droite' : 'Légèrement à gauche';
  if (a < 120) return rel > 0 ? 'Tournez à droite' : 'Tournez à gauche';
  // Hors corridor volontaire : ne pas crier « Demi-tour »
  if (offCorridor) return 'Vers la destination';
  return 'Demi-tour';
}

/** Prochaine manœuvre OSRM encore devant l’utilisateur. */
export function findUpcomingManeuver(
  user: Geo,
  steps: NavManeuver[] | undefined | null
): NavManeuver | null {
  if (!steps?.length) return null;
  let nearestIdx = 0;
  let best = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = haversineDistance(
      user.latitude,
      user.longitude,
      steps[i].location.latitude,
      steps[i].location.longitude
    );
    if (d < best) {
      best = d;
      nearestIdx = i;
    }
  }
  // Si on est déjà sur/après la manœuvre, prendre la suivante
  const start = best < 0.035 ? nearestIdx + 1 : nearestIdx;
  for (let i = start; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === 'depart') continue;
    const d = haversineDistance(
      user.latitude,
      user.longitude,
      s.location.latitude,
      s.location.longitude
    );
    if (d >= 0.03 || s.type === 'arrive') return s;
  }
  return steps[steps.length - 1] || null;
}

/**
 * Calcule flèche + texte pour la barre live.
 * `headingDeg` : direction de déplacement (ou null → flèche absolue N=0).
 * `steps` : manœuvres OSRM si dispo (guidage type Maps).
 */
export function computeNavGuidance(opts: {
  user: Geo | null;
  destination: Geo | null;
  destinationLabel?: string | null;
  route: Geo[];
  headingDeg?: number | null;
  steps?: NavManeuver[] | null;
}): NavGuidance | null {
  const { user, destination, destinationLabel, route, headingDeg, steps } = opts;
  if (!user) {
    return {
      arrowRotateDeg: 0,
      title: 'Localisation…',
      subtitle: destinationLabel || 'En attente GPS',
      distanceLabel: '—',
      remainingKm: 0,
    };
  }

  // Point cible : prochain point du tracé prévu à > 40 m, sinon destination
  let target: Geo | null = null;
  let nearestDistKm = Infinity;
  if (route.length >= 2) {
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineDistance(
        user.latitude,
        user.longitude,
        route[i].latitude,
        route[i].longitude
      );
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    nearestDistKm = best;
    for (let i = nearest; i < route.length; i++) {
      const d = haversineDistance(
        user.latitude,
        user.longitude,
        route[i].latitude,
        route[i].longitude
      );
      if (d >= 0.04) {
        target = route[i];
        break;
      }
    }
    if (!target) target = route[route.length - 1];
  }
  const offCorridor = route.length >= 2 && nearestDistKm > OFF_CORRIDOR_KM;
  // Autre itinéraire volontaire → viser la destination, pas le corridor abandonné
  if (offCorridor && destination) {
    target = destination;
  }
  if (!target && destination) target = destination;
  if (!target) {
    return {
      arrowRotateDeg: headingDeg ?? 0,
      title: 'Suivi libre',
      subtitle: 'Pas de destination — GPS actif',
      distanceLabel: '—',
      remainingKm: 0,
    };
  }

  const end = destination || route[route.length - 1] || target;
  const remainingKm =
    Math.round(
      haversineDistance(user.latitude, user.longitude, end.latitude, end.longitude) * 10
    ) / 10;

  const upcoming = !offCorridor ? findUpcomingManeuver(user, steps) : null;
  if (upcoming) {
    target = upcoming.location;
  }

  const targetBearing = bearingDeg(user, target);
  const heading = headingDeg != null && Number.isFinite(headingDeg) ? headingDeg : targetBearing;
  const rel = relativeBearing(heading, targetBearing);

  const toManeuverKm = upcoming
    ? haversineDistance(
        user.latitude,
        user.longitude,
        upcoming.location.latitude,
        upcoming.location.longitude
      )
    : remainingKm;

  const title = upcoming?.instruction || turnHint(rel, offCorridor);
  const street = upcoming?.name?.trim();
  const subtitleParts = [
    destinationLabel?.trim() || null,
    street && street !== destinationLabel?.trim() ? street : null,
    remainingKm > 0 ? `Reste ${formatRemainingKm(remainingKm)}` : null,
    offCorridor ? 'Itinéraire libre' : null,
  ].filter(Boolean);

  return {
    arrowRotateDeg: rel,
    title,
    subtitle: subtitleParts.join(' · ') || 'Destination',
    distanceLabel: formatRemainingKm(toManeuverKm),
    remainingKm,
    nextManeuver: upcoming,
  };
}

/** Cap depuis les 2 derniers points GPS (mouvement). */
export function headingFromTrail(points: Geo[]): number | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const d = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
  if (d < 0.008) return null; // < 8 m : bruit
  return bearingDeg(a, b);
}
