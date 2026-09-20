import type { FuelGaugeReading, FuelGaugeSource } from '@/types';
import {
  createFuelGaugeReading,
  getFuelGaugeReadings,
  getVehicleById,
} from '@/lib/database';
import { shouldSkipDuplicateReading } from '@/lib/fuelGaugeHistoryCore';

export { FUEL_GAUGE_SOURCE_LABELS, shouldSkipDuplicateReading } from '@/lib/fuelGaugeHistoryCore';

export async function recordFuelGaugeReading(opts: {
  vehicleId: number;
  liters: number;
  source: FuelGaugeSource;
  tripId?: number | null;
  fillUpId?: number | null;
  odometer?: number | null;
  recordedAt?: string;
  tankCapacity?: number;
}): Promise<FuelGaugeReading | null> {
  const liters = Number(opts.liters);
  if (!Number.isFinite(liters) || liters < 0) return null;

  const vehicle = await getVehicleById(opts.vehicleId);
  const tankCapacity =
    opts.tankCapacity != null && Number.isFinite(opts.tankCapacity) && opts.tankCapacity > 0
      ? opts.tankCapacity
      : vehicle?.tankCapacity ?? 0;
  if (!vehicle && !(tankCapacity > 0)) return null;

  const recordedAt = opts.recordedAt || new Date().toISOString();
  const odometer =
    opts.odometer != null && Number.isFinite(opts.odometer)
      ? opts.odometer
      : vehicle
        ? Math.round((Number(vehicle.currentOdometer) || 0) + (Number(vehicle.trackedKm) || 0))
        : null;

  try {
    const recent = await getFuelGaugeReadings(opts.vehicleId, { limit: 1 });
    if (
      shouldSkipDuplicateReading(recent[0], {
        source: opts.source,
        tripId: opts.tripId,
        liters,
        recordedAt,
      })
    ) {
      return recent[0] ?? null;
    }
  } catch {
    /* lecture optionnelle */
  }

  try {
    return await createFuelGaugeReading({
      vehicleId: opts.vehicleId,
      recordedAt,
      liters: Math.round(liters * 10) / 10,
      tankCapacity: tankCapacity > 0 ? tankCapacity : vehicle?.tankCapacity ?? 50,
      source: opts.source,
      tripId: opts.tripId ?? null,
      fillUpId: opts.fillUpId ?? null,
      odometer,
    });
  } catch {
    return null;
  }
}
