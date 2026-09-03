import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FUEL_TYPE_LABELS } from '@/constants/Colors';
import type { Vehicle } from '@/types';
import { formatConsumption } from '@/lib/calculations';
import { fuelLevelLabel } from '@/lib/fuelLevel';

interface VehicleCardProps {
  vehicle: Vehicle;
  isActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function VehicleCard({
  vehicle,
  isActive,
  onPress,
  onLongPress,
  onSelect,
  onEdit,
  onDelete,
}: VehicleCardProps) {
  const { colors } = useTheme();

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
          <Text style={[styles.statValue, { color: colors.text }]}>
            {vehicle.tankCapacity} L
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Réservoir</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {FUEL_TYPE_LABELS[vehicle.fuelType]}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Carburant</Text>
        </View>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 10 }}>
        {fuelLevelLabel(vehicle)}
        {isActive ? ' · véhicule par défaut' : ''}
      </Text>

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
            style={[styles.selectBtn, { borderColor: colors.danger, flex: 0, minWidth: 44, paddingHorizontal: 12 }]}
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
