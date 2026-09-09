import { describe, expect, it } from 'vitest';
import { buildViaWaypoints, samplePassThroughViasFromRoute } from '@/lib/routeVias';

describe('samplePassThroughViasFromRoute', () => {
  it('returns empty for short paths', () => {
    expect(
      samplePassThroughViasFromRoute([
        { latitude: 48, longitude: -1 },
        { latitude: 48.1, longitude: -1.1 },
      ])
    ).toEqual([]);
  });

  it('samples a via on a detoured path', () => {
    const coords = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      coords.push({
        latitude: 48 + t * 0.2 + (i === 10 ? 0.05 : 0),
        longitude: -1.5 + t * 0.3,
      });
    }
    const vias = samplePassThroughViasFromRoute(coords, 2);
    expect(vias.length).toBeGreaterThanOrEqual(1);
    expect(vias[0].latitude).toBeGreaterThan(48.05);
  });

  it('buildViaWaypoints prefers explicit via', () => {
    const explicit = [{ latitude: 48.05, longitude: -1.4 }];
    const coords = Array.from({ length: 20 }, (_, i) => ({
      latitude: 48 + i * 0.01,
      longitude: -1.5 + i * 0.01,
    }));
    expect(buildViaWaypoints(coords, explicit)).toEqual(explicit);
  });
});
