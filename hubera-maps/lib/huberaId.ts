/**
 * HuberaID — Client pour Hubera Maps
 * 
 * Permet de récupérer une session existante depuis une autre app Hubera
 * (principalement Fuel) sans re-saisir les identifiants.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const API_URL = 'https://fuel.hubera.cloud';
const DEVICE_ID_KEY = 'hubera_id_device_id';

export type HuberaAccount = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  isManager?: boolean;
};

export type HuberaIdCheckResult = {
  hasSession: boolean;
  account?: HuberaAccount;
  sourceApp?: string;
};

export type HuberaIdClaimResult = {
  ok: boolean;
  token?: string;
  refreshToken?: string;
  user?: HuberaAccount;
  sourceApp?: string;
  error?: string;
};

// Apps Hubera connues
const HUBERA_APPS = {
  fuel: { scheme: 'gasoiltracking', name: 'Hubera Fuel' },
  maps: { scheme: 'hubera-maps', name: 'Hubera Maps' },
  music: { scheme: 'hubera-music', name: 'Hubera Music' },
  drive: { scheme: 'hubera-drive', name: 'Hubera Drive' },
} as const;

/**
 * Génère ou récupère l'ID unique de l'appareil Hubera.
 */
export async function getHuberaDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    
    const deviceId = `hdev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch {
    return `hdev_fallback_${Date.now()}`;
  }
}

/**
 * Vérifie si une session HuberaID existe pour cet appareil.
 * Interroge le serveur pour savoir si l'utilisateur est connecté sur une autre app.
 */
export async function checkHuberaIdSession(): Promise<HuberaIdCheckResult> {
  try {
    const deviceId = await getHuberaDeviceId();
    
    const res = await fetch(`${API_URL}/api/hubera-id/session?deviceId=${encodeURIComponent(deviceId)}`);
    
    if (!res.ok) {
      return { hasSession: false };
    }
    
    const data = await res.json();
    return {
      hasSession: data.hasSession || false,
      account: data.account,
      sourceApp: data.sourceApp,
    };
  } catch (e) {
    console.warn('[HuberaID] Failed to check session:', e);
    return { hasSession: false };
  }
}

/**
 * Réclame la session HuberaID pour cette app (Maps).
 * Génère un nouveau token valide pour Maps.
 */
export async function claimHuberaIdSession(): Promise<HuberaIdClaimResult> {
  try {
    const deviceId = await getHuberaDeviceId();
    
    const res = await fetch(`${API_URL}/api/hubera-id/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        targetApp: 'maps',
      }),
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { ok: false, error: error.error || `HTTP ${res.status}` };
    }
    
    const data = await res.json();
    return {
      ok: true,
      token: data.token,
      refreshToken: data.refreshToken,
      user: data.user,
      sourceApp: data.sourceApp,
    };
  } catch (e) {
    console.error('[HuberaID] Failed to claim session:', e);
    return { ok: false, error: String(e) };
  }
}

/**
 * Vérifie si une app Hubera est installée.
 */
export async function isHuberaAppInstalled(appId: keyof typeof HUBERA_APPS): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  
  const app = HUBERA_APPS[appId];
  if (!app) return false;
  
  try {
    return await Linking.canOpenURL(`${app.scheme}://`);
  } catch {
    return false;
  }
}

/**
 * Retourne la liste des apps Hubera installées.
 */
export async function getInstalledHuberaApps(): Promise<string[]> {
  const installed: string[] = [];
  
  for (const [id, app] of Object.entries(HUBERA_APPS)) {
    if (await isHuberaAppInstalled(id as keyof typeof HUBERA_APPS)) {
      installed.push(id);
    }
  }
  
  return installed;
}

/**
 * Ouvre Hubera Fuel pour demander la session via deep link (fallback).
 */
export async function requestSessionViaDeepLink(callbackScheme: string): Promise<boolean> {
  const fuelInstalled = await isHuberaAppInstalled('fuel');
  if (!fuelInstalled) return false;
  
  const callback = encodeURIComponent(`${callbackScheme}://hubera-id/receive`);
  const url = `${HUBERA_APPS.fuel.scheme}://hubera-id/share?callback=${callback}&ts=${Date.now()}`;
  
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse une réponse de session depuis un deep link.
 */
export function parseSessionFromDeepLink(url: string): {
  account: HuberaAccount;
  token: string;
  refreshToken?: string;
} | null {
  try {
    const parsed = Linking.parse(url);
    const sessionParam = parsed.queryParams?.session;
    
    if (!sessionParam || typeof sessionParam !== 'string') return null;
    
    const data = JSON.parse(decodeURIComponent(sessionParam));
    
    return {
      account: data.account,
      token: data.token,
      refreshToken: data.refreshToken,
    };
  } catch {
    return null;
  }
}

/**
 * Retourne le nom d'une app Hubera.
 */
export function getAppName(appId: string): string {
  return HUBERA_APPS[appId as keyof typeof HUBERA_APPS]?.name || appId;
}
