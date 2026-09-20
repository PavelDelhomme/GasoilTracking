import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, ProgressBar } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { getFuelGaugeReadings, getTripGaugeReadings } from '@/lib/database';
import { FUEL_GAUGE_SOURCE_LABELS } from '@/lib/fuelGaugeHistoryCore';
import { formatDateSlash, formatRelativeDay } from '@/lib/dates';
import type { FuelGaugeReading } from '@/types';

type Props = {
  vehicleId?: number;
  tripId?: number;
  compact?: boolean;
  title?: string;
  /** Nombre max de lectures (hors trajet unique). Défaut 20. */
  limit?: number;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${formatRelativeDay(iso)} · ${hm} · ${formatDateSlash(iso)}`;
  } catch {
    return iso;
  }
}

export function FuelGaugeTimeline({ vehicleId, tripId, compact, title, limit }: Props) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<FuelGaugeReading[]>([]);
  const cap = limit ?? (compact ? 20 : 20);

  const load = useCallback(async () => {
    try {
      const list = tripId
        ? await getTripGaugeReadings(tripId)
        : await getFuelGaugeReadings(vehicleId, { limit: cap });
      setRows(tripId ? list.slice(-cap) : list);
    } catch {
      setRows([]);
    }
  }, [vehicleId, tripId, compact, cap]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const heading = title || (tripId ? 'Jauge départ → arrivée' : 'Historique des jauges');

  return (
    <Card>
      <Text style={[styles.section, { color: colors.text }]}>{heading}</Text>
      {!tripId && rows.length > 0 && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
          Les plus récentes
        </Text>
      )}
      {rows.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          Aucune jauge enregistrée pour l’instant
        </Text>
      ) : (
        rows.map((r) => {
          const pct =
            r.tankCapacity > 0
              ? Math.min(100, Math.max(0, (r.liters / r.tankCapacity) * 100))
              : 0;
          return (
            <View key={r.id} style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={styles.meta}>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                  {formatWhen(r.recordedAt)}
                </Text>
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>
                  {FUEL_GAUGE_SOURCE_LABELS[r.source] || r.source}
                </Text>
              </View>
              <View style={styles.litersRow}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
                  {r.liters.toFixed(1)} L
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  ~{pct.toFixed(0)} %
                </Text>
              </View>
              <ProgressBar percent={pct} height={6} />
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  litersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
