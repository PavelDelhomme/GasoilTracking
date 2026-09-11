import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import {
  MAINTENANCE_CHECKLIST_ITEMS,
  checklistProgress,
  computeChecklistDue,
  emptyChecklist,
  markChecklistDoneAt,
  normalizeItem,
  type ChecklistItemMeta,
} from '@/lib/maintenanceChecklist';

type Props = {
  upToDate: boolean | null | undefined;
  checklist?: Record<string, unknown> | null;
  currentOdometer?: number | null;
  onChangeUpToDate: (v: boolean | null) => void;
  onChangeChecklist: (next: Record<string, ChecklistItemMeta>) => void;
};

/** Oui/Non entretien + checklist + échéances constructeur (réinit. à la coche). */
export function MaintenanceStatusPanel({
  upToDate,
  checklist,
  currentOdometer,
  onChangeUpToDate,
  onChangeChecklist,
}: Props) {
  const { colors } = useTheme();
  const meta: Record<string, ChecklistItemMeta> = {};
  for (const it of MAINTENANCE_CHECKLIST_ITEMS) {
    meta[it.id] = normalizeItem(checklist?.[it.id]);
  }
  const boolState = emptyChecklist();
  for (const it of MAINTENANCE_CHECKLIST_ITEMS) boolState[it.id] = meta[it.id].done;
  const { done, total } = checklistProgress(boolState);

  const toggle = (id: string) => {
    const nextOn = !meta[id].done;
    const next: Record<string, ChecklistItemMeta> = { ...meta };
    next[id] = nextOn
      ? markChecklistDoneAt(meta[id], currentOdometer)
      : { ...meta[id], done: false };
    onChangeChecklist(next);
  };

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.text }]}>Entretien régulier à jour ?</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 8, lineHeight: 15 }}>
        Cochez ce qui a été fait au garage : l’intervalle constructeur (km / mois) repart de maintenant.
        Non coché ou en retard = à prévoir. Factures / défauts : section Entretien & CT (montant + photo).
      </Text>
      <View style={styles.row}>
        {(
          [
            { v: true as boolean | null, label: 'Oui' },
            { v: false, label: 'Non' },
            { v: null, label: 'N/R' },
          ] as const
        ).map((opt) => {
          const active =
            upToDate === opt.v || (opt.v === null && (upToDate === null || upToDate === undefined));
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
        const on = Boolean(meta[it.id].done);
        const due = computeChecklistDue(it, meta[it.id], currentOdometer);
        const dueColor =
          due.status === 'overdue'
            ? colors.danger
            : due.status === 'soon'
              ? colors.warning
              : colors.textSecondary;
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
              <Text style={{ color: dueColor, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                {due.label}
              </Text>
              {meta[it.id].invoiceAmount != null && meta[it.id].invoiceAmount! > 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                  Facture liée : {meta[it.id].invoiceAmount!.toFixed(2)} €
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontWeight: '800', fontSize: 15, marginBottom: 4 },
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
