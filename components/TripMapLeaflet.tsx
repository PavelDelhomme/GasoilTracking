import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { TripMapRef, TripMapProps, RouteCoord } from './TripMap.types';

function buildHtml(
  lat: number,
  lon: number,
  zoom: number,
  route: RouteCoord[],
  user: RouteCoord | null | undefined,
  accent: string,
  paused: boolean
): string {
  const routeJson = JSON.stringify(route.map((p) => [p.latitude, p.longitude]));
  const userJson = user ? JSON.stringify([user.latitude, user.longitude]) : 'null';
  const accentSafe = String(accent || '#e94560').replace(/[^#a-fA-F0-9]/g, '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#0f172a; }
    .leaflet-control-attribution { font-size:10px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lon}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var accent = '${accentSafe}';
    var routeLayer = null;
    var startMarker = null;
    var userMarker = null;

    function setRoute(pts) {
      if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
      if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
      if (!pts || pts.length === 0) return;
      routeLayer = L.polyline(pts, { color: accent, weight: 5, opacity: 0.9 }).addTo(map);
      startMarker = L.circleMarker(pts[0], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1
      }).addTo(map).bindPopup('Départ');
    }

    function setUser(pt, paused) {
      if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
      if (!pt) return;
      userMarker = L.circleMarker(pt, {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: paused ? '#f59e0b' : '#3b82f6',
        fillOpacity: 1
      }).addTo(map).bindPopup(paused ? 'Pause' : 'Vous');
    }

    function fit(pts) {
      if (!pts || pts.length === 0) return;
      if (pts.length === 1) { map.setView(pts[0], 15); return; }
      map.fitBounds(pts, { padding: [40, 40] });
    }

    setRoute(${routeJson});
    setUser(${userJson}, ${paused ? 'true' : 'false'});
    var all = ${routeJson}.slice();
    if (${userJson}) all.push(${userJson});
    if (all.length) fit(all);
    else map.setView([${lat}, ${lon}], ${zoom});

    function onMsg(raw) {
      try {
        var msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!msg || !msg.type) return;
        if (msg.type === 'update') {
          setRoute(msg.route || []);
          setUser(msg.user || null, !!msg.paused);
          if (msg.follow && msg.user) map.panTo(msg.user);
        }
        if (msg.type === 'fit' && msg.route && msg.route.length) fit(msg.route);
        if (msg.type === 'center' && msg.lat != null) map.setView([msg.lat, msg.lon], msg.zoom || map.getZoom());
      } catch (e) {}
    }

    document.addEventListener('message', function(e) { onMsg(e.data); });
    window.addEventListener('message', function(e) { onMsg(e.data); });
  </script>
</body>
</html>`;
}

/**
 * Carte OpenStreetMap (Leaflet) — pas de clé Google Maps requise.
 * Affiche tracé + position actuelle.
 */
const TripMap = forwardRef<TripMapRef, TripMapProps>(function TripMap(
  { region, routePoints, accentColor, userLocation, paused },
  ref
) {
  const webRef = useRef<WebView>(null);
  const zoom = Math.max(
    10,
    Math.min(16, Math.round(Math.log2(360 / Math.max(region.latitudeDelta || 0.05, 0.005))))
  );

  const html = useMemo(
    () =>
      buildHtml(
        region.latitude,
        region.longitude,
        zoom,
        routePoints,
        userLocation,
        accentColor,
        !!paused
      ),
    // HTML initial seulement ; les updates passent par postMessage
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useImperativeHandle(ref, () => ({
    fitToCoordinates: (coordinates) => {
      inject(webRef, {
        type: 'fit',
        route: coordinates.map((p) => [p.latitude, p.longitude]),
      });
    },
    setCenter: (latitude, longitude, z) => {
      inject(webRef, { type: 'center', lat: latitude, lon: longitude, zoom: z });
    },
  }));

  useEffect(() => {
    inject(webRef, {
      type: 'update',
      route: routePoints.map((p) => [p.latitude, p.longitude]),
      user: userLocation ? [userLocation.latitude, userLocation.longitude] : null,
      paused: !!paused,
      follow: true,
    });
  }, [routePoints, userLocation, paused]);

  // Remount HTML when first GPS fix arrives far from default Paris
  const [bootKey, setBootKey] = useState(0);
  useEffect(() => {
    if (Math.abs(region.latitude - 48.8566) > 0.2 || Math.abs(region.longitude - 2.3522) > 0.2) {
      setBootKey((k) => (k === 0 ? 1 : k));
    }
  }, [region.latitude, region.longitude]);

  const htmlLive = useMemo(
    () =>
      buildHtml(
        region.latitude,
        region.longitude,
        zoom,
        routePoints,
        userLocation,
        accentColor,
        !!paused
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bootKey]
  );

  return (
    <View style={styles.wrap}>
      <WebView
        key={bootKey}
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: htmlLive || html }}
        style={styles.web}
        onMessage={() => {}}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : {})}
      />
    </View>
  );
});

function inject(webRef: React.RefObject<WebView | null>, payload: object) {
  webRef.current?.injectJavaScript(
    `try{onMsg(${JSON.stringify(payload)});}catch(e){};true;`
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, height: '100%', width: '100%', overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#0f172a' },
});

export default TripMap;
