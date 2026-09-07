import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import {
  MAINTENANCE_CHECKLIST_ITEMS,
  checklistProgress,
  emptyChecklist,
  type MaintenanceChecklistState,
} from '@/lib/maintenanceChecklist';

type Props = {
  upToDate: boolean | null | undefined;
  checklist: MaintenanceChecklistState | undefined;
  onChangeUpToDate: (v: boolean | null) => void;
  onChangeChecklist: (next: MaintenanceChecklistState) => void;
};

/** Oui/Non entretien + checklist cochable. */
export function MaintenanceStatusPanel({
  upToDate,
  checklist,
  onChangeUpToDate,
  onChangeChecklist,
}: Props) {
  const { colors } = useTheme();
  const state = checklist && Object.keys(checklist).length ? checklist : emptyChecklist();
  const { done, total } = checklistProgress(state);

  const toggle = (id: string) => {
    onChangeChecklist({ ...state, [id]: !state[id] });
  };

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.text }]}>Entretien régulier à jour ?</Text>
      <View style={styles.row}>
        {(
          [
            { v: true as boolean | null, label: 'Oui' },
            { v: false, label: 'Non' },
            { v: null, label: 'N/R' },
          ] as const
        ).map((opt) => {
          const active = upToDate === opt.v || (opt.v === null && (upToDate === null || upToDate === undefined));
          return (
            <Pressable
              key={String(opt.label)}
              onPress={() => onChangeUpToDate(opt.v)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.accent : colors.background,
                  borderColor: active ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700' }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 10, marginBottom: 6 }}>
        Checklist ({done}/{total})
      </Text>
      {MAINTENANCE_CHECKLIST_ITEMS.map((it) => {
        const on = Boolean(state[it.id]);
        return (
          <Pressable
            key={it.id}
            onPress={() => toggle(it.id)}
            style={styles.checkRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Ionicons
              name={on ? 'checkbox' : 'square-outline'}
              size={22}
              color={on ? colors.accent : colors.textSecondary}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{it.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{it.hint}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontWeight: '800', fontSize: 15, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
});
