import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Card, StatCard } from '@/components/Card';
import { Button } from '@/components/Button';
import TripMap from '@/components/TripMap';
import type { TripMapRef } from '@/components/TripMap.types';
import { deleteTrip, getTripById, getTrips } from '@/lib/database';
import {
  calculateTripStats,
  formatDistance,
  formatEuro,
  parseRoutePoints,
} from '@/lib/calculations';
import {
  computeRouteSpeedStats,
  formatDurationMinutes,
} from '@/lib/consumptionModel';
import { formatDateSlash } from '@/lib/dates';
import { reverseGeocode, tripPlaceLabel, tripSourceLabel } from '@/lib/geocode';
import { notify, confirm } from '@/lib/notify';
import { useApp } from '@/context/AppContext';
import { getPlaces } from '@/lib/database';
import { getTripDisplayRoute } from '@/lib/routeGeometry';
import { computeSimilarTripStats } from '@/lib/similarTrips';
import type { Trip } from '@/types';

/** Détail d’un trajet passé : carte plein écran du tracé + stats. */
export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const { colors } = useTheme();
  const { activeVehicle, refresh } = useApp();
  const mapRef = useRef<TripMapRef>(null);
  const fittedRef = useRef(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [peerTrips, setPeerTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [originLabel, setOriginLabel] = useState('');
  const [destLabel, setDestLabel] = useState('');
  const [displayPoints, setDisplayPoints] = useState<
    { latitude: number; longitude: number }[]
  >([]);

  const load = useCallback(async () => {
    if (!Number.isFinite(tripId)) {
      setLoading(false);
      return;
    }
    fittedRef.current = false;
    const t = await getTripById(tripId);
    setTrip(t);
    setLoading(false);
    if (!t) return;

    const places = await getPlaces();
    const peers = await getTrips(t.vehicleId);
    setPeerTrips(peers);
    const display = await getTripDisplayRoute(t, places);
    setDisplayPoints(display);

    const pts = display.length ? display : parseRoutePoints(t.routePoints);
    const start = pts[0];
    const end = pts.length > 1 ? pts[pts.length - 1] : null;

    let o = tripPlaceLabel(t.originName, start, 'origin');
    let d = tripPlaceLabel(t.destinationName, end, 'destination');

    if (start && (!t.originName || /lieu de départ|^départ$/i.test(t.originName))) {
      const geo = await reverseGeocode(start.latitude, start.longitude);
      if (geo) o = geo;
    }
    if (end && (!t.destinationName || /lieu d.arrivée|^arrivée$/i.test(t.destinationName))) {
      const geo = await reverseGeocode(end.latitude, end.longitude);
      if (geo) d = geo;
    }
    setOriginLabel(o);
    setDestLabel(d);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rawPts = useMemo(
    () => (trip ? parseRoutePoints(trip.routePoints) : []),
    [trip]
  );

  const points = useMemo(() => {
    if (displayPoints.length) return displayPoints;
    return rawPts;
  }, [displayPoints, rawPts]);

  const speedStats = useMemo(() => computeRouteSpeedStats(rawPts), [rawPts]);

  const similar = useMemo(
    () => (trip && peerTrips.length ? computeSimilarTripStats(peerTrips, trip, { excludeId: trip.id }) : null),
    [trip, peerTrips]
  );

  const tripL100 =
    trip && trip.distanceKm >= 0.5 && trip.estimatedFuelUsed > 0
      ? (trip.estimatedFuelUsed / trip.distanceKm) * 100
      : 0;

  const mapPoints = useMemo(() => {
    // Préférer le GPS stocké (timestamps/vitesses) pour coloration
    if (rawPts.length >= 2) return rawPts;
    return points;
  }, [rawPts, points]);

  /** Région = bbox du trajet (pas le point de départ). */
  const region = useMemo(() => {
    const pts = mapPoints.length ? mapPoints : points;
    if (pts.length < 1) {
      return {
        latitude: 48.8566,
        longitude: 2.3522,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    const lats = pts.map((p) => p.latitude);
    const lons = pts.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.025),
      longitudeDelta: Math.max((maxLon - minLon) * 1.4, 0.025),
    };
  }, [mapPoints, points]);

  useEffect(() => {
    if (mapPoints.length < 2 || fittedRef.current) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        mapPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
        { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: false }
      );
      fittedRef.current = true;
    }, 450);
    return () => clearTimeout(t);
  }, [mapPoints]);

  const stats =
    trip && activeVehicle
      ? calculateTripStats(activeVehicle, trip.distanceKm, trip.startTime, trip.endTime, trip.routePoints)
      : trip
        ? {
            fuelUsed: trip.estimatedFuelUsed,
            cost: trip.estimatedCost,
            durationMinutes: trip.endTime
              ? (new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 60000
              : 0,
            movingSpeedKmh: 0,
          }
        : null;

  const onDelete = () => {
    if (!trip) return;
    confirm(
      'Supprimer le trajet',
      `${originLabel} → ${destLabel}`,
      async () => {
        await deleteTrip(trip.id);
        await refresh();
        notify('Supprimé', 'Trajet retiré.');
        router.back();
      },
      'Supprimer'
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.danger }}>Trajet introuvable.</Text>
        <Button title="Retour" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const avgShown =
    speedStats.avgKmh > 0
      ? speedStats.avgKmh
      : stats?.movingSpeedKmh
        ? Math.round(stats.movingSpeedKmh * 10) / 10
        : 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Détail du trajet' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.map}>
          <TripMap
            ref={mapRef}
            region={region}
            routePoints={mapPoints}
            accentColor={colors.accent}
            followUser={false}
            userLocation={null}
            paused={false}
            routeSpeedsKmh={
              rawPts.length >= 2 &&
              mapPoints === rawPts &&
              speedStats.maxKmh > 0
                ? speedStats.pointSpeedsKmh
                : undefined
            }
          />
        </View>

        <ScrollView contentContainerStyle={styles.panel}>
          <Card>
            <Text style={[styles.section, { color: colors.textSecondary }]}>Départ</Text>
            <Text style={[styles.place, { color: colors.text }]}>{originLabel}</Text>
            <Text style={[styles.section, { color: colors.textSecondary, marginTop: 12 }]}>
              Arrivée
            </Text>
            <Text style={[styles.place, { color: colors.text }]}>{destLabel}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 12 }}>
              {formatDateSlash(trip.startTime)}
              {(() => {
                try {
                  const startHm = new Date(trip.startTime).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  if (!trip.endTime) return ` · ${startHm}`;
                  const endHm = new Date(trip.endTime).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const endDay = formatDateSlash(trip.endTime);
                  const startDay = formatDateSlash(trip.startTime);
                  return endDay === startDay
                    ? ` · ${startHm} → ${endHm}`
                    : ` · ${startHm} → ${endDay} ${endHm}`;
                } catch {
                  return '';
                }
              })()}
              {' · '}
              {tripSourceLabel(trip.source) || trip.source}
              {trip.status === 'pending' ? ' · à valider' : ''}
            </Text>
          </Card>

          <View style={styles.statsRow}>
            <StatCard label="Distance" value={formatDistance(trip.distanceKm)} />
            <StatCard label="Carburant" value={`${trip.estimatedFuelUsed.toFixed(2)} L`} />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Coût" value={formatEuro(trip.estimatedCost)} />
            <StatCard
              label="Durée"
              value={formatDurationMinutes(stats?.durationMinutes ?? 0)}
            />
          </View>
          {tripL100 > 0 && (
            <View style={styles.statsRow}>
              <StatCard label="Conso" value={`${tripL100.toFixed(1)} L/100`} />
              <StatCard
                label="vs habitude"
                value={
                  similar?.deltaL100 != null
                    ? `${similar.deltaL100 > 0 ? '+' : ''}${similar.deltaL100.toFixed(1)}`
                    : similar?.avgL100
                      ? `moy. ${similar.avgL100.toFixed(1)}`
                      : '—'
                }
              />
            </View>
          )}

          {similar && similar.count >= 1 && (
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                TRAJETS SIMILAIRES ({similar.count})
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  marginTop: 6,
                  lineHeight: 19,
                }}
              >
                Moyenne : {similar.avgDistanceKm.toFixed(1)} km · {similar.avgFuelL.toFixed(1)} L ·{' '}
                {formatEuro(similar.avgCost)}
                {similar.avgDurationMin > 0 ? ` · ${similar.avgDurationMin} min` : ''}
                {similar.avgL100 > 0 ? ` · ${similar.avgL100.toFixed(1)} L/100` : ''}
              </Text>
              {similar.vsHabitLabel ? (
                <Text
                  style={{
                    color:
                      similar.deltaL100 != null && similar.deltaL100 > 0.3
                        ? colors.warning
                        : similar.deltaL100 != null && similar.deltaL100 < -0.3
                          ? colors.success
                          : colors.text,
                    fontWeight: '700',
                    marginTop: 8,
                  }}
                >
                  {similar.vsHabitLabel}
                </Text>
              ) : null}
            </Card>
          )}

          {(avgShown > 0 || speedStats.maxKmh > 0) && (
            <>
              <Text style={[styles.speedHint, { color: colors.textSecondary }]}>
                Tracé coloré : vert = plus lent → rouge = plus rapide
              </Text>
              <View style={styles.statsRow}>
                <StatCard label="Vitesse moy." value={avgShown > 0 ? `${avgShown} km/h` : '—'} />
                <StatCard
                  label="Vitesse max"
                  value={speedStats.maxKmh > 0 ? `${speedStats.maxKmh} km/h` : '—'}
                />
              </View>
              <View style={styles.statsRow}>
                <StatCard
                  label="Vitesse min"
                  value={speedStats.minKmh > 0 ? `${speedStats.minKmh} km/h` : '—'}
                />
                <StatCard label="Points GPS" value={`${rawPts.length || points.length}`} />
              </View>
            </>
          )}

          {!!trip.note && (
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Note</Text>
              <Text style={{ color: colors.text, marginTop: 4 }}>{trip.note}</Text>
            </Card>
          )}

          <Button
            title="Relancer ce trajet"
            onPress={() => {
              const dest =
                trip.destinationName?.trim() ||
                destLabel ||
                '';
              const end = rawPts.length > 1 ? rawPts[rawPts.length - 1] : displayPoints[displayPoints.length - 1];
              router.push({
                pathname: '/(tabs)/trip' as never,
                params: {
                  mode: 'nav',
                  dest,
                  destLat: end ? String(end.latitude) : undefined,
                  destLon: end ? String(end.longitude) : undefined,
                  autoStart: '0',
                  prepare: '1',
                },
              });
            }}
            style={{ marginBottom: 10 }}
          />
          <Button
            title="Retour (sens inverse)"
            variant="outline"
            onPress={() => {
              const dest =
                trip.originName?.trim() ||
                originLabel ||
                '';
              const start = rawPts[0] || displayPoints[0];
              router.push({
                pathname: '/(tabs)/trip' as never,
                params: {
                  mode: 'nav',
                  dest,
                  destLat: start ? String(start.latitude) : undefined,
                  destLon: start ? String(start.longitude) : undefined,
                  autoStart: '0',
                  prepare: '1',
                },
              });
            }}
            style={{ marginBottom: 10 }}
          />
          <Button
            title="Enregistrer un plein"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/fillup/add' as never,
                params: { fromTrip: String(trip.id) },
              })
            }
            style={{ marginBottom: 10 }}
          />
          <Button title="Supprimer ce trajet" variant="danger" onPress={onDelete} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  map: { height: '42%' },
  panel: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  place: { fontSize: 16, fontWeight: '700', marginTop: 4, lineHeight: 22 },
  statsRow: { flexDirection: 'row', gap: 12, marginVertical: 8 },
  speedHint: { fontSize: 12, marginTop: 4, marginBottom: 0 },
});
