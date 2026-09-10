import { describe, expect, it } from 'vitest';
import { parseOsmMaxspeed } from '@/lib/roadSpeedLimits';
import { findUpcomingManeuver } from '@/lib/navGuidance';
import { suggestPhysicsFields } from '@/lib/vehiclePhysics';
import { rankStationsForDetour } from '@/lib/stationDetour';
import type { Vehicle } from '@/types';

describe('parseOsmMaxspeed', () => {
  it('parse numérique et tags FR', () => {
    expect(parseOsmMaxspeed('50')).toBe(50);
    expect(parseOsmMaxspeed('90 km/h')).toBe(90);
    expect(parseOsmMaxspeed('FR:urban')).toBe(50);
    expect(parseOsmMaxspeed('FR:motorway')).toBe(130);
    expect(parseOsmMaxspeed('none')).toBeNull();
  });
});

describe('findUpcomingManeuver', () => {
  it('saute la manœuvre déjà atteinte', () => {
    const steps = [
      {
        instruction: 'Départ',
        type: 'depart',
        distanceM: 0,
        location: { latitude: 48.1, longitude: -1.68 },
      },
      {
        instruction: 'Tournez à droite',
        type: 'turn',
        modifier: 'right',
        distanceM: 200,
        location: { latitude: 48.101, longitude: -1.68 },
        name: 'Av. Test',
      },
      {
        instruction: 'Arrivée',
        type: 'arrive',
        distanceM: 0,
        location: { latitude: 48.11, longitude: -1.67 },
      },
    ];
    const next = findUpcomingManeuver({ latitude: 48.1, longitude: -1.68 }, steps);
    expect(next?.type).toBe('turn');
  });
});

describe('suggestPhysicsFields catalogue', () => {
  it('renseigne masse/SCx pour 206 / 208 / Touran', () => {
    expect(suggestPhysicsFields('Peugeot', '206').curbWeightKg).toBe(1025);
    expect(suggestPhysicsFields('Peugeot', '208').dragAreaScx).toBeCloseTo(0.61);
    expect(suggestPhysicsFields('Volkswagen', 'Touran').curbWeightKg).toBe(1550);
  });
});

describe('rankStationsForDetour', () => {
  const vehicle = {
    id: 1,
    name: '206',
    brand: 'Peugeot',
    model: '206',
    year: 2003,
    fuelType: 'essence' as const,
    consumptionPer100: 6.5,
    tankCapacity: 50,
    defaultFuelPrice: 1.8,
    currentOdometer: 1,
    hasOdometer: true,
    trackedKm: 0,
    estimatedFuelLiters: 8,
    isActive: true,
    createdAt: '',
  } satisfies Vehicle;

  it('préfère une station pas chère pas trop loin', () => {
    const ranked = rankStationsForDetour({
      vehicle,
      litersRemaining: 8,
      limit: 3,
      stations: [
        {
          id: '1',
          name: 'Loin cher',
          address: '',
          city: '',
          latitude: 48.2,
          longitude: -1.5,
          prices: { e10: 1.95 },
          distanceKm: 18,
        },
        {
          id: '2',
          name: 'Proche ok',
          address: '',
          city: '',
          latitude: 48.12,
          longitude: -1.67,
          prices: { e10: 1.72 },
          distanceKm: 3,
        },
        {
          id: '3',
          name: 'Très pas cher loin',
          address: '',
          city: '',
          latitude: 48.3,
          longitude: -1.4,
          prices: { e10: 1.55 },
          distanceKm: 25,
        },
      ],
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].name).toBe('Proche ok');
  });
});
