import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '@/hooks/useTheme';
import { pad2 } from '@/lib/dates';

type Props = {
  label?: string;
  /** Valeur `HH:MM` */
  value: string;
  onChange: (hm: string) => void;
};

function parseHm(hm: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || '').trim());
  const d = new Date();
  if (m) {
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  } else {
    d.setHours(12, 0, 0, 0);
  }
  return d;
}

function toHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Sélecteur d’heure natif (HH:MM). */
export function TimePickerField({ label = 'Heure', value, onChange }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const date = parseHm(value);

  const apply = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (selected) onChange(toHm(selected));
  };

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Text style={[styles.value, { color: colors.text }]}>{value || '—:—'}</Text>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>Choisir</Text>
      </Pressable>

      {Platform.OS === 'android' && open && (
        <DateTimePicker value={date} mode="time" is24Hour display="default" onChange={apply} />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide">
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={{ color: colors.accent, fontWeight: '700' }}>OK</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={date}
              mode="time"
              is24Hour
              display="spinner"
              onChange={apply}
              style={{ alignSelf: 'center' }}
            />
          </View>
        </Modal>
      )}

      {Platform.OS === 'web' && open && (
        <Modal visible transparent animationType="fade">
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.webBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>{label}</Text>
            {React.createElement('input', {
              type: 'time',
              value: value || '12:00',
              onChange: (e: { target: { value: string } }) => {
                if (e.target.value) onChange(e.target.value.slice(0, 5));
              },
              style: {
                fontSize: 16,
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.background,
                color: colors.text,
                width: '100%',
              },
            })}
            <Pressable
              onPress={() => setOpen(false)}
              style={[styles.webOk, { backgroundColor: colors.accent }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  value: { fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  sheetHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  webBox: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '30%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  webOk: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
});
