/**
 * Hook pour gérer les deep links d'authentification HuberaID.
 * 
 * Utilisé par Hubera Fuel pour répondre aux demandes de session des autres apps.
 * Supporte à la fois l'ancien protocole (auth/share) et le nouveau (hubera-id/share).
 */

import { useEffect, useCallback } from 'react';
import * as Linking from 'expo-linking';
import { useAuth } from '@/context/AuthContext';
import { getToken, getRefreshToken, getStoredUser } from '@/lib/api';
import {
  parseSessionRequest,
  buildSessionResponse,
  getHuberaSession,
  type HuberaSession,
} from '@/lib/huberaId';

export function useDeepLinkAuth() {
  const { user } = useAuth();

  const handleHuberaIdRequest = useCallback(async (url: string) => {
    console.log('[HuberaID] Received URL:', url);
    
    // Essayer le nouveau format HuberaID
    const request = parseSessionRequest(url);
    
    // Aussi supporter l'ancien format (auth/share)
    const parsed = Linking.parse(url);
    const isLegacyRequest = parsed.path === 'auth/share' || 
      (parsed.hostname === 'auth' && parsed.path === '/share');
    
    if (!request && !isLegacyRequest) {
      return false;
    }

    const callback = request?.callback || 
      (parsed.queryParams?.callback ? decodeURIComponent(String(parsed.queryParams.callback)) : null);
    
    if (!callback) {
      console.log('[HuberaID] No callback in request');
      return false;
    }

    console.log('[HuberaID] Session request from callback:', callback);

    // Vérifier qu'on a une session active
    const token = await getToken();
    const refreshToken = await getRefreshToken();
    const storedUser = await getStoredUser();

    if (!token || !storedUser) {
      console.log('[HuberaID] No active session to share');
      try {
        await Linking.openURL(`${callback}?error=no_session`);
      } catch (e) {
        console.error('[HuberaID] Failed to send error response:', e);
      }
      return true;
    }

    // Construire la session HuberaID
    const session: HuberaSession = {
      account: {
        id: String(storedUser.id),
        email: storedUser.email,
        name: storedUser.name,
        isManager: storedUser.isManager,
      },
      token,
      refreshToken,
      sourceApp: 'fuel',
      createdAt: new Date().toISOString(),
    };

    // Envoyer la session via le callback
    const responseUrl = buildSessionResponse(callback, session);
    console.log('[HuberaID] Sending session to:', callback);

    try {
      await Linking.openURL(responseUrl);
      console.log('[HuberaID] Session shared successfully');
      return true;
    } catch (e) {
      console.error('[HuberaID] Failed to share session:', e);
      return false;
    }
  }, []);

  useEffect(() => {
    // Gérer l'URL initiale (app ouverte via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleHuberaIdRequest(url);
      }
    });

    // Écouter les deep links pendant que l'app est ouverte
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleHuberaIdRequest(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleHuberaIdRequest]);

  return { handleHuberaIdRequest };
}
