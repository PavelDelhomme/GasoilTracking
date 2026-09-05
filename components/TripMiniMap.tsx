import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { RouteCoord } from '@/components/TripMap.types';
import { downsampleRoute } from '@/lib/routeGeometry';

type Props = {
  routePoints: RouteCoord[];
  originName?: string;
  destinationName?: string;
  accentColor?: string;
  height?: number;
};

/**
 * Mini-carte trajet réalisé (Leaflet) : polyline complète + marqueurs départ/arrivée.
 */
export function TripMiniMap({
  routePoints,
  originName,
  destinationName,
  accentColor = '#e94560',
  height = 148,
}: Props) {
  const pts = useMemo(() => downsampleRoute(routePoints, 180), [routePoints]);
  const [webReady, setWebReady] = useState(false);

  const html = useMemo(() => {
    if (pts.length < 1) return null;
    const mid = pts[Math.floor(pts.length / 2)] || pts[0];
    const routeJson = JSON.stringify(pts.map((p) => [p.latitude, p.longitude]));
    const accent = String(accentColor).replace(/[^#a-fA-F0-9]/g, '') || '#e94560';
    const oLabel = JSON.stringify(String(originName || 'Départ').slice(0, 48));
    const dLabel = JSON.stringify(String(destinationName || 'Arrivée').slice(0, 48));
    return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#0f172a}
.leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
</style>
</head><body><div id="m"></div><script>
var map=L.map('m',{
  zoomControl:false,dragging:false,scrollWheelZoom:false,
  doubleClickZoom:false,boxZoom:false,keyboard:false,tap:false,
  attributionControl:false
}).setView([${mid.latitude},${mid.longitude}],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:18, crossOrigin:true
}).addTo(map);
var pts=${routeJson};
var line=null;
if(pts.length>1){
  line=L.polyline(pts,{color:'${accent}',weight:5,opacity:0.95,lineJoin:'round'}).addTo(map);
  map.fitBounds(line.getBounds(),{padding:[22,22], maxZoom:14});
} else { map.setView(pts[0],14); }
L.circleMarker(pts[0],{radius:8,color:'#fff',weight:2,fillColor:'#22c55e',fillOpacity:1})
  .addTo(map).bindTooltip(${oLabel},{permanent:false,direction:'top'});
L.circleMarker(pts[pts.length-1],{radius:8,color:'#fff',weight:2,fillColor:'#ef4444',fillOpacity:1})
  .addTo(map).bindTooltip(${dLabel},{permanent:false,direction:'top'});
function fix(){ try{ map.invalidateSize(true); if(line) map.fitBounds(line.getBounds(),{padding:[22,22], maxZoom:14}); }catch(e){} }
setTimeout(fix,80); setTimeout(fix,280); setTimeout(fix,700);
</script></body></html>`;
  }, [pts, accentColor, originName, destinationName]);

  useEffect(() => {
    setWebReady(false);
  }, [html]);

  if (!html) {
    return (
      <View style={[styles.schema, { height: Math.min(height, 80) }]}>
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
        <Text style={styles.schemaHint}>Pas de tracé GPS — ouvrez le détail pour plus d’infos</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      {!webReady && (
        <View style={[StyleSheet.absoluteFillObject, styles.loading]}>
          <Text style={styles.loadingText}>Carte…</Text>
        </View>
      )}
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.map}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        onLoadEnd={() => setWebReady(true)}
        {...(Platform.OS === 'android'
          ? { androidLayerType: 'software' as const, cacheEnabled: true }
          : {})}
      />
      <View style={styles.legend} pointerEvents="none">
        <Text style={styles.legendStart}>● Départ</Text>
        <Text style={styles.legendEnd}>● Arrivée</Text>
        {pts.length > 2 ? (
          <Text style={styles.legendPts}>{pts.length} pts</Text>
        ) : null}
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
    backgroundColor: '#0f172a',
  },
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a' },
  loading: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  legend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  legendStart: { color: '#bbf7d0', fontSize: 10, fontWeight: '700' },
  legendEnd: { color: '#fecaca', fontSize: 10, fontWeight: '700' },
  legendPts: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },
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
