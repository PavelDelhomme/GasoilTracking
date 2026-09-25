/**
 * URLs Hubera Maps — sans React Native (testable).
 */
export type HuberaMapsTrackOpts = {
  tripId?: number | null;
  vehicleId?: number | null;
  mode?: 'free' | 'nav';
  toLat?: number | null;
  toLon?: number | null;
  label?: string | null;
  fromLat?: number | null;
  fromLon?: number | null;
};

const WEB_ORIGIN = 'https://maps.hubera.cloud';

function qs(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&');
}

export function buildHuberaMapsAppUrl(opts: HuberaMapsTrackOpts, scheme = 'hubera-maps'): string {
  const mode = opts.mode ?? 'free';
  const path = mode === 'nav' && opts.toLat != null && opts.toLon != null ? 'navigate' : 'track';
  const query = qs({
    tripId: opts.tripId,
    vehicleId: opts.vehicleId,
    mode,
    toLat: opts.toLat,
    toLon: opts.toLon,
    label: opts.label,
    fromLat: opts.fromLat,
    fromLon: opts.fromLon,
  });
  return `${scheme}://${path}?${query}`;
}

export function buildHuberaMapsWebUrl(opts: HuberaMapsTrackOpts): string {
  const query = qs({
    tripId: opts.tripId,
    vehicleId: opts.vehicleId,
    mode: opts.mode ?? 'free',
    lat: opts.toLat,
    lon: opts.toLon,
    q: opts.label,
    fromLat: opts.fromLat,
    fromLon: opts.fromLon,
  });
  return `${WEB_ORIGIN}/?${query}`;
}
