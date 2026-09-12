/**
 * Lance la navigation externe (Google Maps / Apple Maps).
 * Destination = coords GPS. Pas de via: éco (ça casse Maps : « Impossible de s’y rendre »).
 */
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildViaWaypoints, samplePassThroughViasFromRoute } from '@/lib/routeVias';
import {
  buildAppleMapsUrl,
  buildGoogleMapsDirUrl as buildDirUrlPure,
  buildGoogleNavigationIntent,
  formatDestinationParam,
  formatViaPassThrough,
  fmtLatLng,
  isValidMapsLatLng,
  type MapsLatLng,
  type MapsWaypointMode,
} from '@/lib/mapsUrl';

export type { MapsLatLng };
export type MapsAppChoice = 'google' | 'apple';

export {
  buildViaWaypoints,
  samplePassThroughViasFromRoute,
  formatViaPassThrough,
  formatDestinationParam,
  isValidMapsLatLng,
};

const MAPS_PREF_KEY = 'gasoil_maps_app_pref_v1';

function fmt(p: MapsLatLng): string {
  return fmtLatLng(p);
}

/** URL HTTPS directions — délègue au builder pur (+ platform). */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  waypointMode?: MapsWaypointMode;
  navigate?: boolean;
  destinationLabel?: string | null;
}): string {
  return buildDirUrlPure({ ...opts, platform: Platform.OS });
}

export { buildAppleMapsUrl, buildGoogleNavigationIntent };

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
  waypointMode?: MapsWaypointMode;
  label?: string | null;
}): Promise<boolean> {
  if (!isValidMapsLatLng(opts.destination)) return false;
  const dest = fmt(opts.destination);
  const origin = isValidMapsLatLng(opts.origin) ? opts.origin : null;
  const stopMode = opts.waypointMode === 'stop';
  const wps = stopMode ? (opts.waypoints || []).filter(isValidMapsLatLng).slice(0, 8) : [];
  const hasStops = wps.length > 0;

  if (Platform.OS === 'android') {
    if (hasStops) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin,
        waypoints: wps,
        waypointMode: 'stop',
        navigate: false,
      });
      if (await tryOpen(pathUrl)) return true;
    }
    // Destination seule : intent natif (GPS Maps = origine). HTTPS ensuite.
    if (await tryOpen(buildGoogleNavigationIntent(opts.destination))) {
      return true;
    }
    const classic = buildGoogleMapsDirUrl({
      destination: opts.destination,
      origin,
      navigate: false,
    });
    if (await tryOpen(classic)) return true;
    return tryOpen(`geo:0,0?q=${dest}`);
  }

  if (Platform.OS === 'ios') {
    if (hasStops) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin,
        waypoints: wps,
        waypointMode: 'stop',
        navigate: true,
      });
      if (await tryOpen(pathUrl)) return true;
    }
    const gmaps = origin
      ? `comgooglemaps://?saddr=${fmt(origin)}&daddr=${dest}&directionsmode=driving`
      : `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
    if (await tryOpen(gmaps)) return true;
  }

  return tryOpen(
    buildGoogleMapsDirUrl({
      destination: opts.destination,
      origin,
      waypoints: hasStops ? wps : undefined,
      waypointMode: hasStops ? 'stop' : undefined,
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

export async function launchGoogleMapsNavigation(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  waypointMode?: MapsWaypointMode;
  label?: string;
  preferGoogle?: boolean;
}): Promise<boolean> {
  if (!isValidMapsLatLng(opts.destination)) return false;
  const stopWps =
    opts.waypointMode === 'stop'
      ? (opts.waypoints || []).filter(isValidMapsLatLng)
      : [];
  const app =
    opts.preferGoogle || stopWps.length > 0
      ? 'google'
      : await resolveMapsApp();
  if (app === 'apple' && Platform.OS === 'ios') {
    return openAppleMaps({
      destination: opts.destination,
      origin: opts.origin,
    });
  }
  return openGoogleMaps({
    ...opts,
    waypoints: stopWps,
    waypointMode: stopWps.length ? 'stop' : undefined,
  });
}

export const launchMapsNavigation = launchGoogleMapsNavigation;
