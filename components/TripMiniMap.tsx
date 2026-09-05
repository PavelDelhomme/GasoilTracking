import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { RouteCoord } from '@/components/TripMap.types';

type Props = {
  routePoints: RouteCoord[];
  originName?: string;
  destinationName?: string;
  accentColor?: string;
  height?: number;
};

/** Réduit les points pour rester léger dans une liste. */
function downsample(pts: RouteCoord[], max = 64): RouteCoord[] {
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
 * Mini-carte trajet (Leaflet/OSM) — même stack que la carte live.
 * Évite react-native-maps (clé Google absente → carte vide).
 */
export function TripMiniMap({
  routePoints,
  originName,
  destinationName,
  accentColor = '#e94560',
  height = 118,
}: Props) {
  const pts = useMemo(() => downsample(routePoints), [routePoints]);

  const html = useMemo(() => {
    if (pts.length < 1) return null;
    const mid = pts[Math.floor(pts.length / 2)] || pts[0];
    const routeJson = JSON.stringify(pts.map((p) => [p.latitude, p.longitude]));
    const accent = String(accentColor).replace(/[^#a-fA-F0-9]/g, '') || '#e94560';
    return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#1a1a2e}
.leaflet-control-attribution{display:none!important}
.leaflet-control-zoom{display:none!important}
</style>
</head><body><div id="m"></div><script>
var map=L.map('m',{
  zoomControl:false,dragging:false,scrollWheelZoom:false,
  doubleClickZoom:false,boxZoom:false,keyboard:false,tap:false
}).setView([${mid.latitude},${mid.longitude}],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);
var pts=${routeJson};
if(pts.length>1){
  L.polyline(pts,{color:'${accent}',weight:4,opacity:0.95}).addTo(map);
  map.fitBounds(pts,{padding:[16,16]});
} else { map.setView(pts[0],13); }
L.circleMarker(pts[0],{radius:7,color:'#fff',weight:2,fillColor:'#22c55e',fillOpacity:1}).addTo(map);
L.circleMarker(pts[pts.length-1],{radius:7,color:'#fff',weight:2,fillColor:'#ef4444',fillOpacity:1}).addTo(map);
setTimeout(function(){ try{map.invalidateSize();}catch(e){} }, 120);
</script></body></html>`;
  }, [pts, accentColor]);

  if (!html) {
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
        <Text style={styles.schemaHint}>Pas de tracé GPS enregistré</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.map}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : {})}
      />
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
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: '#1a1a2e' },
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
  schemaHint: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
});
