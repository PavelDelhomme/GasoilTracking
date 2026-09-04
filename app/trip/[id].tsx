import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Card, StatCard } from '@/components/Card';
import { Button } from '@/components/Button';
import TripMap from '@/components/TripMap';
import type { TripMapRef } from '@/components/TripMap.types';
import { deleteTrip, getTripById } from '@/lib/database';
import {
  calculateTripStats,
  formatDistance,
  formatEuro,
  parseRoutePoints,
} from '@/lib/calculations';
import { formatDateSlash } from '@/lib/dates';
import { reverseGeocode, tripPlaceLabel, tripSourceLabel } from '@/lib/geocode';
import { notify, confirm } from '@/lib/notify';
import { useApp } from '@/context/AppContext';
import type { Trip } from '@/types';

/** Détail d’un trajet passé : carte plein écran du tracé + stats. */
export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const { colors } = useTheme();
  const { activeVehicle, refresh } = useApp();
  const mapRef = useRef<TripMapRef>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [originLabel, setOriginLabel] = useState('');
  const [destLabel, setDestLabel] = useState('');

  const load = useCallback(async () => {
    if (!Number.isFinite(tripId)) {
      setLoading(false);
      return;
    }
    const t = await getTripById(tripId);
    setTrip(t);
    setLoading(false);
    if (!t) return;

    const pts = parseRoutePoints(t.routePoints);
    const start = pts[0];
    const end = pts.length > 1 ? pts[pts.length - 1] : null;

    let o = tripPlaceLabel(t.originName, start, 'origin');
    let d = tripPlaceLabel(t.destinationName, end, 'destination');

    // Enrichit avec adresse réelle si libellé générique / coords
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

  const points = useMemo(
    () => (trip ? parseRoutePoints(trip.routePoints) : []),
    [trip]
  );

  useEffect(() => {
    if (points.length > 0) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true }
        );
      }, 400);
    }
  }, [points]);

  const region = useMemo(() => {
    const p = points[0] || { latitude: 48.8566, longitude: 2.3522 };
    return {
      latitude: p.latitude,
      longitude: p.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [points]);

  const stats =
    trip && activeVehicle
      ? calculateTripStats(activeVehicle, trip.distanceKm, trip.startTime, trip.endTime)
      : trip
        ? {
            fuelUsed: trip.estimatedFuelUsed,
            cost: trip.estimatedCost,
            durationMinutes: trip.endTime
              ? (new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 60000
              : 0,
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

  const endPt = points.length > 1 ? points[points.length - 1] : null;

  return (
    <>
      <Stack.Screen options={{ title: 'Détail du trajet' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.map}>
          <TripMap
            ref={mapRef}
            region={region}
            routePoints={points}
            accentColor={colors.accent}
            userLocation={endPt}
            paused={false}
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
              value={`${Math.floor(stats?.durationMinutes ?? 0)} min`}
            />
          </View>

          {!!trip.note && (
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Note</Text>
              <Text style={{ color: colors.text, marginTop: 4 }}>{trip.note}</Text>
            </Card>
          )}

          <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
            {points.length} point(s) GPS enregistrés — tracé coloré sur la carte.
          </Text>

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
});
