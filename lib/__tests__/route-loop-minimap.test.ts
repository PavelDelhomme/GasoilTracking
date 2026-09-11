import { describe, expect, it } from 'vitest';
import { downsampleRoute, isLoopRoute, type LatLng } from '../routeDownsample';

function loopPts(): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 0; i <= 30; i++) {
    pts.push({ latitude: 48.1558, longitude: -1.5868 - i * 0.0015 });
  }
  for (let i = 29; i >= 0; i--) {
    pts.push({ latitude: 48.1559, longitude: -1.5868 - i * 0.0015 });
  }
  return pts;
}

describe('loop route minimap helpers', () => {
  it('détecte une boucle départ≈arrivée', () => {
    expect(isLoopRoute(loopPts())).toBe(true);
  });
  it('downsample conserve un point loin à l’Ouest', () => {
    const pts = loopPts();
    const down = downsampleRoute(pts, 40);
    const minLon = Math.min(...down.map((p) => p.longitude));
    expect(minLon).toBeLessThan(-1.62);
    expect(down.length).toBeLessThanOrEqual(40);
    expect(down[0]).toEqual(pts[0]);
    expect(down[down.length - 1].latitude).toBeCloseTo(pts[pts.length - 1].latitude, 3);
  });
});
