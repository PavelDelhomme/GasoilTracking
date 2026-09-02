import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { getPlaces, updatePlace } from '@/lib/database';
import { notify } from '@/lib/notify';
import { getCurrentLocation } from '@/lib/locationService';
import type { Place, PlaceKind } from '@/types';

const KINDS: { id: PlaceKind; label: string }[] = [
  { id: 'home', label: 'Domicile' },
  { id: 'work', label: 'Travail' },
  { id: 'other', label: 'Autre' },
  { id: 'station', label: 'Station' },
];

export default function EditPlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = Number(id);
  const { colors } = useTheme();
  const [place, setPlace] = useState<Place | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [kind, setKind] = useState<PlaceKind>('home');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPlaces().then((list) => {
      const p = list.find((x) => x.id === placeId);
      if (!p) {
        notify('Erreur', 'Lieu introuvable.');
        router.back();
        return;
      }
      setPlace(p);
      setName(p.name);
      setAddress(p.address || '');
      setKind(p.kind);
    });
  }, [placeId]);

  const save = async (refreshGps: boolean) => {
    if (!name.trim()) {
      notify('Erreur', 'Nom requis.');
      return;
    }
    setLoading(true);
    try {
      let lat = place?.latitude ?? null;
      let lon = place?.longitude ?? null;
      if (refreshGps) {
        const loc = await getCurrentLocation();
        if (loc) {
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
        }
      }
      await updatePlace(placeId, {
        name: name.trim(),
        address: address.trim(),
        kind,
        latitude: lat,
        longitude: lon,
      });
      notify('Lieu mis à jour', name.trim());
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  if (!place) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Text style={{ color: colors.textSecondary }}>Chargement…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
        Modifiez le nom et l’adresse exacte. GPS optionnel pour la carte.
      </Text>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {KINDS.map((k) => (
          <Pressable
            key={k.id}
            onPress={() => setKind(k.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: kind === k.id ? colors.accent : colors.card,
            }}
          >
            <Text style={{ color: kind === k.id ? '#fff' : colors.text, fontWeight: '600' }}>
              {k.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Input label="Nom" value={name} onChangeText={setName} placeholder="Domicile" />
      <Input
        label="Adresse exacte"
        value={address}
        onChangeText={setAddress}
        placeholder="1 Rue Camille Saint-Saëns, Thorigné-Fouillard"
      />
      {place.latitude != null && place.longitude != null && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
          GPS : {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
        </Text>
      )}
      <Button title="Enregistrer" onPress={() => save(false)} loading={loading} />
      <Button
        title="Enregistrer + position GPS actuelle"
        variant="secondary"
        onPress={() => save(true)}
        loading={loading}
        style={{ marginTop: 10 }}
      />
    </ScrollView>
  );
}
