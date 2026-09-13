import { describe, expect, it } from 'vitest';
import {
  commuteHintLabel,
  commuteWindow,
  isWeekday,
  suggestTripsForNow,
} from '@/lib/smartSuggestions';

const home = {
  id: 1,
  name: 'Domicile',
  address: 'Thorigné',
  kind: 'home' as const,
  latitude: 48.14,
  longitude: -1.58,
  sortOrder: 0,
  createdAt: '',
};
const work = {
  id: 2,
  name: 'Travail',
  address: 'La Guerche',
  kind: 'work' as const,
  latitude: 47.95,
  longitude: -1.22,
  sortOrder: 1,
  createdAt: '',
};

function atLocal(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe('commuteWindow', () => {
  it('ne propose rien le dimanche soir', () => {
    const sunEve = atLocal(2026, 9, 13, 20, 45);
    expect(isWeekday(sunEve)).toBe(false);
    expect(commuteWindow(sunEve)).toBe('none');
    expect(commuteHintLabel(sunEve)).toBeNull();
  });

  it('ne propose rien le samedi après-midi', () => {
    const sat = atLocal(2026, 9, 12, 17, 0);
    expect(commuteWindow(sat)).toBe('none');
  });

  it('propose retour domicile un mardi 17h', () => {
    const tue = atLocal(2026, 9, 15, 17, 0);
    expect(commuteWindow(tue)).toBe('to_home');
    expect(commuteHintLabel(tue)).toMatch(/Fin de journée/);
  });

  it('ne propose plus fin de journée après 20h30 en semaine', () => {
    const late = atLocal(2026, 9, 15, 21, 0);
    expect(commuteWindow(late)).toBe('none');
    expect(commuteHintLabel(late)).toBeNull();
  });

  it('propose aller travail un lundi matin', () => {
    const mon = atLocal(2026, 9, 14, 7, 30);
    expect(commuteWindow(mon)).toBe('to_work');
  });
});

describe('suggestTripsForNow', () => {
  it('n’affiche pas retour domicile le dimanche', () => {
    const sun = atLocal(2026, 9, 13, 19, 0);
    const list = suggestTripsForNow({
      places: [home, work] as never,
      trips: [],
      userLocation: { latitude: 47.95, longitude: -1.22 },
      now: sun,
    });
    expect(list.every((s) => s.kind !== 'commute_to_home')).toBe(true);
    expect(list.every((s) => s.kind !== 'commute_to_work')).toBe(true);
  });

  it('n’affiche pas commute hors fenêtre même en semaine', () => {
    const noon = atLocal(2026, 9, 15, 13, 0);
    const list = suggestTripsForNow({
      places: [home, work] as never,
      trips: [],
      now: noon,
    });
    expect(list.filter((s) => s.kind.startsWith('commute'))).toHaveLength(0);
  });
});
