import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createRecurringRoute, getPlaces } from '@/lib/database';
import { notify } from '@/lib/notify';
import type { Place } from '@/types';

export default function AddRouteScreen() {
  const { activeVehicle } = useApp();
  const { colors } = useTheme();
  const [places, setPlaces] = useState<Place[]>([]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [distanceKm, setDistanceKm] = useState('20');
  const [times, setTimes] = useState('5');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPlaces().then((p) => {
      setPlaces(p);
      const home = p.find((x) => x.kind === 'home');
      const work = p.find((x) => x.kind === 'work');
      if (home) setFromId(home.id);
      if (work) setToId(work.id);
      if (home && work && !name) setName('Domicile → Travail');
    });
  }, []);

  const save = async () => {
    if (!fromId || !toId) {
      notify('Erreur', 'Choisissez départ et arrivée (créez des lieux avant).');
      return;
    }
    const km = parseFloat(distanceKm.replace(',', '.'));
    const tw = parseFloat(times.replace(',', '.'));
    if (!km || km <= 0 || !tw || tw <= 0) {
      notify('Erreur', 'Distance et fois/semaine requis.');
      return;
    }
    setLoading(true);
    try {
      const from = places.find((p) => p.id === fromId);
      const to = places.find((p) => p.id === toId);
      await createRecurringRoute({
        vehicleId: activeVehicle?.id ?? null,
        name: name.trim() || `${from?.name} → ${to?.name}`,
        fromPlaceId: fromId,
        toPlaceId: toId,
        distanceKm: km,
        timesPerWeek: tw,
        isActive: true,
      });
      notify('Trajet régulier', 'Ajouté pour l’estimation budget.');
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  const PlacePicker = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number | null;
    onChange: (id: number) => void;
  }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      {places.length === 0 ? (
        <Text style={{ color: colors.danger }}>Aucun lieu — créez-en dans Budget.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {places.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => onChange(p.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: value === p.id ? colors.accent : colors.card,
              }}
            >
              <Text style={{ color: value === p.id ? '#fff' : colors.text, fontSize: 13 }}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
        Trajet récurrent (ex. domicile–travail) pour estimer le budget mensuel.
      </Text>
      <Input label="Nom" value={name} onChangeText={setName} placeholder="Domicile → Travail" />
      <PlacePicker label="Départ" value={fromId} onChange={setFromId} />
      <PlacePicker label="Arrivée" value={toId} onChange={setToId} />
      <Input
        label="Distance aller (km)"
        value={distanceKm}
        onChangeText={setDistanceKm}
        keyboardType="numeric"
      />
      <Input
        label="Fréquence (fois / semaine)"
        value={times}
        onChangeText={setTimes}
        keyboardType="numeric"
        placeholder="5 = tous les jours ouvrés"
      />
      <Button title="Enregistrer" onPress={save} loading={loading} />
    </ScrollView>
  );
}
