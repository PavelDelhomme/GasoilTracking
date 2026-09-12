import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import type { Place, PlaceKind } from '@/types';
import {
  searchAddressSuggestions,
  searchContactSuggestions,
  type SuggestHit,
} from '@/lib/placeSuggest';
import { PLACE_SEARCH_DEBOUNCE_MS } from '@/lib/placeSearch';
import {
  getRecentDestinations,
  type RecentDestination,
} from '@/lib/recentDestinations';

const KIND_LABEL: Record<PlaceKind, string> = {
  home: 'Domicile',
  work: 'Travail',
  other: 'Autre',
  station: 'Station',
};

function placeLabel(p: Place): string {
  const base = p.name || KIND_LABEL[p.kind] || 'Lieu';
  if (p.address?.trim()) return `${base} — ${p.address.trim()}`;
  return base;
}

function matchesQuery(p: Place, q: string): boolean {
  if (!q.trim()) return true;
  const n = q.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const hay = `${p.name} ${p.address} ${KIND_LABEL[p.kind]} ${p.kind}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (/\b(domicil\w*|maison|home|appart)\b/.test(n) && p.kind === 'home') return true;
  // Ne PAS matcher « inter » / Intermarché → Travail (faux positif fréquent)
  if (/\b(travail|bureau|boulot|work|office)\b/.test(n) && p.kind === 'work') return true;
  if (/\b(station|essence|carburant)\b/.test(n) && p.kind === 'station') return true;
  return hay.includes(n) || n.split(/\s+/).every((w) => !w || hay.includes(w));
}

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onPickPlace?: (place: Place) => void;
  /** Coords depuis géocode / lieu enregistré */
  onPickCoords?: (coords: { latitude: number; longitude: number; label: string }) => void;
  places: Place[];
  placeholder?: string;
  preferKinds?: PlaceKind[];
  /** Active Photon / Nominatim + contacts */
  enableRemoteSuggest?: boolean;
  /** Biais GPS (meilleures suggestions autour de soi). */
  bias?: { latitude: number; longitude: number } | null;
};

function expandAlias(text: string, places: Place[]): string {
  const n = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
  if (n === 'domicile' || n === 'maison' || n === 'home') {
    const home = places.find((p) => p.kind === 'home');
    if (home) return placeLabel(home);
  }
  if (n === 'travail' || n === 'bureau' || n === 'work' || n === 'boulot') {
    const work = places.find((p) => p.kind === 'work');
    if (work) return placeLabel(work);
  }
  return text;
}

export function PlaceSuggestField({
  label,
  value,
  onChangeText,
  onPickPlace,
  onPickCoords,
  places,
  placeholder,
  preferKinds = ['home', 'work'],
  enableRemoteSuggest = true,
  bias,
}: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  const [remote, setRemote] = useState<SuggestHit[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const biasRef = useRef(bias);
  biasRef.current = bias;

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  useEffect(() => {
    void getRecentDestinations(8).then(setRecents);
  }, []);

  const quick = useMemo(() => {
    const list: Place[] = [];
    for (const kind of preferKinds) {
      const p = places.find((x) => x.kind === kind);
      if (p) list.push(p);
    }
    for (const p of places) {
      if (!list.some((x) => x.id === p.id)) list.push(p);
    }
    return list.slice(0, 8);
  }, [places, preferKinds]);

  const queryText = focused ? draft : value;

  const recentHits = useMemo(() => {
    const q = queryText.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const scored = recents
      .map((r) => {
        const label = r.label.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
        let score = 0;
        if (!q) score = 1;
        else if (label.startsWith(q)) score = 3;
        else if (label.includes(q)) score = 2;
        else if (q.split(/\s+/).every((w) => !w || label.includes(w))) score = 1;
        return { r, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.r.at - a.r.at)
      .slice(0, 5)
      .map((x) => x.r);
    return scored;
  }, [recents, queryText]);

  const placeSuggestions = useMemo(() => {
    const filtered = places.filter((p) => matchesQuery(p, queryText)).slice(0, 8);
    if (filtered.length) return filtered;
    if (!queryText.trim()) return quick.slice(0, 6);
    return [];
  }, [places, queryText, quick]);

  useEffect(() => {
    if (!enableRemoteSuggest || !focused) {
      return;
    }
    const q = queryText.trim();
    if (q.length < 3) {
      setRemote([]);
      setRemoteLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const seq = ++searchSeq.current;
      setRemoteLoading(true);
      void (async () => {
        const [geo, contacts] = await Promise.all([
          searchAddressSuggestions(q, 6, biasRef.current),
          searchContactSuggestions(q),
        ]);
        if (seq !== searchSeq.current) return;
        setRemote([...contacts, ...geo].slice(0, 8));
        setRemoteLoading(false);
      })();
    }, PLACE_SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryText, focused, enableRemoteSuggest]);

  const pickPlace = (p: Place) => {
    const next = placeLabel(p);
    setDraft(next);
    onChangeText(next);
    onPickPlace?.(p);
    if (p.latitude != null && p.longitude != null) {
      onPickCoords?.({
        latitude: p.latitude,
        longitude: p.longitude,
        label: next,
      });
    }
    setFocused(false);
  };

  const pickRemote = (h: SuggestHit) => {
    const labelText = h.subtitle && h.source === 'contact' ? `${h.label} — ${h.subtitle}` : h.label;
    setDraft(labelText);
    onChangeText(labelText);
    if (h.latitude != null && h.longitude != null) {
      onPickCoords?.({ latitude: h.latitude, longitude: h.longitude, label: labelText });
    } else if (h.subtitle) {
      onPickCoords?.({ latitude: NaN, longitude: NaN, label: h.subtitle });
    }
    setFocused(false);
  };

  const pickRecent = (r: RecentDestination) => {
    setDraft(r.label);
    onChangeText(r.label);
    if (r.latitude != null && r.longitude != null) {
      onPickCoords?.({ latitude: r.latitude, longitude: r.longitude, label: r.label });
    }
    setFocused(false);
  };

  const emitText = (t: string) => {
    const expanded = expandAlias(t, places);
    setDraft(expanded);
    onChangeText(expanded);
    if (expanded !== t) {
      const match = places.find((p) => placeLabel(p) === expanded);
      if (match) pickPlace(match);
    }
    setFocused(true);
  };

  const showList = focused;

  return (
    <View style={styles.wrap}>
      <Input
        label={label}
        value={draft}
        clearable
        autoCorrect={false}
        autoCapitalize="sentences"
        onChangeText={emitText}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 220)}
      />

      {showList &&
        (placeSuggestions.length > 0 ||
          recentHits.length > 0 ||
          remote.length > 0 ||
          remoteLoading) && (
          <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {recentHits.map((r, i) => (
              <Pressable
                key={`recent-${i}-${r.label}`}
                onPress={() => pickRecent(r)}
                accessibilityRole="button"
                accessibilityLabel={`Récent ${r.label}`}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>Récent</Text>
                <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
            {placeSuggestions.map((p) => (
              <Pressable
                key={`p-${p.id}`}
                onPress={() => pickPlace(p)}
                accessibilityRole="button"
                accessibilityLabel={`Lieu ${p.name}`}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>
                  {KIND_LABEL[p.kind]}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{p.name}</Text>
                {!!p.address && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {p.address}
                  </Text>
                )}
              </Pressable>
            ))}
            {remote.map((h) => (
              <Pressable
                key={h.id}
                onPress={() => pickRemote(h)}
                accessibilityRole="button"
                accessibilityLabel={`${h.source === 'contact' ? 'Contact' : 'Adresse'} ${h.label}`}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>
                  {h.source === 'contact'
                    ? 'Contact'
                    : h.kind === 'poi'
                      ? 'Lieu'
                      : 'Adresse'}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{h.label}</Text>
                {!!h.subtitle && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>
                    {h.subtitle}
                  </Text>
                )}
              </Pressable>
            ))}
            {remoteLoading ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                Recherche…
              </Text>
            ) : null}
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  chips: { gap: 8, paddingBottom: 10 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    maxHeight: 280,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
