import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { fetchVehicles, fetchStats, type Vehicle, type TripStats } from '@/lib/api';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, logout, loading: authLoading } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [vRes, sRes] = await Promise.all([
          fetchVehicles(),
          fetchStats('all'),
        ]);
        setVehicles(vRes.vehicles);
        setStats(sRes.stats);
      } catch (e) {
        console.warn('Erreur chargement profil:', e);
      }
      setLoading(false);
    })();
  }, [user]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
  };

  if (!user) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <Ionicons name="person-circle" size={80} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.text }]}>Mon profil</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Connectez-vous avec votre compte Hubera Fuel
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header profil */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accentLight }]}>
          <Text style={[styles.avatarText, { color: colors.accent }]}>
            {user.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.userName, { color: colors.text }]}>{user.name}</Text>
        <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</Text>
        <View style={[styles.badge, { backgroundColor: colors.accentLight }]}>
          <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
          <Text style={[styles.badgeText, { color: colors.accent }]}>Compte Hubera Fuel</Text>
        </View>
      </View>

      {/* Statistiques globales */}
      {stats && (
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Statistiques globales</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{stats.totalTrips}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Trajets</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>
                {(stats.totalDistance / 1000).toFixed(0)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>km parcourus</Text>
            </View>
            {stats.totalFuelUsed > 0 && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.accent }]}>
                  {stats.totalFuelUsed.toFixed(0)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>litres</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>
                {Math.round(stats.totalDuration / 3600)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>heures</Text>
            </View>
          </View>

          {/* Répartition par mode */}
          <Text style={[styles.subsectionTitle, { color: colors.text, marginTop: 16 }]}>
            Par mode de transport
          </Text>
          <View style={styles.modeStats}>
            {[
              { key: 'driving', icon: 'car', label: 'Voiture' },
              { key: 'walking', icon: 'walk', label: 'À pied' },
              { key: 'transit', icon: 'bus', label: 'Transports' },
              { key: 'cycling', icon: 'bicycle', label: 'Vélo' },
            ].map(({ key, icon, label }) => {
              const modeData = stats.byMode[key as keyof typeof stats.byMode];
              if (modeData.count === 0) return null;
              return (
                <View key={key} style={[styles.modeStatRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.modeStatLeft}>
                    <Ionicons name={icon as any} size={18} color={colors.accent} />
                    <Text style={[styles.modeStatLabel, { color: colors.text }]}>{label}</Text>
                  </View>
                  <View style={styles.modeStatRight}>
                    <Text style={[styles.modeStatValue, { color: colors.text }]}>
                      {modeData.count} trajets
                    </Text>
                    <Text style={[styles.modeStatSub, { color: colors.textSecondary }]}>
                      {(modeData.distance / 1000).toFixed(0)} km
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Véhicules */}
      {vehicles.length > 0 && (
        <View style={[styles.vehiclesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Mes véhicules</Text>
          {vehicles.map((v) => (
            <View key={v.id} style={[styles.vehicleRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.vehicleIcon, { backgroundColor: colors.accentLight }]}>
                <Ionicons name="car-sport" size={20} color={colors.accent} />
              </View>
              <View style={styles.vehicleInfo}>
                <Text style={[styles.vehicleName, { color: colors.text }]}>{v.name}</Text>
                <Text style={[styles.vehicleDetail, { color: colors.textSecondary }]}>
                  {v.brand} {v.model} {v.year ? `(${v.year})` : ''}
                </Text>
              </View>
              {v.avgConsumption && (
                <View style={styles.vehicleConsumption}>
                  <Text style={[styles.consumptionValue, { color: colors.accent }]}>
                    {v.avgConsumption.toFixed(1)}
                  </Text>
                  <Text style={[styles.consumptionLabel, { color: colors.textSecondary }]}>
                    L/100
                  </Text>
                </View>
              )}
            </View>
          ))}
          <Text style={[styles.vehiclesNote, { color: colors.textSecondary }]}>
            Gérez vos véhicules dans Hubera Fuel
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsSection}>
        <Pressable
          style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            // Ouvrir Hubera Fuel
          }}
        >
          <Ionicons name="water" size={20} color={colors.accent} />
          <Text style={[styles.actionText, { color: colors.text }]}>Ouvrir Hubera Fuel</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>

        <Pressable
          style={[styles.logoutButton, { borderColor: colors.error }]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.logoutText, { color: colors.error }]}>Se déconnecter</Text>
            </>
          )}
        </Pressable>
      </View>

      <Text style={[styles.version, { color: colors.textSecondary }]}>
        Hubera Maps v1.0.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 16 },
  subtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  primaryButton: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  profileCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '800' },
  userName: { fontSize: 20, fontWeight: '700' },
  userEmail: { fontSize: 14, marginTop: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  statsCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  subsectionTitle: { fontSize: 14, fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: { width: '48%', alignItems: 'center', marginBottom: 12 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  modeStats: { marginTop: 8 },
  modeStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  modeStatLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeStatLabel: { fontSize: 14, fontWeight: '500' },
  modeStatRight: { alignItems: 'flex-end' },
  modeStatValue: { fontSize: 14, fontWeight: '600' },
  modeStatSub: { fontSize: 12 },
  vehiclesCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  vehicleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 15, fontWeight: '600' },
  vehicleDetail: { fontSize: 12, marginTop: 2 },
  vehicleConsumption: { alignItems: 'center' },
  consumptionValue: { fontSize: 18, fontWeight: '800' },
  consumptionLabel: { fontSize: 10 },
  vehiclesNote: { fontSize: 12, marginTop: 12, textAlign: 'center' },
  actionsSection: { gap: 12 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '600' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 24 },
});
