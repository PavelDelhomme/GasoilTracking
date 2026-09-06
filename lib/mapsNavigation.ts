/**
 * Lance Google Maps en navigation guidée.
 * Sur Android (Blackview etc.) : éviter intent:// et dir_action fragile →
 * privilégier google.navigation: qui démarre vraiment la nav.
 */
import { Linking, Platform } from 'react-native';

export type MapsLatLng = { latitude: number; longitude: number };

function fmt(p: MapsLatLng): string {
  return `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`;
}

/** Waypoints « via » pour biaiser l’itinéraire (quand le schéma le permet). */
export function buildViaWaypoints(
  routeCoords: MapsLatLng[] | undefined,
  explicitVia?: MapsLatLng[]
): MapsLatLng[] {
  if (explicitVia?.length) return explicitVia.slice(0, 2);
  if (!routeCoords || routeCoords.length < 8) return [];
  const n = routeCoords.length;
  return [routeCoords[Math.floor(n * 0.4)]].filter(Boolean);
}

/** URL HTTPS directions (web / iOS / fallback). Sans dir_action (souvent « lien incompatible »). */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  navigate?: boolean;
}): string {
  // Format chemin : plus toléré par Maps Android que api=1 + via:
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
  // dir_action=navigate cassé sur certains Maps Android (« lien incompatible »)
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
 * Android : google.navigation en premier (fiable Blackview / Samsung).
 */
export async function launchGoogleMapsNavigation(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  label?: string;
}): Promise<boolean> {
  const dest = fmt(opts.destination);
  const wps = opts.waypoints || [];

  if (Platform.OS === 'android') {
    // 1) Navigation turn-by-turn native — le plus fiable
    if (await tryOpen(`google.navigation:q=${dest}&mode=d`)) {
      return true;
    }

    // 2) Ancien format saddr/daddr (+ via éventuel)
    if (wps.length && opts.origin) {
      const via = wps.map((p) => fmt(p)).join('+to:');
      const classic =
        `https://maps.google.com/maps?saddr=${fmt(opts.origin)}` +
        `&daddr=${via}+to:${dest}&dirflg=d`;
      if (await tryOpen(classic)) return true;
    } else {
      const classic = `https://maps.google.com/maps?daddr=${dest}&dirflg=d`;
      if (await tryOpen(classic)) return true;
    }

    // 3) Chemin /dir/A/B/C
    const pathUrl = buildGoogleMapsDirUrl({
      destination: opts.destination,
      origin: opts.origin,
      waypoints: wps,
      navigate: false,
    });
    if (await tryOpen(pathUrl)) return true;

    // 4) geo:
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
      waypoints: wps,
      navigate: true,
    })
  );
}
