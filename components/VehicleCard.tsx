import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FUEL_TYPE_LABELS } from '@/constants/Colors';
import type { Vehicle } from '@/types';
import { displayOdometerKm, formatConsumption } from '@/lib/calculations';
import { fuelLevelLabel, fuelLevelPercent, setFuelFraction } from '@/lib/fuelLevel';
import { ProgressBar } from '@/components/Card';
import { notify } from '@/lib/notify';

interface VehicleCardProps {
  vehicle: Vehicle;
  isActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Après changement rapide de jauge. */
  onFuelUpdated?: () => void;
}

const FUEL_PRESETS = [
  { f: 0.125, label: '~1/8' },
  { f: 0.25, label: '1/4' },
  { f: 0.5, label: '1/2' },
  { f: 0.75, label: '3/4' },
  { f: 1, label: 'Plein' },
] as const;

export function VehicleCard({
  vehicle,
  isActive,
  onPress,
  onLongPress,
  onSelect,
  onEdit,
  onDelete,
  onFuelUpdated,
}: VehicleCardProps) {
  const { colors } = useTheme();
  const odo = displayOdometerKm(vehicle);
  const fuelPct = fuelLevelPercent(vehicle);

  const setFuel = async (fraction: number, label: string) => {
    const next = await setFuelFraction(vehicle, fraction);
    notify('Réservoir', `${vehicle.name} · ${label} (~${next.toFixed(0)} L)`);
    onFuelUpdated?.();
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: isActive ? colors.accent : colors.border,
          borderWidth: isActive ? 2 : 1,
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]}>{vehicle.name}</Text>
          <Text style={[styles.details, { color: colors.textSecondary }]}>
            {vehicle.brand} {vehicle.model} ({vehicle.year})
          </Text>
        </View>
        {isActive && (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Text style={styles.badgeText}>Actif</Text>
          </View>
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatConsumption(vehicle.consumptionPer100, vehicle.fuelType)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Conso.</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{odo.toLocaleString('fr-FR')}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>km</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {FUEL_TYPE_LABELS[vehicle.fuelType]}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Carburant</Text>
        </View>
      </View>

      <View style={styles.fuelBlock}>
        <View style={styles.fuelHeader}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
            Réservoir · {fuelLevelLabel(vehicle)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
            {vehicle.tankCapacity} L
          </Text>
        </View>
        <ProgressBar
          percent={fuelPct}
          color={fuelPct < 20 ? colors.danger : fuelPct < 40 ? colors.warning : colors.success}
          height={10}
        />
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
          Jauge approx. (ce que vous voyez sur le tableau de bord)
        </Text>
        <View style={styles.fuelChips}>
          {FUEL_PRESETS.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={(e) => {
                e.stopPropagation?.();
                void setFuel(opt.f, opt.label);
              }}
              style={[
                styles.fuelChip,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    vehicle.estimatedFuelLiters != null &&
                    Math.abs(fuelPct / 100 - opt.f) < 0.08
                      ? colors.accent + '22'
                      : colors.background,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
        {(vehicle.currentOdometer > 0 || (vehicle.trackedKm ?? 0) > 0) && (
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
                        Compteur {odo.toLocaleString('fr-FR')} km · base{' '}
            {(vehicle.currentOdometer || 0).toLocaleString('fr-FR')} +{' '}
            {(vehicle.trackedKm || 0).toFixed(0)} suivis
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        {!isActive && onSelect && (
          <TouchableOpacity
            style={[styles.selectBtn, { borderColor: colors.accent, flex: 1 }]}
            onPress={onSelect}
          >
            <Text style={[styles.selectText, { color: colors.accent }]}>Sélectionner</Text>
          </TouchableOpacity>
        )}
        {onEdit && (
          <TouchableOpacity
            style={[styles.selectBtn, { borderColor: colors.border, flex: 1 }]}
            onPress={onEdit}
          >
            <Text style={[styles.selectText, { color: colors.text }]}>Modifier</Text>
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity
            style={[
              styles.selectBtn,
              { borderColor: colors.danger, flex: 0, minWidth: 44, paddingHorizontal: 12 },
            ]}
            onPress={onDelete}
          >
            <Text style={[styles.selectText, { color: colors.danger }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  info: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700' },
  details: { fontSize: 14, marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 14, fontWeight: '600' },
  statLabel: { fontSize: 11, marginTop: 2 },
  fuelBlock: { marginTop: 14 },
  fuelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fuelChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  fuelChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectBtn: {
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  selectText: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
});
