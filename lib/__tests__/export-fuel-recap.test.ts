import { describe, expect, it } from 'vitest';
import type { FillUp, Vehicle } from '@/types';
import {
  buildFillUpsCsv,
  buildFillUpsRecapPdf,
  fuelExportFilename,
  selectFillUpsForExport,
} from '@/lib/fuelRecapExport';

function veh(id: number, name: string, fuelType: Vehicle['fuelType']): Vehicle {
  return {
    id,
    name,
    brand: 'Peugeot',
    model: name,
    year: 2004,
    fuelType,
    consumptionPer100: 7,
    tankCapacity: 50,
    defaultFuelPrice: 1.8,
    currentOdometer: 100000,
    hasOdometer: true,
    trackedKm: 0,
    estimatedFuelLiters: null,
    isActive: true,
    createdAt: '2026-01-01',
  };
}

const vehicles: Vehicle[] = [veh(1, '206', 'essence'), veh(2, '806', 'diesel')];

const fillUps: FillUp[] = [
  {
    id: 1,
    vehicleId: 1,
    date: '2026-09-12',
    liters: 34.62,
    pricePerLiter: 2.169,
    totalCost: 75.09,
    odometer: 120000,
    distanceSinceLastKm: 480,
    isFull: true,
    note: 'Intermarche',
  },
  {
    id: 2,
    vehicleId: 2,
    date: '2026-08-03',
    liters: 40,
    pricePerLiter: 1.6,
    totalCost: 64,
    odometer: 200000,
    distanceSinceLastKm: 500,
    isFull: true,
  },
];

describe('export Fuel CSV / PDF', () => {
  it('filtre le mois ou exporte tous les pleins', () => {
    expect(selectFillUpsForExport(fillUps, '2026-09')).toHaveLength(1);
    expect(selectFillUpsForExport(fillUps, 'all')).toHaveLength(2);
  });

  it('génère un CSV avec BOM, en-tête et séparateur point-virgule', () => {
    const csv = buildFillUpsCsv(fillUps, vehicles, '2026-09');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('date;vehicule;litres');
    expect(csv).toContain('206');
    expect(csv).toContain('34.62');
    expect(csv).not.toContain('806');
  });

  it('génère un PDF %PDF avec le récap tous véhicules', () => {
    const pdf = buildFillUpsRecapPdf(fillUps, vehicles, 'all', 'all');
    const head = new TextDecoder('latin1').decode(pdf.slice(0, 8));
    expect(head.startsWith('%PDF-1.')).toBe(true);
    const asText = new TextDecoder('latin1').decode(pdf);
    expect(asText).toContain('Hubera Fuel');
    expect(asText).toContain('%%EOF');
    expect(fuelExportFilename('pdf', 'all', 'all', vehicles)).toBe(
      'hubera-fuel-recap-tous-les-pleins-tous-vehicules.pdf'
    );
  });
});
