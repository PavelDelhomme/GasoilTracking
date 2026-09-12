/**
 * Construction d’URL Google Maps Directions — sans dépendance React Native (testable).
 */
export type MapsLatLng = { latitude: number; longitude: number };

export function fmtLatLng(p: MapsLatLng): string {
  return `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`;
}

/** Passage sans arrêt (préfixe Google Maps `via:`). */
export function formatViaPassThrough(p: MapsLatLng): string {
  return `via:${fmtLatLng(p)}`;
}

/** Destination : label humain@coords si dispo, sinon coords seules. */
export function formatDestinationParam(
  destination: MapsLatLng,
  label?: string | null
): string {
  const coords = fmtLatLng(destination);
  const name = label?.trim();
  if (!name) return coords;
  return `${name}@${coords}`;
}

/** Étape avec arrêt (coords nues — comme Maps / Waze). */
export function formatStopWaypoint(p: MapsLatLng): string {
  return fmtLatLng(p);
}

export type MapsWaypointMode = 'via' | 'stop';

const MAX_VIA = 2;
const MAX_STOP = 8;

/** URL HTTPS directions — waypoints toujours encodés. */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  /** via = passage sans arrêt (éco) ; stop = étape réelle */
  waypointMode?: MapsWaypointMode;
  navigate?: boolean;
  destinationLabel?: string | null;
  /** Platform.OS — évite import RN ici */
  platform?: string;
}): string {
  const parts = [
    'api=1',
    `destination=${encodeURIComponent(
      formatDestinationParam(opts.destination, opts.destinationLabel)
    )}`,
    'travelmode=driving',
  ];
  if (opts.origin) {
    parts.push(`origin=${encodeURIComponent(fmtLatLng(opts.origin))}`);
  }
  const stopMode = opts.waypointMode === 'stop';
  const wps = (opts.waypoints || []).slice(0, stopMode ? MAX_STOP : MAX_VIA);
  if (wps.length) {
    const raw = wps
      .map((p) => (stopMode ? formatStopWaypoint(p) : formatViaPassThrough(p)))
      .join('|');
    parts.push(`waypoints=${encodeURIComponent(raw)}`);
  }
  if (opts.navigate && opts.platform !== 'android') {
    parts.push('dir_action=navigate');
  }
  return `https://www.google.com/maps/dir/?${parts.join('&')}`;
}

export function buildAppleMapsUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
}): string {
  const parts = [`daddr=${fmtLatLng(opts.destination)}`, 'dirflg=d'];
  if (opts.origin) parts.push(`saddr=${fmtLatLng(opts.origin)}`);
  return `http://maps.apple.com/?${parts.join('&')}`;
}
