import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
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
  const [drafts, setDrafts] = useState<ImportedTripDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);

  const estimate = (km: number) => {
    if (!activeVehicle) return { fuel: 0, cost: 0 };
    const fuel = (km * activeVehicle.consumptionPer100) / 100;
    return { fuel, cost: fuel * activeVehicle.defaultFuelPrice };
  };

  const mergeDrafts = (list: ImportedTripDraft[]) => {
    setDrafts((prev) => [...list, ...prev]);
  };

  const parseUrl = () => {
    const d = parseGoogleMapsUrl(mapsUrl);
    if (!d) {
      notify(
        'Import',
        'URL non reconnue. Collez un lien Google Maps Directions ou « Départ → Arrivée ».'
      );
      return;
    }
    mergeDrafts([d]);
    setMapsUrl('');
  };

  const ingestJsonText = (raw: string) => {
    const list = parseGoogleTimelineJson(raw);
    if (!list.length) {
      notify('Import', 'Aucun trajet trouvé dans ce fichier Timeline.');
      return;
    }
    mergeDrafts(list);
    notify(
      'Import',
      `${list.length} trajet(s) détectés. Validez ceux en voiture, ignorez les autres.`
    );
  };

  /** Google n’offre plus d’API OAuth Timeline — export fichier depuis Maps. */
  const pickTimelineFile = async () => {
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      let raw = '';
      if (Platform.OS === 'web') {
        const file = (asset as { file?: File }).file;
        if (file) raw = await file.text();
        else {
          notify('Import', 'Impossible de lire le fichier sur le web.');
          return;
        }
      } else {
        raw = await FileSystem.readAsStringAsync(asset.uri);
      }
      ingestJsonText(raw);
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Lecture fichier impossible');
    } finally {
      setPicking(false);
    }
  };

  const openMapsTimelineHelp = async () => {
    // Guide utilisateur : export depuis l’app Maps (données sur l’appareil)
    await Linking.openURL('https://support.google.com/maps/answer/6258979');
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

      <Card style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
          Timeline (votre compte Google)
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
          Google ne laisse plus les apps se connecter en OAuth pour lire Timeline (données sur
          l’appareil uniquement). Le flux propre : exportez Timeline depuis Maps, puis choisissez
          le fichier ici pour sélectionner / valider les trajets.
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 12 }}>
          Sur Android : Maps → votre photo → Votre Timeline → ⋮ → Paramètres → Exporter les données
          Timeline → enregistrez le JSON → ouvrez-le ci-dessous.
        </Text>
        <Button
          title={picking ? 'Ouverture…' : 'Choisir mon fichier Timeline (.json)'}
          onPress={pickTimelineFile}
          loading={picking}
        />
        <Button
          title="Aide Google Maps (Timeline)"
          variant="outline"
          onPress={openMapsTimelineHelp}
          style={{ marginTop: 10 }}
        />
      </Card>

      <Text style={[styles.section, { color: colors.text }]}>Ou coller un lien Maps</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Lien d’itinéraire Directions, ou texte « Départ → Arrivée ».
      </Text>

      <Input
        label="URL Maps / Départ → Arrivée"
        value={mapsUrl}
        onChangeText={setMapsUrl}
        autoCapitalize="none"
        placeholder="https://www.google.com/maps/dir/Lille/Paris/"
      />
      <Button title="Ajouter depuis l’URL" variant="secondary" onPress={parseUrl} />

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
              {new Date(d.startTime).toLocaleString('fr-FR')} · {formatDistance(d.distanceKm)} ·{' '}
              {tag} · {d.source}
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
        <Button
          title={`Enregistrer (${drafts.filter((d) => d.status !== 'rejected').length})`}
          onPress={saveAll}
          loading={loading}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 20, marginTop: 10 },
});
