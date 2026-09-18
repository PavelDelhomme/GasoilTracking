/**
 * Lance la navigation externe (Google / Apple / Waze / OsmAnd / Organic Maps).
 * Waze = deep link uniquement (pas d’API nav publique). Waypoints `via:` → Google.
 */
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildViaWaypoints, samplePassThroughViasFromRoute } from '@/lib/routeVias';
import {
  buildAppleMapsUrl,
  buildGoogleMapsDirUrl as buildDirUrlPure,
  formatDestinationParam,
  formatViaPassThrough,
  fmtLatLng,
  type MapsLatLng,
} from '@/lib/mapsUrl';

export type { MapsLatLng };
export type MapsAppChoice = 'google' | 'apple' | 'waze' | 'osmand' | 'organic';

export {
  buildViaWaypoints,
  samplePassThroughViasFromRoute,
  formatViaPassThrough,
  formatDestinationParam,
};

const MAPS_PREF_KEY = 'gasoil_maps_app_pref_v1';
const MAPS_CHOICES: MapsAppChoice[] = ['google', 'apple', 'waze', 'osmand', 'organic'];

export function mapsAppLabel(app: MapsAppChoice): string {
  switch (app) {
    case 'apple':
      return 'Plans (Apple)';
    case 'waze':
      return 'Waze';
    case 'osmand':
      return 'OsmAnd';
    case 'organic':
      return 'Organic Maps';
    default:
      return 'Google Maps';
  }
}

function fmt(p: MapsLatLng): string {
  return fmtLatLng(p);
}

/** URL HTTPS directions — délègue au builder pur (+ platform). */
export function buildGoogleMapsDirUrl(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  navigate?: boolean;
  destinationLabel?: string | null;
}): string {
  return buildDirUrlPure({ ...opts, platform: Platform.OS });
}

export { buildAppleMapsUrl };

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
    if (MAPS_CHOICES.includes(v as MapsAppChoice)) return v as MapsAppChoice;
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

/** Choix app navigation (multi-providers) ; mémorise. */
export function askMapsAppPreference(): Promise<MapsAppChoice> {
  return new Promise((resolve) => {
    const pick = (app: MapsAppChoice) => {
      void setPreferredMapsApp(app);
      resolve(app);
    };
    const options =
      Platform.OS === 'ios'
        ? (['Google Maps', 'Plans (Apple)', 'Waze', 'OsmAnd', 'Organic Maps', 'Annuler'] as const)
        : (['Google Maps', 'Waze', 'OsmAnd', 'Organic Maps', 'Annuler'] as const);
    const cancelIndex = options.length - 1;
    const mapIdx = (idx: number): MapsAppChoice => {
      if (Platform.OS === 'ios') {
        return (['google', 'apple', 'waze', 'osmand', 'organic'] as MapsAppChoice[])[idx] || 'google';
      }
      return (['google', 'waze', 'osmand', 'organic'] as MapsAppChoice[])[idx] || 'google';
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Navigation',
          message: 'Quelle app utiliser pour ce trajet ?',
          options: [...options],
          cancelButtonIndex: cancelIndex,
        },
        (idx) => {
          if (idx === cancelIndex || idx == null) {
            resolve('apple');
            return;
          }
          pick(mapIdx(idx));
        }
      );
      return;
    }

    Alert.alert(
      'Navigation',
      'Quelle app utiliser ? (Waze / OsmAnd = deep link)',
      [
        { text: 'Google Maps', onPress: () => pick('google') },
        { text: 'Waze', onPress: () => pick('waze') },
        { text: 'OsmAnd', onPress: () => pick('osmand') },
        { text: 'Organic Maps', onPress: () => pick('organic') },
        { text: 'Annuler', style: 'cancel', onPress: () => resolve('google') },
      ]
    );
  });
}

async function resolveMapsApp(): Promise<MapsAppChoice> {
  if (Platform.OS === 'web') return 'google';
  const pref = await getPreferredMapsApp();
  if (pref) return pref;
  return askMapsAppPreference();
}

/** Deep links navigation tierce (pas d’API Waze). */
export function buildWazeNavUrl(destination: MapsLatLng): string {
  const ll = `${destination.latitude},${destination.longitude}`;
  return `https://waze.com/ul?ll=${encodeURIComponent(ll)}&navigate=yes`;
}

export function buildOsmAndNavUrl(destination: MapsLatLng): string {
  const { latitude: lat, longitude: lon } = destination;
  // HTTPS universel + scheme natif en fallback à l’ouverture
  return `https://osmand.net/map?pin=${lat},${lon}#16/${lat}/${lon}`;
}

export function buildOrganicMapsNavUrl(destination: MapsLatLng): string {
  const { latitude: lat, longitude: lon } = destination;
  return `https://omaps.app/map?v=1&ll=${lat}%2C${lon}&n=1`;
}

async function openWaze(destination: MapsLatLng): Promise<boolean> {
  const ll = fmt(destination);
  if (await tryOpen(`waze://?ll=${ll}&navigate=yes`)) return true;
  return tryOpen(buildWazeNavUrl(destination));
}

