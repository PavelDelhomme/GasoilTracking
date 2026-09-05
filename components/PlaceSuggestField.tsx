import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import type { Place, PlaceKind } from '@/types';
import {
  searchAddressSuggestions,
  searchContactSuggestions,
  type SuggestHit,
} from '@/lib/placeSuggest';

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
  if (/domicil|maison|home|appart/.test(n) && p.kind === 'home') return true;
  if (/travail|bureau|boulot|work|office|inter/.test(n) && p.kind === 'work') return true;
  if (/station|essence|carburant/.test(n) && p.kind === 'station') return true;
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
  /** Active Nominatim + contacts */
  enableRemoteSuggest?: boolean;
};

function expandAlias(text: string, places: Place[]): string {
  const n = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
  if (n === 'domicile' || n === 'maison' || n === 'home') {
    const home = places.find((p) => p.kind === 'home');
    if (home) return placeLabel(home);
  }
  if (n === 'travail' || n === 'bureau' || n === 'work' || n === 'intermarche' || n === 'intermarché') {
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
}: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<SuggestHit[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const placeSuggestions = useMemo(() => {
    const filtered = places.filter((p) => matchesQuery(p, value)).slice(0, 8);
    if (filtered.length) return filtered;
    if (!value.trim()) return quick.slice(0, 6);
    return [];
  }, [places, value, quick]);

  useEffect(() => {
    if (!enableRemoteSuggest || !focused) {
      setRemote([]);
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setRemote([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const [geo, contacts] = await Promise.all([
          searchAddressSuggestions(q, 5),
          searchContactSuggestions(q),
        ]);
        setRemote([...contacts, ...geo].slice(0, 8));
      })();
    }, 380);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, focused, enableRemoteSuggest]);

  const pickPlace = (p: Place) => {
    onChangeText(placeLabel(p));
    onPickPlace?.(p);
    if (p.latitude != null && p.longitude != null) {
      onPickCoords?.({
        latitude: p.latitude,
        longitude: p.longitude,
        label: placeLabel(p),
      });
    }
    setFocused(false);
  };

  const pickRemote = (h: SuggestHit) => {
    const labelText = h.subtitle && h.source === 'contact' ? `${h.label} — ${h.subtitle}` : h.label;
    onChangeText(labelText);
    if (h.latitude != null && h.longitude != null) {
      onPickCoords?.({ latitude: h.latitude, longitude: h.longitude, label: labelText });
    } else if (h.subtitle) {
      // Contact : adresse texte → géocode plus tard au start
      onPickCoords?.({ latitude: NaN, longitude: NaN, label: h.subtitle });
    }
    setFocused(false);
  };

  const showList = focused || value.length > 0;

  return (
    <View style={styles.wrap}>
      <Input
        label={label}
        value={value}
        onChangeText={(t) => {
          const expanded = expandAlias(t, places);
          onChangeText(expanded);
          if (expanded !== t) {
            const match = places.find((p) => placeLabel(p) === expanded);
            if (match) pickPlace(match);
          }
          setFocused(true);
        }}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 220)}
      />

      {quick.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {quick.map((p) => (
            <Pressable
              key={`q-${p.id}`}
              onPress={() => pickPlace(p)}
              style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                {KIND_LABEL[p.kind] === p.name ? p.name : `${KIND_LABEL[p.kind]} · ${p.name}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {showList && (placeSuggestions.length > 0 || remote.length > 0) && (
        <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {placeSuggestions.map((p) => (
            <Pressable
              key={`p-${p.id}`}
              onPress={() => pickPlace(p)}
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
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>
                {h.source === 'contact' ? 'Contact' : 'Adresse'}
              </Text>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{h.label}</Text>
              {!!h.subtitle && (
                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>
                  {h.subtitle}
                </Text>
              )}
            </Pressable>
          ))}
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
