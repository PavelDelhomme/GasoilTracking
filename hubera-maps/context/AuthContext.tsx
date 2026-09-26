import React, { createContext, useCallback, useContext, useEffect, useState, useRef } from 'react';
import * as Linking from 'expo-linking';
import { Platform, AppState } from 'react-native';
import {
  clearSession,
  fetchMe,
  getStoredUser,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  setSession,
  type AuthUser,
} from '@/lib/api';

// Scheme Hubera Fuel pour demander la session
const FUEL_SCHEME = 'gasoiltracking';
const MAPS_SCHEME = 'hubera-maps';

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  requestingFromFuel: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  requestSessionFromFuel: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestingFromFuel, setRequestingFromFuel] = useState(false);
  const sessionRequestSent = useRef(false);

  const applySharedSession = useCallback(async (
    token: string,
    refreshToken: string | null | undefined,
    sharedUser: { id: string; email: string; name: string; isManager?: boolean }
  ) => {
    const authUser: AuthUser = {
      id: Number(sharedUser.id),
      email: sharedUser.email,
      name: sharedUser.name,
      isManager: sharedUser.isManager,
    };
    await setSession(token, authUser, refreshToken);
    setUser(authUser);
    console.log('[auth] Session applied from Hubera Fuel');
  }, []);

  const handleIncomingUrl = useCallback(async (url: string) => {
    console.log('[auth] Incoming URL:', url);
    
    try {
      const parsed = Linking.parse(url);
      
      // Vérifier si c'est une réponse de session de Fuel
      if (parsed.path === 'auth/receive' || parsed.hostname === 'auth' && parsed.path === '/receive') {
        setRequestingFromFuel(false);
        
        // Vérifier s'il y a une erreur
        if (parsed.queryParams?.error) {
          console.log('[auth] Fuel returned error:', parsed.queryParams.error);
          setLoading(false);
          return;
        }
        
        // Parser la session
        const sessionParam = parsed.queryParams?.session;
        if (sessionParam && typeof sessionParam === 'string') {
          try {
            const session = JSON.parse(decodeURIComponent(sessionParam));
            
            // Vérifier le timestamp (5 minutes max)
            if (Date.now() - session.timestamp > 5 * 60 * 1000) {
              console.warn('[auth] Session transfer expired');
              setLoading(false);
              return;
            }
            
            await applySharedSession(session.token, session.refreshToken, session.user);
            setLoading(false);
            return;
          } catch (e) {
            console.error('[auth] Failed to parse session:', e);
          }
        }
      }
    } catch (e) {
      console.error('[auth] Error handling URL:', e);
    }
    
    setLoading(false);
  }, [applySharedSession]);

  const requestSessionFromFuel = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    
    try {
      // Vérifier si Fuel est installé
      const canOpen = await Linking.canOpenURL(`${FUEL_SCHEME}://`);
      if (!canOpen) {
        console.log('[auth] Hubera Fuel not installed');
        return false;
      }
      
      setRequestingFromFuel(true);
      sessionRequestSent.current = true;
      
      // Construire l'URL de demande
      const callback = encodeURIComponent(`${MAPS_SCHEME}://auth/receive`);
      const requestUrl = `${FUEL_SCHEME}://auth/share?callback=${callback}&ts=${Date.now()}`;
      
      console.log('[auth] Requesting session from Fuel:', requestUrl);
      await Linking.openURL(requestUrl);
      
      return true;
    } catch (e) {
      console.error('[auth] Failed to request session:', e);
      setRequestingFromFuel(false);
      return false;
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const { user: me } = await fetchMe();
      setUser(me);
    } catch {
      // session invalide
    }
  }, []);

  // Initialisation : vérifier session locale ou demander à Fuel
  useEffect(() => {
    (async () => {
      // D'abord vérifier si on a déjà une session locale
      const token = await getToken();
      const stored = await getStoredUser();
      
      if (token && stored) {
        setUser(stored);
        try {
          await refreshMe();
        } catch {
          // ignore
        }
        setLoading(false);
        return;
      }
      
      // Pas de session locale : essayer de récupérer depuis Fuel
      if (Platform.OS !== 'web' && !sessionRequestSent.current) {
        const requested = await requestSessionFromFuel();
        if (requested) {
          // Attendre la réponse via deep link (timeout après 10s)
          setTimeout(() => {
            if (loading) {
              console.log('[auth] Timeout waiting for Fuel response');
              setRequestingFromFuel(false);
              setLoading(false);
            }
          }, 10000);
          return;
        }
      }
      
      setLoading(false);
    })();
  }, [refreshMe, requestSessionFromFuel]);

  // Écouter les deep links
  useEffect(() => {
    // URL initiale (app ouverte via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) handleIncomingUrl(url);
    });
    
    // Deep links pendant que l'app est ouverte
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });
    
    return () => subscription.remove();
  }, [handleIncomingUrl]);

  // Quand l'app revient au premier plan après demande à Fuel
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && requestingFromFuel) {
        // L'app est revenue au premier plan, attendre un peu pour le deep link
        setTimeout(() => {
          if (requestingFromFuel) {
            console.log('[auth] App returned but no session received');
            setRequestingFromFuel(false);
            setLoading(false);
          }
        }, 2000);
      }
    });
    
    return () => subscription.remove();
  }, [requestingFromFuel]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedUser } = await apiLogin(email, password);
    setUser(loggedUser);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      requestingFromFuel,
      login, 
      logout, 
      refreshMe,
      requestSessionFromFuel,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
