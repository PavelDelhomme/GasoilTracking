import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { VehicleCard } from '@/components/VehicleCard';
import { Button } from '@/components/Button';
import { deleteVehicle } from '@/lib/database';
import { confirm, notify } from '@/lib/notify';

export default function VehiclesScreen() {
  const { vehicles, activeVehicle, selectVehicle, refresh } = useApp();
  const { colors } = useTheme();

  const handleDelete = (id: number, name: string) => {
    confirm(
      'Supprimer',
      `Supprimer "${name}" ?`,
      async () => {
        await deleteVehicle(id);
        await refresh();
        notify('Supprimé', name);
      },
      'Supprimer'
    );
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
            <Button
              title="Ajouter un véhicule"
              onPress={() => router.push('/vehicle/add')}
              style={{ marginTop: 20, alignSelf: 'stretch' }}
            />
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 12,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              Ou depuis l&apos;accueil : « Charger un exemple »
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            isActive={activeVehicle?.id === item.id}
            onSelect={() => selectVehicle(item.id)}
            onPress={() =>
              router.push({ pathname: '/vehicle/edit' as never, params: { id: String(item.id) } })
            }
            onEdit={() =>
              router.push({ pathname: '/vehicle/edit' as never, params: { id: String(item.id) } })
            }
            onMaintenance={() =>
              router.push({
                pathname: '/vehicle/maintenance' as never,
                params: { id: String(item.id) },
              })
            }
            onLongPress={() => handleDelete(item.id, item.name)}
            onDelete={() => handleDelete(item.id, item.name)}
            onFuelUpdated={() => void refresh()}
          />
        )}
      />
      {vehicles.length > 0 && (
        <View style={styles.footer}>
          <Button title="Ajouter un véhicule" onPress={() => router.push('/vehicle/add')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 24 },
  emptyText: { fontSize: 16, marginTop: 16 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
});
