import { describe, expect, it } from 'vitest';
import {
  parseHistoryFilter,
  parseVehicleIdParam,
  tripHistoryNav,
  tripIsToday,
  tripStartedOnYmd,
} from '@/lib/tripHistoryNav';

describe('tripHistoryNav', () => {
  it('ouvre l’historique du jour pour un véhicule', () => {
    expect(tripHistoryNav({ filter: 'today', vehicleId: 2 })).toEqual({
      pathname: '/(tabs)/trip',
      params: { tab: 'history', filter: 'today', vehicleId: '2' },
    });
  });

  it('omet vehicleId invalide', () => {
    expect(tripHistoryNav({ filter: 'all', vehicleId: 0 }).params.vehicleId).toBeUndefined();
  });
});

describe('tripIsToday', () => {
  it('filtre le jour local', () => {
    const now = new Date(2026, 8, 12, 16, 0, 0);
    expect(tripIsToday('2026-09-12T11:55:00+02:00', now)).toBe(true);
    expect(tripIsToday('2026-09-11T22:00:00+02:00', now)).toBe(false);
    const localMorning = new Date(2026, 8, 12, 0, 10, 0);
    expect(tripStartedOnYmd(localMorning.toISOString(), '2026-09-12')).toBe(true);
  });
});

describe('parseHistoryFilter', () => {
  it('lit today / sinceFill / all', () => {
    expect(parseHistoryFilter('today')).toBe('today');
    expect(parseHistoryFilter(['sinceFill'])).toBe('sinceFill');
    expect(parseHistoryFilter('nope')).toBeNull();
  });

  it('parse vehicleId', () => {
    expect(parseVehicleIdParam('2')).toBe(2);
    expect(parseVehicleIdParam(['3'])).toBe(3);
    expect(parseVehicleIdParam('x')).toBeNull();
  });
});
