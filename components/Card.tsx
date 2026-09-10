import React from 'react';
import { View, Text, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function Card({ children, style, accessibilityLabel }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
  onPress?: () => void;
}

export function StatCard({ label, value, subtitle, color, onPress }: StatCardProps) {
  const { colors } = useTheme();
  const inner = (
    <Card
      style={styles.statCard}
      accessibilityLabel={`${label} : ${value}${subtitle ? `, ${subtitle}` : ''}`}
    >
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: color ?? colors.text }]}>{value}</Text>
      {subtitle && (
        <Text style={[styles.statSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      )}
    </Card>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ flex: 1 }}
    >
      {inner}
    </Pressable>
  );
}

interface ProgressBarProps {
  percent: number;
  color?: string;
  height?: number;
}

export function ProgressBar({ percent, color, height = 8 }: ProgressBarProps) {
  const { colors } = useTheme();
  const over = percent > 100;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const barColor =
    color ??
    (over || clampedPercent > 90
      ? colors.danger
      : clampedPercent > 70
        ? colors.warning
        : colors.success);

  return (
    <View
      style={[styles.progressBg, { backgroundColor: colors.border, height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clampedPercent) }}
    >
      <View
        style={[
          styles.progressFill,
          {
            width: `${clampedPercent}%`,
            backgroundColor: barColor,
            height,
            opacity: over ? 1 : 1,
          },
        ]}
      />
      {over && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderWidth: 1.5,
              borderColor: colors.danger,
              borderRadius: 4,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  progressBg: {
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    borderRadius: 4,
  },
});
