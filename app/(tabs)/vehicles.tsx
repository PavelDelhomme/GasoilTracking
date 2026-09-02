import React from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { VehicleCard } from '@/components/VehicleCard';
import { Button } from '@/components/Button';
import { deleteVehicle } from '@/lib/database';

export default function VehiclesScreen() {
  const { vehicles, activeVehicle, selectVehicle, refresh } = useApp();
  const { colors } = useTheme();

  const handleDelete = (id: number, name: string) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteVehicle(id);
          await refresh();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="car-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Aucun véhicule enregistré
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            isActive={activeVehicle?.id === item.id}
            onSelect={() => selectVehicle(item.id)}
            onPress={() =>
              Alert.alert(item.name, undefined, [
                { text: 'Sélectionner', onPress: () => selectVehicle(item.id) },
                { text: 'Supprimer', style: 'destructive', onPress: () => handleDelete(item.id, item.name) },
                { text: 'Annuler', style: 'cancel' },
              ])
            }
          />
        )}
      />
      <View style={styles.footer}>
        <Button title="Ajouter un véhicule" onPress={() => router.push('/vehicle/add')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 64 },
  emptyText: { fontSize: 16, marginTop: 16 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
});
