import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createBudget, getRecurringRoutes } from '@/lib/database';
import { formatEuro, getBudgetPeriodDates } from '@/lib/calculations';
import { notify } from '@/lib/notify';
import type { Budget } from '@/types';

export default function AddBudgetScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const { currency } = useLocale();
  const [name, setName] = useState('Carburant mensuel');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<Budget['period']>('monthly');
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [hintRoutes, setHintRoutes] = useState('');

  useEffect(() => {
    (async () => {
      if (!activeVehicle) return;
      const routes = await getRecurringRoutes(activeVehicle.id);
      if (!routes.length) return;
      let kmWeek = 0;
      for (const r of routes) kmWeek += r.distanceKm * r.timesPerWeek;
      const kmMonth = kmWeek * 4.33;
      const liters = (kmMonth * activeVehicle.consumptionPer100) / 100;
      const est = Math.ceil(liters * activeVehicle.defaultFuelPrice);
      // marge enveloppe +15 %
      const envelope = Math.ceil(est * 1.15);
      setSuggested(envelope);
      setHintRoutes(
        `${routes.length} trajet(s) régulier(s) → ~${kmMonth.toFixed(0)} km/mois → ~${formatEuro(est)} (+15 % = ${formatEuro(envelope)})`
      );
      if (!amount) setAmount(String(envelope));
    })();
  }, [activeVehicle?.id]);

  const periods: { key: Budget['period']; label: string }[] = [
    { key: 'monthly', label: 'Mensuel' },
    { key: 'yearly', label: 'Annuel' },
    { key: 'custom', label: 'Personnalisé' },
  ];

  const handleSave = async () => {
    if (!name.trim() || !amount) {
      notify('Erreur', 'Nom et montant sont requis.');
      return;
    }

    setLoading(true);
    try {
      const { startDate, endDate } = getBudgetPeriodDates(period);
      await createBudget({
        vehicleId: activeVehicle?.id ?? null,
        name: name.trim(),
        amount: parseFloat(amount.replace(',', '.')),
        period,
        startDate,
        endDate,
        isActive: true,
      });
      await refresh();
      notify('Enveloppe créée', `${name.trim()} — ${amount} ${currency}`);
      router.back();
    } catch {
      notify('Erreur', 'Impossible de créer le budget.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Système d&apos;enveloppe : chaque plein débite ce budget. Proposez un montant d&apos;après
        vos trajets réguliers (domicile / travail…).
      </Text>

      {suggested != null && (
        <View style={[styles.suggest, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            Suggestion du mois : {formatEuro(suggested)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{hintRoutes}</Text>
          <Button
            title="Utiliser cette suggestion"
            variant="outline"
            onPress={() => setAmount(String(suggested))}
            style={{ marginTop: 10 }}
          />
        </View>
      )}

      <Input
        label="Nom de l’enveloppe"
        placeholder="Carburant mensuel"
        value={name}
        onChangeText={setName}
      />
      <Input
        label={`Montant enveloppe (${currency})`}
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
          ? `Lié à : ${activeVehicle.name}. Mis à jour à chaque plein.`
          : 'Budget global pour tous les véhicules.'}
      </Text>

      <Button title="Créer l’enveloppe" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  suggest: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
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
