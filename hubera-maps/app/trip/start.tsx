import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useTheme } from '@/context/ThemeContext';
import { startTrip, type TransportMode } from '@/lib/api';

const MODE_ICONS: Record<TransportMode, string> = {
  driving: 'car',
  walking: 'walk',
  transit: 'bus',
  cycling: 'bicycle',
};

const MODE_LABELS: Record<TransportMode, string> = {
  driving: 'En voiture',
  walking: 'À pied',
  transit: 'En transports',
  cycling: 'À vélo',
};

export default function StartTripScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    mode: TransportMode;
    vehicleId: string;
    vehicleName: string;
    destName: string;
    destLat: string;
    destLon: string;
  }>();

  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [tripId, setTripId] = useState<number | null>(null);

  const mode = (params.mode as TransportMode) || 'driving';
  const hasDestination = !!params.destName;

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await startTrip({
        mode,
        vehicleId: params.vehicleId ? Number(params.vehicleId) : undefined,
        destination: params.destName,
        destinationCoords: params.destLat && params.destLon
          ? { latitude: Number(params.destLat), longitude: Number(params.destLon) }
          : undefined,
      });

      setTripId(res.tripId);
      setStarted(true);

      // Ouvre Hubera Fuel pour démarrer le tracking GPS
      if (res.fuelDeepLink) {
        const canOpen = await Linking.canOpenURL(res.fuelDeepLink);
        if (canOpen) {
          await Linking.openURL(res.fuelDeepLink);
        }
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de démarrer le trajet');
    }
    setLoading(false);
  };

  const handleOpenMaps = async () => {
    if (!params.destLat || !params.destLon) return;
    
    const url = `https://www.google.com/maps/dir/?api=1&destination=${params.destLat},${params.destLon}&travelmode=${mode === 'driving' ? 'driving' : mode === 'walking' ? 'walking' : mode === 'cycling' ? 'bicycling' : 'transit'}`;
    await Linking.openURL(url);
  };

  if (started) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.successContent}>
          <View style={[styles.successIcon, { backgroundColor: colors.success + '20' }]}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>Trajet démarré !</Text>
          <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
            {hasDestination
              ? `Direction : ${params.destName?.split(',')[0]}`
              : 'Suivi libre en cours'}
          </Text>

          <View style={styles.successActions}>
            {hasDestination && (
              <Pressable
                style={[styles.mapsButton, { backgroundColor: colors.accent }]}
                onPress={handleOpenMaps}
              >
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.mapsButtonText}>Ouvrir Google Maps</Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.closeButton, { borderColor: colors.border }]}
              onPress={() => router.dismissAll()}
            >
              <Text style={[styles.closeButtonText, { color: colors.text }]}>Fermer</Text>
            </Pressable>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle" size={18} color={colors.accent} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Le tracking GPS est géré par Hubera Fuel. Vous pouvez mettre en pause ou arrêter
              le trajet depuis l'application Fuel.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Mode de transport */}
        <View style={[styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.modeIcon, { backgroundColor: colors.accentLight }]}>
            <Ionicons name={MODE_ICONS[mode] as any} size={32} color={colors.accent} />
          </View>
          <Text style={[styles.modeLabel, { color: colors.text }]}>{MODE_LABELS[mode]}</Text>
        </View>

        {/* Véhicule (si voiture) */}
        {mode === 'driving' && params.vehicleName && (
          <View style={[styles.infoRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="car-sport" size={20} color={colors.textSecondary} />
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Véhicule</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{params.vehicleName}</Text>
          </View>
        )}

        {/* Destination */}
        <View style={[styles.infoRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons
            name={hasDestination ? 'flag' : 'locate'}
            size={20}
            color={hasDestination ? colors.accent : colors.textSecondary}
          />
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
            {hasDestination ? 'Destination' : 'Mode'}
          </Text>
          <Text
            style={[styles.infoValue, { color: hasDestination ? colors.accent : colors.text }]}
            numberOfLines={1}
          >
            {hasDestination ? params.destName?.split(',')[0] : 'Suivi libre'}
          </Text>
        </View>

        {/* Bouton démarrer */}
        <Pressable
          style={[styles.startButton, { backgroundColor: colors.accent }]}
          onPress={handleStart}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="play" size={24} color="#fff" />
              <Text style={styles.startButtonText}>Démarrer le trajet</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Annuler</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  modeCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  modeIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modeLabel: { fontSize: 20, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { flex: 1, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 14,
    marginTop: 16,
    gap: 10,
  },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cancelButton: { alignItems: 'center', padding: 16, marginTop: 8 },
  cancelButtonText: { fontSize: 15, fontWeight: '600' },
  successContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: '800' },
  successSubtitle: { fontSize: 15, marginTop: 8, textAlign: 'center' },
  successActions: { width: '100%', marginTop: 32, gap: 12 },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  mapsButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeButton: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  closeButtonText: { fontSize: 16, fontWeight: '600' },
  infoCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 24,
    gap: 10,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
