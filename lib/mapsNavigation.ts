/**
 * Lance Google Maps en navigation guidée.
 * Jamais d’arrêt intermédiaire : les points « via » sont des passages (via:),
 * pas des destinations (sinon Maps ajoute un stop au milieu du trajet).
 */
import { Linking, Platform } from 'react-native';

export type MapsLatLng = { latitude: number; longitude: number };

function fmt(p: MapsLatLng): string {
  return `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`;
}

/** Passage sans arrêt (préfixe Google Maps `via:`). */
export function formatViaPassThrough(p: MapsLatLng): string {
  return `via:${fmt(p)}`;
}

/**
 * Waypoints pour biaiser Maps. Uniquement des via explicites (OSRM alternatif).
 * On n’injecte plus un point à 40 % du tracé : ça créait un arrêt fantôme.
 */
export function buildViaWaypoints(
  _routeCoords: MapsLatLng[] | undefined,
  explicitVia?: MapsLatLng[]
): MapsLatLng[] {
  if (explicitVia?.length) return explicitVia.slice(0, 2);
  return [];
}

/** URL HTTPS directions (web / iOS / fallback) — via = passage, pas stop. */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  navigate?: boolean;
}): string {
  const parts = [
    'api=1',
    `destination=${fmt(opts.destination)}`,
    'travelmode=driving',
  ];
  if (opts.origin) {
    parts.push(`origin=${fmt(opts.origin)}`);
  }
  const wps = (opts.waypoints || []).slice(0, 2);
  if (wps.length) {
    parts.push(`waypoints=${wps.map(formatViaPassThrough).join('|')}`);
  }
  if (opts.navigate && Platform.OS !== 'android') {
    parts.push('dir_action=navigate');
  }
  return `https://www.google.com/maps/dir/?${parts.join('&')}`;
}

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ouvre Google Maps et démarre la navigation si possible.
 * Destination seule en priorité (pas d’arrêt ajouté).
 */
export async function launchGoogleMapsNavigation(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  label?: string;
}): Promise<boolean> {
  const dest = fmt(opts.destination);
  const wps = (opts.waypoints || []).slice(0, 2);
  const hasVia = wps.length > 0;

  if (Platform.OS === 'android') {
    // Navigation native : destination uniquement (fiable, sans stop).
    if (await tryOpen(`google.navigation:q=${dest}&mode=d`)) {
      return true;
    }

    if (hasVia) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin: opts.origin,
        waypoints: wps,
        navigate: false,
      });
      if (await tryOpen(pathUrl)) return true;
    }

    const classic = `https://maps.google.com/maps?daddr=${dest}&dirflg=d`;
    if (await tryOpen(classic)) return true;

    return tryOpen(`geo:0,0?q=${dest}`);
  }

  if (Platform.OS === 'ios') {
    const gmaps = `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
    if (await tryOpen(gmaps)) return true;
  }

  return tryOpen(
    buildGoogleMapsDirUrl({
      destination: opts.destination,
      origin: opts.origin,
      waypoints: hasVia ? wps : undefined,
      navigate: true,
    })
  );
}
