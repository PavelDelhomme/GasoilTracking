/** Demande un niveau de carburant approximatif (début / fin de trajet). */
import { Alert, Platform } from 'react-native';
import type { Vehicle } from '@/types';
import { setFuelFraction } from '@/lib/fuelLevel';
import { updateVehicle } from '@/lib/database';

export type FuelGaugeResult = {
  liters: number;
  skipped: boolean;
};

/**
 * Demande le niveau essence (fractions ou saisie litres).
 * Android : Alert limité à ~3 boutons → menus en cascade.
 * `skipped: true` si l’utilisateur passe.
 */
export function askFuelGaugeApprox(
  vehicle: Vehicle,
  title: string,
  message: string
): Promise<FuelGaugeResult> {
  return new Promise((resolve) => {
    const skip = () =>
      resolve({ liters: vehicle.estimatedFuelLiters ?? 0, skipped: true });

    const setLiters = async (liters: number) => {
      const v = Math.min(vehicle.tankCapacity, Math.max(0, Math.round(liters * 10) / 10));
      await updateVehicle(vehicle.id, { estimatedFuelLiters: v });
      resolve({ liters: v, skipped: false });
    };

    const pickFraction = async (f: number) => {
      const liters = await setFuelFraction(vehicle, f);
      resolve({ liters, skipped: false });
    };

    const askLitersNative = () => {
      if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
        Alert.prompt(
          'Litres restants',
          `Capacité ${vehicle.tankCapacity} L`,
          async (text) => {
            const n = Number(String(text || '').replace(',', '.'));
            if (!Number.isFinite(n) || n < 0) {
              skip();
              return;
            }
            await setLiters(n);
          }
        );
        return;
      }
      // Android : 4 niveaux rapides (pas de prompt natif)
      Alert.alert('Niveau approximatif', `Réservoir ${vehicle.tankCapacity} L`, [
        { text: 'Plein', onPress: () => void pickFraction(1) },
        { text: '1/2', onPress: () => void pickFraction(0.5) },
        { text: '1/4', onPress: () => void pickFraction(0.25) },
        { text: 'Passer', style: 'cancel', onPress: skip },
      ]);
    };

    const askMoreFractions = () => {
      Alert.alert(title, 'Niveau plus précis', [
        { text: '3/4', onPress: () => void pickFraction(0.75) },
        { text: 'Presque vide', onPress: () => void pickFraction(0.1) },
        { text: 'Retour', style: 'cancel', onPress: () => showRoot() },
      ]);
    };

    const showRoot = () => {
      Alert.alert(title, message, [
        { text: 'Passer', style: 'cancel', onPress: skip },
        { text: 'Plein / 1/2 / 1/4…', onPress: askLitersNative },
        { text: 'Autres niveaux', onPress: askMoreFractions },
      ]);
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const choice = window.prompt(
        `${title}\n\n${message}\n\nFractions : 1 / 0.75 / 0.5 / 0.25 / 0.1\nou litres (ex. 28)\n(Annuler = passer)`,
        vehicle.estimatedFuelLiters != null ? String(vehicle.estimatedFuelLiters) : ''
      );
      if (choice == null || choice.trim() === '') {
        skip();
        return;
      }
      const raw = choice.trim().replace(',', '.');
      const n = Number(raw);
      void (async () => {
        if (!Number.isFinite(n) || n < 0) {
          skip();
          return;
        }
        if (n <= 1) {
          await pickFraction(n);
          return;
        }
        await setLiters(n);
      })();
      return;
    }

    showRoot();
  });
}
