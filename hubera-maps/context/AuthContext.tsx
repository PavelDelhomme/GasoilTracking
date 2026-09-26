import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const stored = await getStoredUser();
      if (token && stored) {
        setUser(stored);
        try {
          await refreshMe();
        } catch {
          // ignore
        }
      }
      setLoading(false);
    })();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedUser } = await apiLogin(email, password);
    setUser(loggedUser);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
