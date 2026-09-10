import { describe, expect, it } from 'vitest';
import { parseOsmMaxspeed } from '@/lib/roadSpeedLimits';
import { findUpcomingManeuver } from '@/lib/navGuidance';
import { suggestPhysicsFields } from '@/lib/vehiclePhysics';

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
