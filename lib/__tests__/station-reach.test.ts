import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@/types';
import type { FuelStationPrice } from '@/lib/fuelPrices';
import {
  estimatedRangeKm,
  fuelLitersToDriveKm,
  pickCheapestReachableStations,
  stationSearchRadiusKm,
} from '@/lib/stationDetour';

const vehicle: Vehicle = {
  id: 1,
  name: '206',
  brand: 'Peugeot',
  model: '206',
  year: 2003,
  fuelType: 'essence',
  consumptionPer100: 6.5,
  tankCapacity: 50,
  defaultFuelPrice: 1.8,
  currentOdometer: 121575,
  hasOdometer: true,
  trackedKm: 0,
  estimatedFuelLiters: 12.5,
  isActive: true,
  createdAt: '',
};

function st(
  id: string,
  km: number,
  e10: number,
  name = id
): FuelStationPrice {
  return {
    id,
    name,
    address: '',
    city: 'Rennes',
    latitude: 48.1,
    longitude: -1.6,
    prices: { e10 },
    distanceKm: km,
  };
}

describe('estimatedRangeKm', () => {
  it('quart de 50 L à 6,5 L/100 ≈ 192 km', () => {
    expect(estimatedRangeKm(vehicle, 12.5)).toBeCloseTo(192.3, 0);
  });
});

describe('pickCheapestReachableStations', () => {
  it('prend la moins chère encore joignable, pas la plus proche', () => {
    const top = pickCheapestReachableStations({
      stations: [
        st('proche-cher', 3, 1.89, 'Proche'),
        st('loin-pas-cher', 12, 1.62, 'Pas cher'),
        st('injoignable', 250, 1.4, 'Trop loin'),
      ],
      vehicle,
      litersRemaining: 12.5,
      limit: 3,
    });
    expect(top[0]?.name).toBe('Pas cher');
    expect(top.some((s) => s.name === 'Trop loin')).toBe(false);
  });

  it('exclut une station trop loin pour le réservoir', () => {
    const top = pickCheapestReachableStations({
      stations: [st('loin', 40, 1.5, 'Loin')],
      vehicle,
      litersRemaining: 1.2,
      limit: 3,
    });
    expect(top).toHaveLength(0);
    expect(fuelLitersToDriveKm(vehicle, 40)).toBeGreaterThan(1.2);
  });
});

describe('stationSearchRadiusKm', () => {
  it('plafonne à 30 km', () => {
    expect(stationSearchRadiusKm(200)).toBe(30);
    expect(stationSearchRadiusKm(5)).toBe(8);
  });
});
