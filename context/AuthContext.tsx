import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearSession,
  fetchSync,
  getStoredUser,
  getToken,
  login as apiLogin,
  pushSync,
  register as apiRegister,
  setSession,
} from '@/lib/api';
import { getVehicles, getFillUps, getBudgets, getTrips } from '@/lib/database';

type User = { id: string; email: string; name: string };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const stored = await getStoredUser();
      if (token && stored) setUser(stored);
      setLoading(false);
    })();
  }, []);

  const syncNow = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const [vehicles, fillUps, budgets, trips] = await Promise.all([
      getVehicles(),
      getFillUps(),
      getBudgets(),
      getTrips(),
    ]);
    await pushSync({ vehicles, fillUps, budgets, trips });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    await setSession(res.token, res.user);
    setUser(res.user);
    try {
      const remote = await fetchSync();
      // La sync complète d'import DB peut être ajoutée plus tard ; on pousse d'abord le local
      await syncNow();
      if (remote?.data) {
        // remote payload disponible pour restauration future
      }
    } catch {
      /* offline ok */
    }
  }, [syncNow]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await apiRegister(email, password, name);
    await setSession(res.token, res.user);
    setUser(res.user);
    await syncNow();
  }, [syncNow]);

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, syncNow }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
