/**
 * Lance la navigation externe (Google Maps / Apple Maps).
 * Les waypoints `via:` biaisent l’itinéraire sans créer d’arrêt.
 */
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MapsLatLng = { latitude: number; longitude: number };
export type MapsAppChoice = 'google' | 'apple';

const MAPS_PREF_KEY = 'gasoil_maps_app_pref_v1';

function fmt(p: MapsLatLng): string {
  return `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`;
}

/** Passage sans arrêt (préfixe Google Maps `via:`). */
export function formatViaPassThrough(p: MapsLatLng): string {
  return `via:${fmt(p)}`;
}

/**
 * Waypoints pour biaiser Maps. Uniquement des via explicites (OSRM alternatif).
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

export function buildAppleMapsUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
}): string {
  const parts = [`daddr=${fmt(opts.destination)}`, 'dirflg=d'];
  if (opts.origin) parts.push(`saddr=${fmt(opts.origin)}`);
  return `http://maps.apple.com/?${parts.join('&')}`;
}

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function getPreferredMapsApp(): Promise<MapsAppChoice | null> {
  try {
    const v = await AsyncStorage.getItem(MAPS_PREF_KEY);
    if (v === 'google' || v === 'apple') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export async function setPreferredMapsApp(app: MapsAppChoice): Promise<void> {
  try {
    await AsyncStorage.setItem(MAPS_PREF_KEY, app);
  } catch {
    /* ignore */
  }
}

/** Demande Google vs Apple (iOS) ; mémorise le choix. */
export function askMapsAppPreference(): Promise<MapsAppChoice> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Navigation',
          message: 'Quelle app utiliser pour ce trajet ?',
          options: ['Google Maps', 'Plans (Apple)', 'Annuler'],
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) {
            void setPreferredMapsApp('google');
            resolve('google');
          } else if (idx === 1) {
            void setPreferredMapsApp('apple');
            resolve('apple');
          } else {
            resolve('apple');
          }
        }
      );
      return;
    }
    Alert.alert('Navigation', 'Quelle app utiliser ?', [
      {
        text: 'Google Maps',
        onPress: () => {
          void setPreferredMapsApp('google');
          resolve('google');
        },
      },
      {
        text: 'Plans Apple',
        onPress: () => {
          void setPreferredMapsApp('apple');
          resolve('apple');
        },
      },
      { text: 'Annuler', style: 'cancel', onPress: () => resolve('google') },
    ]);
  });
}

async function resolveMapsApp(): Promise<MapsAppChoice> {
  if (Platform.OS === 'android') return 'google';
  if (Platform.OS === 'web') return 'google';
  const pref = await getPreferredMapsApp();
  if (pref) return pref;
  return askMapsAppPreference();
}

async function openGoogleMaps(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
}): Promise<boolean> {
  const dest = fmt(opts.destination);
  const wps = (opts.waypoints || []).slice(0, 2);
  const hasVia = wps.length > 0;

  if (Platform.OS === 'android') {
    // Si un itinéraire alternatif est choisi (via), NE PAS utiliser navigation:q
    // (ignore les waypoints) — utiliser l’URL directions.
    if (hasVia) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin: opts.origin,
        waypoints: wps,
        navigate: false,
      });
      if (await tryOpen(pathUrl)) return true;
    } else if (await tryOpen(`google.navigation:q=${dest}&mode=d`)) {
      return true;
    }

    const classic = `https://maps.google.com/maps?daddr=${dest}&dirflg=d`;
    if (await tryOpen(classic)) return true;
    return tryOpen(`geo:0,0?q=${dest}`);
  }

  if (Platform.OS === 'ios') {
    if (hasVia) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin: opts.origin,
        waypoints: wps,
        navigate: true,
      });
      if (await tryOpen(pathUrl)) return true;
    }
    const gmaps = hasVia
      ? buildGoogleMapsDirUrl({
          destination: opts.destination,
          origin: opts.origin,
          waypoints: wps,
          navigate: true,
        })
      : `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
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

async function openAppleMaps(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
}): Promise<boolean> {
  if (await tryOpen(buildAppleMapsUrl(opts))) return true;
  return tryOpen(
    `maps://?daddr=${fmt(opts.destination)}${opts.origin ? `&saddr=${fmt(opts.origin)}` : ''}&dirflg=d`
  );
}

/**
 * Ouvre l’app de navigation (Google / Apple) et démarre le guidage si possible.
 * Passe les vias de l’itinéraire choisi dans l’app pour coller à « économique / rapide ».
 */
export async function launchGoogleMapsNavigation(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  label?: string;
  /** Forcer Google (ignore le choix Apple). */
  preferGoogle?: boolean;
}): Promise<boolean> {
  const wps = opts.waypoints || [];
  // Apple Plans ne gère pas les vias OSRM → forcer Google si itinéraire alternatif.
  const app =
    opts.preferGoogle || wps.length > 0
      ? 'google'
      : await resolveMapsApp();
  if (app === 'apple' && Platform.OS === 'ios') {
    return openAppleMaps({
      destination: opts.destination,
      origin: opts.origin,
    });
  }
  return openGoogleMaps(opts);
}

/** Alias explicite multi-apps. */
export const launchMapsNavigation = launchGoogleMapsNavigation;
