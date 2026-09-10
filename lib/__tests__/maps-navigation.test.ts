import { describe, expect, it } from 'vitest';
import { buildGoogleMapsDirUrl, formatViaPassThrough } from '@/lib/mapsUrl';
import {
  buildViaWaypoints,
  samplePassThroughViasFromRoute,
  shouldSampleGeometryVias,
} from '@/lib/routeVias';

describe('buildGoogleMapsDirUrl', () => {
  const origin = { latitude: 48.11, longitude: -1.68 };
  const destination = { latitude: 48.2, longitude: -1.5 };
  const via = { latitude: 48.15, longitude: -1.6 };

  it('encode les waypoints via: (pas de via: littéral brut dans l’URL)', () => {
    const url = buildGoogleMapsDirUrl({
      destination,
      origin,
      waypoints: [via],
    });
    expect(url).toContain('waypoints=');
    expect(url).not.toMatch(/waypoints=via:/);
    expect(url).toContain(encodeURIComponent(formatViaPassThrough(via)));
    expect(url).toContain(`origin=${encodeURIComponent('48.110000,-1.680000')}`);
    expect(url).toContain('destination=');
  });

  it('accepte un label destination humain', () => {
    const url = buildGoogleMapsDirUrl({
      destination,
      destinationLabel: 'Maison',
    });
    expect(url).toContain(encodeURIComponent('Maison@48.200000,-1.500000'));
  });
});

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

  it('buildViaWaypoints : fastest → aucun via', () => {
    const explicit = [{ latitude: 48.05, longitude: -1.4 }];
    const coords = Array.from({ length: 20 }, (_, i) => ({
      latitude: 48 + i * 0.01,
      longitude: -1.5 + i * 0.01,
    }));
    expect(buildViaWaypoints(coords, explicit, { kind: 'fastest' })).toEqual([]);
    expect(shouldSampleGeometryVias('fastest')).toBe(false);
    expect(shouldSampleGeometryVias('eco')).toBe(true);
  });

  it('buildViaWaypoints préfère via explicite en eco', () => {
    const explicit = [{ latitude: 48.05, longitude: -1.4 }];
    const coords = Array.from({ length: 20 }, (_, i) => ({
      latitude: 48 + i * 0.01,
      longitude: -1.5 + i * 0.01,
    }));
    expect(buildViaWaypoints(coords, explicit, { kind: 'eco' })).toEqual(explicit);
  });
});
