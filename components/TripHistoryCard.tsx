import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { formatDistance, formatEuro, parseRoutePoints } from '@/lib/calculations';
import { formatDateSlash } from '@/lib/dates';
import type { Trip } from '@/types';

type Props = {
  trip: Trip;
  onDelete: (trip: Trip) => void;
};

function staticMapUrl(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number } | null,
  w = 640,
  h = 200
): string {
  const midLat = end ? (start.latitude + end.latitude) / 2 : start.latitude;
  const midLon = end ? (start.longitude + end.longitude) / 2 : start.longitude;
  const markers = end
    ? `${start.latitude},${start.longitude},ol-marker-green|${end.latitude},${end.longitude},ol-marker-red`
    : `${start.latitude},${start.longitude},ol-marker-green`;
  return (
    `https://staticmap.openstreetmap.de/staticmap.php?center=${midLat},${midLon}` +
    `&zoom=12&size=${w}x${h}&maptype=mapnik&markers=${markers}`
  );
}

/**
 * Carte historique : mini carte départ/arrivée + infos + suppression.
 */
export function TripHistoryCard({ trip, onDelete }: Props) {
  const { colors } = useTheme();
  const points = useMemo(() => parseRoutePoints(trip.routePoints), [trip.routePoints]);
  const start = points[0] || null;
  const end = points.length > 1 ? points[points.length - 1] : null;

  const mapUri = start ? staticMapUrl(start, end) : null;

  const timeLabel = (() => {
    try {
      const d = new Date(trip.startTime);
      const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `${formatDateSlash(trip.startTime)} · ${hm}`;
    } catch {
      return formatDateSlash(trip.startTime);
    }
  })();

  return (
    <Card style={styles.card}>
      {mapUri ? (
        <Image
          source={{ uri: mapUri }}
          style={styles.map}
          resizeMode="cover"
          accessibilityLabel="Mini carte du trajet"
        />
      ) : (
        <View style={[styles.mapPlaceholder, { backgroundColor: colors.border }]}>
          <Ionicons name="map-outline" size={22} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
            Pas de tracé GPS
          </Text>
        </View>
      )}

      <View style={styles.ends}>
        <View style={styles.endCol}>
          <Text style={[styles.endLabel, { color: colors.success }]}>Départ</Text>
          <Text style={[styles.endValue, { color: colors.text }]} numberOfLines={2}>
            {trip.originName || (start ? `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}` : '—')}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} style={{ marginTop: 14 }} />
        <View style={styles.endCol}>
          <Text style={[styles.endLabel, { color: colors.accent }]}>Arrivée</Text>
          <Text style={[styles.endValue, { color: colors.text }]} numberOfLines={2}>
            {trip.destinationName ||
              (end ? `${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}` : '—')}
          </Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
          {timeLabel}
          {'\n'}
          {formatDistance(trip.distanceKm)} · {formatEuro(trip.estimatedCost)}
          {trip.source ? ` · ${trip.source}` : ''}
          {trip.status === 'pending' ? ' · en attente' : ''}
        </Text>
        <Pressable
          onPress={() => onDelete(trip)}
          hitSlop={10}
          style={[styles.deleteBtn, { borderColor: colors.danger }]}
          accessibilityLabel="Supprimer ce trajet"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 0, overflow: 'hidden' },
  map: { width: '100%', height: 120, backgroundColor: '#e2e8f0' },
  mapPlaceholder: {
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ends: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  endCol: { flex: 1 },
  endLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 2 },
  endValue: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
});
