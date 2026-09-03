/** Helpers niveau carburant estimé par véhicule (multi-voitures). */

import type { FillUp, Vehicle } from '@/types';
import { updateVehicle } from '@/lib/database';
import { estimateFuelUsed } from '@/lib/calculations';

/** Applique un plein au niveau estimé du véhicule. */
export async function applyFillUpToFuelEstimate(
  vehicle: Vehicle,
  fill: Pick<FillUp, 'liters' | 'isFull'>
): Promise<number> {
  let next: number;
  if (fill.isFull) {
    next = vehicle.tankCapacity;
  } else if (vehicle.estimatedFuelLiters != null) {
    next = Math.min(vehicle.tankCapacity, vehicle.estimatedFuelLiters + fill.liters);
  } else {
    // Inconnu avant : on considère que le plein remplit « presque » jusqu’à liters ajoutés
    // (hypothèse prudente : réservoir était bas)
    next = Math.min(vehicle.tankCapacity, fill.liters);
  }
  next = Math.round(next * 10) / 10;
  await updateVehicle(vehicle.id, { estimatedFuelLiters: next });
  return next;
}

/** Décrémente le niveau après un trajet. */
export async function applyTripFuelBurn(vehicle: Vehicle, distanceKm: number): Promise<number | null> {
  if (vehicle.estimatedFuelLiters == null || distanceKm <= 0) return vehicle.estimatedFuelLiters;
  const burned = estimateFuelUsed(distanceKm, vehicle.consumptionPer100);
  const next = Math.max(0, Math.round((vehicle.estimatedFuelLiters - burned) * 10) / 10);
  await updateVehicle(vehicle.id, { estimatedFuelLiters: next });
  return next;
}

/** Fixe un niveau approximatif (fraction 0–1 du réservoir). */
export async function setFuelFraction(vehicle: Vehicle, fraction: number): Promise<number> {
  const f = Math.max(0, Math.min(1, fraction));
  const next = Math.round(vehicle.tankCapacity * f * 10) / 10;
  await updateVehicle(vehicle.id, { estimatedFuelLiters: next });
  return next;
}

export function fuelLevelLabel(vehicle: Vehicle): string {
  if (vehicle.estimatedFuelLiters == null) return 'Niveau inconnu';
  const pct = fuelLevelPercent(vehicle);
  return `${vehicle.estimatedFuelLiters.toFixed(1)} L (~${pct.toFixed(0)} %)`;
}

/** 0–100, ou 0 si inconnu. */
export function fuelLevelPercent(vehicle: Vehicle): number {
  if (vehicle.estimatedFuelLiters == null || vehicle.tankCapacity <= 0) return 0;
  return Math.min(100, Math.max(0, (vehicle.estimatedFuelLiters / vehicle.tankCapacity) * 100));
}
