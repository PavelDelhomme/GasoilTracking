import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  clearSession,
  fetchSync,
  getStoredUser,
  getToken,
  login as apiLogin,
  logoutRemote,
  register as apiRegister,
  setSession,
} from '@/lib/api';
import { applySnapshot, hasLocalUserData, normalizeSnapshot } from '@/lib/dataSnapshot';
import { saveLocalBackup, refreshFromCloud, syncPreferNewer } from '@/lib/backup';

type User = { id: string; email: string; name: string };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    inviteCode: string
  ) => Promise<{ ok: boolean; pending?: boolean; message?: string }>;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Remplace le local par les données cloud du compte */
  refreshCloudNow: () => Promise<{ ok: boolean; reason: string; updatedAt?: string | null }>;
  applySession: (token: string, user: User, refreshToken?: string | null) => Promise<void>;
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
    await syncPreferNewer();
  }, []);

  const refreshCloudNow = useCallback(async () => {
    return refreshFromCloud();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setUser(res.user);
    try {
      const localHas = await hasLocalUserData();
      const remote = await fetchSync();
      const remoteSnap = normalizeSnapshot(remote?.data);

      if (!localHas && remoteSnap) {
        await applySnapshot(remoteSnap, 'replace');
        await saveLocalBackup(remoteSnap);
      } else {
        await syncPreferNewer();
      }
    } catch {
      try {
        await saveLocalBackup();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, inviteCode: string) => {
      const platform = Platform.OS === 'web' ? 'web' : 'mobile';
      return apiRegister(email, password, name, inviteCode, platform);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await saveLocalBackup();
    } catch {
      /* ignore */
    }
    await logoutRemote();
    await clearSession();
    setUser(null);
  }, []);

  const applySession = useCallback(
    async (token: string, next: User, refreshToken?: string | null) => {
      await setSession(token, next, refreshToken);
      setUser(next);
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, syncNow, refreshCloudNow, applySession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
