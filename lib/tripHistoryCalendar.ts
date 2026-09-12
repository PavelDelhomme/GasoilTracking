import { pad2 } from '@/lib/dates';

/** En-têtes semaine (lundi en premier). */
export const WEEKDAYS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

export type MonthDayCell = { ymd: string | null };

/** Grille calendaire lundi → dimanche pour `AAAA-MM`. */
export function monthDayCells(ym: string): MonthDayCell[] {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return [];
  const first = new Date(y, m - 1, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: MonthDayCell[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ ymd: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ ymd: `${y}-${pad2(m)}-${pad2(d)}` });
  }
  while (cells.length % 7 !== 0) cells.push({ ymd: null });
  return cells;
}

export function ymdInInclusiveRange(ymd: string, from: string, to: string): boolean {
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  return ymd >= a && ymd <= b;
}

export function applyCalendarDayPick(opts: {
  ymd: string;
  rangeMode: boolean;
  from: string | null;
  to: string | null;
}): { from: string; to: string; filter: 'date' | 'range' } {
  const { ymd, rangeMode, from, to } = opts;
  if (!rangeMode) {
    return { from: ymd, to: ymd, filter: 'date' };
  }
  const rangeComplete = Boolean(from && to && from !== to);
  if (!from || rangeComplete) {
    return { from: ymd, to: ymd, filter: 'date' };
  }
  if (ymd === from) {
    return { from, to: from, filter: 'date' };
  }
  const a = ymd < from ? ymd : from;
  const b = ymd < from ? from : ymd;
  return { from: a, to: b, filter: 'range' };
}
