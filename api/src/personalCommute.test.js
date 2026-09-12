import { describe, expect, it } from 'vitest';
import {
  applyPersonalCommute,
  applyPersonalFillUp,
  downsampleCoords,
  localDayIso,
} from './personalCommute.js';

const vehicle = {
  id: 3,
  name: '206',
  brand: 'Peugeot',
  model: '206',
  year: 2003,
  fuelType: 'essence',
  consumptionPer100: 6.5,
  tankCapacity: 50,
  defaultFuelPrice: 1.79,
  currentOdometer: 121400,
  hasOdometer: true,
  trackedKm: 0,
  estimatedFuelLiters: 18.4,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const route = {
  distanceKm: 44.7,
  durationMinutes: 53,
  coordinates: [
    { latitude: 48.1572, longitude: -1.587 },
    { latitude: 47.9484, longitude: -1.2237 },
  ],
};

describe('applyPersonalCommute', () => {
  it('ajoute l’aller, fixe 121575 km et le quart de réservoir', () => {
    const r = applyPersonalCommute({ vehicles: [vehicle], trips: [], places: [] }, route);
    expect(r.ok).toBe(true);
    expect(r.already).toBe(false);
    const v = r.snapshot.vehicles.find((x) => x.id === 3);
    expect(v.currentOdometer).toBe(121575);
    expect(v.estimatedFuelLiters).toBe(12.5);
    expect(r.snapshot.trips).toHaveLength(1);
    expect(r.snapshot.trips[0].originName).toMatch(/Camille Saint-Saëns/);
    expect(r.snapshot.trips[0].destinationName).toMatch(/Intermarché/);
    expect(r.snapshot.trips[0].distanceKm).toBe(44.7);
    expect(r.snapshot.places.some((p) => p.kind === 'home')).toBe(true);
    expect(localDayIso('2026-09-12', '07:45')).toBe('2026-09-12T07:45:00+02:00');
  });

  it('ne duplique pas le trajet du jour', () => {
    const first = applyPersonalCommute({ vehicles: [vehicle], trips: [], places: [] }, route);
    const second = applyPersonalCommute(first.snapshot, route);
    expect(second.already).toBe(true);
    expect(second.snapshot.trips).toHaveLength(1);
    expect(second.snapshot.vehicles[0].estimatedFuelLiters).toBe(12.5);
  });

  it('ne remet pas la jauge à 1/4 si le trajet existe déjà après un plein', () => {
    const first = applyPersonalCommute({ vehicles: [vehicle], trips: [], places: [] }, route);
    first.snapshot.vehicles[0].estimatedFuelLiters = 50;
    const second = applyPersonalCommute(first.snapshot, route);
    expect(second.already).toBe(true);
    expect(second.snapshot.vehicles[0].estimatedFuelLiters).toBe(50);
  });
});

describe('applyPersonalFillUp', () => {
  it('ajoute le plein Intermarché et met le réservoir plein', () => {
    const r = applyPersonalFillUp(
      { vehicles: [vehicle], trips: [], places: [], fillUps: [] },
      route,
      {
        fillUp: {
          liters: 34.62,
          totalCost: 75.09,
          isFull: true,
          stationName: 'Intermarché La Guerche de Bretagne',
        },
      }
    );
    expect(r.ok).toBe(true);
    expect(r.already).toBe(false);
    expect(r.liters).toBe(34.62);
    expect(r.totalCost).toBe(75.09);
    expect(r.pricePerLiter).toBe(2.169);
    expect(r.estimatedFuelLiters).toBe(50);
    expect(r.snapshot.fillUps).toHaveLength(1);
    expect(r.snapshot.trips).toHaveLength(1);
    expect(r.snapshot.fillUps[0].note).toMatch(/Intermarché/);
    expect(r.snapshot.trips[0].fillUpId).toBe(r.fillUpId);
    expect(r.snapshot.vehicles[0].defaultFuelPrice).toBe(2.169);
  });

  it('ne duplique pas le même plein', () => {
    const first = applyPersonalFillUp(
      { vehicles: [vehicle], trips: [], places: [], fillUps: [] },
      route,
      { fillUp: { liters: 34.62, totalCost: 75.09, isFull: true } }
    );
    const second = applyPersonalFillUp(first.snapshot, route, {
      fillUp: { liters: 34.62, totalCost: 75.09, isFull: true },
    });
    expect(second.already).toBe(true);
    expect(second.snapshot.fillUps).toHaveLength(1);
    expect(second.estimatedFuelLiters).toBe(50);
  });
});

describe('downsampleCoords', () => {
  it('garde début et fin', () => {
    const pts = Array.from({ length: 500 }, (_, i) => ({ latitude: i, longitude: i }));
    const d = downsampleCoords(pts, 10);
    expect(d).toHaveLength(10);
    expect(d[0]).toEqual(pts[0]);
    expect(d[9]).toEqual(pts[499]);
  });
});
