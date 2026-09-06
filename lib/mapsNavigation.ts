/**
 * Lance Google Maps en navigation guidée.
 * Android : si waypoints (itinéraire alternatif / éco) → classique saddr/daddr d’abord,
 * sinon google.navigation: (fiable Blackview).
 */
import { Linking, Platform } from 'react-native';

export type MapsLatLng = { latitude: number; longitude: number };

function fmt(p: MapsLatLng): string {
  return `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`;
}

/** Waypoints « via » pour biaiser l’itinéraire. */
export function buildViaWaypoints(
  routeCoords: MapsLatLng[] | undefined,
  explicitVia?: MapsLatLng[]
): MapsLatLng[] {
  if (explicitVia?.length) return explicitVia.slice(0, 2);
  if (!routeCoords || routeCoords.length < 8) return [];
  const n = routeCoords.length;
  return [routeCoords[Math.floor(n * 0.4)]].filter(Boolean);
}

/** URL HTTPS directions (web / iOS / fallback). */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  navigate?: boolean;
}): string {
  if (opts.origin || (opts.waypoints && opts.waypoints.length)) {
    const segs: string[] = [];
    if (opts.origin) segs.push(fmt(opts.origin));
    else segs.push('Current+Location');
    for (const w of (opts.waypoints || []).slice(0, 2)) segs.push(fmt(w));
    segs.push(fmt(opts.destination));
    return `https://www.google.com/maps/dir/${segs.join('/')}`;
  }
  const parts = [
    'api=1',
    `destination=${fmt(opts.destination)}`,
    'travelmode=driving',
  ];
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
 */
export async function launchGoogleMapsNavigation(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  label?: string;
}): Promise<boolean> {
  const dest = fmt(opts.destination);
  const wps = opts.waypoints || [];
  const hasVia = wps.length > 0;

  if (Platform.OS === 'android') {
    // Avec via (éco / alternatif) : ouvrir l’itinéraire guidé avec passages
    // avant le schéma navigation simple (qui ignore les waypoints).
    if (hasVia) {
      const origin = opts.origin ? fmt(opts.origin) : 'Current+Location';
      const via = wps.map((p) => fmt(p)).join('+to:');
      const classic =
        `https://maps.google.com/maps?saddr=${origin}` +
        `&daddr=${via}+to:${dest}&dirflg=d`;
      if (await tryOpen(classic)) return true;

      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin: opts.origin,
        waypoints: wps,
        navigate: false,
      });
      if (await tryOpen(pathUrl)) return true;
    }

    // Sans via (ou fallback) : navigation turn-by-turn native
    if (await tryOpen(`google.navigation:q=${dest}&mode=d`)) {
      return true;
    }

    const classic = `https://maps.google.com/maps?daddr=${dest}&dirflg=d`;
    if (await tryOpen(classic)) return true;

    return tryOpen(`geo:0,0?q=${dest}`);
  }

  if (Platform.OS === 'ios') {
    if (hasVia && opts.origin) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin: opts.origin,
        waypoints: wps,
        navigate: true,
      });
      if (await tryOpen(pathUrl)) return true;
    }
    const gmaps = `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
    if (await tryOpen(gmaps)) return true;
  }

  return tryOpen(
    buildGoogleMapsDirUrl({
      destination: opts.destination,
      origin: opts.origin,
      waypoints: wps,
      navigate: true,
    })
  );
}
