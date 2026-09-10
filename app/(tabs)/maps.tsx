/**
 * Onglet Maps dédié : suivi libre par défaut + accès navigation / aller quelque part.
 * Réutilise le moteur Trajet (GPS, OSRM, Overpass) via deep-link.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/context/AppContext';
import TripMap from '@/components/TripMap';
import type { TripMapRef } from '@/components/TripMap.types';
import { getCurrentLocation } from '@/lib/locationService';
import { fetchSpeedLimitNear, type SpeedLimitInfo } from '@/lib/roadSpeedLimits';
import { forwardGeocode } from '@/lib/geocode';
import { formatSpeedKmh } from '@/lib/calculations';
import { Button } from '@/components/Button';

export default function MapsScreen() {
  const { colors } = useTheme();
  const { activeTrip, activeVehicle } = useApp();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<TripMapRef>(null);
  const [user, setUser] = useState<{ latitude: number; longitude: number } | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [limit, setLimit] = useState<SpeedLimitInfo | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const refreshLoc = useCallback(async () => {
    const loc = await getCurrentLocation({ fresh: true });
    if (loc?.coords) {
      setUser({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const sp = loc.coords.speed;
      if (sp != null && sp >= 0) setSpeedKmh(sp * 3.6);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLoc();
      let nativeSub: Location.LocationSubscription | null = null;
      let webWatch: number | null = null;
      void (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
          webWatch = navigator.geolocation.watchPosition(
            (pos) => {
              setUser({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
              if (pos.coords.speed != null && pos.coords.speed >= 0) {
                setSpeedKmh(pos.coords.speed * 3.6);
              }
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 4000 }
          );
        } else {
          nativeSub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 3000,
              distanceInterval: 8,
            },
            (pos) => {
              setUser({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
              if (pos.coords.speed != null && pos.coords.speed >= 0) {
                setSpeedKmh(pos.coords.speed * 3.6);
              }
            }
          );
        }
      })();
      return () => {
        nativeSub?.remove();
        if (webWatch != null && typeof navigator !== 'undefined') {
          navigator.geolocation.clearWatch(webWatch);
        }
      };
    }, [refreshLoc])
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const run = async () => {
      const info = await fetchSpeedLimitNear(user.latitude, user.longitude);
      if (!cancelled) setLimit(info);
    };
    void run();
    const id = setInterval(() => void run(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.latitude, user?.longitude]);

  const goFreeTrack = () => {
    router.push({ pathname: '/(tabs)/trip', params: { mode: 'free', autoStart: '1' } });
  };

  const goNav = () => {
    router.push({ pathname: '/(tabs)/trip', params: { mode: 'nav' } });
  };

  const goSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchError('Indiquez une adresse ou un lieu');
      return;
    }
    setSearching(true);
    setSearchError(null);
    Keyboard.dismiss();
    try {
      const hit = await forwardGeocode(q);
      if (!hit) {
        setSearchError('Lieu introuvable');
        return;
      }
      router.push({
        pathname: '/(tabs)/trip',
        params: {
          mode: 'nav',
          dest: hit.label || q,
          destLat: String(hit.latitude),
          destLon: String(hit.longitude),
        },
      });
    } catch {
      setSearchError('Recherche indisponible');
    } finally {
      setSearching(false);
    }
  };

  const region = {
    latitude: user?.latitude ?? 48.11,
    longitude: user?.longitude ?? -1.68,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.mapWrap}>
        <TripMap
          ref={mapRef}
          region={region}
          routePoints={[]}
          accentColor={colors.accent}
          userLocation={user}
          followUser
        />
        <View style={[styles.hud, { top: 12, justifyContent: 'flex-end' }]} pointerEvents="box-none">
          <View
            style={[styles.speedChip, { backgroundColor: colors.card + 'EE', borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
              {speedKmh > 0.5 ? formatSpeedKmh(speedKmh) : '—'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>GPS</Text>
          </View>
          {limit ? (
            <View style={styles.limitSign} accessibilityLabel={`Limitation ${limit.limitKmh} km/h`}>
              <Text style={styles.limitValue}>{limit.limitKmh}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: 12 + insets.bottom,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>Maps</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>
          Suivi libre par défaut · navigation in-app (OSRM + panneaux OSM)
        </Text>

        {activeTrip ? (
          <Pressable
            onPress={() => router.push('/(tabs)/trip')}
            style={[
              styles.activeBanner,
              { borderColor: colors.accent, backgroundColor: colors.accent + '18' },
            ]}
          >
            <Ionicons name="navigate" size={18} color={colors.accent} />
            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
              Trajet en cours — ouvrir le guidage
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.accent} />
          </Pressable>
        ) : null}

        <View
          style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.background }]}
        >
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Aller quelque part…"
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.text, paddingVertical: 8, fontSize: 15 }}
            returnKeyType="search"
            onSubmitEditing={() => void goSearch()}
          />
          {searching ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Pressable onPress={() => void goSearch()} hitSlop={8}>
              <Ionicons name="arrow-forward-circle" size={26} color={colors.accent} />
            </Pressable>
          )}
        </View>
        {searchError ? (
          <Text style={{ color: colors.warning, fontSize: 12, marginBottom: 8 }}>{searchError}</Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            title={activeVehicle ? 'Démarrer suivi libre' : 'Choisir un véhicule'}
            onPress={() => {
              if (!activeVehicle) {
                router.push('/(tabs)/vehicles');
                return;
              }
              goFreeTrack();
            }}
            style={{ flex: 1 }}
          />
          <Button title="Navigation" variant="outline" onPress={goNav} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapWrap: { flex: 1, minHeight: 220 },
  hud: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  limitSign: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#dc2626',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitValue: { color: '#0f172a', fontWeight: '900', fontSize: 20 },
  speedChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  sheet: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
});
