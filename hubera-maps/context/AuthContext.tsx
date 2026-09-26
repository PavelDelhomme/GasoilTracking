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
import {
  checkHuberaIdSession,
  claimHuberaIdSession,
  parseSessionFromDeepLink,
  requestSessionViaDeepLink,
  getAppName,
  type HuberaAccount,
} from '@/lib/huberaId';

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  huberaIdAccount: HuberaAccount | null; // Compte détecté via HuberaID
  huberaIdSourceApp: string | null; // App source (fuel, etc.)
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  connectWithHuberaId: () => Promise<boolean>; // Se connecter avec le compte HuberaID détecté
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [huberaIdAccount, setHuberaIdAccount] = useState<HuberaAccount | null>(null);
  const [huberaIdSourceApp, setHuberaIdSourceApp] = useState<string | null>(null);
  const huberaIdChecked = useRef(false);

  const applySession = useCallback(async (
    token: string,
    refreshToken: string | null | undefined,
    account: HuberaAccount
  ) => {
    const authUser: AuthUser = {
      id: Number(account.id),
      email: account.email,
      name: account.name,
      isManager: account.isManager,
    };
    await setSession(token, authUser, refreshToken);
    setUser(authUser);
    setHuberaIdAccount(null); // Effacer le compte détecté une fois connecté
    setHuberaIdSourceApp(null);
    console.log('[HuberaID] Session applied from', huberaIdSourceApp || 'unknown');
  }, [huberaIdSourceApp]);

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

  /**
   * Se connecter avec le compte HuberaID détecté (sans email/password).
   */
  const connectWithHuberaId = useCallback(async (): Promise<boolean> => {
    if (!huberaIdAccount) {
      console.log('[HuberaID] No account to connect with');
      return false;
    }

    console.log('[HuberaID] Claiming session for account:', huberaIdAccount.email);
    
    const result = await claimHuberaIdSession();
    
    if (!result.ok || !result.token || !result.user) {
      console.error('[HuberaID] Failed to claim session:', result.error);
      return false;
    }

    await applySession(result.token, result.refreshToken, result.user);
    return true;
  }, [huberaIdAccount, applySession]);

  // Initialisation : vérifier session locale puis HuberaID
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
      
      // Pas de session locale : vérifier HuberaID sur le serveur
      if (Platform.OS !== 'web' && !huberaIdChecked.current) {
        huberaIdChecked.current = true;
        
        console.log('[HuberaID] Checking for existing session...');
        const check = await checkHuberaIdSession();
        
        if (check.hasSession && check.account) {
          console.log('[HuberaID] Found session from', check.sourceApp, ':', check.account.email);
          setHuberaIdAccount(check.account);
          setHuberaIdSourceApp(check.sourceApp || null);
        } else {
          console.log('[HuberaID] No existing session found');
        }
      }
      
      setLoading(false);
    })();
  }, [refreshMe]);

  // Écouter les deep links pour les réponses HuberaID
  useEffect(() => {
    const handleUrl = async (url: string) => {
      console.log('[HuberaID] Incoming URL:', url);
      
      // Vérifier si c'est une réponse HuberaID
      const parsed = Linking.parse(url);
      const isHuberaIdResponse = 
        parsed.path === 'hubera-id/receive' || 
        parsed.path === 'auth/receive' ||
        (parsed.hostname === 'hubera-id' && parsed.path === '/receive');
      
      if (!isHuberaIdResponse) return;
      
      // Vérifier les erreurs
      if (parsed.queryParams?.error) {
        console.log('[HuberaID] Error from source app:', parsed.queryParams.error);
        return;
      }
      
      // Parser la session
      const session = parseSessionFromDeepLink(url);
      if (session) {
        await applySession(session.token, session.refreshToken, session.account);
      }
    };
    
    // URL initiale
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    
    // Deep links pendant que l'app est ouverte
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    
    return () => subscription.remove();
  }, [applySession]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedUser } = await apiLogin(email, password);
    setUser(loggedUser);
    setHuberaIdAccount(null);
    setHuberaIdSourceApp(null);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    // Re-vérifier HuberaID au cas où il y aurait un autre compte
    huberaIdChecked.current = false;
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      huberaIdAccount,
      huberaIdSourceApp,
      login, 
      logout, 
      refreshMe,
      connectWithHuberaId,
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
