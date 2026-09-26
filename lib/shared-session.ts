/**
 * Hubera Shared Session
 * 
 * Permet de partager la session d'authentification entre les apps Hubera
 * (Fuel, Maps, etc.) via un système de deep linking bidirectionnel.
 * 
 * Flow:
 * 1. App secondaire (Maps) démarre sans session
 * 2. Vérifie si Hubera Fuel est installé
 * 3. Envoie un deep link à Fuel demandant le token
 * 4. Fuel répond via deep link avec le token encodé
 * 5. Maps applique la session
 */

import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// Schemes des apps Hubera
export const HUBERA_APPS = {
  fuel: {
    scheme: 'gasoiltracking', // Legacy scheme pour Hubera Fuel
    package: 'com.gasoiltracking.app',
  },
  maps: {
    scheme: 'hubera-maps',
    package: 'cloud.hubera.maps',
  },
} as const;

export type SharedSession = {
  token: string;
  refreshToken?: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    isManager?: boolean;
  };
  sourceApp: string;
  timestamp: number;
};

/**
 * Vérifie si Hubera Fuel est installé sur l'appareil.
 */
export async function isHuberaFuelInstalled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  
  try {
    const canOpen = await Linking.canOpenURL(`${HUBERA_APPS.fuel.scheme}://`);
    return canOpen;
  } catch {
    return false;
  }
}

/**
 * Génère une URL pour demander la session à Hubera Fuel.
 * @param callbackScheme Le scheme de l'app qui demande (ex: 'hubera-maps')
 */
export function buildAuthRequestUrl(callbackScheme: string): string {
  const callback = encodeURIComponent(`${callbackScheme}://auth/receive`);
  return `${HUBERA_APPS.fuel.scheme}://auth/share?callback=${callback}&ts=${Date.now()}`;
}

/**
 * Génère une URL de réponse avec le token pour l'app appelante.
 * @param callbackUrl L'URL de callback complète
 * @param session La session à partager
 */
export function buildAuthResponseUrl(callbackUrl: string, session: SharedSession): string {
  const payload = encodeURIComponent(JSON.stringify(session));
  const sep = callbackUrl.includes('?') ? '&' : '?';
  return `${callbackUrl}${sep}session=${payload}`;
}

/**
 * Parse une session reçue via deep link.
 * @param url L'URL reçue contenant la session
 */
export function parseSessionFromUrl(url: string): SharedSession | null {
  try {
    const parsed = Linking.parse(url);
    const sessionParam = parsed.queryParams?.session;
    
    if (!sessionParam || typeof sessionParam !== 'string') {
      return null;
    }
    
    const session = JSON.parse(decodeURIComponent(sessionParam)) as SharedSession;
    
    // Vérifier que la session n'est pas trop vieille (5 minutes max pour le transfert)
    if (Date.now() - session.timestamp > 5 * 60 * 1000) {
      console.warn('[shared-session] Session transfer expired');
      return null;
    }
    
    return session;
  } catch (e) {
    console.error('[shared-session] Failed to parse session:', e);
    return null;
  }
}

/**
 * Demande la session à Hubera Fuel via deep link.
 * @param callbackScheme Le scheme de l'app appelante
 */
export async function requestSessionFromFuel(callbackScheme: string): Promise<boolean> {
  const installed = await isHuberaFuelInstalled();
  if (!installed) {
    console.log('[shared-session] Hubera Fuel not installed');
    return false;
  }
  
  const url = buildAuthRequestUrl(callbackScheme);
  console.log('[shared-session] Requesting session from Fuel:', url);
  
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    console.error('[shared-session] Failed to open Fuel:', e);
    return false;
  }
}

/**
 * Parse le callback URL de demande de session.
 * Utilisé par Hubera Fuel pour extraire l'URL de callback.
 */
export function parseAuthRequest(url: string): { callback: string; ts: number } | null {
  try {
    const parsed = Linking.parse(url);
    
    if (parsed.path !== 'auth/share') {
      return null;
    }
    
    const callback = parsed.queryParams?.callback;
    const ts = parsed.queryParams?.ts;
    
    if (!callback || typeof callback !== 'string') {
      return null;
    }
    
    return {
      callback: decodeURIComponent(callback),
      ts: ts ? Number(ts) : Date.now(),
    };
  } catch {
    return null;
  }
}
