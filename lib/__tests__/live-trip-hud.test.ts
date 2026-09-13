import { describe, expect, it } from 'vitest';
import { formatDurationMin, liveTripHudStats } from '@/lib/liveTripHud';
import { freeTripNote } from '@/lib/startFreeTripNote';

describe('liveTripHudStats', () => {
  it('calcule distance, durée et moyenne', () => {
    const start = Date.parse('2026-09-12T10:00:00.000Z');
    const now = start + 30 * 60 * 1000;
    const s = liveTripHudStats({ distanceKm: 21, startTime: '2026-09-12T10:00:00.000Z' }, now);
    expect(s?.distanceKm).toBe(21);
    expect(s?.durationMinutes).toBe(30);
    expect(s?.avgKmh).toBe(42);
  });

  it('sans trajet', () => {
    expect(liveTripHudStats(null)).toBeNull();
  });
});

describe('formatDurationMin', () => {
  it('minutes puis heures', () => {
    expect(formatDurationMin(8)).toBe('8 min');
    expect(formatDurationMin(60)).toBe('1 h');
    expect(formatDurationMin(75)).toBe('1 h 15 min');
  });
});

describe('freeTripNote', () => {
  it('distingue web et natif', () => {
    expect(freeTripNote(true)).toMatch(/web/i);
    expect(freeTripNote(false)).toMatch(/libre/i);
  });
});
