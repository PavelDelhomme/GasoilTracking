import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  expandPlaceQuery,
  mergeSuggestHits,
  parsePhotonFeatures,
  placeQueryVariants,
  searchPlaces,
  type SuggestHit,
} from '@/lib/placeSearch';

describe('expandPlaceQuery', () => {
  it('développe « parc des expo » vers expositions', () => {
    expect(expandPlaceQuery('parc des expo Nantes')).toBe('parc des expositions Nantes');
    expect(expandPlaceQuery('Parc des Expo nantes')).toBe('parc des expositions nantes');
  });

  it('développe expo isolé et ccial', () => {
    expect(expandPlaceQuery('expo nantes')).toBe('expositions nantes');
    expect(expandPlaceQuery('ccial Atlantis')).toBe('centre commercial Atlantis');
  });

  it('placeQueryVariants garde l’original en second', () => {
    const v = placeQueryVariants('parc des expo Nantes');
    expect(v[0]).toMatch(/expositions/i);
    expect(v[1]).toMatch(/expo/i);
  });
});

describe('parsePhotonFeatures', () => {
  it('mappe le Parc des expositions de Nantes', () => {
    const hits = parsePhotonFeatures([
      {
        geometry: { coordinates: [-1.532388, 47.2584968] },
        properties: {
          osm_id: 42,
          osm_type: 'W',
          osm_key: 'landuse',
          osm_value: 'commercial',
          name: 'Exponantes - Parc des expositions de la Beaujoire',
          city: 'Nantes',
          postcode: '44300',
        },
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toMatch(/expositions/i);
    expect(hits[0].kind).toBe('poi');
    expect(hits[0].latitude).toBeCloseTo(47.2585, 3);
    expect(hits[0].longitude).toBeCloseTo(-1.5324, 3);
  });
});

describe('mergeSuggestHits', () => {
  it('déduplique par coords et préfère le POI', () => {
    const a: SuggestHit = {
      id: '1',
      label: 'Parc des expositions',
      source: 'geo',
      kind: 'poi',
      latitude: 47.2585,
      longitude: -1.5324,
    };
    const b: SuggestHit = {
      id: '2',
      label: 'Rue des expos',
      source: 'geo',
      kind: 'address',
      latitude: 47.25851,
      longitude: -1.53241,
    };
    const merged = mergeSuggestHits([a, b], 'parc expo nantes', 5);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe('poi');
  });
});

describe('searchPlaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fusionne Photon (prioritaire) et Nominatim', async () => {
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('photon.komoot.io')) {
          return {
            ok: true,
            json: async () => ({
              features: [
                {
                  geometry: { coordinates: [-1.532388, 47.2584968] },
                  properties: {
                    osm_id: 1,
                    osm_key: 'landuse',
                    name: 'Exponantes - Parc des expositions de la Beaujoire',
                    city: 'Nantes',
                  },
                },
              ],
            }),
          } as Response;
        }
        return { ok: true, json: async () => [] } as Response;
      }
    );
    const hits = await searchPlaces('parc des expo Nantes', { limit: 5 });
    expect(hits.some((h) => /expositions/i.test(h.label))).toBe(true);
  });
});
