import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { PlaceSuggestField } from '@/components/PlaceSuggestField';
import type { Place } from '@/types';

export const MAX_TRIP_STOPS = 8;

export type TripStop = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

export function newTripStopId(): string {
  return `stop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

type Bias = { latitude: number; longitude: number } | null | undefined;

type Props = {
  stops: TripStop[];
  onChange: (stops: TripStop[]) => void;
  places: Place[];
  bias?: Bias;
  /** Champ d’ajout contrôlé (ex. pendant un trajet déjà lancé). */
  adding?: boolean;
  onAddingChange?: (v: boolean) => void;
  compact?: boolean;
  hideAdd?: boolean;
};

export function TripStopsEditor({
  stops,
  onChange,
  places,
  bias,
  adding: addingProp,
  onAddingChange,
  compact,
  hideAdd,
}: Props) {
  const { colors } = useTheme();
  const [innerAdding, setInnerAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const adding = addingProp ?? innerAdding;
  const setAdding = (v: boolean) => {
    onAddingChange?.(v);
    if (addingProp == null) setInnerAdding(v);
    if (!v) setDraft('');
  };

  const pick = (label: string, latitude: number, longitude: number) => {
    if (stops.length >= MAX_TRIP_STOPS) return;
    onChange([...stops, { id: newTripStopId(), label, latitude, longitude }]);
    setAdding(false);
    setDraft('');
  };

  return (
    <View style={{ marginTop: compact ? 8 : 12 }}>
      {!compact ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8, lineHeight: 17 }}>
          Comme dans Maps / Waze : ici → étape(s) → arrivée. Google Maps s’ouvre avec les arrêts
          (pas un simple passage).
        </Text>
      ) : null}

      {stops.map((s, i) => (
        <View
          key={s.id}
          style={[
            styles.stopRow,
            { borderColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
          </View>
          <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={2}>
            {s.label}
          </Text>
          <Pressable
            onPress={() => onChange(stops.filter((x) => x.id !== s.id))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Retirer l’étape ${s.label}`}
          >
            <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
      ))}

      {hideAdd ? null : adding && stops.length < MAX_TRIP_STOPS ? (
        <View style={{ marginTop: 4 }}>
          <PlaceSuggestField
            label={`Étape ${stops.length + 1}`}
            placeholder="Station, adresse, lieu…"
            value={draft}
            onChangeText={setDraft}
            places={places}
            bias={bias ?? undefined}
            onPickCoords={(c) => {
              if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
                pick(c.label, c.latitude, c.longitude);
              }
            }}
          />
          <Pressable onPress={() => setAdding(false)} style={{ paddingVertical: 6 }}>
            <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
              Annuler
            </Text>
          </Pressable>
        </View>
      ) : stops.length < MAX_TRIP_STOPS ? (
        <Pressable
          onPress={() => setAdding(true)}
          style={[styles.addBtn, { borderColor: colors.accent, backgroundColor: colors.accent + '12' }]}
          accessibilityRole="button"
          accessibilityLabel="Ajouter une étape"
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>
            Ajouter une étape
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
});
