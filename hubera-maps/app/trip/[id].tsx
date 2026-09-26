import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fetchTrip, type Trip, type TransportMode } from '@/lib/api';

const MODE_ICONS: Record<TransportMode, string> = {
  driving: 'car',
  walking: 'walk',
  transit: 'bus',
  cycling: 'bicycle',
};

const MODE_LABELS: Record<TransportMode, string> = {
  driving: 'Voiture',
  walking: 'À pied',
  transit: 'Transports en commun',
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
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TripDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [trip, setTrip] = useState<(Trip & { vehicle?: any; route?: any[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const data = await fetchTrip(id);
        setTrip(data);
      } catch (e: any) {
        setError(e.message || 'Erreur chargement trajet');
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle" size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>{error || 'Trajet non trouvé'}</Text>
      </View>
    );
  }

  const mode = trip.mode || 'driving';
  const consumption = trip.fuelUsed && trip.distance
    ? ((trip.fuelUsed / trip.distance) * 100).toFixed(2)
    : null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header avec mode */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.modeIcon, { backgroundColor: colors.accentLight }]}>
          <Ionicons name={MODE_ICONS[mode] as any} size={28} color={colors.accent} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {trip.endLocation || trip.startLocation || 'Trajet'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {MODE_LABELS[mode]}
          </Text>
        </View>
      </View>

      {/* Date et heure */}
      <View style={[styles.dateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.dateText, { color: colors.text }]}>
          {formatDate(trip.startTime)}
        </Text>
      </View>

      {/* Statistiques principales */}
      <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Statistiques</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Ionicons name="speedometer-outline" size={24} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDistance(trip.distance || 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Distance</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={24} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDuration(trip.duration || 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Durée</Text>
          </View>
          {trip.avgSpeed && (
            <View style={styles.statItem}>
              <Ionicons name="speedometer" size={24} color={colors.accent} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {Math.round(trip.avgSpeed)} km/h
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Vitesse moy.</Text>
            </View>
          )}
          {trip.maxSpeed && (
            <View style={styles.statItem}>
              <Ionicons name="flash" size={24} color={colors.warning} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {Math.round(trip.maxSpeed)} km/h
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Vitesse max</Text>
            </View>
          )}
        </View>
      </View>

      {/* Consommation (si trajet voiture) */}
      {mode === 'driving' && (trip.fuelUsed || consumption) && (
        <View style={[styles.fuelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Consommation</Text>
          <View style={styles.fuelGrid}>
            {trip.fuelUsed && (
              <View style={styles.fuelItem}>
                <Ionicons name="water" size={28} color={colors.accent} />
                <Text style={[styles.fuelValue, { color: colors.accent }]}>
                  {trip.fuelUsed.toFixed(2)} L
                </Text>
                <Text style={[styles.fuelLabel, { color: colors.textSecondary }]}>
                  Carburant utilisé
                </Text>
              </View>
            )}
            {consumption && (
              <View style={styles.fuelItem}>
                <Ionicons name="analytics" size={28} color={colors.accent} />
                <Text style={[styles.fuelValue, { color: colors.accent }]}>
                  {consumption} L/100
                </Text>
                <Text style={[styles.fuelLabel, { color: colors.textSecondary }]}>
                  Consommation
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Véhicule */}
      {trip.vehicle && (
        <View style={[styles.vehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Véhicule</Text>
          <View style={styles.vehicleRow}>
            <View style={[styles.vehicleIcon, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="car-sport" size={24} color={colors.accent} />
            </View>
            <View style={styles.vehicleInfo}>
              <Text style={[styles.vehicleName, { color: colors.text }]}>{trip.vehicle.name}</Text>
              <Text style={[styles.vehicleDetail, { color: colors.textSecondary }]}>
                {trip.vehicle.brand} {trip.vehicle.model}
              </Text>
            </View>
            {trip.vehicle.tankCapacity && (
              <View style={styles.tankInfo}>
                <Text style={[styles.tankValue, { color: colors.accent }]}>
                  {trip.vehicle.tankCapacity}L
                </Text>
                <Text style={[styles.tankLabel, { color: colors.textSecondary }]}>réservoir</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Itinéraire */}
      <View style={[styles.routeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Itinéraire</Text>
        <View style={styles.routePoints}>
          <View style={styles.routePoint}>
            <View style={[styles.routeMarker, { backgroundColor: colors.success }]}>
              <Ionicons name="location" size={14} color="#fff" />
            </View>
            <View style={styles.routePointInfo}>
              <Text style={[styles.routePointLabel, { color: colors.textSecondary }]}>Départ</Text>
              <Text style={[styles.routePointValue, { color: colors.text }]} numberOfLines={2}>
                {trip.startLocation || 'Position GPS'}
              </Text>
            </View>
          </View>
          <View style={[styles.routeLine, { borderColor: colors.border }]} />
          <View style={styles.routePoint}>
            <View style={[styles.routeMarker, { backgroundColor: colors.accent }]}>
              <Ionicons name="flag" size={14} color="#fff" />
            </View>
            <View style={styles.routePointInfo}>
              <Text style={[styles.routePointLabel, { color: colors.textSecondary }]}>Arrivée</Text>
              <Text style={[styles.routePointValue, { color: colors.text }]} numberOfLines={2}>
                {trip.endLocation || 'Position finale'}
              </Text>
            </View>
          </View>
        </View>
        {trip.route && trip.route.length > 0 && (
          <Text style={[styles.routeInfo, { color: colors.textSecondary }]}>
            {trip.route.length} points GPS enregistrés
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { marginTop: 12, fontSize: 15 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    gap: 14,
  },
  modeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  dateText: { fontSize: 14 },
  statsCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: { width: '48%', alignItems: 'center', marginBottom: 16 },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  statLabel: { fontSize: 12, marginTop: 2 },
  fuelCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  fuelGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  fuelItem: { alignItems: 'center' },
  fuelValue: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  fuelLabel: { fontSize: 12, marginTop: 4 },
  vehicleCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 16, fontWeight: '600' },
  vehicleDetail: { fontSize: 13, marginTop: 2 },
  tankInfo: { alignItems: 'center' },
  tankValue: { fontSize: 18, fontWeight: '700' },
  tankLabel: { fontSize: 11 },
  routeCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  routePoints: {},
  routePoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routePointInfo: { flex: 1, paddingVertical: 2 },
  routePointLabel: { fontSize: 12 },
  routePointValue: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  routeLine: {
    width: 2,
    height: 24,
    marginLeft: 13,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  routeInfo: { fontSize: 12, marginTop: 14, textAlign: 'center' },
});