async function openOsmAnd(destination: MapsLatLng): Promise<boolean> {
  const { latitude: lat, longitude: lon } = destination;
  if (await tryOpen(`osmand.geo:${lat},${lon}`)) return true;
  if (await tryOpen(`osmand://?lat=${lat}&lon=${lon}`)) return true;
  return tryOpen(buildOsmAndNavUrl(destination));
}

async function openOrganicMaps(destination: MapsLatLng): Promise<boolean> {
  const { latitude: lat, longitude: lon } = destination;
  if (await tryOpen(`om://map?v=1&ll=${lat},${lon}&n=1`)) return true;
  if (await tryOpen(`organicmaps://map?v=1&ll=${lat},${lon}&n=1`)) return true;
  return tryOpen(buildOrganicMapsNavUrl(destination));
}

/** Ouvre une destination dans une app précise (boutons « Ouvrir dans… »). */
export async function openInMapsApp(
  app: MapsAppChoice,
  opts: { destination: MapsLatLng; origin?: MapsLatLng | null; waypoints?: MapsLatLng[]; label?: string }
): Promise<boolean> {
  switch (app) {
    case 'waze':
      return openWaze(opts.destination);
    case 'osmand':
      return openOsmAnd(opts.destination);
    case 'organic':
      return openOrganicMaps(opts.destination);
    case 'apple':
      if (Platform.OS === 'ios') {
        return openAppleMaps({ destination: opts.destination, origin: opts.origin });
      }
      return openGoogleMaps(opts);
    default:
      return openGoogleMaps(opts);
  }
}

async function openGoogleMaps(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  waypoints?: MapsLatLng[];
  label?: string | null;
}): Promise<boolean> {
  const dest = fmt(opts.destination);
  const wps = (opts.waypoints || []).slice(0, 2);
  const hasVia = wps.length > 0;
  const label = opts.label;

  if (Platform.OS === 'android') {
    // Avec vias : directions HTTPS encodées (intent navigation ne gère pas les vias).
    if (hasVia) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin: opts.origin,
        waypoints: wps,
        navigate: false,
        destinationLabel: label,
      });
      if (await tryOpen(pathUrl)) return true;
    }
    // Sans via : intent navigation natif (origin = GPS Maps courant — ne pas forcer HTTPS).
    if (await tryOpen(`google.navigation:q=${dest}&mode=d`)) {
      return true;
    }
    const classic = buildGoogleMapsDirUrl({
      destination: opts.destination,
      origin: opts.origin,
      navigate: false,
      destinationLabel: label,
    });
    if (await tryOpen(classic)) return true;
    const q = label?.trim()
      ? encodeURIComponent(`${label.trim()}@${dest}`)
      : dest;
    return tryOpen(`geo:0,0?q=${q}`);
  }

  if (Platform.OS === 'ios') {
    if (hasVia) {
      const pathUrl = buildGoogleMapsDirUrl({
        destination: opts.destination,
        origin: opts.origin,
        waypoints: wps,
        navigate: true,
        destinationLabel: label,
      });
      if (await tryOpen(pathUrl)) return true;
    }
    const gmaps = hasVia
      ? buildGoogleMapsDirUrl({
          destination: opts.destination,
          origin: opts.origin,
          waypoints: wps,
          navigate: true,
          destinationLabel: label,
        })
      : opts.origin
        ? `comgooglemaps://?saddr=${fmt(opts.origin)}&daddr=${dest}&directionsmode=driving`
        : `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
    if (await tryOpen(gmaps)) return true;
  }

  return tryOpen(
    buildGoogleMapsDirUrl({
      destination: opts.destination,
      origin: opts.origin,
      waypoints: hasVia ? wps : undefined,
      navigate: true,
      destinationLabel: label,
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
  label?: string;
  preferGoogle?: boolean;
}): Promise<boolean> {
  const wps = opts.waypoints || [];
  // Les vias pass-through ne sont fiables que via Google Maps (HTTPS directions).
  if (opts.preferGoogle || wps.length > 0) {
    return openGoogleMaps(opts);
  }
  const app = await resolveMapsApp();
  return openInMapsApp(app, opts);
}

export const launchMapsNavigation = launchGoogleMapsNavigation;

/** Feuille « Ouvrir dans… » sans changer la préférence par défaut. */
export async function openDestinationInChooser(opts: {
  destination: MapsLatLng;
  origin?: MapsLatLng | null;
  label?: string;
}): Promise<void> {
  const open = (app: MapsAppChoice) => {
    void openInMapsApp(app, opts);
  };
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: opts.label || 'Ouvrir dans…',
        options: ['Google Maps', 'Plans (Apple)', 'Waze', 'OsmAnd', 'Organic Maps', 'Annuler'],
        cancelButtonIndex: 5,
      },
      (idx) => {
        const apps: (MapsAppChoice | null)[] = ['google', 'apple', 'waze', 'osmand', 'organic', null];
        const app = apps[idx ?? 5];
        if (app) open(app);
      }
    );
    return;
  }
  Alert.alert(opts.label || 'Ouvrir dans…', undefined, [
    { text: 'Google Maps', onPress: () => open('google') },
    { text: 'Waze', onPress: () => open('waze') },
    { text: 'OsmAnd', onPress: () => open('osmand') },
    { text: 'Organic Maps', onPress: () => open('organic') },
    { text: 'Annuler', style: 'cancel' },
  ]);
}
