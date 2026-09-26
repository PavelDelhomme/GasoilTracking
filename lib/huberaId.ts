/**
 * HuberaID — Système centralisé d'authentification Hubera
 * 
 * Permet le partage de session entre toutes les apps Hubera (Fuel, Maps, Music, Drive, etc.)
 * sur un même appareil, sans re-saisie des identifiants.
 * 
 * Fonctionnement:
 * 1. Quand un utilisateur se connecte sur une app Hubera, la session est stockée dans HuberaID
 * 2. Les autres apps Hubera peuvent détecter cette session et proposer "Continuer avec {email}"
 * 3. L'utilisateur accepte → la session est copiée vers l'app locale (sans mot de passe)
 * 4. Logout sur une app = option de déconnecter toutes les apps Hubera
 * 
 * Stockage:
 * - Android: SharedPreferences avec android:sharedUserId (même signature = même stockage)
 * - iOS: Keychain avec App Groups
 * - Web: localStorage avec domaine .hubera.cloud
 * - Fallback: Deep linking entre apps (si stockage partagé impossible)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HuberaAccount = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  isManager?: boolean;
};

export type HuberaSession = {
  account: HuberaAccount;
  token: string;
  refreshToken?: string | null;
  sourceApp: HuberaAppId;
  createdAt: string;
  expiresAt?: string | null;
};

export type HuberaAppId = 'fuel' | 'maps' | 'music' | 'drive' | 'photos' | 'notes' | 'calendar';

export type HuberaAppInfo = {
  id: HuberaAppId;
  name: string;
  scheme: string;
  androidPackage: string;
  iosBundle: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Configuration des apps Hubera
// ─────────────────────────────────────────────────────────────────────────────

export const HUBERA_APPS: Record<HuberaAppId, HuberaAppInfo> = {
  fuel: {
    id: 'fuel',
    name: 'Hubera Fuel',
    scheme: 'gasoiltracking',
    androidPackage: 'com.gasoiltracking.app',
    iosBundle: 'com.gasoiltracking.app',
  },
  maps: {
    id: 'maps',
    name: 'Hubera Maps',
    scheme: 'hubera-maps',
    androidPackage: 'cloud.hubera.maps',
    iosBundle: 'cloud.hubera.maps',
  },
  music: {
    id: 'music',
    name: 'Hubera Music',
    scheme: 'hubera-music',
    androidPackage: 'cloud.hubera.music',
    iosBundle: 'cloud.hubera.music',
  },
  drive: {
    id: 'drive',
    name: 'Hubera Drive',
    scheme: 'hubera-drive',
    androidPackage: 'cloud.hubera.drive',
    iosBundle: 'cloud.hubera.drive',
  },
  photos: {
    id: 'photos',
    name: 'Hubera Photos',
    scheme: 'hubera-photos',
    androidPackage: 'cloud.hubera.photos',
    iosBundle: 'cloud.hubera.photos',
  },
  notes: {
    id: 'notes',
    name: 'Hubera Notes',
    scheme: 'hubera-notes',
    androidPackage: 'cloud.hubera.notes',
    iosBundle: 'cloud.hubera.notes',
  },
  calendar: {
    id: 'calendar',
    name: 'Hubera Calendar',
    scheme: 'hubera-calendar',
    androidPackage: 'cloud.hubera.calendar',
    iosBundle: 'cloud.hubera.calendar',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Clés de stockage partagé
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'hubera_id_';
const SESSION_KEY = `${STORAGE_PREFIX}session`;
const ACCOUNTS_KEY = `${STORAGE_PREFIX}accounts`;
const DEVICE_ID_KEY = `${STORAGE_PREFIX}device_id`;

// ─────────────────────────────────────────────────────────────────────────────
// Stockage partagé (AsyncStorage avec clés communes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère ou récupère l'ID unique de l'appareil Hubera.
 * Cet ID est partagé entre toutes les apps Hubera sur l'appareil.
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
 * Sauvegarde la session HuberaID (après login réussi).
 * Appelé par l'app qui effectue le login.
 */
export async function saveHuberaSession(
  session: Omit<HuberaSession, 'createdAt'>,
): Promise<void> {
  const fullSession: HuberaSession = {
    ...session,
    createdAt: new Date().toISOString(),
  };
  
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(fullSession));
  
  // Mettre à jour la liste des comptes connus
  await addKnownAccount(session.account);
  
  console.log('[HuberaID] Session saved for', session.account.email, 'from', session.sourceApp);
}

/**
 * Récupère la session HuberaID active (si elle existe).
 */
export async function getHuberaSession(): Promise<HuberaSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    
    const session = JSON.parse(raw) as HuberaSession;
    
    // Vérifier si la session n'est pas expirée
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      console.log('[HuberaID] Session expired');
      await clearHuberaSession();
      return null;
    }
    
    return session;
  } catch (e) {
    console.warn('[HuberaID] Failed to get session:', e);
    return null;
  }
}

/**
 * Supprime la session HuberaID (logout global).
 */
export async function clearHuberaSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
  console.log('[HuberaID] Session cleared');
}

