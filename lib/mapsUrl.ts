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

/** URL HTTPS directions — waypoints toujours encodés. */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
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
  const wps = (opts.waypoints || []).slice(0, 2);
  if (wps.length) {
    const raw = wps.map(formatViaPassThrough).join('|');
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
