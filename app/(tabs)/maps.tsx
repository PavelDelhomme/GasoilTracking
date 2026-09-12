/**
 * Onglet Maps : recherche adresse en header, lieux & récents, suivi libre / nav.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
} from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/context/AppContext';
import TripMap from '@/components/TripMap';
import type { TripMapRef } from '@/components/TripMap.types';
import { getCurrentLocation, peekLiveRouteTail } from '@/lib/locationService';
import { fetchSpeedLimitNear, type SpeedLimitInfo } from '@/lib/roadSpeedLimits';
import { forwardGeocode } from '@/lib/geocode';
import { calculateRouteDistance, formatDistance, formatSpeedKmh } from '@/lib/calculations';
import { Button } from '@/components/Button';
import { TutorialAnchor } from '@/components/TutorialAnchor';
import { MapsSearchHeader } from '@/components/MapsSearchHeader';
import { getPlaces } from '@/lib/database';
import {
  getRecentDestinations,
  type RecentDestination,
} from '@/lib/recentDestinations';
import { searchAddressSuggestions, type SuggestHit } from '@/lib/placeSuggest';
import type { Place } from '@/types';
import { startFreeGpsTrip } from '@/lib/startFreeTrip';
import { useToast } from '@/context/ToastContext';

export default function MapsScreen() {
  const { colors } = useTheme();
  const { activeTrip, activeVehicle, refresh } = useApp();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const mapRef = useRef<TripMapRef>(null);
  const [user, setUser] = useState<{ latitude: number; longitude: number } | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [limit, setLimit] = useState<SpeedLimitInfo | null>(null);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHits, setSearchHits] = useState<SuggestHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [recentDests, setRecentDests] = useState<RecentDestination[]>([]);
  const [startingFree, setStartingFree] = useState(false);
  const [liveKm, setLiveKm] = useState(0);
  const searchSeq = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const userRef = useRef(user);
  userRef.current = user;

  const refreshLoc = useCallback(async () => {
    const loc = await getCurrentLocation({ fresh: true });
    if (loc?.coords) {
      setUser({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const sp = loc.coords.speed;
      if (sp != null && sp >= 0) setSpeedKmh(sp * 3.6);
    }
  }, []);

  const reloadPlaces = useCallback(async () => {
    const [p, r] = await Promise.all([getPlaces(), getRecentDestinations(8)]);
    setPlaces(p);
    setRecentDests(r);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLoc();
      void reloadPlaces();
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
    }, [refreshLoc, reloadPlaces])
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

  const goSearch = useCallback(async (raw?: string) => {
    const q = (raw ?? queryRef.current).trim();
    if (q.length < 2) {
      setSearchError('Indiquez une adresse ou un lieu');
      return;
    }
    setSearching(true);
    setSearchError(null);
    Keyboard.dismiss();
    try {
      const hit = await forwardGeocode(q, userRef.current);
      if (!hit) {
        setSearchError('Lieu introuvable — essayez un nom plus complet (ex. parc des expositions Nantes)');
        return;
      }
      router.push({
        pathname: '/(tabs)/trip',
        params: {
          mode: 'nav',
          dest: hit.label || q,
          destLat: String(hit.latitude),
          destLon: String(hit.longitude),
          autoStart: 'prepare',
          prepare: '1',
        },
      });
    } catch {
      setSearchError('Recherche indisponible');
    } finally {
      setSearching(false);
    }
  }, []);

  const onDebouncedQuery = useCallback((q: string) => {
    setQuery(q);
  }, []);

  const onSubmitSearch = useCallback((q: string) => {
    void goSearch(q);
  }, [goSearch]);

  const onSearchFocusChange = useCallback((focused: boolean) => {
    setSearchFocused(focused);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    void (async () => {
      const geo = await searchAddressSuggestions(q, 8, userRef.current);
      if (seq !== searchSeq.current) return;
      const qn = q.toLowerCase();
      const recentHits: SuggestHit[] = recentDests
        .filter((r) => r.label.toLowerCase().includes(qn))
        .slice(0, 4)
        .map((r, i) => ({
          id: `recent-${i}-${r.label}`,
          label: r.label,
          source: 'place' as const,
          latitude: r.latitude ?? undefined,
          longitude: r.longitude ?? undefined,
          subtitle: 'Récent',
        }));
      const placeHits: SuggestHit[] = places
        .filter((p) => {
          const hay = `${p.name} ${p.address}`.toLowerCase();
          return hay.includes(qn);
        })
        .slice(0, 4)
        .map((p) => ({
          id: `place-${p.id}`,
          label: p.name,
          subtitle: p.address || undefined,
          source: 'place' as const,
          latitude: p.latitude ?? undefined,
          longitude: p.longitude ?? undefined,
        }));
      setSearchHits([...recentHits, ...placeHits, ...geo].slice(0, 10));
    })();
  }, [query, places, recentDests]);

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <MapsSearchHeader
          insetsTop={insets.top}
          onDebouncedQuery={onDebouncedQuery}
          onSubmit={onSubmitSearch}
          onFocusChange={onSearchFocusChange}
        />
      ),
    });
  }, [navigation, insets.top, onDebouncedQuery, onSubmitSearch, onSearchFocusChange]);

  useEffect(() => {
    if (!activeTrip?.isActive) {
      setLiveKm(0);
      return;
    }
    const tick = () => {
      const tail = peekLiveRouteTail(200);
      if (tail && tail.length >= 2) {
        setLiveKm(calculateRouteDistance(tail));
      } else {
        setLiveKm(Number(activeTrip.distanceKm) || 0);
      }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [activeTrip?.id, activeTrip?.isActive, activeTrip?.distanceKm]);

  const openLiveTrip = useCallback(() => {
    router.navigate({ pathname: '/(tabs)/trip', params: { tab: 'live' } });
  }, []);

  const goFreeTrack = async () => {
    if (!activeVehicle) {
      router.push('/(tabs)/vehicles');
      return;
    }
    if (activeTrip?.isActive) {
      openLiveTrip();
      return;
    }
    setStartingFree(true);
    try {
      const r = await startFreeGpsTrip({ vehicle: activeVehicle, refresh });
      if (!r.ok) {
        showToast(r.error);
        return;
      }
      if (!r.trackingStarted) {
        showToast('Trajet créé — autorisez la localisation pour tracer.');
      } else {
        showToast('Suivi GPS démarré — restez sur Maps, le km s’affiche ici.');
      }
    } finally {
      setStartingFree(false);
    }
  };

  const goToPlace = (label: string, lat?: number | null, lon?: number | null) => {
    if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
      router.push({
        pathname: '/(tabs)/trip',
        params: {
          mode: 'nav',
          dest: label,
          destLat: String(lat),
          destLon: String(lon),
          autoStart: 'prepare',
          prepare: '1',
        },
      });
    } else {
      router.push({
        pathname: '/(tabs)/trip',
        params: { mode: 'nav', dest: label, autoStart: 'prepare', prepare: '1' },
      });
    }
  };

  const quickPlaces = places.filter((p) => p.kind === 'home' || p.kind === 'work');
  const otherPlaces = places.filter((p) => p.kind !== 'home' && p.kind !== 'work').slice(0, 6);

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
        <View style={[styles.hud, { top: 12 }]} pointerEvents="box-none">
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

      <TutorialAnchor id="maps-search">
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
        {searchError ? (
          <Text style={{ color: colors.warning, fontSize: 12, marginBottom: 6 }}>{searchError}</Text>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 8, lineHeight: 16 }}>
            Tapez un lieu (ex. « parc des expo Nantes ») — les suggestions arrivent après une courte
            pause, sans bloquer le clavier. Vous pourrez ajouter des étapes avant de démarrer.
          </Text>
        )}

        {searching ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Recherche du lieu…</Text>
          </View>
        ) : null}

        {(searchFocused || query.trim().length >= 2) && searchHits.length > 0 ? (
          <View style={{ marginBottom: 10, maxHeight: 180 }}>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {searchHits.map((h) => (
                <Pressable
                  key={h.id}
                  onPress={() => {
                    setSearchFocused(false);
                    if (h.latitude != null && h.longitude != null) {
                      goToPlace(h.label, h.latitude, h.longitude);
                    } else {
                      void goSearch(h.label);
                    }
                  }}
                  style={{
                    paddingVertical: 8,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>
                    {h.subtitle === 'Récent'
                      ? 'Récent'
                      : h.source === 'place'
                        ? 'Lieu'
                        : h.kind === 'poi'
                          ? 'Lieu'
                          : 'Adresse'}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                    {h.label}
                  </Text>
                  {!!h.subtitle && h.subtitle !== 'Récent' ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                      {h.subtitle}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {activeTrip?.isActive ? (
          <Pressable
            onPress={openLiveTrip}
            style={[
              styles.activeBanner,
              { borderColor: colors.accent, backgroundColor: colors.accent + '18' },
            ]}
          >
            <Ionicons name="navigate" size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                Suivi GPS en cours
                {activeTrip.isPaused ? ' · pause' : ''}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {formatDistance(liveKm || activeTrip.distanceKm || 0)}
                {activeTrip.originName ? ` · ${activeTrip.originName}` : ''}
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>Détail</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Lieux & récents</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
        >
          {quickPlaces.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => goToPlace(p.name, p.latitude, p.longitude)}
              style={[styles.chip, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}
            >
              <Ionicons
                name={p.kind === 'home' ? 'home' : 'briefcase'}
                size={14}
                color={colors.accent}
              />
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>{p.name}</Text>
            </Pressable>
          ))}
          {otherPlaces.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => goToPlace(p.name, p.latitude, p.longitude)}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
            </Pressable>
          ))}
          {recentDests.map((r, i) => (
            <Pressable
              key={`${r.label}-${i}`}
              onPress={() => goToPlace(r.label, r.latitude, r.longitude)}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                {r.label}
              </Text>
            </Pressable>
          ))}
          {!quickPlaces.length && !otherPlaces.length && !recentDests.length ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              Aucun lieu — ajoutez Maison / Travail dans Budget, ou cherchez une adresse.
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button
            title={
              !activeVehicle
                ? 'Choisir un véhicule'
                : startingFree
                  ? 'Démarrage…'
                  : activeTrip?.isActive
                    ? 'Voir le suivi'
                    : 'Démarrer suivi libre'
            }
            loading={startingFree}
            onPress={() => {
              if (!activeVehicle) {
                router.push('/(tabs)/vehicles');
                return;
              }
              void goFreeTrack();
            }}
            style={{ flex: 1 }}
          />
          <Button
            title="Historique"
            variant="outline"
            onPress={() =>
              router.push({ pathname: '/(tabs)/trip', params: { tab: 'history' } })
            }
            style={{ flex: 1 }}
          />
        </View>
      </View>
      </TutorialAnchor>
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
    paddingTop: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
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