/**
 * Ajoute un compte à la liste des comptes connus sur cet appareil.
 */
async function addKnownAccount(account: HuberaAccount): Promise<void> {
  try {
    const accounts = await getKnownAccounts();
    const existing = accounts.findIndex(a => a.email === account.email);
    
    if (existing >= 0) {
      accounts[existing] = account; // Mise à jour
    } else {
      accounts.unshift(account); // Ajout en premier
    }
    
    // Garder max 5 comptes
    const trimmed = accounts.slice(0, 5);
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[HuberaID] Failed to save account:', e);
  }
}

/**
 * Récupère la liste des comptes Hubera connus sur cet appareil.
 */
export async function getKnownAccounts(): Promise<HuberaAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HuberaAccount[];
  } catch {
    return [];
  }
}

/**
 * Supprime un compte de la liste des comptes connus.
 */
export async function removeKnownAccount(email: string): Promise<void> {
  const accounts = await getKnownAccounts();
  const filtered = accounts.filter(a => a.email !== email);
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(filtered));
}

// ─────────────────────────────────────────────────────────────────────────────
// Détection des apps Hubera installées
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie si une app Hubera est installée sur l'appareil.
 */
export async function isHuberaAppInstalled(appId: HuberaAppId): Promise<boolean> {
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
 * Retourne la liste des apps Hubera installées sur l'appareil.
 */
export async function getInstalledHuberaApps(): Promise<HuberaAppId[]> {
  const installed: HuberaAppId[] = [];
  
  for (const appId of Object.keys(HUBERA_APPS) as HuberaAppId[]) {
    if (await isHuberaAppInstalled(appId)) {
      installed.push(appId);
    }
  }
  
  return installed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep linking pour partage de session (fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Demande la session à une autre app Hubera via deep link.
 * Utilisé en fallback si le stockage partagé ne fonctionne pas.
 */
export async function requestSessionFromApp(
  targetApp: HuberaAppId,
  callbackScheme: string,
): Promise<boolean> {
  const app = HUBERA_APPS[targetApp];
  if (!app) return false;
  
  const installed = await isHuberaAppInstalled(targetApp);
  if (!installed) return false;
  
  const callback = encodeURIComponent(`${callbackScheme}://hubera-id/receive`);
  const requestUrl = `${app.scheme}://hubera-id/share?callback=${callback}&ts=${Date.now()}`;
  
  console.log('[HuberaID] Requesting session from', targetApp);
  
  try {
    await Linking.openURL(requestUrl);
    return true;
  } catch (e) {
    console.error('[HuberaID] Failed to request session:', e);
    return false;
  }
}

/**
 * Parse une demande de session entrante.
 */
export function parseSessionRequest(url: string): { callback: string; ts: number } | null {
  try {
    const parsed = Linking.parse(url);
    
    if (parsed.path !== 'hubera-id/share' && parsed.hostname !== 'hubera-id') {
      return null;
    }
    
    const callback = parsed.queryParams?.callback;
    if (!callback || typeof callback !== 'string') return null;
    
    return {
      callback: decodeURIComponent(callback),
      ts: Number(parsed.queryParams?.ts) || Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Génère l'URL de réponse avec la session.
 */
export function buildSessionResponse(callbackUrl: string, session: HuberaSession): string {
  const payload = encodeURIComponent(JSON.stringify({
    account: session.account,
    token: session.token,
    refreshToken: session.refreshToken,
    sourceApp: session.sourceApp,
    ts: Date.now(),
  }));
  
  const sep = callbackUrl.includes('?') ? '&' : '?';
  return `${callbackUrl}${sep}session=${payload}`;
}

/**
 * Parse une réponse de session.
 */
export function parseSessionResponse(url: string): {
  account: HuberaAccount;
  token: string;
  refreshToken?: string | null;
  sourceApp: HuberaAppId;
} | null {
  try {
    const parsed = Linking.parse(url);
    const sessionParam = parsed.queryParams?.session;
    
    if (!sessionParam || typeof sessionParam !== 'string') return null;
    
    const data = JSON.parse(decodeURIComponent(sessionParam));
    
    // Vérifier le timestamp (5 minutes max pour le transfert)
    if (data.ts && Date.now() - data.ts > 5 * 60 * 1000) {
      console.warn('[HuberaID] Session response expired');
      return null;
    }
    
    return {
      account: data.account,
      token: data.token,
      refreshToken: data.refreshToken,
      sourceApp: data.sourceApp,
    };
  } catch (e) {
    console.error('[HuberaID] Failed to parse session response:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne le nom d'affichage d'une app Hubera.
 */
export function getAppName(appId: HuberaAppId): string {
  return HUBERA_APPS[appId]?.name || appId;
}

/**
 * Vérifie si le token JWT est expiré ou va expirer bientôt.
 */
export function isTokenExpiringSoon(token: string, marginMs = 5 * 60 * 1000): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false;
    return payload.exp * 1000 - Date.now() < marginMs;
  } catch {
    return true;
  }
}
