/**
 * Handoff Hubera Maps : suivi libre / navigation.
 * Fuel reste propriétaire du trajet GPS ; Maps affiche et commande pause/stop/plein.
 */
import { Linking, Platform } from 'react-native';
import {
  buildHuberaMapsAppUrl,
  type HuberaMapsTrackOpts,
} from '@/lib/huberaMapsUrl';

export type { HuberaMapsTrackOpts };
export { buildHuberaMapsAppUrl, buildHuberaMapsWebUrl } from '@/lib/huberaMapsUrl';

export type HuberaMapsOpenResult = 'app' | 'web' | false;

const APP_SCHEMES = ['hubera-maps', 'cloudity-maps'] as const;

async function tryOpen(url: string): Promise<boolean> {
  try {
    const can = await Linking.canOpenURL(url).catch(() => true);
    if (!can && Platform.OS === 'ios') return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ouvre l’app Hubera Maps si elle est installée.
 * Pas de fallback Google : le suivi Fuel continue dans l’onglet Maps.
 */
export async function openHuberaMapsForTrip(
  opts: HuberaMapsTrackOpts
): Promise<HuberaMapsOpenResult> {
  for (const scheme of APP_SCHEMES) {
    if (await tryOpen(buildHuberaMapsAppUrl(opts, scheme))) return 'app';
  }
  return false;
}

/** Navigation A→B : Maps d’abord, sinon false (l’appelant peut tomber sur Google). */
export async function openHuberaMapsNavigate(
  opts: HuberaMapsTrackOpts
): Promise<HuberaMapsOpenResult> {
  return openHuberaMapsForTrip({ ...opts, mode: 'nav' });
}
