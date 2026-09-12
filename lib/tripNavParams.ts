/**
 * Params écran Trajet (expo-router peut envoyer string | string[]).
 * Sans React Native — testable.
 */

export type TripStartMode = 'free' | 'nav';

export function firstSearchParam(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value.find((v) => v != null && String(v).trim() !== '');
    return first == null ? '' : String(first).trim();
  }
  if (value == null) return '';
  return String(value).trim();
}

export type ParsedTripNav = {
  mode: TripStartMode | null;
  dest: string;
  destCoords: { latitude: number; longitude: number } | null;
  /** Clé stable pour détecter un nouveau lieu (Maps → Trajet). */
  destKey: string;
  /** Démarrer vraiment le GPS en suivi libre. */
  autoStartFree: boolean;
  /** Préparer destination + itinéraires, sans démarrer. */
  prepareNav: boolean;
};

export function parseTripNavParams(params: {
  mode?: unknown;
  dest?: unknown;
  destLat?: unknown;
  destLon?: unknown;
  autoStart?: unknown;
  prepare?: unknown;
}): ParsedTripNav {
  const modeRaw = firstSearchParam(params.mode);
  const dest = firstSearchParam(params.dest);
  const latRaw = firstSearchParam(params.destLat);
  const lonRaw = firstSearchParam(params.destLon);
  const lat = latRaw === '' ? NaN : Number(latRaw);
  const lon = lonRaw === '' ? NaN : Number(lonRaw);
  const destCoords =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? { latitude: lat, longitude: lon }
      : null;
  const autoStart = firstSearchParam(params.autoStart);
  const prepare = firstSearchParam(params.prepare);
  const wantFree = modeRaw === 'free';
  const hasDest = !wantFree && (dest.length > 0 || destCoords != null);
  const mode: TripStartMode | null = wantFree
    ? 'free'
    : modeRaw === 'nav' || hasDest
      ? 'nav'
      : null;
  /** mode=free + autoStart=1 gagne même s’il reste une dest dans l’URL (expo-router merge). */
  const autoStartFree = autoStart === '1' && wantFree;
  const prepareNav =
    !autoStartFree &&
    (hasDest ||
      mode === 'nav' ||
      prepare === '1' ||
      autoStart === '1' ||
      autoStart === 'prepare');
  const destKey = hasDest
    ? `${dest}|${destCoords ? destCoords.latitude.toFixed(5) : ''}|${
        destCoords ? destCoords.longitude.toFixed(5) : ''
      }`
    : '';
  return {
    mode,
    dest: wantFree ? '' : dest,
    destCoords: wantFree ? null : destCoords,
    destKey,
    autoStartFree,
    prepareNav,
  };
}

/** Params pour Maps → suivi libre (nonce `r` pour relancer après une nav). */
export function freeTrackNavParams(nonce: number | string = Date.now()): Record<string, string> {
  return {
    mode: 'free',
    autoStart: '1',
    dest: '',
    destLat: '',
    destLon: '',
    prepare: '',
    r: String(nonce),
  };
}
