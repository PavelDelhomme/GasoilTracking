/**
 * Cache + layout mini-cartes OSM (tuiles) — précharge fluide sans WebView.
 */
import { Image } from 'react-native';
import type { Trip } from '@/types';
import type { Place } from '@/types';
import {
  downsampleRoute,
  getTripDisplayRoute,
  type LatLng,
} from '@/lib/routeGeometry';

const TILE = 256;
const routeCache = new Map<number, LatLng[]>();
const layoutCache = new Map<string, TileMapLayout>();
const inflight = new Map<number, Promise<LatLng[]>>();

export type PixelPt = { x: number; y: number };
export type MapTile = {
  key: string;
  url: string;
  left: number;
  top: number;
  size: number;
};
export type TileMapLayout = {
  width: number;
  height: number;
  zoom: number;
  tiles: MapTile[];
  line: PixelPt[];
  start: PixelPt;
  end: PixelPt;
};

export function getCachedTripRoute(tripId: number): LatLng[] | undefined {
  return routeCache.get(tripId);
}

export function setCachedTripRoute(tripId: number, pts: LatLng[]) {
  if (pts.length) routeCache.set(tripId, pts);
}

/** Mercator world pixels (fractional tile * 256). */
export function latLonToWorld(lat: number, lon: number, zoom: number): PixelPt {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n * TILE;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y =
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n * TILE;
  return { x, y };
}

/** Zoom serré : départ/arrivée bien visibles + corridor fin (aller-retour) lisible. */
export function zoomForPoints(pts: LatLng[], width: number, height: number): number {
  if (pts.length < 1) return 14;
  const lats = pts.map((p) => p.latitude);
  const lons = pts.map((p) => p.longitude);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  // Corridor très allongé (ex. aller-retour Ouest) : forcer une marge lat/lon minimale
  // sinon le zoom colle trop et le tracé paraît « vide » sur la mini-carte.
  const latSpan = Math.max(1e-6, maxLat - minLat);
  const lonSpan = Math.max(1e-6, maxLon - minLon);
  if (lonSpan / latSpan > 6) {
    const padLat = lonSpan / 6;
    const mid = (minLat + maxLat) / 2;
    minLat = mid - padLat / 2;
    maxLat = mid + padLat / 2;
  } else if (latSpan / lonSpan > 6) {
    const padLon = latSpan / 6;
    const mid = (minLon + maxLon) / 2;
    minLon = mid - padLon / 2;
    maxLon = mid + padLon / 2;
  }
  // Marge intérieure ~22% pour pastilles + boucle
  const pad = 1.28;
  for (let z = 17; z >= 9; z--) {
    const a = latLonToWorld(minLat, minLon, z);
    const b = latLonToWorld(maxLat, maxLon, z);
    const w = Math.abs(b.x - a.x) * pad;
    const h = Math.abs(b.y - a.y) * pad;
    if (w <= width && h <= height) return z;
  }
  return 9;
}

/**
 * Calcule la grille de tuiles + polyline en pixels pour un tracé.
 */
export function buildTileMapLayout(
  pts: LatLng[],
  opts?: { width?: number; height?: number }
): TileMapLayout | null {
  if (pts.length < 1) return null;
  const width = opts?.width ?? 360;
  const height = opts?.height ?? 168;
  const sample = downsampleRoute(pts, 80);
  let zoom = zoomForPoints(sample, width, height);

  for (let attempt = 0; attempt < 5; attempt++) {
    const z = Math.max(8, zoom - attempt);
    const layout = layoutAtZoom(sample, width, height, z);
    if (layout.tiles.length <= 18 || attempt === 4) return layout;
  }
  return null;
}

function layoutAtZoom(
  sample: LatLng[],
  width: number,
  height: number,
  zoom: number
): TileMapLayout {
  const worlds = sample.map((p) => latLonToWorld(p.latitude, p.longitude, zoom));
  const xs = worlds.map((p) => p.x);
  const ys = worlds.map((p) => p.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (maxX - minX < 40) {
    const c = (minX + maxX) / 2;
    minX = c - 60;
    maxX = c + 60;
  }
  if (maxY - minY < 40) {
    const c = (minY + maxY) / 2;
    minY = c - 40;
    maxY = c + 40;
  }
  const padX = (maxX - minX) * 0.14 + 24;
  const padY = (maxY - minY) * 0.14 + 24;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(width / spanX, height / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const offsetX = (width - usedW) / 2;
  const offsetY = (height - usedH) / 2;

  const toLocal = (p: PixelPt): PixelPt => ({
    x: (p.x - minX) * scale + offsetX,
    y: (p.y - minY) * scale + offsetY,
  });

  const line = worlds.map(toLocal);
  const start = line[0];
  const end = line[line.length - 1];

  const worldLeft = minX - offsetX / scale;
  const worldTop = minY - offsetY / scale;
  const worldRight = worldLeft + width / scale;
  const worldBottom = worldTop + height / scale;

  const tx0 = Math.floor(worldLeft / TILE);
  const ty0 = Math.floor(worldTop / TILE);
  const tx1 = Math.floor((worldRight - 1e-6) / TILE);
  const ty1 = Math.floor((worldBottom - 1e-6) / TILE);
  const n = 2 ** zoom;
  const tiles: MapTile[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      const left = (tx * TILE - worldLeft) * scale;
      const top = (ty * TILE - worldTop) * scale;
      const size = TILE * scale;
      const sub = ['a', 'b', 'c'][(tx + ty) % 3];
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        url: `https://${sub}.tile.openstreetmap.fr/osmfr/${zoom}/${tx}/${ty}.png`,
        left,
        top,
        size,
      });
    }
  }

  return { width, height, zoom, tiles, line, start, end };
}

export function getCachedLayout(
  tripId: number,
  pts: LatLng[],
  width: number,
  height: number
): TileMapLayout | null {
  const key = `${tripId}:${pts.length}:${width}x${height}:${pts[0]?.latitude}:${pts[pts.length - 1]?.longitude}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const layout = buildTileMapLayout(pts, { width, height });
  if (layout) layoutCache.set(key, layout);
  return layout;
}

export async function resolveTripRouteCached(
  trip: Trip,
  places: Place[]
): Promise<LatLng[]> {
  const cached = routeCache.get(trip.id);
  if (cached && cached.length >= 2) return cached;

  const pending = inflight.get(trip.id);
  if (pending) return pending;

  const job = (async () => {
    const pts = await getTripDisplayRoute(trip, places);
    if (pts.length) routeCache.set(trip.id, pts);
    return pts;
  })();
  inflight.set(trip.id, job);
  try {
    return await job;
  } finally {
    inflight.delete(trip.id);
  }
}

/** Précharge tracés + tuiles pour l’historique. */
export async function preloadHistoryMaps(
  trips: Trip[],
  places: Place[],
  _accent = '#e94560'
): Promise<void> {
  const batch = trips.slice(0, 8);
  for (const t of batch) {
    try {
      const pts = await resolveTripRouteCached(t, places);
      const layout = getCachedLayout(t.id, pts, 360, 168);
      if (!layout) continue;
      await Promise.all(
        layout.tiles.slice(0, 12).map((tile) => Image.prefetch(tile.url).catch(() => undefined))
      );
    } catch {
      /* ignore one */
    }
  }
}
