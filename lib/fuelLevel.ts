/** Helpers niveau carburant estimé par véhicule (multi-voitures). */

import type { FillUp, Vehicle } from '@/types';
import { updateVehicle } from '@/lib/database';
import { estimateTripFuelLiters } from '@/lib/consumptionModel';

export type FillFuelPreview = {
  beforeLiters: number | null;
  afterLiters: number;
  mode: 'full' | 'add' | 'replace_unknown';
  summary: string;
};

/**
 * Aperçu avant enregistrement :
 * - plein complet → réservoir = capacité (le reste précédent est « complété »)
 * - partiel + niveau connu → reste + litres ajoutés (plafonné capacité)
 * - partiel + niveau inconnu → seulement les litres saisis
 */
export function previewFillUpFuel(
  vehicle: Vehicle,
  fill: Pick<FillUp, 'liters' | 'isFull'>
): FillFuelPreview {
  const before = vehicle.estimatedFuelLiters;
  if (fill.isFull) {
    return {
      beforeLiters: before,
      afterLiters: vehicle.tankCapacity,
      mode: 'full',
      summary:
        before != null
          ? `Avant ~${before.toFixed(1)} L → plein = ${vehicle.tankCapacity} L (capacité)`
          : `Plein complet → ${vehicle.tankCapacity} L (capacité du réservoir)`,
    };
  }
  if (before != null) {
    const after = Math.min(vehicle.tankCapacity, before + fill.liters);
    return {
      beforeLiters: before,
      afterLiters: Math.round(after * 10) / 10,
      mode: 'add',
      summary: `Avant ~${before.toFixed(1)} L + ${fill.liters.toFixed(1)} L → ~${after.toFixed(1)} L`,
    };
  }
  const after = Math.min(vehicle.tankCapacity, fill.liters);
  return {
    beforeLiters: null,
    afterLiters: Math.round(after * 10) / 10,
    mode: 'replace_unknown',
    summary: `Niveau inconnu → estime ~${after.toFixed(1)} L (litres de ce plein seulement)`,
  };
}

/** Applique un plein au niveau estimé du véhicule. */
export async function applyFillUpToFuelEstimate(
  vehicle: Vehicle,
  fill: Pick<FillUp, 'liters' | 'isFull'>
): Promise<number> {
  const preview = previewFillUpFuel(vehicle, fill);
  const next = preview.afterLiters;
  await updateVehicle(vehicle.id, { estimatedFuelLiters: next });
  return next;
}

/**
 * Après modification d’un plein déjà enregistré : retire l’ancien apport litres, puis réapplique.
 */
export async function reapplyFillUpFuelEstimate(
  vehicle: Vehicle,
  previous: Pick<FillUp, 'liters' | 'isFull'>,
  nextFill: Pick<FillUp, 'liters' | 'isFull'>
): Promise<number | null> {
  if (vehicle.estimatedFuelLiters == null) {
    return applyFillUpToFuelEstimate(vehicle, nextFill);
  }
  const undone = Math.max(
    0,
    Math.round((vehicle.estimatedFuelLiters - previous.liters) * 10) / 10
  );
  const virtual: Vehicle = { ...vehicle, estimatedFuelLiters: undone };
  return applyFillUpToFuelEstimate(virtual, nextFill);
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

/** Fixe un niveau en litres. */
export async function setFuelLiters(vehicle: Vehicle, liters: number): Promise<number> {
  const next = Math.min(
    vehicle.tankCapacity,
    Math.max(0, Math.round(liters * 10) / 10)
  );
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

/** Autonomie basse ≈ ⅓ réservoir ; critique ≈ ¼. */
export const FUEL_WARN_FRACTION = 1 / 3;
export const FUEL_CRITICAL_FRACTION = 1 / 4;

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
  const warnLiters =
    lowLitersThreshold != null && lowLitersThreshold > 0
      ? lowLitersThreshold
      : tankCapacity * FUEL_WARN_FRACTION;
  const criticalLiters = Math.min(warnLiters * 0.75, tankCapacity * FUEL_CRITICAL_FRACTION);

  // Seuils km (approx) : critique ~¼ plein, warn ~⅓ — basés sur conso typique ~8 L/100
  const criticalKm = tankCapacity * FUEL_CRITICAL_FRACTION * (100 / 8);
  const warnKm = tankCapacity * FUEL_WARN_FRACTION * (100 / 8);

  if (
    litersRemaining <= criticalLiters ||
    pct <= FUEL_CRITICAL_FRACTION * 100 ||
    (rangeKm != null && rangeKm > 0 && rangeKm < criticalKm)
  ) {
    return 'critical';
  }
  if (
    litersRemaining <= warnLiters ||
    pct <= FUEL_WARN_FRACTION * 100 ||
    (rangeKm != null && rangeKm > 0 && rangeKm < warnKm)
  ) {
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
