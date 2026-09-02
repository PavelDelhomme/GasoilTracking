import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createPlace } from '@/lib/database';
import { notify } from '@/lib/notify';
import { getCurrentLocation } from '@/lib/locationService';
import type { PlaceKind } from '@/types';

const KINDS: { id: PlaceKind; label: string }[] = [
  { id: 'home', label: 'Domicile' },
  { id: 'work', label: 'Travail' },
  { id: 'other', label: 'Autre' },
  { id: 'station', label: 'Station' },
];

export default function AddPlaceScreen() {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [kind, setKind] = useState<PlaceKind>('home');
  const [loading, setLoading] = useState(false);

  const save = async (withGps: boolean) => {
    if (!name.trim()) {
      notify('Erreur', 'Nom du lieu requis.');
      return;
    }
    setLoading(true);
    try {
      let lat: number | null = null;
      let lon: number | null = null;
      if (withGps) {
        const loc = await getCurrentLocation();
        if (loc) {
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
        }
      }
      await createPlace({
        name: name.trim(),
        address: address.trim(),
        kind,
        latitude: lat,
        longitude: lon,
      });
      notify('Lieu ajouté', name.trim());
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
        Configurez domicile, travail ou d&apos;autres points pour vos trajets réguliers et le budget.
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
      <Input label="Nom" value={name} onChangeText={setName} placeholder="Maison, Bureau…" />
      <Input
        label="Adresse"
        value={address}
        onChangeText={setAddress}
        placeholder="12 rue…, Lille"
      />
      <Button title="Enregistrer" onPress={() => save(false)} loading={loading} />
      <Button
        title="Enregistrer + GPS actuel"
        variant="secondary"
        onPress={() => save(true)}
        loading={loading}
        style={{ marginTop: 10 }}
      />
    </ScrollView>
  );
}
