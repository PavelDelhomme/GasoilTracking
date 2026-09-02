import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, ProgressBar } from '@/components/Card';
import { Button } from '@/components/Button';
import { formatEuro } from '@/lib/calculations';
import { deleteBudget } from '@/lib/database';
import type { BudgetStatus } from '@/types';
import { Alert } from 'react-native';

export default function BudgetScreen() {
  const { budgetStatuses, activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleDelete = (id: number, name: string) => {
    Alert.alert('Supprimer', `Supprimer le budget "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteBudget(id);
          await refresh();
        },
      },
    ]);
  };

  const renderBudget = ({ item }: { item: BudgetStatus }) => {
    const isOverBudget = item.percentUsed > 100;
    const statusColor = isOverBudget
      ? colors.danger
      : item.percentUsed > 80
        ? colors.warning
        : colors.success;

    return (
      <Card style={styles.budgetCard}>
        <View style={styles.budgetHeader}>
          <View>
            <Text style={[styles.budgetName, { color: colors.text }]}>{item.budget.name}</Text>
            <Text style={[styles.budgetPeriod, { color: colors.textSecondary }]}>
              {new Date(item.budget.startDate).toLocaleDateString('fr-FR')} —{' '}
              {new Date(item.budget.endDate).toLocaleDateString('fr-FR')}
            </Text>
          </View>
          <Text style={[styles.percent, { color: statusColor }]}>
            {item.percentUsed.toFixed(0)}%
          </Text>
        </View>

        <ProgressBar percent={item.percentUsed} color={statusColor} height={10} />

        <View style={styles.amounts}>
          <View style={styles.amountItem}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Dépensé</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>
              {formatEuro(item.spent)}
            </Text>
          </View>
          <View style={styles.amountItem}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Budget</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>
              {formatEuro(item.budget.amount)}
            </Text>
          </View>
          <View style={styles.amountItem}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Reste</Text>
            <Text style={[styles.amountValue, { color: statusColor }]}>
              {formatEuro(item.remaining)}
            </Text>
          </View>
        </View>

        <Text style={[styles.projection, { color: colors.textSecondary }]}>
          Projection fin de période : {formatEuro(item.projectedEndOfPeriod)}
          {item.projectedEndOfPeriod > item.budget.amount && ' ⚠️ Dépassement prévu'}
        </Text>

        <Button
          title="Supprimer"
          variant="outline"
          onPress={() => handleDelete(item.budget.id, item.budget.name)}
          style={{ marginTop: 12 }}
        />
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={budgetStatuses}
        keyExtractor={(item) => item.budget.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <Card style={styles.infoCard}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>
              Budget dynamique
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Vos budgets se mettent à jour automatiquement à chaque plein enregistré.
              {activeVehicle
                ? ` Suivi pour : ${activeVehicle.name}`
                : ' Budget global (tous véhicules)'}
            </Text>
          </Card>
        }
        ListEmptyComponent={
          <Card style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Aucun budget défini. Créez-en un pour suivre vos dépenses carburant.
            </Text>
          </Card>
        }
        renderItem={renderBudget}
      />
      <View style={styles.footer}>
        <Button title="Nouveau budget" onPress={() => router.push('/budget/add')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 100 },
  infoCard: { marginBottom: 16 },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  infoText: { fontSize: 14, lineHeight: 20 },
  empty: { alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  budgetCard: { marginBottom: 16 },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  budgetName: { fontSize: 18, fontWeight: '700' },
  budgetPeriod: { fontSize: 13, marginTop: 2 },
  percent: { fontSize: 24, fontWeight: '700' },
  amounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  amountItem: { alignItems: 'center', flex: 1 },
  amountLabel: { fontSize: 12 },
  amountValue: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  projection: { fontSize: 13, marginTop: 12, fontStyle: 'italic' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
});
