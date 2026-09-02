import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'https://gasoil-tracking.delhomme.ovh';

const TOKEN_KEY = 'gasoil_auth_token';
const REFRESH_KEY = 'gasoil_refresh_token';
const USER_KEY = 'gasoil_auth_user';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isManager?: boolean;
};

export async function setSession(
  token: string,
  user: AuthUser,
  refreshToken?: string | null
) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
  }
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function accessExpiresSoon(token: string, skewMs = 120_000): boolean {
  try {
    const mid = token.split('.')[1];
    if (!mid) return true;
    const json = JSON.parse(atob(mid.replace(/-/g, '+').replace(/_/g, '/')));
    if (!json.exp) return false;
    return json.exp * 1000 - Date.now() < skewMs;
  } catch {
    return true;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await clearSession();
        return false;
      }
      await setSession(data.token, data.user, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function ensureFreshAccessToken(): Promise<string | null> {
  let token = await getToken();
  if (!token) return null;
  if (accessExpiresSoon(token)) {
    const ok = await refreshSession();
    if (!ok) return null;
    token = await getToken();
  }
  return token;
}

async function request(path: string, options: RequestInit = {}, retried = false): Promise<any> {
  const token = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/register')
    ? null
    : await ensureFreshAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    const ok = await refreshSession();
    if (ok) return request(path, options, true);
  }

  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export function register(
  email: string,
  password: string,
  name: string,
  inviteCode: string,
  platform: 'web' | 'mobile' = 'web'
) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, inviteCode, platform }),
  }) as Promise<{ ok: boolean; pending?: boolean; message?: string }>;
}

export function resendVerificationEmail(email: string) {
  return request('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }) as Promise<{ ok: boolean; message?: string; alreadyActive?: boolean }>;
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  }) as Promise<{ ok: boolean; message: string }>;
}

export function forgotPassword(email: string) {
  return request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }) as Promise<{ ok: boolean; message: string; mailed?: boolean }>;
}

export function resetPassword(token: string, newPassword: string) {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  }) as Promise<{ ok: boolean; message: string }>;
}

export function deleteAccount(password: string, confirm = 'SUPPRIMER') {
  return request('/api/auth/delete-account', {
    method: 'POST',
    body: JSON.stringify({ password, confirm }),
  }) as Promise<{ ok: boolean; message: string }>;
}

export async function login(email: string, password: string) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await setSession(data.token, data.user, data.refreshToken);
  return data;
}

export async function logoutRemote() {
  const token = await getToken();
  const refreshToken = await getRefreshToken();
  if (!token) return;
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* ignore */
  }
}

export function fetchSync() {
  return request('/api/sync');
}

export function pushSync(data: unknown) {
  return request('/api/sync', {
    method: 'PUT',
    body: JSON.stringify({ data }),
  });
}

export type AdminOverview = {
  adminEmail: string;
  personalMail: string | null;
  inviteCode: string | null;
  users: { id: string; email: string; name: string; email_verified: number; created_at: string }[];
  pending: {
    id?: string;
    email: string;
    name?: string;
    platform: string;
    expires_at: string;
    created_at: string;
  }[];
  userCount: number;
  pendingCount: number;
  apkVersion?: string;
  apkAvailable?: boolean;
  webUrl?: string;
  downloadPage?: string;
  iosInstallUrl?: string;
  channels?: {
    android: boolean;
    web: boolean;
    iosPwa: boolean;
    iosAppStore: boolean;
  };
  downloadLinks?: {
    id: string;
    label: string | null;
    max_uses: number;
    use_count: number;
    expires_at: string;
    created_at: string;
    revoked_at: string | null;
    last_used_at: string | null;
    created_by: string;
  }[];
};

export function fetchAdminOverview(): Promise<AdminOverview> {
  return request('/api/admin/overview') as Promise<AdminOverview>;
}

export function fetchMe() {
  return request('/api/auth/me') as Promise<{
    user: AuthUser & { email_verified?: number; created_at?: string };
    pendingRegistrationsCount: number;
    pendingRegistrations?: PendingRegistrationSummary[];
  }>;
}

export type PendingRegistrationSummary = {
  email: string;
  name?: string;
  platform?: string;
  expires_at?: string;
  created_at?: string;
};

export function createDownloadLink(opts?: { days?: number; maxUses?: number; label?: string }) {
  return request('/api/admin/download-links', {
    method: 'POST',
    body: JSON.stringify(opts || {}),
  }) as Promise<{ id: string; url: string; expiresAt: string; maxUses: number }>;
}

export function sendDownloadLinkEmail(email: string, opts?: { days?: number; maxUses?: number }) {
  return request('/api/admin/send-download-link', {
    method: 'POST',
    body: JSON.stringify({ email, ...opts }),
  }) as Promise<{
    ok: boolean;
    mailed: boolean;
    url: string;
    webUrl?: string;
    downloadPage?: string;
    iosInstallUrl?: string;
    inviteCode?: string | null;
    apkIncluded?: boolean;
    message: string;
  }>;
}

export function revokeDownloadLink(id: string) {
  return request(`/api/admin/download-links/${id}/revoke`, { method: 'POST', body: '{}' });
}

export function approvePendingRegistration(email: string) {
  return request('/api/admin/approve-pending', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }) as Promise<{ ok: boolean; message: string }>;
}

export function rejectPendingRegistration(email: string) {
  return request('/api/admin/reject-pending', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }) as Promise<{ ok: boolean; message: string }>;
}

export function resendPendingVerification(email: string) {
  return request('/api/admin/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }) as Promise<{ ok: boolean; mailed?: boolean; message: string }>;
}

/** Gestionnaires : admin@… + paveldelhomme@gmail.com (+ EXPO_PUBLIC / extra). */
export function isManagerEmail(email?: string | null, userFlag?: boolean | null): boolean {
  if (userFlag === true) return true;
  const e = String(email || '')
    .toLowerCase()
    .trim();
  if (!e) return false;
  if (e === 'admin@delhomme.ovh') return true;
  if (e === 'paveldelhomme@gmail.com') return true;
  const personal = (
    process.env.EXPO_PUBLIC_PERSONAL_MAIL ||
    Constants.expoConfig?.extra?.personalMail ||
    ''
  )
    .toString()
    .toLowerCase()
    .trim();
  return Boolean(personal && e === personal);
}

export type AppVersionInfo = {
  version: string;
  minVersion: string;
  forceUpdate: boolean;
  apkUrl: string | null;
  apkAvailable?: boolean;
  webUrl?: string;
  iosInstallUrl?: string;
  releaseNotes: string;
  downloadPage: string;
  channels?: {
    android: boolean;
    web: boolean;
    iosPwa: boolean;
    iosAppStore: boolean;
  };
};

export async function fetchAppVersion(): Promise<AppVersionInfo> {
  const res = await fetch(`${API_URL}/api/version`);
  if (!res.ok) throw new Error('Impossible de vérifier la version');
  return res.json();
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function getLocalAppVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

export { API_URL };
