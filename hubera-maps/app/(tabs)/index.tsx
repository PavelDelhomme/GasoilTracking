import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import {
  fetchVehicles,
  fetchPlaces,
  searchAddress,
  type Vehicle,
  type Place,
  type GeocodingResult,
  type TransportMode,
} from '@/lib/api';

const TRANSPORT_MODES: { id: TransportMode; icon: string; label: string }[] = [
  { id: 'driving', icon: 'car', label: 'Voiture' },
  { id: 'walking', icon: 'walk', label: 'À pied' },
  { id: 'transit', icon: 'bus', label: 'Transports' },
  { id: 'cycling', icon: 'bicycle', label: 'Vélo' },
];

export default function MapScreen() {
  const { colors } = useTheme();
  const { user, loading: authLoading, requestingFromFuel, requestSessionFromFuel } = useAuth();

  const [mode, setMode] = useState<TransportMode>('driving');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<GeocodingResult | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Charge les données au montage
  useEffect(() => {
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const [vehiclesRes, placesRes] = await Promise.all([
          fetchVehicles(),
          fetchPlaces(),
        ]);
        setVehicles(vehiclesRes.vehicles);
        setPlaces(placesRes.places);
        // Sélectionne le véhicule par défaut
        const defaultV = vehiclesRes.vehicles.find((v) => v.isDefault) || vehiclesRes.vehicles[0];
        if (defaultV) setSelectedVehicle(defaultV);
      } catch (e) {
        console.warn('Erreur chargement données:', e);
      }
      setLoading(false);
    })();
  }, [user]);

  // Demande la position
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
    })();
  }, []);

  // Recherche d'adresse avec debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchAddress(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStartTrip = useCallback(() => {
    router.push({
      pathname: '/trip/start',
      params: {
        mode,
        vehicleId: mode === 'driving' ? selectedVehicle?.id : undefined,
        vehicleName: mode === 'driving' ? selectedVehicle?.name : undefined,
        destName: destination?.displayName,
        destLat: destination?.lat,
        destLon: destination?.lon,
      },
    });
  }, [mode, selectedVehicle, destination]);

  const handleSelectResult = (result: GeocodingResult) => {
    setDestination(result);
    setSearchQuery(result.displayName.split(',')[0]);
    setSearchResults([]);
  };

  const handleSelectPlace = (place: Place) => {
    setDestination({
      placeId: String(place.id),
      displayName: place.name,
      lat: place.latitude,
      lon: place.longitude,
      type: place.type || 'place',
    });
    setSearchQuery(place.name);
  };

  // État de chargement auth (récupération session Fuel)
  if (authLoading || requestingFromFuel) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {requestingFromFuel 
            ? 'Connexion via Hubera Fuel...' 
            : 'Chargement...'}
        </Text>
        {requestingFromFuel && (
          <Text style={[styles.subtitle, { color: colors.textSecondary, marginTop: 8 }]}>
            Vérification de votre compte Hubera
          </Text>
        )}
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <Ionicons name="map" size={64} color={colors.textSecondary} />
          <Text style={[styles.title, { color: colors.text }]}>Hubera Maps</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Connectez-vous avec votre compte Hubera Fuel pour accéder à vos véhicules et trajets.
          </Text>
          
          {/* Bouton pour réessayer la connexion via Fuel */}
          <Pressable
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={async () => {
              const requested = await requestSessionFromFuel();
              if (!requested) {
                // Fuel pas installé, aller à l'écran de login manuel
                router.push('/auth');
              }
            }}
          >
            <Ionicons name="flash" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Connexion via Hubera Fuel</Text>
          </Pressable>
          
          {/* Bouton secondaire pour login manuel */}
          <Pressable
            style={[styles.secondaryButton, { borderColor: colors.border, marginTop: 12 }]}
            onPress={() => router.push('/auth')}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Ou se connecter manuellement
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Chargement...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Sélection du mode de transport */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Mode de transport</Text>
      <View style={styles.modeRow}>
        {TRANSPORT_MODES.map((m) => (
          <Pressable
            key={m.id}
            style={[
              styles.modeButton,
              {
                backgroundColor: mode === m.id ? colors.accent : colors.card,
                borderColor: mode === m.id ? colors.accent : colors.border,
              },
            ]}
            onPress={() => setMode(m.id)}
          >
            <Ionicons
              name={m.icon as any}
              size={24}
              color={mode === m.id ? '#fff' : colors.text}
            />
            <Text
              style={[
                styles.modeLabel,
                { color: mode === m.id ? '#fff' : colors.text },
              ]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Sélection du véhicule (si mode voiture) */}
      {mode === 'driving' && vehicles.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Véhicule</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vehicleScroll}>
            {vehicles.map((v) => (
              <Pressable
                key={v.id}
                style={[
                  styles.vehicleCard,
                  {
                    backgroundColor: selectedVehicle?.id === v.id ? colors.accentLight : colors.card,
                    borderColor: selectedVehicle?.id === v.id ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => setSelectedVehicle(v)}
              >
                <Ionicons
                  name="car-sport"
                  size={28}
                  color={selectedVehicle?.id === v.id ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[styles.vehicleName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {v.name}
                </Text>
                <Text style={[styles.vehicleInfo, { color: colors.textSecondary }]}>
                  {v.brand} {v.model}
                </Text>
                {(v.consumptionPer100 || v.avgConsumption) && (
                  <Text style={[styles.vehicleConsumption, { color: colors.accent }]}>
                    {(v.consumptionPer100 || v.avgConsumption)?.toFixed(1)} L/100
                  </Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Recherche de destination */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Destination</Text>
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Rechercher une adresse..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searching && <ActivityIndicator size="small" color={colors.accent} />}
        {searchQuery && !searching && (
          <Pressable onPress={() => { setSearchQuery(''); setDestination(null); }}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Résultats de recherche */}
      {searchResults.length > 0 && (
        <View style={[styles.resultsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {searchResults.map((r) => (
            <Pressable
              key={r.placeId}
              style={[styles.resultItem, { borderBottomColor: colors.border }]}
              onPress={() => handleSelectResult(r)}
            >
              <Ionicons name="location" size={18} color={colors.accent} />
              <Text style={[styles.resultText, { color: colors.text }]} numberOfLines={2}>
                {r.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Lieux enregistrés */}
      {!searchQuery && places.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>
            Lieux enregistrés
          </Text>
          <View style={styles.placesGrid}>
            {places.slice(0, 6).map((p) => (
              <Pressable
                key={p.id}
                style={[styles.placeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleSelectPlace(p)}
              >
                <Ionicons
                  name={p.type === 'home' ? 'home' : p.type === 'work' ? 'briefcase' : 'star'}
                  size={20}
                  color={colors.accent}
                />
                <Text style={[styles.placeName, { color: colors.text }]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Boutons d'action */}
      <View style={styles.actionButtons}>
        <Pressable
          style={[styles.startButton, { backgroundColor: colors.accent }]}
          onPress={handleStartTrip}
        >
          <Ionicons name="navigate" size={22} color="#fff" />
          <Text style={styles.startButtonText}>
            {destination ? 'Démarrer le trajet' : 'Suivi libre'}
          </Text>
        </Pressable>
      </View>

      {destination && (
        <View style={[styles.destinationBanner, { backgroundColor: colors.accentLight }]}>
          <Ionicons name="flag" size={18} color={colors.accent} />
          <Text style={[styles.destinationText, { color: colors.accent }]} numberOfLines={1}>
            {destination.displayName.split(',')[0]}
          </Text>
          <Pressable onPress={() => setDestination(null)}>
            <Ionicons name="close" size={18} color={colors.accent} />
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 22 },
  loadingText: { marginTop: 12, fontSize: 15 },
  primaryButton: { 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32, 
    paddingVertical: 14, 
    borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 4,
  },
  modeLabel: { fontSize: 12, fontWeight: '600' },
  vehicleScroll: { marginBottom: 16 },
  vehicleCard: {
    width: 120,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginRight: 10,
    alignItems: 'center',
    gap: 4,
  },
  vehicleName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  vehicleInfo: { fontSize: 11, textAlign: 'center' },
  vehicleConsumption: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
  resultsContainer: { marginTop: 8, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  resultText: { flex: 1, fontSize: 14 },
  placesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  placeName: { fontSize: 13, fontWeight: '600', maxWidth: 100 },
  actionButtons: { marginTop: 24 },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 10,
  },
  startButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  destinationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  destinationText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
