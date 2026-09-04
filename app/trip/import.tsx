import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Pressable,
} from 'react-native';
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
  type ImportedTripDraft,
} from '@/lib/mapsImport';
import {
  base64ToBytes,
  filterDraftsByDateRange,
  parseTimelineFromJsonText,
  parseTimelineFromZipBytes,
  suggestVehicleHint,
} from '@/lib/takeoutImport';
import { notify } from '@/lib/notify';
import { formatDistance, formatEuro } from '@/lib/calculations';
import type { Vehicle } from '@/types';

type DraftRow = ImportedTripDraft & { vehicleId: number };

export default function ImportTripsScreen() {
  const { activeVehicle, vehicles, refresh } = useApp();
  const { colors } = useTheme();
  const [mapsUrl, setMapsUrl] = useState('');
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [defaultVehicleId, setDefaultVehicleId] = useState<number | null>(
    activeVehicle?.id ?? null
  );

  const vehicleById = useMemo(() => {
    const m = new Map<number, Vehicle>();
    for (const v of vehicles) m.set(v.id, v);
    return m;
  }, [vehicles]);

  const estimateFor = (vehicleId: number, km: number) => {
    const v = vehicleById.get(vehicleId);
    if (!v) return { fuel: 0, cost: 0 };
    const fuel = (km * v.consumptionPer100) / 100;
    return { fuel, cost: fuel * v.defaultFuelPrice };
  };

  const mergeDrafts = (list: ImportedTripDraft[], vehicleId?: number) => {
    const vid = vehicleId ?? defaultVehicleId ?? activeVehicle?.id;
    if (!vid) {
      notify('Véhicule', 'Sélectionnez un véhicule cible.');
      return;
    }
    const filtered = filterDraftsByDateRange(
      list,
      fromDay.trim() || null,
      toDay.trim() || null
    );
    setDrafts((prev) => [
      ...filtered.map((d) => ({ ...d, vehicleId: vid })),
      ...prev,
    ]);
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

  const ingestPayload = async (uri: string, name: string, mime?: string | null) => {
    const lower = name.toLowerCase();
    const isZip =
      lower.endsWith('.zip') ||
      mime === 'application/zip' ||
      mime === 'application/x-zip-compressed';

    if (isZip) {
      let b64: string;
      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const { drafts: list, filesRead, errors } = parseTimelineFromZipBytes(bytes);
        if (!list.length) {
          notify(
            'Import ZIP',
            errors[0] || 'Aucun trajet Timeline trouvé dans le ZIP.'
          );
          return;
        }
        mergeDrafts(list);
        notify(
          'Takeout ZIP',
          `${list.length} trajet(s) · fichiers : ${filesRead.slice(0, 4).join(', ')}`
        );
        return;
      }
      b64 = await FileSystem.readAsStringAsync(uri, {
                  encoding: 'base64' as const,
      });
      const bytes = base64ToBytes(b64);
      const { drafts: list, filesRead, errors } = parseTimelineFromZipBytes(bytes);
      if (!list.length) {
        notify('Import ZIP', errors[0] || 'Aucun trajet trouvé dans le ZIP.');
        return;
      }
      mergeDrafts(list);
      notify(
        'Takeout ZIP',
        `${list.length} trajet(s) · ${filesRead.length} fichier(s) JSON lus`
      );
      return;
    }

    let raw = '';
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      raw = await res.text();
    } else {
      raw = await FileSystem.readAsStringAsync(uri);
    }
    const list = parseTimelineFromJsonText(raw);
    if (!list.length) {
      notify('Import', 'Aucun trajet trouvé dans ce JSON Timeline.');
      return;
    }
    mergeDrafts(list);
    notify('Import', `${list.length} trajet(s) détectés — validez / changez de véhicule.`);
  };

  const pickTimelineFile = async () => {
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/json',
          'application/zip',
          'application/x-zip-compressed',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      await ingestPayload(asset.uri, asset.name || 'export.json', asset.mimeType);
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Lecture fichier impossible');
    } finally {
      setPicking(false);
    }
  };

  const openMapsTimelineHelp = async () => {
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

  const setRowVehicle = (index: number, vehicleId: number) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, vehicleId } : d)));
  };

  const saveAll = async () => {
    const toSave = drafts.filter((d) => d.status !== 'rejected');
    if (!toSave.length) {
      notify('Rien à sauver', 'Tous les trajets sont ignorés.');
      return;
    }
    setLoading(true);
    try {
      for (const d of toSave) {
        const v = vehicleById.get(d.vehicleId);
        if (!v) continue;
        const km = d.distanceKm || 0;
        const { fuel, cost } = estimateFor(d.vehicleId, km);
        await createTrip({
          vehicleId: d.vehicleId,
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
          await addTrackedKm(d.vehicleId, km);
        }
      }
      await refresh();
      notify('OK', `${toSave.length} trajet(s) enregistrés.`);
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec import');
    } finally {
      setLoading(false);
    }
  };

  if (!vehicles.length) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.danger, textAlign: 'center' }}>
          Ajoutez un véhicule avant d’importer.
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
      <Text style={[styles.title, { color: colors.text }]}>Importer des trajets</Text>

      <Card style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
          Méthode recommandée (sans Takeout)
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
          Google ne propose plus d’API pour récupérer votre Timeline personnelle. Le plus fiable :
          démarrer un trajet GPS dans l’app (onglet Trajet) avant de partir, ou saisir un trajet
          manuel / coller un lien Google Maps Directions plus bas.
        </Text>
        <Button
          title="Ouvrir le suivi GPS"
          onPress={() => router.push('/(tabs)/trip' as never)}
          style={{ marginBottom: 8 }}
        />
        <Button
          title="Saisir un trajet manuel"
          variant="outline"
          onPress={() => router.push('/trip/add' as never)}
        />
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
          Export Timeline / Takeout (optionnel)
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 8 }}>
          Si tu arrives à exporter un .json Timeline ou un .zip Takeout, tu peux encore l’importer
          ici — mais ce n’est plus nécessaire au quotidien.
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
          Astuce : filtre les dates, puis change le véhicule ligne par ligne si besoin.
        </Text>

        <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>
          Véhicule par défaut à l’import
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {vehicles.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => setDefaultVehicleId(v.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: defaultVehicleId === v.id ? colors.accent : colors.card,
              }}
            >
              <Text style={{ color: defaultVehicleId === v.id ? '#fff' : colors.text, fontSize: 13 }}>
                {v.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Input
          label="Filtrer depuis (AAAA-MM-JJ) — optionnel"
          value={fromDay}
          onChangeText={setFromDay}
          placeholder="2026-08-25"
        />
        <Input
          label="Filtrer jusqu’à (AAAA-MM-JJ) — optionnel"
          value={toDay}
          onChangeText={setToDay}
          placeholder="2026-09-04"
        />

        <Button
          title={picking ? 'Ouverture…' : 'Choisir JSON ou ZIP Takeout'}
          onPress={pickTimelineFile}
          loading={picking}
        />
        <Button
          title="Aide export Timeline Maps"
          variant="outline"
          onPress={openMapsTimelineHelp}
          style={{ marginTop: 10 }}
        />
      </Card>

      <Text style={[styles.section, { color: colors.text }]}>Ou coller un lien Maps</Text>
      <Input
        label="URL Maps / Départ → Arrivée"
        value={mapsUrl}
        onChangeText={setMapsUrl}
        autoCapitalize="none"
        placeholder="https://www.google.com/maps/dir/…"
      />
      <Button title="Ajouter depuis l’URL" variant="secondary" onPress={parseUrl} />

      {drafts.length > 0 && (
        <>
          <Text style={[styles.section, { color: colors.text, marginTop: 16 }]}>
            Trajets détectés ({drafts.length})
          </Text>
          {drafts.map((d, index) => {
            const { cost } = estimateFor(d.vehicleId, d.distanceKm || 0);
            const hint = suggestVehicleHint(d);
            const rejected = d.status === 'rejected';
            return (
              <Card
                key={`${d.startTime}-${index}`}
                style={{
                  marginBottom: 10,
                  opacity: rejected ? 0.55 : 1,
                  borderColor: rejected ? colors.border : colors.accent,
                  borderWidth: 1,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {d.originName} → {d.destinationName}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                  {d.startTime.slice(0, 16).replace('T', ' ')} · {formatDistance(d.distanceKm || 0)} ·{' '}
                  {formatEuro(cost)}
                </Text>
                {!!hint && (
                  <Text style={{ color: colors.accent, fontSize: 12, marginTop: 4 }}>{hint}</Text>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {vehicles.map((v) => (
                    <Pressable
                      key={v.id}
                      onPress={() => setRowVehicle(index, v.id)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: d.vehicleId === v.id ? colors.accent + '33' : colors.background,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>
                        {v.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => confirmOne(index)}>
                    <Text style={{ color: colors.success, fontWeight: '700' }}>Valider</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleReject(index)}>
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>
                      {rejected ? 'Réintégrer' : 'Ignorer'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })}
          <Button title="Enregistrer la sélection" onPress={saveAll} loading={loading} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  section: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
});
