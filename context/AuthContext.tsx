import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  clearSession,
  fetchMe,
  fetchSync,
  getRefreshToken,
  getStoredUser,
  getToken,
  login as apiLogin,
  logoutRemote,
  register as apiRegister,
  setSession,
  type AuthUser,
  type PendingRegistrationSummary,
} from '@/lib/api';
import { applySnapshot, hasLocalUserData, normalizeSnapshot } from '@/lib/dataSnapshot';
import { saveLocalBackup, refreshFromCloud, syncPreferNewer } from '@/lib/backup';

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  pendingRegistrationsCount: number;
  pendingRegistrations: PendingRegistrationSummary[];
  refreshMe: () => Promise<void>;
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
  applySession: (token: string, user: AuthUser, refreshToken?: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistrationSummary[]>(
    []
  );

  const refreshMe = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setPendingRegistrationsCount(0);
      setPendingRegistrations([]);
      return;
    }
    try {
      const me = await fetchMe();
      const next: AuthUser = {
        id: me.user.id,
        email: me.user.email,
        name: me.user.name,
        isManager: !!me.user.isManager,
      };
      setUser(next);
      const refresh = await getRefreshToken();
      await setSession(token, next, refresh);
      setPendingRegistrationsCount(me.pendingRegistrationsCount || 0);
      setPendingRegistrations(me.pendingRegistrations || []);
    } catch {
      /* session invalide ou offline */
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
          /* ignore */
        }
      }
      setLoading(false);
    })();
  }, [refreshMe]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshMe();
    });
    return () => sub.remove();
  }, [refreshMe]);

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
    const next: AuthUser = {
      ...res.user,
      isManager: !!res.user.isManager,
    };
    setUser(next);
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
    try {
      const me = await fetchMe();
      setPendingRegistrationsCount(me.pendingRegistrationsCount || 0);
      setPendingRegistrations(me.pendingRegistrations || []);
      if (me.user) {
        const u: AuthUser = {
          id: me.user.id,
          email: me.user.email,
          name: me.user.name,
          isManager: !!me.user.isManager,
        };
        setUser(u);
        const token = await getToken();
        if (token) await setSession(token, u);
      }
    } catch {
      setPendingRegistrationsCount(0);
      setPendingRegistrations([]);
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
    setPendingRegistrationsCount(0);
    setPendingRegistrations([]);
  }, []);

  const applySession = useCallback(
    async (token: string, next: AuthUser, refreshToken?: string | null) => {
      await setSession(token, next, refreshToken);
      setUser(next);
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pendingRegistrationsCount,
        pendingRegistrations,
        refreshMe,
        login,
        register,
        logout,
        syncNow,
        refreshCloudNow,
        applySession,
      }}
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
