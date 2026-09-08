/** Demande un niveau de carburant approximatif (début / fin de trajet). */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Vehicle } from '@/types';
import { setFuelLiters } from '@/lib/fuelLevel';
import { requestFuelGaugeModal } from '@/components/FuelGaugeModalHost';

export type FuelGaugeResult = {
  liters: number;
  skipped: boolean;
};

const GAUGE_ASKED_KEY = (vehicleId: number) => `gasoil_gauge_asked_${vehicleId}`;

/** Skip intelligent : jauge connue récemment → ne pas redemander. */
export async function shouldSkipFuelGauge(
  vehicle: Vehicle,
  opts?: { maxAgeHours?: number }
): Promise<boolean> {
  if (vehicle.estimatedFuelLiters == null) return false;
  const maxAge = (opts?.maxAgeHours ?? 18) * 3600_000;
  try {
    const raw = await AsyncStorage.getItem(GAUGE_ASKED_KEY(vehicle.id));
    // Jamais saisi → demander au moins une fois (ne pas skipper sur une estimation seule).
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < maxAge;
  } catch {
    return false;
  }
}

async function markGaugeAsked(vehicleId: number) {
  try {
    await AsyncStorage.setItem(GAUGE_ASKED_KEY(vehicleId), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Demande le niveau de carburant via jauge visuelle (modal).
 * `force: false` + saisie récente → skip auto.
 */
export async function askFuelGaugeApprox(
  vehicle: Vehicle,
  title: string,
  message: string,
  opts?: { force?: boolean; softSkip?: boolean }
): Promise<FuelGaugeResult> {
  if (!opts?.force) {
    const skipOk = await shouldSkipFuelGauge(vehicle);
    // Soft-skip uniquement si demandé explicitement (évite de sauter la 1ʳᵉ saisie).
    if (skipOk && opts?.softSkip === true) {
      return {
        liters: vehicle.estimatedFuelLiters ?? 0,
        skipped: true,
      };
    }
  }

  // Web : prompt simple
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const choice = window.prompt(
      `${title}\n\n${message}\n\nLitres restants (ex. 28)\n(Annuler = passer)`,
      vehicle.estimatedFuelLiters != null ? String(vehicle.estimatedFuelLiters) : ''
    );
    if (choice == null || choice.trim() === '') {
      return { liters: vehicle.estimatedFuelLiters ?? 0, skipped: true };
    }
    const n = Number(choice.trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      return { liters: vehicle.estimatedFuelLiters ?? 0, skipped: true };
    }
    const liters = await setFuelLiters(vehicle, n <= 1 ? n * vehicle.tankCapacity : n);
    await markGaugeAsked(vehicle.id);
    return { liters, skipped: false };
  }

  const result = await new Promise<FuelGaugeResult>((resolve) => {
    const ok = requestFuelGaugeModal({
      vehicle,
      title,
      message,
      resolve,
    });
    if (!ok) {
      // Host pas encore monté → skip
      resolve({ liters: vehicle.estimatedFuelLiters ?? 0, skipped: true });
    }
  });

  if (!result.skipped) {
    await setFuelLiters(vehicle, result.liters);
    await markGaugeAsked(vehicle.id);
  }
  return result;
}
