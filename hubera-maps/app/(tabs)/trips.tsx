import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { fetchTrips, fetchStats, type Trip, type TripStats, type TransportMode } from '@/lib/api';

const MODE_ICONS: Record<TransportMode, string> = {
  driving: 'car',
  walking: 'walk',
  transit: 'bus',
  cycling: 'bicycle',
};

const MODE_LABELS: Record<TransportMode, string> = {
  driving: 'Voiture',
  walking: 'À pied',
  transit: 'Transports',
  cycling: 'Vélo',
};

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function formatDistance(meters: number): string {
  if (!meters) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function TripsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterMode, setFilterMode] = useState<TransportMode | 'all'>('all');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadTrips = useCallback(async (reset = false) => {
    if (!user) return;
    try {
      const offset = reset ? 0 : trips.length;
      const mode = filterMode === 'all' ? undefined : filterMode;
      const res = await fetchTrips({ mode, limit: 20, offset });
      
      if (reset) {
        setTrips(res.trips);
      } else {
        setTrips((prev) => [...prev, ...res.trips]);
      }
      setHasMore(res.hasMore);
    } catch (e) {
      console.warn('Erreur chargement trajets:', e);
    }
  }, [user, filterMode, trips.length]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchStats('month');
      setStats(res.stats);
    } catch (e) {
      console.warn('Erreur chargement stats:', e);
    }
  }, [user]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadTrips(true), loadStats()]);
      setLoading(false);
    })();
  }, [user, filterMode]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTrips(true), loadStats()]);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadTrips(false);
    setLoadingMore(false);
  };

  const renderTrip = ({ item }: { item: Trip }) => (
    <Pressable
      style={[styles.tripCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/trip/${item.id}`)}
    >
      <View style={styles.tripHeader}>
        <View style={[styles.modeIcon, { backgroundColor: colors.accentLight }]}>
          <Ionicons
            name={MODE_ICONS[item.mode] as any}
            size={20}
            color={colors.accent}
          />
        </View>
        <View style={styles.tripInfo}>
          <Text style={[styles.tripLocation, { color: colors.text }]} numberOfLines={1}>
            {item.endLocation || item.startLocation || 'Trajet'}
          </Text>
          <Text style={[styles.tripDate, { color: colors.textSecondary }]}>
            {formatDate(item.startTime)} · {MODE_LABELS[item.mode]}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </View>

      <View style={styles.tripStats}>
        <View style={styles.tripStat}>
          <Ionicons name="speedometer-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.tripStatValue, { color: colors.text }]}>
            {formatDistance(item.distance || 0)}
          </Text>
        </View>
        <View style={styles.tripStat}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.tripStatValue, { color: colors.text }]}>
            {formatDuration(item.duration || 0)}
          </Text>
        </View>
        {item.mode === 'driving' && item.consumption && (
          <View style={styles.tripStat}>
            <Ionicons name="water-outline" size={16} color={colors.accent} />
            <Text style={[styles.tripStatValue, { color: colors.accent, fontWeight: '700' }]}>
              {item.consumption} L/100
            </Text>
          </View>
        )}
      </View>

      {item.vehicleName && (
        <View style={[styles.vehicleBadge, { backgroundColor: colors.background }]}>
          <Ionicons name="car-sport" size={14} color={colors.textSecondary} />
          <Text style={[styles.vehicleBadgeText, { color: colors.textSecondary }]}>
            {item.vehicleName}
          </Text>
        </View>
      )}
    </Pressable>
  );

  if (!user) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <Ionicons name="navigate" size={64} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Historique des trajets</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Connectez-vous pour voir vos trajets
        </Text>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => router.push('/auth')}
        >
          <Text style={styles.primaryButtonText}>Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Stats résumé */}
      {stats && (
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statsTitle, { color: colors.text }]}>Ce mois</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{stats.totalTrips}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>trajets</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>
                {(stats.totalDistance / 1000).toFixed(0)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>km</Text>
            </View>
            {stats.totalFuelUsed > 0 && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.accent }]}>
                  {stats.totalFuelUsed.toFixed(1)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>litres</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Filtres par mode */}
      <View style={styles.filtersRow}>
        <Pressable
          style={[
            styles.filterChip,
            { backgroundColor: filterMode === 'all' ? colors.accent : colors.card, borderColor: colors.border },
          ]}
          onPress={() => setFilterMode('all')}
        >
          <Text style={{ color: filterMode === 'all' ? '#fff' : colors.text, fontWeight: '600' }}>
            Tous
          </Text>
        </Pressable>
        {(['driving', 'walking', 'transit', 'cycling'] as TransportMode[]).map((m) => (
          <Pressable
            key={m}
            style={[
              styles.filterChip,
              { backgroundColor: filterMode === m ? colors.accent : colors.card, borderColor: colors.border },
            ]}
            onPress={() => setFilterMode(m)}
          >
            <Ionicons
              name={MODE_ICONS[m] as any}
              size={16}
              color={filterMode === m ? '#fff' : colors.text}
            />
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="navigate-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucun trajet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Démarrez un trajet depuis l'onglet Carte
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTrip}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 16 }} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  primaryButton: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statsCard: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  statsTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  listContent: { padding: 16, paddingTop: 8 },
  tripCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  tripHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripInfo: { flex: 1 },
  tripLocation: { fontSize: 15, fontWeight: '600' },
  tripDate: { fontSize: 12, marginTop: 2 },
  tripStats: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  tripStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripStatValue: { fontSize: 13, fontWeight: '500' },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  vehicleBadgeText: { fontSize: 12 },
});
