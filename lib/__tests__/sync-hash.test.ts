import { describe, expect, it } from 'vitest';
import { snapshotContentHash } from '@/lib/snapshotHash';

describe('snapshotContentHash', () => {
  const base = {
    schema: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    appVersion: '1.4.85',
    vehicles: [
      {
        id: 1,
        estimatedFuelLiters: 13.9,
        currentOdometer: 120000,
        trackedKm: 10,
        consumptionLearnFactor: 1,
        isActive: true,
      },
    ],
    fillUps: [] as Array<{
      id: number;
      vehicleId: number;
      date: string;
      liters: number;
      totalCost: number;
      isFull: boolean;
    }>,
    budgets: [] as Array<{
      id: number;
      vehicleId: number | null;
      amount: number;
      spent: number;
      isActive: boolean;
      period: string;
    }>,
    trips: [
      {
        id: 1,
        vehicleId: 1,
        distanceKm: 42,
        startTime: '2026-09-01T10:00:00.000Z',
        endTime: '2026-09-01T11:00:00.000Z',
        status: 'confirmed',
        isActive: false,
        estimatedFuelUsed: 2.5,
        estimatedCost: 4.5,
        destinationName: 'Maison',
      },
    ],
    places: [] as Array<{ id: number; name: string; latitude: number; longitude: number }>,
    recurringRoutes: [] as Array<{ id: number; distanceKm: number; name: string }>,
    maintenances: [] as Array<{
      id: number;
      vehicleId: number;
      kind: string;
      doneAt: string | null;
      amount: number | null;
      status: string;
    }>,
  };

  it('ignore exportedAt (hash stable)', () => {
    const a = snapshotContentHash({ ...base, exportedAt: '2026-01-01T00:00:00.000Z' });
    const b = snapshotContentHash({ ...base, exportedAt: '2026-09-10T12:00:00.000Z' });
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it('égalité → skip sync cosmétique', () => {
    const local = snapshotContentHash(base);
    const remote = snapshotContentHash({
      ...base,
      exportedAt: new Date().toISOString(),
    });
    expect(local).toBe(remote);
  });

  it('change métier → hash différent', () => {
    const a = snapshotContentHash(base);
    const b = snapshotContentHash({
      ...base,
      vehicles: [{ ...base.vehicles[0], estimatedFuelLiters: 40.7 }],
    });
    expect(a).not.toBe(b);
  });
});
