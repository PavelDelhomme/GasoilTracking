import { describe, expect, it } from 'vitest';
import {
  accelAggressionFactor,
  estimateTripFuelLiters,
  type PointLike,
} from '@/lib/consumptionModel';
import type { Vehicle } from '@/types';

const vehicle: Vehicle = {
  id: 2,
  name: 'Peugeot 206',
  brand: 'Peugeot',
  model: '206',
  year: 2003,
  fuelType: 'essence',
  consumptionPer100: 5.2,
  tankCapacity: 50,
  defaultFuelPrice: 1.79,
  currentOdometer: 120000,
  hasOdometer: true,
  trackedKm: 0,
  estimatedFuelLiters: 40,
  isActive: true,
  createdAt: '',
  consumptionLearnFactor: 1,
};

/** Fenêtre avec accélérations agressives (Δv ≥ 15 km/h en < 4 s), vitesses ≤ 130. */
function harshAccelPoints(): PointLike[] {
  const pts: PointLike[] = [];
  let t = 1_000_000;
  let lat = 48.1;
  const lon = -1.6;
  // Alternance 10 ↔ 40 km/h sur 2,5 s
  const speeds = [10, 40, 12, 45, 8, 42, 10, 38, 9, 44, 11, 40, 10, 41, 9];
  for (let i = 0; i < speeds.length; i++) {
    const v = speeds[i];
    const dt = 2500;
    const dKm = (v * dt) / 3_600_000;
    lat += dKm / 111;
    pts.push({ latitude: lat, longitude: lon, timestamp: t });
    t += dt;
  }
  return pts;
}

function calmPoints(): PointLike[] {
  const pts: PointLike[] = [];
  let t = 1_000_000;
  let lat = 48.1;
  for (let i = 0; i < 15; i++) {
    lat += 0.001; // ~111 m / 5 s ≈ 80 km/h stable
    pts.push({ latitude: lat, longitude: -1.6, timestamp: t });
    t += 5000;
  }
  return pts;
}

describe('consumption-accel', () => {
  it('accelAggressionFactor > 1 sur conduite agressive', () => {
    const f = accelAggressionFactor(harshAccelPoints());
    expect(f).toBeGreaterThan(1);
    expect(f).toBeLessThanOrEqual(1.14);
  });

  it('accelAggressionFactor ≈ 1 sur conduite calme', () => {
    expect(accelAggressionFactor(calmPoints())).toBe(1);
  });

  it('accelFactor augmente estimateTripFuelLiters', () => {
    const pts = harshAccelPoints();
    const accel = accelAggressionFactor(pts);
    expect(accel).toBeGreaterThan(1);
    const base = estimateTripFuelLiters(vehicle, 20, {
      avgSpeedKmh: 50,
      idleRatio: 0.05,
      accelFactor: 1,
      stopGoFactor: 1,
    });
    const aggressive = estimateTripFuelLiters(vehicle, 20, {
      avgSpeedKmh: 50,
      idleRatio: 0.05,
      accelFactor: accel,
      stopGoFactor: 1,
    });
    expect(aggressive).toBeGreaterThan(base);
  });
});
