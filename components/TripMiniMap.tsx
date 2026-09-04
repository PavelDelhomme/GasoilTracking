import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { RouteCoord } from '@/components/TripMap.types';

type Props = {
  routePoints: RouteCoord[];
  originName?: string;
  destinationName?: string;
  accentColor?: string;
  height?: number;
};

function regionFromPoints(pts: RouteCoord[]) {
  const lats = pts.map((p) => p.latitude);
  const lons = pts.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latDelta = Math.max((maxLat - minLat) * 1.6, 0.012);
  const lonDelta = Math.max((maxLon - minLon) * 1.6, 0.012);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

/** Réduit les points pour rester léger dans une liste. */
function downsample(pts: RouteCoord[], max = 48): RouteCoord[] {
  if (pts.length <= max) return pts;
  const out: RouteCoord[] = [pts[0]];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Mini-carte trajet (départ vert → arrivée rouge) pour les cartes d’historique.
 * MapView native (lite sur Android) — taille fixe, non interactive.
 */
export function TripMiniMap({
  routePoints,
  originName,
  destinationName,
  accentColor = '#e94560',
  height = 118,
}: Props) {
  const pts = useMemo(() => downsample(routePoints), [routePoints]);
  const start = pts[0];
  const end = pts.length > 1 ? pts[pts.length - 1] : start;
  const region = useMemo(() => (pts.length ? regionFromPoints(pts) : null), [pts]);

  if (!pts.length || !region || !start) {
    return (
      <View style={[styles.schema, { height: Math.min(height, 72) }]}>
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
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      <MapView
        style={styles.map}
        initialRegion={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        liteMode={Platform.OS === 'android'}
      >
        {pts.length > 1 && (
          <Polyline coordinates={pts} strokeColor={accentColor} strokeWidth={4} />
        )}
        <Marker
          coordinate={start}
          pinColor="green"
          title="Départ"
          description={originName}
          tracksViewChanges={false}
        />
        {end && (
          <Marker
            coordinate={end}
            pinColor="red"
            title="Arrivée"
            description={destinationName}
            tracksViewChanges={false}
          />
        )}
      </MapView>
      <View style={styles.legend} pointerEvents="none">
        <Text style={styles.legendStart}>Départ</Text>
        <Text style={styles.legendEnd}>Arrivée</Text>
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
    backgroundColor: '#1a1a2e',
  },
  map: { ...StyleSheet.absoluteFillObject },
  legend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  legendStart: { color: '#bbf7d0', fontSize: 10, fontWeight: '700' },
  legendEnd: { color: '#fecaca', fontSize: 10, fontWeight: '700' },
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
  dot: { width: 12, height: 12, borderRadius: 6 },
  schemaText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600', flex: 1 },
});
