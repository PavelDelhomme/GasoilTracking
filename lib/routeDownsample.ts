/**
 * Downsample / détection boucle — module pur (pas de RN / réseau).
 */

export type LatLng = { latitude: number; longitude: number };

/** Downsample en gardant début/fin + extrêmes (boucles / aller-retour). */
export function downsampleRoute(pts: LatLng[], max = 160): LatLng[] {
  if (pts.length <= max) return pts;
  if (max < 4) return [pts[0], pts[pts.length - 1]];

  const start = pts[0];
  const end = pts[pts.length - 1];
  const keep = new Set<number>([0, pts.length - 1]);

  const chordDist = (p: LatLng) => {
    const ax = start.longitude;
    const ay = start.latitude;
    const bx = end.longitude - ax;
    const by = end.latitude - ay;
    const tLen2 = bx * bx + by * by;
    if (tLen2 < 1e-14) {
      const dx = p.longitude - ax;
      const dy = p.latitude - ay;
      return dx * dx + dy * dy;
    }
    let t = ((p.longitude - ax) * bx + (p.latitude - ay) * by) / tLen2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * bx;
    const cy = ay + t * by;
    const dx = p.longitude - cx;
    const dy = p.latitude - cy;
    return dx * dx + dy * dy;
  };

  const ranked = pts
    .map((p, i) => ({ i, d: chordDist(p) }))
    .sort((a, b) => b.d - a.d);
  const extra = Math.max(2, Math.floor(max * 0.25));
  for (let k = 0; k < extra && k < ranked.length; k++) keep.add(ranked[k].i);

  const step = (pts.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) keep.add(Math.round(i * step));

  return [...keep]
    .filter((i) => i >= 0 && i < pts.length)
    .sort((a, b) => a - b)
    .slice(0, max)
    .map((i) => pts[i]);
}

/** Départ ≈ arrivée (boucle / tour sans arrêt). */
export function isLoopRoute(pts: LatLng[], maxMeters = 120): boolean {
  if (pts.length < 3) return false;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const m = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return m <= maxMeters;
}
