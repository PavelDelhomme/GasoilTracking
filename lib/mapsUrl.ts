/**
 * Construction d’URL Google Maps Directions — sans dépendance React Native (testable).
 *
 * Destination = coords seules. Le format « Nom@lat,lng » n’est pas supporté par
 * maps/dir/?api=1 et produit « Impossible de s’y rendre ».
 */
export type MapsLatLng = { latitude: number; longitude: number };

export function isValidMapsLatLng(p: MapsLatLng | null | undefined): p is MapsLatLng {
  if (!p) return false;
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) < 1e-4 && Math.abs(lon) < 1e-4) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return true;
}

export function fmtLatLng(p: MapsLatLng): string {
  return `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`;
}

/** Passage sans arrêt (préfixe Google Maps `via:`). Conservé pour tests / legacy. */
export function formatViaPassThrough(p: MapsLatLng): string {
  return `via:${fmtLatLng(p)}`;
}

/**
 * Destination pour l’API dir : uniquement lat,lng.
 * Le label est ignoré (il cassait le routage Google).
 */
export function formatDestinationParam(
  destination: MapsLatLng,
  _label?: string | null
): string {
  return fmtLatLng(destination);
}

/** Étape avec arrêt (coords nues — comme Maps / Waze). */
export function formatStopWaypoint(p: MapsLatLng): string {
  return fmtLatLng(p);
}

export type MapsWaypointMode = 'via' | 'stop';

const MAX_STOP = 8;

/** URL HTTPS directions — waypoints toujours encodés. */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  /** via = ignoré (casse Google) ; stop = étape réelle */
  waypointMode?: MapsWaypointMode;
  navigate?: boolean;
  destinationLabel?: string | null;
  /** Platform.OS — évite import RN ici */
  platform?: string;
}): string {
  const dest = opts.destination;
  const parts = [
    'api=1',
    `destination=${encodeURIComponent(formatDestinationParam(dest))}`,
    'travelmode=driving',
  ];
  if (isValidMapsLatLng(opts.origin)) {
    parts.push(`origin=${encodeURIComponent(fmtLatLng(opts.origin))}`);
  }
  const stopMode = opts.waypointMode === 'stop';
  const wps = (opts.waypoints || []).filter(isValidMapsLatLng).slice(0, MAX_STOP);
  // via: éco / géométrie → souvent hors route → « Impossible de s’y rendre ».
  if (stopMode && wps.length) {
    const raw = wps.map(formatStopWaypoint).join('|');
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
  if (isValidMapsLatLng(opts.origin)) parts.push(`saddr=${fmtLatLng(opts.origin)}`);
  return `http://maps.apple.com/?${parts.join('&')}`;
}

/** Intent Android navigation : coords seules (le plus fiable). */
export function buildGoogleNavigationIntent(destination: MapsLatLng): string {
  return `google.navigation:q=${fmtLatLng(destination)}&mode=d`;
}
