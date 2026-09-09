/**
 * Modal jauge visuelle (remplace les Alert 1/4 · 1/2 · Plein).
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FuelGaugeSlider } from '@/components/FuelGaugeSlider';
import type { Vehicle } from '@/types';
import type { FuelGaugeResult } from '@/lib/fuelGaugePrompt';

type Request = {
  vehicle: Vehicle;
  title: string;
  message: string;
  resolve: (r: FuelGaugeResult) => void;
};

let enqueue: ((req: Request) => void) | null = null;

/** Appelé par askFuelGaugeApprox quand le host est monté. */
export function registerFuelGaugeHost(fn: ((req: Request) => void) | null) {
  enqueue = fn;
}

export function requestFuelGaugeModal(req: Request): boolean {
  if (!enqueue) return false;
  enqueue(req);
  return true;
}

export function FuelGaugeModalHost() {
  const { colors } = useTheme();
  const [req, setReq] = useState<Request | null>(null);
  const [liters, setLiters] = useState(0);

  useEffect(() => {
    registerFuelGaugeHost((r) => {
      const start =
        r.vehicle.estimatedFuelLiters != null
          ? r.vehicle.estimatedFuelLiters
          : r.vehicle.tankCapacity * 0.5;
      setLiters(start);
      setReq(r);
    });
    return () => registerFuelGaugeHost(null);
  }, []);

  const close = (result: FuelGaugeResult) => {
    req?.resolve(result);
    setReq(null);
  };

  if (!req) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close({ liters, skipped: true })}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{req.title}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
            {req.message}
          </Text>
          <FuelGaugeSlider
            tankCapacity={req.vehicle.tankCapacity}
            liters={liters}
            onChange={setLiters}
            requireConfirm={false}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                close({
                  liters: req.vehicle.estimatedFuelLiters ?? 0,
                  skipped: true,
                })
              }
              style={[styles.btn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Passer</Text>
            </Pressable>
            <Pressable
              onPress={() => close({ liters, skipped: false })}
              style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent }]}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Valider · {liters.toFixed(1)} L</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: Platform.OS === 'ios' ? 'center' : 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 28,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnPrimary: { borderWidth: 0 },
});
