import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, LayoutChangeEvent } from 'react-native';
import type { RouteCoord } from '@/components/TripMap.types';
import { downsampleRoute } from '@/lib/routeGeometry';
import { buildTileMapLayout, type PixelPt } from '@/lib/tripMapCache';

type Props = {
  routePoints: RouteCoord[];
  originName?: string;
  destinationName?: string;
  accentColor?: string;
  height?: number;
  prefetchedUrl?: string | null;
};

function RouteSegments({
  line,
  color,
}: {
  line: PixelPt[];
  color: string;
}) {
  if (line.length < 2) return null;
  const segs: React.ReactNode[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    segs.push(
      <View
        key={`s${i}`}
        style={{
          position: 'absolute',
          left: mx - len / 2,
          top: my - 2.5,
          width: len,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: color,
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    );
  }
  return <>{segs}</>;
}

/**
 * Mini-carte rapide : tuiles OSM + tracé + gros pastilles départ/arrivée.
 * Pas de WebView → fluide dans une liste / préchargeable.
 */
export function TripMiniMap({
  routePoints,
  originName,
  destinationName,
  accentColor = '#e94560',
  height = 168,
}: Props) {
  const [width, setWidth] = useState(360);
  const pts = useMemo(() => downsampleRoute(routePoints, 64), [routePoints]);
  const layout = useMemo(
    () => buildTileMapLayout(pts, { width, height }),
    [pts, width, height]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 40 && Math.abs(w - width) > 2) setWidth(w);
  };

  if (!layout || pts.length < 1) {
    return (
      <View style={[styles.schema, { height: Math.min(height, 84) }]} onLayout={onLayout}>
        <View style={styles.schemaRow}>
          <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.schemaText} numberOfLines={1}>
            {originName || 'Départ'}
          </Text>
        </View>
        <View style={styles.schemaLine} />
        <View style={styles.schemaRow}>
          <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.schemaText} numberOfLines={1}>
            {destinationName || 'Arrivée'}
          </Text>
        </View>
        <Text style={styles.schemaHint}>Tracé indisponible pour ce trajet</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height: layout.height }]} onLayout={onLayout}>
      <View style={styles.mapClip}>
        {layout.tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.url }}
            style={{
              position: 'absolute',
              left: tile.left,
              top: tile.top,
              width: tile.size,
              height: tile.size,
            }}
          />
        ))}
        <RouteSegments line={layout.line} color={accentColor} />
        <View
          style={[
            styles.marker,
            {
              left: layout.start.x - 10,
              top: layout.start.y - 10,
              backgroundColor: '#22c55e',
            },
          ]}
        />
        <View
          style={[
            styles.marker,
            {
              left: layout.end.x - 10,
              top: layout.end.y - 10,
              backgroundColor: '#ef4444',
            },
          ]}
        />
      </View>

      <View style={styles.pinStart} pointerEvents="none">
        <View style={styles.pinStartDot} />
        <Text style={styles.pinLabel} numberOfLines={1}>
          {originName || 'Départ'}
        </Text>
      </View>
      <View style={styles.pinEnd} pointerEvents="none">
        <View style={styles.pinEndDot} />
        <Text style={styles.pinLabelEnd} numberOfLines={1}>
          {destinationName || 'Arrivée'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
    backgroundColor: '#dbe4ee',
  },
  mapClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#fff',
    zIndex: 2,
  },
  pinStart: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '52%',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 3,
  },
  pinEnd: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '52%',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 3,
  },
  pinStartDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinEndDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinLabel: { color: '#bbf7d0', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  pinLabelEnd: { color: '#fecaca', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  schema: {
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 6,
  },
  schemaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  schemaLine: {
    width: 2,
    height: 10,
    marginLeft: 5,
    backgroundColor: '#94a3b8',
    borderRadius: 1,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  schemaText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600', flex: 1 },
  schemaHint: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
});
