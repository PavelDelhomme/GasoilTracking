/** Demande un niveau de carburant approximatif (début / fin de trajet). */
import { Alert, Platform } from 'react-native';
import type { Vehicle } from '@/types';
import { setFuelFraction } from '@/lib/fuelLevel';
import { updateVehicle } from '@/lib/database';

export type FuelGaugeResult = {
  liters: number;
  skipped: boolean;
};

function fractionButtons(
  vehicle: Vehicle,
  resolve: (r: FuelGaugeResult) => void
): { text: string; onPress: () => void }[] {
  const pick = (f: number) => async () => {
    const liters = await setFuelFraction(vehicle, f);
    resolve({ liters, skipped: false });
  };
  return [
    { text: 'Plein', onPress: pick(1) },
    { text: '3/4', onPress: pick(0.75) },
    { text: '1/2', onPress: pick(0.5) },
    { text: '1/4', onPress: pick(0.25) },
    { text: 'Presque vide', onPress: pick(0.1) },
  ];
}

/**
 * Demande le niveau essence (fractions ou saisie litres).
 * `skipped: true` si l’utilisateur passe.
 */
export function askFuelGaugeApprox(
  vehicle: Vehicle,
  title: string,
  message: string
): Promise<FuelGaugeResult> {
  return new Promise((resolve) => {
    const skip = () => resolve({ liters: vehicle.estimatedFuelLiters ?? 0, skipped: true });

    const askLiters = () => {
      const promptFn =
        Platform.OS === 'ios'
          ? Alert.prompt.bind(Alert)
          : Platform.OS === 'web' && typeof window !== 'undefined'
            ? (t: string, m: string, cb: (text: string | undefined) => void) => {
                const v = window.prompt(`${t}\n${m}`, '');
                cb(v ?? undefined);
              }
            : null;

      if (!promptFn) {
        // Android : pas de prompt natif → on propose 1/2 comme défaut via boutons déjà listés
        skip();
        return;
      }
      promptFn(
        'Litres restants',
        `Capacité ${vehicle.tankCapacity} L — indiquez le niveau actuel`,
        async (text: string | undefined) => {
          const n = Number(String(text || '').replace(',', '.'));
          if (!Number.isFinite(n) || n < 0) {
            skip();
            return;
          }
          const liters = Math.min(vehicle.tankCapacity, Math.round(n * 10) / 10);
          await updateVehicle(vehicle.id, { estimatedFuelLiters: liters });
          resolve({ liters, skipped: false });
        }
      );
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
          const liters = await setFuelFraction(vehicle, n);
          resolve({ liters, skipped: false });
          return;
        }
        const liters = Math.min(vehicle.tankCapacity, Math.round(n * 10) / 10);
        await updateVehicle(vehicle.id, { estimatedFuelLiters: liters });
        resolve({ liters, skipped: false });
      })();
      return;
    }

    Alert.alert(title, message, [
      { text: 'Passer', style: 'cancel', onPress: skip },
      ...fractionButtons(vehicle, resolve),
      { text: 'Saisir L…', onPress: askLiters },
    ]);
  });
}
