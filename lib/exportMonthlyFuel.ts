/**
 * Télécharge / partage un vrai fichier CSV ou PDF (plus de copie presse-papiers).
 */
import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { FillUp, Vehicle } from '@/types';
import { uint8ToBase64 } from '@/lib/simplePdf';
import {
  buildFillUpsCsv,
  buildFillUpsRecapPdf,
  fuelExportFilename,
  selectFillUpsForExport,
  type FuelExportPeriod,
} from '@/lib/fuelRecapExport';

export {
  buildFillUpsCsv,
  buildFillUpsRecapPdf,
  buildMonthlyFuelCsv,
  exportScopeLabel,
  fuelExportFilename,
  selectFillUpsForExport,
  vehicleScopeSlug,
  type FuelExportPeriod,
} from '@/lib/fuelRecapExport';

function downloadWeb(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareNativeFile(
  filename: string,
  body: string | Uint8Array,
  mime: string
): Promise<'shared'> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('Stockage local indisponible');
  const path = `${dir}${filename}`;
  if (typeof body === 'string') {
    await FileSystem.writeAsStringAsync(path, body, { encoding: 'utf8' });
  } else {
    await FileSystem.writeAsStringAsync(path, uint8ToBase64(body), { encoding: 'base64' });
  }
  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(path);
    await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
      type: mime,
      extra: {
        'android.intent.extra.STREAM': contentUri,
        'android.intent.extra.SUBJECT': filename,
      },
      flags: 1,
    });
    return 'shared';
  }
  await Share.share({ url: path, title: filename });
  return 'shared';
}

export async function exportFillUpsCsvFile(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  period: FuelExportPeriod,
  vehicleFilter: number | 'all'
): Promise<'downloaded' | 'shared'> {
  const rows = selectFillUpsForExport(fillUps, period);
  if (!rows.length) throw new Error('Aucun plein à exporter pour cette sélection.');
  const filename = fuelExportFilename('csv', period, vehicleFilter, vehicles);
  const csv = buildFillUpsCsv(fillUps, vehicles, period);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    downloadWeb(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    return 'downloaded';
  }
  return shareNativeFile(filename, csv, 'text/csv');
}

export async function exportFillUpsPdfFile(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  period: FuelExportPeriod,
  vehicleFilter: number | 'all'
): Promise<'downloaded' | 'shared'> {
  const rows = selectFillUpsForExport(fillUps, period);
  if (!rows.length) throw new Error('Aucun plein à exporter pour cette sélection.');
  const filename = fuelExportFilename('pdf', period, vehicleFilter, vehicles);
  const pdf = buildFillUpsRecapPdf(fillUps, vehicles, period, vehicleFilter);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    downloadWeb(filename, new Blob([pdf], { type: 'application/pdf' }));
    return 'downloaded';
  }
  return shareNativeFile(filename, pdf, 'application/pdf');
}

/** @deprecated — utilise exportFillUpsCsvFile. */
export async function shareMonthlyFuelCsv(
  fillUps: FillUp[],
  vehicles: Vehicle[],
  monthKey: string
): Promise<'shared' | 'copied' | 'downloaded'> {
  return exportFillUpsCsvFile(fillUps, vehicles, monthKey, 'all');
}
