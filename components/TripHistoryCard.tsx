import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { TripMiniMap } from '@/components/TripMiniMap';
import { useTheme } from '@/hooks/useTheme';
import { formatDistance, formatEuro, parseRoutePoints } from '@/lib/calculations';
import { formatDateSlash } from '@/lib/dates';
import { tripPlaceLabel, tripSourceLabel } from '@/lib/geocode';
import { getTripDisplayRoute } from '@/lib/routeGeometry';
import { getPlaces } from '@/lib/database';
import type { Trip } from '@/types';
import type { RouteCoord } from '@/components/TripMap.types';

type Props = {
  trip: Trip;
  onPress: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
};

/** Carte historique : mini-carte du trajet réalisé + adresses. */
export function TripHistoryCard({ trip, onPress, onDelete }: Props) {
  const { colors } = useTheme();
  const stored = useMemo(() => parseRoutePoints(trip.routePoints), [trip.routePoints]);
  const [displayPts, setDisplayPts] = useState<RouteCoord[]>(stored);

  const start = displayPts[0] || stored[0] || null;
  const end =
    displayPts.length > 1
      ? displayPts[displayPts.length - 1]
      : stored.length > 1
        ? stored[stored.length - 1]
        : null;

  const origin = tripPlaceLabel(trip.originName, start, 'origin');
  const dest = tripPlaceLabel(trip.destinationName, end, 'destination');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const places = await getPlaces();
        const pts = await getTripDisplayRoute(trip, places);
        if (!cancelled && pts.length) setDisplayPts(pts);
      } catch {
        /* keep stored */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.routePoints, trip.originName, trip.destinationName]);

  const timeLabel = (() => {
    try {
      const d = new Date(trip.startTime);
      const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `${formatDateSlash(trip.startTime)} · ${hm}`;
    } catch {
      return formatDateSlash(trip.startTime);
    }
  })();

  const sourceFr = tripSourceLabel(trip.source);

  return (
    <Pressable onPress={() => onPress(trip)}>
      <Card style={styles.card}>
        <TripMiniMap
          routePoints={displayPts}
          originName={origin}
          destinationName={dest}
          accentColor={colors.accent}
          height={152}
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

        <View style={styles.metaRow}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {timeLabel}
            {sourceFr ? ` · ${sourceFr}` : ''}
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

        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
              {formatDistance(trip.distanceKm)}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.accent + '18', borderColor: colors.accent }]}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>
              {formatEuro(trip.estimatedCost)}
            </Text>
          </View>
          {trip.estimatedFuelUsed > 0 && (
            <View style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
                {trip.estimatedFuelUsed.toFixed(1)} L
              </Text>
            </View>
          )}
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
});
