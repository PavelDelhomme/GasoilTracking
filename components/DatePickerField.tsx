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
import { formatDateSlash, parseLocalYmd, toLocalYmd } from '@/lib/dates';

type Props = {
  label?: string;
  /** Valeur interne `AAAA-MM-JJ` */
  value: string;
  onChange: (ymd: string) => void;
  maximumDate?: Date;
  minimumDate?: Date;
};

/**
 * Sélecteur de date : affichage JJ/MM/AAAA + date picker natif.
 */
export function DatePickerField({
  label = 'Date',
  value,
  onChange,
  maximumDate,
  minimumDate,
}: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const date = parseLocalYmd(value);

  const apply = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (selected) onChange(toLocalYmd(selected));
  };

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.value, { color: colors.text }]}>{formatDateSlash(value)}</Text>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>Choisir</Text>
      </Pressable>

      {Platform.OS === 'android' && open && (
        <DateTimePicker
          value={date}
          mode="date"
          display="calendar"
          onChange={apply}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
        />
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
              mode="date"
              display="spinner"
              onChange={apply}
              maximumDate={maximumDate}
              minimumDate={minimumDate}
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
              type: 'date',
              value,
              max: maximumDate ? toLocalYmd(maximumDate) : undefined,
              min: minimumDate ? toLocalYmd(minimumDate) : undefined,
              onChange: (e: { target: { value: string } }) => {
                if (e.target.value) onChange(e.target.value);
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
