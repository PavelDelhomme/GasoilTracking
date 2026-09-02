import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Text } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createBudget } from '@/lib/database';
import { getBudgetPeriodDates } from '@/lib/calculations';
import type { Budget } from '@/types';

export default function AddBudgetScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<Budget['period']>('monthly');
  const [loading, setLoading] = useState(false);

  const periods: { key: Budget['period']; label: string }[] = [
    { key: 'monthly', label: 'Mensuel' },
    { key: 'yearly', label: 'Annuel' },
    { key: 'custom', label: 'Personnalisé' },
  ];

  const handleSave = async () => {
    if (!name.trim() || !amount) {
      Alert.alert('Erreur', 'Nom et montant sont requis.');
      return;
    }

    setLoading(true);
    try {
      const { startDate, endDate } = getBudgetPeriodDates(period);
      await createBudget({
        vehicleId: activeVehicle?.id ?? null,
        name: name.trim(),
        amount: parseFloat(amount),
        period,
        startDate,
        endDate,
        isActive: true,
      });
      await refresh();
      router.back();
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le budget.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Input
        label="Nom du budget"
        placeholder="Carburant mensuel"
        value={name}
        onChangeText={setName}
      />
      <Input
        label="Montant (€)"
        placeholder="200"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />

      <Text style={[styles.label, { color: colors.text }]}>Période</Text>
      <View style={styles.periods}>
        {periods.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.periodChip,
              {
                backgroundColor: period === p.key ? colors.accent : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setPeriod(p.key)}
          >
            <Text
              style={{
                color: period === p.key ? '#fff' : colors.text,
                fontWeight: '600',
              }}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {activeVehicle
          ? `Ce budget sera lié à : ${activeVehicle.name}. Il se mettra à jour automatiquement à chaque plein.`
          : 'Budget global pour tous les véhicules.'}
      </Text>

      <Button title="Créer le budget" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  periods: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  hint: { fontSize: 13, marginBottom: 24, lineHeight: 20 },
});
