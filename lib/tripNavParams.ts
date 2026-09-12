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
  const hasDest = dest.length > 0 || destCoords != null;
  const mode: TripStartMode | null =
    modeRaw === 'free' && !hasDest
      ? 'free'
      : modeRaw === 'nav' || hasDest
        ? 'nav'
        : null;
  const autoStartFree = autoStart === '1' && modeRaw === 'free' && !hasDest;
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
  return { mode, dest, destCoords, destKey, autoStartFree, prepareNav };
}
