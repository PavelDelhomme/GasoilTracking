/** Helpers niveau carburant estimé par véhicule (multi-voitures). */

import type { FillUp, Vehicle } from '@/types';
import { updateVehicle } from '@/lib/database';
import { estimateTripFuelLiters } from '@/lib/consumptionModel';

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
    next = Math.min(vehicle.tankCapacity, fill.liters);
  }
  next = Math.round(next * 10) / 10;
  await updateVehicle(vehicle.id, { estimatedFuelLiters: next });
  return next;
}

/** Décrémente le niveau après un trajet (modèle conso réaliste). */
export async function applyTripFuelBurn(
  vehicle: Vehicle,
  distanceKm: number,
  ascentM = 0
): Promise<number | null> {
  if (vehicle.estimatedFuelLiters == null || distanceKm <= 0) return vehicle.estimatedFuelLiters;
  const burned = estimateTripFuelLiters(vehicle, distanceKm, {
    ascentM,
    learnedFactor: vehicle.consumptionLearnFactor,
  });
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

/**
 * Met à jour le facteur d’apprentissage (EMA) après saisie jauge début/fin.
 */
export async function blendConsumptionLearnFactor(
  vehicle: Vehicle,
  sampleFactor: number
): Promise<number> {
  const prev = vehicle.consumptionLearnFactor && vehicle.consumptionLearnFactor > 0.5
    ? vehicle.consumptionLearnFactor
    : 1;
  const next = Math.round((prev * 0.72 + sampleFactor * 0.28) * 1000) / 1000;
  await updateVehicle(vehicle.id, { consumptionLearnFactor: next });
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

export type FuelTone = 'ok' | 'warn' | 'critical' | 'unknown';

export function fuelRemainingTone(opts: {
  litersRemaining: number | null | undefined;
  tankCapacity: number;
  lowLitersThreshold?: number | null;
  rangeKm?: number | null;
}): FuelTone {
  const { litersRemaining, tankCapacity, lowLitersThreshold, rangeKm } = opts;
  if (litersRemaining == null || !Number.isFinite(litersRemaining) || tankCapacity <= 0) {
    return 'unknown';
  }
  const pct = (litersRemaining / tankCapacity) * 100;
  const lowAbs =
    lowLitersThreshold != null && lowLitersThreshold > 0
      ? lowLitersThreshold
      : Math.max(8, tankCapacity * 0.12);

  if (litersRemaining <= lowAbs * 0.55 || pct < 12 || (rangeKm != null && rangeKm > 0 && rangeKm < 60)) {
    return 'critical';
  }
  if (litersRemaining <= lowAbs || pct < 28 || (rangeKm != null && rangeKm > 0 && rangeKm < 140)) {
    return 'warn';
  }
  return 'ok';
}

export function fuelToneColor(
  tone: FuelTone,
  colors: { success: string; warning: string; danger: string; text: string }
): string {
  switch (tone) {
    case 'critical':
      return colors.danger;
    case 'warn':
      return colors.warning;
    case 'ok':
      return colors.success;
    default:
      return colors.text;
  }
}
