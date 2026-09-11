/**
 * Préférences client synchronisées via le snapshot cloud
 * (survit à un wipe local / nouvel appareil).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_DONE_KEY = 'gasoil_onboarding_done_v2';
const ONBOARDING_DONE_V1 = 'gasoil_onboarding_done_v1';

export type ClientPrefs = {
  /** Visite guidée déjà terminée / passée sur ce compte. */
  onboardingDoneV2?: boolean;
};

export async function readOnboardingDoneLocal(): Promise<boolean> {
  try {
    const [v2, v1] = await AsyncStorage.multiGet([ONBOARDING_DONE_KEY, ONBOARDING_DONE_V1]);
    return v2?.[1] === '1' || v1?.[1] === '1';
  } catch {
    return false;
  }
}

export async function writeOnboardingDoneLocal(done: boolean): Promise<void> {
  if (done) {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
  } else {
    await AsyncStorage.multiRemove([ONBOARDING_DONE_KEY, ONBOARDING_DONE_V1]);
  }
}

export async function collectClientPrefs(): Promise<ClientPrefs> {
  return { onboardingDoneV2: await readOnboardingDoneLocal() };
}

/** Fusion sticky : une fois faite nulle part → reste faite. */
export function mergeClientPrefs(
  local: ClientPrefs | null | undefined,
  remote: ClientPrefs | null | undefined
): ClientPrefs {
  return {
    onboardingDoneV2: !!(local?.onboardingDoneV2 || remote?.onboardingDoneV2),
  };
}

export async function applyClientPrefs(prefs: ClientPrefs | null | undefined): Promise<void> {
  if (!prefs) return;
  if (prefs.onboardingDoneV2) {
    await writeOnboardingDoneLocal(true);
  }
}

export function normalizeClientPrefs(raw: unknown): ClientPrefs | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Record<string, unknown>;
  const prefs: ClientPrefs = {};
  if (d.onboardingDoneV2 === true || d.onboardingDoneV2 === 1 || d.onboardingDoneV2 === '1') {
    prefs.onboardingDoneV2 = true;
  }
  return Object.keys(prefs).length ? prefs : undefined;
}
