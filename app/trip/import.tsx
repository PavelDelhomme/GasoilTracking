import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { createTrip, addTrackedKm } from '@/lib/database';
import {
  parseGoogleMapsUrl,
  parseGoogleTimelineJson,
  type ImportedTripDraft,
} from '@/lib/mapsImport';
import { notify } from '@/lib/notify';
import { formatDistance, formatEuro } from '@/lib/calculations';

export default function ImportTripsScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [mapsUrl, setMapsUrl] = useState('');
  const [jsonPaste, setJsonPaste] = useState('');
  const [drafts, setDrafts] = useState<ImportedTripDraft[]>([]);
  const [loading, setLoading] = useState(false);

  const estimate = (km: number) => {
    if (!activeVehicle) return { fuel: 0, cost: 0 };
    const fuel = (km * activeVehicle.consumptionPer100) / 100;
    return { fuel, cost: fuel * activeVehicle.defaultFuelPrice };
  };

  const parseUrl = () => {
    const d = parseGoogleMapsUrl(mapsUrl);
    if (!d) {
      notify('Import', 'URL non reconnue. Collez un lien Google Maps Directions ou « Départ → Arrivée ».');
      return;
    }
    setDrafts((prev) => [d, ...prev]);
    setMapsUrl('');
  };

  const parseJson = () => {
    try {
      const list = parseGoogleTimelineJson(jsonPaste);
      if (!list.length) {
        notify('Import', 'Aucun trajet trouvé dans ce JSON.');
        return;
      }
      setDrafts((prev) => [...list, ...prev]);
      setJsonPaste('');
      notify(
        'Import',
        `${list.length} trajet(s) détectés. Validez ceux en voiture, ignorez les autres.`
      );
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'JSON invalide');
    }
  };

  const toggleReject = (index: number) => {
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === index
          ? { ...d, status: d.status === 'rejected' ? 'pending' : 'rejected' }
          : d
      )
    );
  };

  const confirmOne = (index: number) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, status: 'confirmed', activityType: 'driving' } : d))
    );
  };

  const saveAll = async () => {
    if (!activeVehicle) {
      notify('Erreur', 'Véhicule actif requis.');
      return;
    }
    const toSave = drafts.filter((d) => d.status !== 'rejected');
    if (!toSave.length) {
      notify('Rien à sauver', 'Tous les trajets sont ignorés.');
      return;
    }
    setLoading(true);
    try {
      for (const d of toSave) {
        const km = d.distanceKm || 0;
        const { fuel, cost } = estimate(km);
        await createTrip({
          vehicleId: activeVehicle.id,
          startTime: d.startTime,
          endTime: d.endTime,
          distanceKm: km,
          estimatedFuelUsed: Math.round(fuel * 100) / 100,
          estimatedCost: Math.round(cost * 100) / 100,
          routePoints: '[]',
          originName: d.originName,
          destinationName: d.destinationName,
          isActive: false,
          status: d.status === 'confirmed' ? 'confirmed' : 'pending',
          source: d.source,
          fillUpId: null,
          note: d.note,
        });
        if (d.status === 'confirmed' && km > 0) {
          await addTrackedKm(activeVehicle.id, km);
        }
      }
      await refresh();
      notify('OK', `${toSave.length} trajet(s) enregistrés (certains en attente de validation).`);
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec import');
    } finally {
      setLoading(false);
    }
  };

  if (!activeVehicle) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.danger, textAlign: 'center' }}>
          Sélectionnez un véhicule avant d’importer.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>Importer depuis Google Maps</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Collez une URL d’itinéraire Maps, un texte « Départ → Arrivée », ou le JSON Timeline
        (Google Takeout). Les trajets détectés restent à valider.
      </Text>

      <Input
        label="URL Maps / Départ → Arrivée"
        value={mapsUrl}
        onChangeText={setMapsUrl}
        autoCapitalize="none"
        placeholder="https://www.google.com/maps/dir/Lille/Paris/"
      />
      <Button title="Ajouter depuis l’URL" variant="secondary" onPress={parseUrl} />

      <Input
        label="JSON Timeline Takeout (coller)"
        value={jsonPaste}
        onChangeText={setJsonPaste}
        multiline
        style={{ minHeight: 100, textAlignVertical: 'top' }}
        placeholder='{"timelineObjects":[...]}'
      />
      <Button title="Analyser le JSON" variant="outline" onPress={parseJson} style={{ marginBottom: 16 }} />

      {drafts.map((d, i) => {
        const rejected = d.status === 'rejected';
        const tag =
          d.activityType === 'driving'
            ? 'Voiture'
            : d.activityType === 'other'
              ? 'Autre'
              : 'Indéfini';
        return (
          <Card
            key={`${d.startTime}-${i}`}
            style={{
              marginBottom: 10,
              opacity: rejected ? 0.45 : 1,
              borderWidth: 1,
              borderColor: d.status === 'confirmed' ? colors.success : colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {d.originName} → {d.destinationName}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              {new Date(d.startTime).toLocaleString('fr-FR')} · {formatDistance(d.distanceKm)} · {tag} ·{' '}
              {d.source}
            </Text>
            {!!d.note && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{d.note}</Text>
            )}
            <View style={styles.row}>
              <TouchableOpacity onPress={() => confirmOne(i)}>
                <Text style={{ color: colors.success, fontWeight: '600' }}>Valider voiture</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleReject(i)}>
                <Text style={{ color: colors.danger, fontWeight: '600' }}>
                  {rejected ? 'Remettre' : 'Ignorer'}
                </Text>
              </TouchableOpacity>
            </View>
            {d.distanceKm > 0 && activeVehicle && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                Est. {estimate(d.distanceKm).fuel.toFixed(2)} L ·{' '}
                {formatEuro(estimate(d.distanceKm).cost)}
              </Text>
            )}
          </Card>
        );
      })}

      {drafts.length > 0 && (
        <Button title={`Enregistrer (${drafts.filter((d) => d.status !== 'rejected').length})`} onPress={saveAll} loading={loading} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 20, marginTop: 10 },
});
