/**
 * Échantillonnage de points de passage (via) depuis une géométrie de trajet.
 * Sans dépendance React Native — utilisable en tests et par Maps.
 */
export type ViaLatLng = { latitude: number; longitude: number };

/**
 * Échantillonne 1–2 points de passage sur la géométrie pour biaiser Maps
 * vers le même corridor (éco / alternatif), sans stop fantôme.
 */
export function samplePassThroughViasFromRoute(
  coords: ViaLatLng[] | undefined,
  max = 2
): ViaLatLng[] {
  if (!coords || coords.length < 8) return [];
  const a = coords[0];
  const b = coords[coords.length - 1];
  const dLat = b.latitude - a.latitude;
  const dLon = b.longitude - a.longitude;
  const len2 = dLat * dLat + dLon * dLon || 1;

  type Cand = { p: ViaLatLng; score: number; idx: number };
  const cands: Cand[] = [];
  const lo = Math.floor(coords.length * 0.2);
  const hi = Math.ceil(coords.length * 0.8);
  for (let i = lo; i < hi; i++) {
    const p = coords[i];
    const t = ((p.latitude - a.latitude) * dLat + (p.longitude - a.longitude) * dLon) / len2;
    const projLat = a.latitude + t * dLat;
    const projLon = a.longitude + t * dLon;
    const dx = p.latitude - projLat;
    const dy = p.longitude - projLon;
    const score = dx * dx + dy * dy;
    cands.push({ p, score, idx: i });
  }
  if (!cands.length) return [];

  cands.sort((x, y) => y.score - x.score);
  const picked: { p: ViaLatLng; idx: number }[] = [];
  for (const c of cands) {
    if (picked.length >= max) break;
    if (
      picked.some(
        (q) =>
          Math.abs(q.p.latitude - c.p.latitude) < 0.008 &&
          Math.abs(q.p.longitude - c.p.longitude) < 0.008
      )
    ) {
      continue;
    }
    if (c.score < 0.00002 && picked.length === 0) {
      const idx = Math.round((coords.length - 1) * 0.4);
      picked.push({ p: coords[idx], idx });
      break;
    }
    if (c.score >= 0.00002) picked.push({ p: c.p, idx: c.idx });
  }

  return picked.sort((x, y) => x.idx - y.idx).map((x) => x.p).slice(0, max);
}

/** Waypoints Maps : vias explicites, sinon échantillon géométrie. */
export function buildViaWaypoints(
  routeCoords: ViaLatLng[] | undefined,
  explicitVia?: ViaLatLng[]
): ViaLatLng[] {
  if (explicitVia?.length) return explicitVia.slice(0, 2);
  return samplePassThroughViasFromRoute(routeCoords, 2);
}
