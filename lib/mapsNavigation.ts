/**
 * Lance Google Maps en navigation guidée (itinéraire choisi).
 */
import { Linking, Platform } from 'react-native';

export type MapsLatLng = { latitude: number; longitude: number };

function fmt(p: MapsLatLng): string {
  return `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`;
}

/** Waypoints « via » (passage sans arrêt) pour biaiser l’itinéraire Maps. */
export function buildViaWaypoints(
  routeCoords: MapsLatLng[] | undefined,
  explicitVia?: MapsLatLng[]
): MapsLatLng[] {
  if (explicitVia?.length) return explicitVia.slice(0, 3);
  if (!routeCoords || routeCoords.length < 6) return [];
  const n = routeCoords.length;
  const a = routeCoords[Math.floor(n * 0.33)];
  const b = routeCoords[Math.floor(n * 0.66)];
  return [a, b].filter(Boolean);
}

/** URL Directions API avec démarrage navigation. */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  navigate?: boolean;
}): string {
  const parts: string[] = [
    'api=1',
    `destination=${fmt(opts.destination)}`,
    'travelmode=driving',
  ];
  if (opts.navigate !== false) parts.push('dir_action=navigate');
  if (opts.origin) parts.push(`origin=${fmt(opts.origin)}`);
  const wps = (opts.waypoints || []).slice(0, 3);
  if (wps.length) {
    // via: = passage sans arrêt
    const wp = wps.map((p) => `via:${fmt(p)}`).join('|');
    parts.push(`waypoints=${encodeURIComponent(wp)}`);
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
 * Ouvre Google Maps et démarre la navigation turn-by-turn si possible.
 * Android : Intent forcé vers l’app Maps (pas le navigateur).
 */
export async function launchGoogleMapsNavigation(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  label?: string;
}): Promise<boolean> {
  const httpsUrl = buildGoogleMapsDirUrl({
    destination: opts.destination,
    origin: opts.origin,
    waypoints: opts.waypoints,
    navigate: true,
  });
  const dest = fmt(opts.destination);

  if (Platform.OS === 'android') {
    // 1) Intent explicite Google Maps + navigation
    const path = httpsUrl.replace(/^https:\/\//, '');
    const intent =
      `intent://${path}` +
      '#Intent;scheme=https;package=com.google.android.apps.maps;end';
    if (await tryOpen(intent)) return true;

    // 2) Schéma navigation (démarre direct, sans waypoints)
    if (await tryOpen(`google.navigation:q=${dest}&mode=d`)) return true;

    // 3) HTTPS classique
    if (await tryOpen(httpsUrl)) return true;
    return false;
  }

  if (Platform.OS === 'ios') {
    const gmaps = `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
    if (await tryOpen(gmaps)) return true;
    const gmapsUrl = httpsUrl.replace(
      'https://www.google.com/maps',
      'comgooglemapsurl://maps.google.com'
    );
    if (await tryOpen(gmapsUrl)) return true;
  }

  return tryOpen(httpsUrl);
}
