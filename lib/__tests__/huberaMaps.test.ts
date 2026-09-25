import { describe, expect, it } from 'vitest';
import { buildHuberaMapsAppUrl, buildHuberaMapsWebUrl } from '@/lib/huberaMapsUrl';

describe('huberaMaps urls', () => {
  it('ouvre un suivi libre', () => {
    expect(buildHuberaMapsAppUrl({ tripId: 42, vehicleId: 7, mode: 'free' })).toBe(
      'hubera-maps://track?tripId=42&vehicleId=7&mode=free'
    );
  });

  it('ouvre une navigation', () => {
    const url = buildHuberaMapsAppUrl({
      tripId: 9,
      mode: 'nav',
      toLat: 48.8566,
      toLon: 2.3522,
      label: 'Paris',
    });
    expect(url).toContain('hubera-maps://navigate?');
    expect(url).toContain('toLat=48.8566');
    expect(url).toContain('label=Paris');
  });

  it('web maps.hubera.cloud', () => {
    expect(buildHuberaMapsWebUrl({ tripId: 1, mode: 'free' })).toBe(
      'https://maps.hubera.cloud/?tripId=1&mode=free'
    );
  });
});
