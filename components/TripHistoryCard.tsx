import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { TripMiniMap } from '@/components/TripMiniMap';
import { useTheme } from '@/hooks/useTheme';
import { formatDistance, formatEuro, parseRoutePoints } from '@/lib/calculations';
import { formatDateSlash } from '@/lib/dates';
import { tripPlaceLabel } from '@/lib/geocode';
import type { Trip } from '@/types';

type Props = {
  trip: Trip;
  onPress: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
};

/** Carte historique cliquable : mini-carte + adresses départ/arrivée. */
export function TripHistoryCard({ trip, onPress, onDelete }: Props) {
  const { colors } = useTheme();
  const points = useMemo(() => parseRoutePoints(trip.routePoints), [trip.routePoints]);
  const start = points[0] || null;
  const end = points.length > 1 ? points[points.length - 1] : null;

  const origin = tripPlaceLabel(trip.originName, start, 'origin');
  const dest = tripPlaceLabel(trip.destinationName, end, 'destination');

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
    <Pressable onPress={() => onPress(trip)}>
      <Card style={styles.card}>
        <TripMiniMap
          routePoints={points}
          originName={origin}
          destinationName={dest}
          accentColor={colors.accent}
          height={128}
        />

        <View style={styles.ends}>
          <View style={styles.endCol}>
            <Text style={[styles.endLabel, { color: colors.success }]}>Départ</Text>
            <Text style={[styles.endValue, { color: colors.text }]} numberOfLines={2}>
              {origin}
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
              {dest}
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
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete(trip);
            }}
            hitSlop={10}
            style={[styles.deleteBtn, { borderColor: colors.danger }]}
            accessibilityLabel="Supprimer ce trajet"
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </View>
      </Card>
    </Pressable>
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
