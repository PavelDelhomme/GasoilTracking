import { describe, expect, it } from 'vitest';
import {
  buildGoogleMapsDirUrl,
  buildGoogleNavigationIntent,
  formatDestinationParam,
  formatViaPassThrough,
  isValidMapsLatLng,
} from '@/lib/mapsUrl';
import {
  buildViaWaypoints,
  samplePassThroughViasFromRoute,
  shouldSampleGeometryVias,
} from '@/lib/routeVias';

describe('buildGoogleMapsDirUrl', () => {
  const origin = { latitude: 48.11, longitude: -1.68 };
  const destination = { latitude: 48.2, longitude: -1.5 };
  const via = { latitude: 48.15, longitude: -1.6 };

  it('destination = coords seules (pas Nom@lat,lng — casse Google Maps)', () => {
    const url = buildGoogleMapsDirUrl({
      destination,
      origin,
      destinationLabel: 'Exponantes - Parc des expositions de la Beaujoire',
    });
    expect(url).toContain(`destination=${encodeURIComponent('48.200000,-1.500000')}`);
    expect(url).not.toContain('Exponantes');
    expect(decodeURIComponent(url)).not.toContain('@48.200000');
    expect(formatDestinationParam(destination, 'Maison')).toBe('48.200000,-1.500000');
  });

  it('ignore les waypoints via: éco (Impossible de s’y rendre)', () => {
    const url = buildGoogleMapsDirUrl({
      destination,
      origin,
      waypoints: [via],
      waypointMode: 'via',
    });
    expect(url).not.toContain('waypoints=');
    expect(url).toContain(`destination=${encodeURIComponent('48.200000,-1.500000')}`);
  });

  it('étapes avec arrêt : coords nues, pas via:', () => {
    const stopA = { latitude: 47.22, longitude: -1.55 };
    const stopB = { latitude: 47.25, longitude: -1.53 };
    const url = buildGoogleMapsDirUrl({
      destination,
      origin,
      waypoints: [stopA, stopB],
      waypointMode: 'stop',
    });
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('waypoints=47.220000,-1.550000|47.250000,-1.530000');
    expect(decoded).not.toContain('via:47.220000');
  });

  it('intent Android : coords + mode driving', () => {
    expect(buildGoogleNavigationIntent(destination)).toBe(
      'google.navigation:q=48.200000,-1.500000&mode=d'
    );
  });

  it('rejette 0,0 et coords invalides', () => {
    expect(isValidMapsLatLng({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isValidMapsLatLng({ latitude: 47.25, longitude: -1.53 })).toBe(true);
    expect(isValidMapsLatLng({ latitude: NaN, longitude: -1.53 })).toBe(false);
  });

  it('encode encore via: pour le helper legacy', () => {
    expect(formatViaPassThrough(via)).toBe('via:48.150000,-1.600000');
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
