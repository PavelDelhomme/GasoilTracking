import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { TripMiniMap } from '@/components/TripMiniMap';
import { useTheme } from '@/hooks/useTheme';
import { formatDistance, formatEuro, parseRoutePoints } from '@/lib/calculations';
import { formatDateSlash } from '@/lib/dates';
import type { Trip } from '@/types';

type Props = {
  trip: Trip;
  onDelete: (trip: Trip) => void;
};

/** Carte historique : mini-carte départ/arrivée + suppression. */
export function TripHistoryCard({ trip, onDelete }: Props) {
  const { colors } = useTheme();
  const points = useMemo(() => parseRoutePoints(trip.routePoints), [trip.routePoints]);

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
      <TripMiniMap
        routePoints={points}
        originName={trip.originName}
        destinationName={trip.destinationName}
        accentColor={colors.accent}
        height={128}
      />

      <View style={styles.ends}>
        <View style={styles.endCol}>
          <Text style={[styles.endLabel, { color: colors.success }]}>Départ</Text>
          <Text style={[styles.endValue, { color: colors.text }]} numberOfLines={2}>
            {trip.originName ||
              (points[0]
                ? `${points[0].latitude.toFixed(4)}, ${points[0].longitude.toFixed(4)}`
                : '—')}
          </Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={16}
          color={colors.textSecondary}
          style={{ marginTop: 14 }}
        />
        <View style={styles.endCol}>
          <Text style={[styles.endLabel, { color: colors.accent }]}>Arrivée</Text>
          <Text style={[styles.endValue, { color: colors.text }]} numberOfLines={2}>
            {trip.destinationName ||
              (points.length > 1
                ? `${points[points.length - 1].latitude.toFixed(4)}, ${points[points.length - 1].longitude.toFixed(4)}`
                : '—')}
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
  card: { marginTop: 12, overflow: 'hidden' },
  ends: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  endCol: { flex: 1 },
  endLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 2 },
  endValue: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
});
