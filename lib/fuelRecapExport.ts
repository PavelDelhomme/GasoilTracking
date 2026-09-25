/**
 * Construction CSV / PDF du récap Fuel (sans React Native — testable).
 */
import type { FillUp, Vehicle } from '@/types';
import { formatMonthLabel, monthKeyFromDate } from '@/lib/dates';
import { buildSimplePdf, wrapPdfLine, type PdfLine } from '@/lib/simplePdf';

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type FuelExportPeriod = string | 'all';

export function selectFillUpsForExport(
  fillUps: FillUp[],
  period: FuelExportPeriod
): FillUp[] {
  const rows =
    period === 'all'
      ? [...fillUps]
      : fillUps.filter((f) => monthKeyFromDate(f.date) === period);
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function vehicleScopeSlug(
  vehicleFilter: number | 'all',
  vehicles: Vehicle[]
): string {
  if (vehicleFilter === 'all') return 'tous-vehicules';
  const name = vehicles.find((v) => v.id === vehicleFilter)?.name || `vehicule-${vehicleFilter}`;
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || `vehicule-${vehicleFilter}`
  );
}

export function fuelExportFilename(
  ext: 'csv' | 'pdf',
  period: FuelExportPeriod,
  vehicleFilter: number | 'all',
  vehicles: Vehicle[]
): string {
  const when = period === 'all' ? 'tous-les-pleins' : period;
  return `hubera-fuel-recap-${when}-${vehicleScopeSlug(vehicleFilter, vehicles)}.${ext}`;
}

export function exportScopeLabel(
  period: FuelExportPeriod,
  vehicleFilter: number | 'all',
  vehicles: Vehicle[]
): string {
  const when = period === 'all' ? 'tous les pleins' : formatMonthLabel(period);
  const who =
    vehicleFilter === 'all'
      ? 'tous les véhicules'
      : vehicles.find((v) => v.id === vehicleFilter)?.name || `véhicule #${vehicleFilter}`;
  return `${when} · ${who}`;
}

export function buildFillUpsCsv(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  period: FuelExportPeriod
): string {
  const byId = new Map(vehicles.map((v) => [v.id, v.name]));
  const rows = selectFillUpsForExport(fillUps, period);
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
  return `\uFEFF${[header, ...lines].join('\n')}\n`;
}

export function buildMonthlyFuelCsv(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  monthKey: string
): string {
  return buildFillUpsCsv(fillUps, vehicles, monthKey);
}

function vehicleName(vehicles: Vehicle[], id: number): string {
  return vehicles.find((v) => v.id === id)?.name || `Véhicule #${id}`;
}

type Totals = { count: number; liters: number; cost: number; km: number };

function totalsOf(rows: FillUp[]): Totals {
  let liters = 0;
  let cost = 0;
  let km = 0;
  for (const f of rows) {
    liters += f.liters;
    cost += f.totalCost;
    if (f.distanceSinceLastKm && f.distanceSinceLastKm > 0) km += f.distanceSinceLastKm;
  }
  return { count: rows.length, liters, cost, km };
}

export function buildFillUpsRecapPdf(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  period: FuelExportPeriod,
  vehicleFilter: number | 'all'
): Uint8Array {
  const rows = selectFillUpsForExport(fillUps, period);
  const all = totalsOf(rows);
  const byVehicle = new Map<number, FillUp[]>();
  for (const f of rows) {
    const list = byVehicle.get(f.vehicleId) || [];
    list.push(f);
    byVehicle.set(f.vehicleId, list);
  }
  const lines: PdfLine[] = [
    { text: 'Hubera Fuel', size: 20, bold: true },
    { text: 'Recapitulatif des pleins', size: 14, bold: true },
    { text: exportScopeLabel(period, vehicleFilter, vehicles), size: 11 },
    { text: `Genere le ${new Date().toLocaleString('fr-FR')}`, size: 9 },
    { text: ' ' },
    {
      text: `${all.count} plein(s)  ·  ${all.liters.toFixed(2)} L  ·  ${all.cost.toFixed(2)} EUR  ·  ${all.km.toFixed(0)} km`,
      bold: true,
    },
  ];
  if (byVehicle.size > 1) {
    lines.push({ text: ' ' }, { text: 'Par vehicule', size: 12, bold: true });
    for (const [id, list] of [...byVehicle.entries()].sort((a, b) =>
      vehicleName(vehicles, a[0]).localeCompare(vehicleName(vehicles, b[0]), 'fr')
    )) {
      const t = totalsOf(list);
      const conso = t.km > 0 ? ((t.liters / t.km) * 100).toFixed(1) : '—';
      for (const w of wrapPdfLine(
        `${vehicleName(vehicles, id)} : ${t.count} plein(s), ${t.liters.toFixed(1)} L, ${t.cost.toFixed(2)} EUR, ${t.km.toFixed(0)} km, ${conso} L/100`
      )) {
        lines.push({ text: w });
      }
    }
  }
  lines.push({ text: ' ' }, { text: 'Detail des pleins', size: 12, bold: true });
  lines.push({
    text: 'Date        Vehicule              Litres    EUR      km',
    bold: true,
    size: 9,
  });
  for (const f of rows) {
    const date = f.date.slice(0, 10).replace(/-/g, '/');
    const veh = vehicleName(vehicles, f.vehicleId).slice(0, 18).padEnd(18);
    const L = f.liters.toFixed(2).padStart(7);
    const eur = f.totalCost.toFixed(2).padStart(8);
    const km = f.distanceSinceLastKm != null ? f.distanceSinceLastKm.toFixed(0).padStart(6) : '     —';
    lines.push({ text: `${date}  ${veh} ${L} ${eur} ${km}`, size: 9 });
  }
  if (!rows.length) {
    lines.push({ text: 'Aucun plein pour cette selection.' });
  }
  return buildSimplePdf(lines);
}
