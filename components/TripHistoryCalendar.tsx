import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatMonthLabel, nextMonthKey, previousMonthKey, toLocalYmd } from '@/lib/dates';
import { applyCalendarDayPick, monthDayCells, WEEKDAYS_FR, ymdInInclusiveRange } from '@/lib/tripHistoryCalendar';

type Props = {
  monthYm: string;
  onMonthChange: (ym: string) => void;
  tripYmds: ReadonlySet<string>;
  from: string | null;
  to: string | null;
  rangeMode: boolean;
  onRangeModeChange: (v: boolean) => void;
  onSelect: (next: { from: string; to: string; filter: 'date' | 'range' }) => void;
  maxYmd?: string;
};

/**
 * Calendrier historique : jours avec trajet (point) vs sans, jour ou plage.
 */
export function TripHistoryCalendar({
  monthYm,
  onMonthChange,
  tripYmds,
  from,
  to,
  rangeMode,
  onRangeModeChange,
  onSelect,
  maxYmd,
}: Props) {
  const { colors } = useTheme();
  const today = toLocalYmd(new Date());
  const cap = maxYmd || today;
  const cells = monthDayCells(monthYm);

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => onRangeModeChange(false)}
          accessibilityRole="button"
          accessibilityState={{ selected: !rangeMode }}
          style={[
            styles.modeChip,
            {
              borderColor: !rangeMode ? colors.accent : colors.border,
              backgroundColor: !rangeMode ? colors.accent + '22' : colors.background,
            },
          ]}
        >
          <Text style={{ color: !rangeMode ? colors.accent : colors.text, fontWeight: '700', fontSize: 13 }}>
            Un jour
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onRangeModeChange(true)}
          accessibilityRole="button"
          accessibilityState={{ selected: rangeMode }}
          style={[
            styles.modeChip,
            {
              borderColor: rangeMode ? colors.accent : colors.border,
              backgroundColor: rangeMode ? colors.accent + '22' : colors.background,
            },
          ]}
        >
          <Text style={{ color: rangeMode ? colors.accent : colors.text, fontWeight: '700', fontSize: 13 }}>
            Plage de dates
          </Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
        {rangeMode
          ? 'Touchez le début puis la fin. Point coloré = jour avec trajet.'
          : 'Touchez un jour. Point coloré = jour avec trajet.'}
      </Text>
      <View style={styles.monthNav}>
        <Pressable
          onPress={() => onMonthChange(previousMonthKey(monthYm))}
          hitSlop={10}
          accessibilityLabel="Mois précédent"
        >
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
          {formatMonthLabel(monthYm)}
        </Text>
        <Pressable
          onPress={() => onMonthChange(nextMonthKey(monthYm))}
          hitSlop={10}
          accessibilityLabel="Mois suivant"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.accent} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS_FR.map((d, i) => (
          <Text key={`${d}-${i}`} style={[styles.weekHead, { color: colors.textSecondary }]}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((c, i) => {
          if (!c.ymd) {
            return <View key={`e-${i}`} style={styles.cell} />;
          }
          const ymd = c.ymd;
          const hasTrip = tripYmds.has(ymd);
          const disabled = ymd > cap;
          const selected =
            from && to ? ymdInInclusiveRange(ymd, from, to) : from === ymd;
          const isEnd = from && to && from !== to && (ymd === from || ymd === to);
          const isToday = ymd === today;
          return (
            <Pressable
              key={ymd}
              disabled={disabled}
              onPress={() =>
                onSelect(
                  applyCalendarDayPick({ ymd, rangeMode, from, to })
                )
              }
              accessibilityRole="button"
              accessibilityLabel={`${ymd}${hasTrip ? ', avec trajet' : ', sans trajet'}`}
              style={styles.cell}
            >
              <View
                style={[
                  styles.day,
                  selected
                    ? {
                        backgroundColor: isEnd ? colors.accent : colors.accent + '44',
                      }
                    : isToday
                      ? { borderWidth: 1, borderColor: colors.accent }
                      : null,
                  disabled ? { opacity: 0.35 } : null,
                ]}
              >
                <Text
                  style={{
                    color: selected && isEnd ? '#fff' : hasTrip ? colors.text : colors.textSecondary,
                    fontWeight: hasTrip || selected ? '800' : '500',
                    fontSize: 13,
                  }}
                >
                  {Number(ymd.slice(8, 10))}
                </Text>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: hasTrip
                        ? selected && isEnd
                          ? '#fff'
                          : colors.accent
                        : 'transparent',
                    },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekHead: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285%', aspectRatio: 1, padding: 2 },
  day: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
});
