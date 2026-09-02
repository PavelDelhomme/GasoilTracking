import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, StatCard } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import TripMap from '@/components/TripMap';
import type { TripMapRef } from '@/components/TripMap.types';
import {
  createTrip,
  stopActiveTrips,
  updateTrip,
} from '@/lib/database';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  getCurrentLocation,
  openGoogleMapsNavigation,
  openGoogleMapsSearch,
} from '@/lib/locationService';
import {
  calculateTripStats,
  formatEuro,
  formatDistance,
  parseRoutePoints,
} from '@/lib/calculations';

export default function TripScreen() {
  const { activeVehicle, activeTrip, refresh } = useApp();
  const { colors } = useTheme();
  const mapRef = useRef<TripMapRef>(null);
  const [destination, setDestination] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [currentRegion, setCurrentRegion] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  useEffect(() => {
    getCurrentLocation().then((loc) => {
      if (loc) {
        setCurrentRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (activeTrip) {
      const points = parseRoutePoints(activeTrip.routePoints);
      if (points.length > 0 && mapRef.current) {
        mapRef.current.fitToCoordinates(
          points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
        );
      }
    }
  }, [activeTrip?.routePoints]);

  const handleStartTrip = async () => {
    if (!activeVehicle) {
      Alert.alert('Erreur', 'Sélectionnez un véhicule avant de démarrer un trajet.');
      return;
    }

    setIsStarting(true);
    try {
      await stopActiveTrips();
      const loc = await getCurrentLocation();
      const startPoint = loc
        ? [{ latitude: loc.coords.latitude, longitude: loc.coords.longitude, timestamp: Date.now() }]
        : [];

      await createTrip({
        vehicleId: activeVehicle.id,
        startTime: new Date().toISOString(),
        endTime: null,
        distanceKm: 0,
        estimatedFuelUsed: 0,
        estimatedCost: 0,
        routePoints: JSON.stringify(startPoint),
        destinationName: destination || undefined,
        isActive: true,
      });

      const trackingStarted = await startBackgroundTracking();
      if (!trackingStarted) {
        Alert.alert(
          'Permission requise',
          'Autorisez la localisation en arrière-plan pour suivre votre trajet pendant la navigation.'
        );
      }

      await refresh();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de démarrer le trajet.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTrip = async () => {
    if (!activeTrip) return;

    Alert.alert('Terminer le trajet', 'Voulez-vous arrêter le suivi ?', [
      { text: 'Continuer', style: 'cancel' },
      {
        text: 'Terminer',
        onPress: async () => {
          await stopBackgroundTracking();
          await updateTrip(activeTrip.id, {
            isActive: false,
            endTime: new Date().toISOString(),
          });
          await refresh();
        },
      },
    ]);
  };

  const handleOpenGoogleMaps = async () => {
    if (destination.trim()) {
      const url = openGoogleMapsSearch(destination);
      await Linking.openURL(url);
    } else {
      const loc = await getCurrentLocation();
      if (loc) {
        const url = openGoogleMapsNavigation(
          loc.coords.latitude + 0.01,
          loc.coords.longitude + 0.01,
          destination || 'Destination'
        );
        await Linking.openURL(url);
      }
    }
  };

  const tripStats =
    activeTrip && activeVehicle
      ? calculateTripStats(activeVehicle, activeTrip.distanceKm, activeTrip.startTime)
      : null;

  const routePoints = activeTrip ? parseRoutePoints(activeTrip.routePoints) : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.map}>
        <TripMap
          ref={mapRef}
          region={currentRegion}
          routePoints={routePoints}
          accentColor={colors.accent}
        />
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {!activeVehicle ? (
          <Card>
            <Text style={[styles.warning, { color: colors.warning }]}>
              Sélectionnez un véhicule dans l'onglet Véhicules pour démarrer un trajet.
            </Text>
          </Card>
        ) : activeTrip ? (
          <>
            <Card style={{ ...styles.activeTrip, borderColor: colors.accent }}>
              <View style={styles.tripActiveHeader}>
                <Ionicons name="radio-button-on" size={16} color={colors.accent} />
                <Text style={[styles.tripActiveTitle, { color: colors.accent }]}>
                  Trajet en cours
                </Text>
              </View>
              {activeTrip.destinationName && (
                <Text style={[styles.destination, { color: colors.text }]}>
                  → {activeTrip.destinationName}
                </Text>
              )}
            </Card>

            <View style={styles.statsRow}>
              <StatCard
                label="Distance"
                value={formatDistance(activeTrip.distanceKm)}
              />
              <StatCard
                label="Carburant est."
                value={`${activeTrip.estimatedFuelUsed.toFixed(2)} L`}
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                label="Coût est."
                value={formatEuro(activeTrip.estimatedCost)}
              />
              <StatCard
                label="Durée"
                value={`${Math.floor(tripStats?.durationMinutes ?? 0)} min`}
              />
            </View>

            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Le suivi continue en arrière-plan même si vous ouvrez Google Maps pour la navigation.
            </Text>

            <Button
              title="Ouvrir Google Maps"
              variant="secondary"
              onPress={handleOpenGoogleMaps}
              style={{ marginBottom: 8 }}
            />
            <Button title="Terminer le trajet" variant="danger" onPress={handleStopTrip} />
          </>
        ) : (
          <>
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Démarrer un trajet
              </Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                Véhicule : {activeVehicle.name} ({activeVehicle.consumptionPer100} L/100km)
              </Text>
              <Input
                label="Destination (optionnel)"
                placeholder="Ex: Paris, Lyon, 12 rue de la Paix..."
                value={destination}
                onChangeText={setDestination}
              />
            </Card>

            <Button
              title="Démarrer le suivi GPS"
              onPress={handleStartTrip}
              loading={isStarting}
              style={{ marginBottom: 8 }}
            />
            <Button
              title="Naviguer avec Google Maps"
              variant="outline"
              onPress={handleOpenGoogleMaps}
            />

            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Lancez d'abord le suivi GPS, puis ouvrez Google Maps. L'application calculera
              la consommation en temps réel pendant votre trajet, même en arrière-plan.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { height: '45%' },
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 14, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  activeTrip: { marginBottom: 12, borderWidth: 2 },
  tripActiveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripActiveTitle: { fontSize: 16, fontWeight: '700' },
  destination: { fontSize: 15, marginTop: 4 },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 16, lineHeight: 20 },
  warning: { fontSize: 15, textAlign: 'center' },
});
