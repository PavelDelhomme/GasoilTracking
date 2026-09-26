/**
 * Hook pour gérer les deep links d'authentification partagée entre apps Hubera.
 * 
 * Utilisé par Hubera Fuel pour répondre aux demandes de session des autres apps.
 */

import { useEffect, useCallback } from 'react';
import * as Linking from 'expo-linking';
import { useAuth } from '@/context/AuthContext';
import { getToken, getRefreshToken, getStoredUser } from '@/lib/api';
import {
  parseAuthRequest,
  buildAuthResponseUrl,
  type SharedSession,
} from '@/lib/shared-session';

export function useDeepLinkAuth() {
  const { user } = useAuth();

  const handleAuthShareRequest = useCallback(async (url: string) => {
    console.log('[deep-link-auth] Received URL:', url);
    
    const request = parseAuthRequest(url);
    if (!request) {
      console.log('[deep-link-auth] Not an auth share request');
      return false;
    }

    console.log('[deep-link-auth] Auth share request from callback:', request.callback);

    // Vérifier qu'on a une session active
    const token = await getToken();
    const refreshToken = await getRefreshToken();
    const storedUser = await getStoredUser();

    if (!token || !storedUser) {
      console.log('[deep-link-auth] No active session to share');
      // Ouvrir le callback avec une erreur
      try {
        await Linking.openURL(`${request.callback}?error=no_session`);
      } catch (e) {
        console.error('[deep-link-auth] Failed to send error response:', e);
      }
      return true;
    }

    // Construire la session à partager
    const session: SharedSession = {
      token,
      refreshToken,
      user: {
        id: String(storedUser.id),
        email: storedUser.email,
        name: storedUser.name,
        isManager: storedUser.isManager,
      },
      sourceApp: 'fuel',
      timestamp: Date.now(),
    };

    // Envoyer la session via le callback
    const responseUrl = buildAuthResponseUrl(request.callback, session);
    console.log('[deep-link-auth] Sending session to:', request.callback);

    try {
      await Linking.openURL(responseUrl);
      console.log('[deep-link-auth] Session shared successfully');
      return true;
    } catch (e) {
      console.error('[deep-link-auth] Failed to share session:', e);
      return false;
    }
  }, []);

  useEffect(() => {
    // Gérer l'URL initiale (app ouverte via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleAuthShareRequest(url);
      }
    });

    // Écouter les deep links pendant que l'app est ouverte
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthShareRequest(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleAuthShareRequest]);

  return { handleAuthShareRequest };
}
