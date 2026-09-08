/**
 * Export CSV mensuel des pleins (partage natif).
 */
import { Platform, Share } from 'react-native';
import type { FillUp, Vehicle } from '@/types';
import { monthKeyFromDate } from '@/lib/dates';

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildMonthlyFuelCsv(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  monthKey: string
): string {
  const byId = new Map(vehicles.map((v) => [v.id, v.name]));
  const rows = fillUps
    .filter((f) => monthKeyFromDate(f.date) === monthKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const header = [
    'date',
    'vehicule',
    'litres',
    'prix_par_litre',
    'total_eur',
    'odometre',
    'distance_depuis_dernier_km',
    'plein',
    'note',
  ].join(';');

  const lines = rows.map((f) =>
    [
      csvEscape(f.date.slice(0, 10)),
      csvEscape(byId.get(f.vehicleId) || `véhicule #${f.vehicleId}`),
      csvEscape(f.liters.toFixed(2)),
      csvEscape(f.pricePerLiter.toFixed(3)),
      csvEscape(f.totalCost.toFixed(2)),
      csvEscape(f.odometer),
      csvEscape(f.distanceSinceLastKm),
      csvEscape(f.isFull ? 'oui' : 'non'),
      csvEscape(f.note || ''),
    ].join(';')
  );

  return [header, ...lines].join('\n');
}

export async function shareMonthlyFuelCsv(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  monthKey: string
): Promise<'shared' | 'copied'> {
  const csv = buildMonthlyFuelCsv(fillUps, vehicles, monthKey);
  const title = `Gasoil Tracking — pleins ${monthKey}`;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(csv);
      return 'copied';
    }
    // Fallback téléchargement navigateur
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pleins-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return 'shared';
  }
  await Share.share({
    title,
    message: csv,
  });
  return 'shared';
}
