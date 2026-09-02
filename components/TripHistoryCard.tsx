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

/**
 * Carte historique : mini-carte départ/arrivée + infos + suppression.
 */
export function TripHistoryCard({ trip, onDelete }: Props) {
  const { colors } = useTheme();
  const points = useMemo(() => parseRoutePoints(trip.routePoints), [trip.routePoints]);
  const start = points[0] || null;
  const end = points.length > 1 ? points[points.length - 1] : start;

  const timeLabel = (() => {
    try {
      const d = new Date(trip.startTime);
      const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `${formatDateSlash(trip.startTime)} · ${hm}`;
    } catch {
      return formatDateSlash(trip.startTime);
    }
  })();

  const sourceLabel =
    trip.source === 'gps'
      ? 'GPS'
      : trip.source === 'maps_import'
        ? 'Import Maps'
        : trip.source === 'manual'
          ? 'Manuel'
          : trip.source === 'detected'
            ? 'Détecté'
            : trip.source || '';

  return (
    <Card style={styles.card}>
      <TripMiniMap
        routePoints={points}
        originName={trip.originName}
        destinationName={trip.destinationName}
        accentColor={colors.accent}
        height={140}
      />

      <View style={styles.ends}>
        <View style={styles.endCol}>
          <View style={styles.endTitleRow}>
            <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
            <Text style={[styles.endLabel, { color: colors.success }]}>Départ</Text>
          </View>
          <Text style={[styles.endValue, { color: colors.text }]} numberOfLines={2}>
            {trip.originName ||
              (start ? `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}` : '—')}
          </Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={16}
          color={colors.textSecondary}
          style={{ marginTop: 18 }}
        />
        <View style={styles.endCol}>
          <View style={styles.endTitleRow}>
            <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
            <Text style={[styles.endLabel, { color: colors.accent }]}>Arrivée</Text>
          </View>
          <Text style={[styles.endValue, { color: colors.text }]} numberOfLines={2}>
            {trip.destinationName ||
              (end ? `${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}` : '—')}
          </Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 18 }}>
          {timeLabel}
          {'\n'}
          {formatDistance(trip.distanceKm)} · {formatEuro(trip.estimatedCost)}
          {sourceLabel ? ` · ${sourceLabel}` : ''}
          {trip.status === 'pending' ? ' · en attente' : ''}
          {points.length > 1 ? ` · ${points.length} pts` : ''}
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
    paddingTop: 4,
  },
  endCol: { flex: 1 },
  endTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  endLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  endValue: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    gap: 8,
  },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
});
