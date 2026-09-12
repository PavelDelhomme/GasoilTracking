import { describe, expect, it } from 'vitest';
import { SHORT_TRIP_DELETE_KM, shouldDeleteShortTrip } from '@/lib/shortTrip';

describe('shouldDeleteShortTrip', () => {
  it('seuil 500 m', () => {
    expect(SHORT_TRIP_DELETE_KM).toBe(0.5);
  });

  it('propose suppression sous 0,5 km', () => {
    expect(shouldDeleteShortTrip(0)).toBe(true);
    expect(shouldDeleteShortTrip(0.2)).toBe(true);
    expect(shouldDeleteShortTrip(0.499)).toBe(true);
  });

  it('conserve à partir de 0,5 km', () => {
    expect(shouldDeleteShortTrip(0.5)).toBe(false);
    expect(shouldDeleteShortTrip(1.2)).toBe(false);
  });

  it('conserve un 0 km si le trajet a duré ≥ 5 min', () => {
    expect(shouldDeleteShortTrip(0, 5)).toBe(false);
    expect(shouldDeleteShortTrip(0.1, 20)).toBe(false);
    expect(shouldDeleteShortTrip(0.2, 4.9)).toBe(true);
  });

  it('refuse NaN', () => {
    expect(shouldDeleteShortTrip(Number.NaN)).toBe(false);
  });
});
