import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'https://gasoil-tracking.delhomme.ovh';

const TOKEN_KEY = 'gasoil_auth_token';
const USER_KEY = 'gasoil_auth_user';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setSession(token: string, user: { id: string; email: string; name: string }) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function request(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export function register(email: string, password: string, name: string, inviteCode: string) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, inviteCode }),
  });
}

export function login(email: string, password: string) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
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

export type AppVersionInfo = {
  version: string;
  minVersion: string;
  forceUpdate: boolean;
  apkUrl: string;
  releaseNotes: string;
  downloadPage: string;
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
