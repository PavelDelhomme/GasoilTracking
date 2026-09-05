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
  paused: boolean,
  planned: RouteCoord[],
  dest: RouteCoord | null | undefined
): string {
  const routeJson = JSON.stringify(route.map((p) => [p.latitude, p.longitude]));
  const plannedJson = JSON.stringify(planned.map((p) => [p.latitude, p.longitude]));
  const userJson = user ? JSON.stringify([user.latitude, user.longitude]) : 'null';
  const destJson = dest ? JSON.stringify([dest.latitude, dest.longitude]) : 'null';
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
    var plannedLayer = null;
    var startMarker = null;
    var userMarker = null;
    var destMarker = null;

    function setRoute(pts) {
      if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
      if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
      if (!pts || pts.length === 0) return;
      routeLayer = L.polyline(pts, { color: accent, weight: 5, opacity: 0.9 }).addTo(map);
      startMarker = L.circleMarker(pts[0], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1
      }).addTo(map).bindPopup('Départ');
    }

    function setPlanned(pts) {
      if (plannedLayer) { map.removeLayer(plannedLayer); plannedLayer = null; }
      if (!pts || pts.length < 2) return;
      plannedLayer = L.polyline(pts, {
        color: '#94a3b8', weight: 4, opacity: 0.75, dashArray: '8 10'
      }).addTo(map);
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

    function setDest(pt) {
      if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
      if (!pt) return;
      destMarker = L.circleMarker(pt, {
        radius: 10,
        color: '#fff',
        weight: 2,
        fillColor: '#ef4444',
        fillOpacity: 1
      }).addTo(map).bindPopup('Destination');
    }

    function fit(pts) {
      if (!pts || pts.length === 0) return;
      if (pts.length === 1) { map.setView(pts[0], 15); return; }
      map.fitBounds(pts, { padding: [40, 40] });
    }

    setRoute(${routeJson});
    setPlanned(${plannedJson});
    setUser(${userJson}, ${paused ? 'true' : 'false'});
    setDest(${destJson});
    var all = ${routeJson}.slice().concat(${plannedJson});
    if (${userJson}) all.push(${userJson});
    if (${destJson}) all.push(${destJson});
    if (all.length) fit(all);
    else map.setView([${lat}, ${lon}], ${zoom});

    function onMsg(raw) {
      try {
        var msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!msg || !msg.type) return;
        if (msg.type === 'update') {
          setRoute(msg.route || []);
          setPlanned(msg.planned || []);
          setUser(msg.user || null, !!msg.paused);
          setDest(msg.dest || null);
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

const TripMap = forwardRef<TripMapRef, TripMapProps>(function TripMap(
  { region, routePoints, accentColor, userLocation, paused, plannedRoute = [], destination },
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
        !!paused,
        plannedRoute,
        destination
      ),
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
      planned: (plannedRoute || []).map((p) => [p.latitude, p.longitude]),
      user: userLocation ? [userLocation.latitude, userLocation.longitude] : null,
      dest: destination ? [destination.latitude, destination.longitude] : null,
      paused: !!paused,
      follow: true,
    });
  }, [routePoints, userLocation, paused, plannedRoute, destination]);

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
        !!paused,
        plannedRoute,
        destination
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
  wrap: { flex: 1 },
  web: { flex: 1, backgroundColor: '#0f172a' },
});

export default TripMap;
