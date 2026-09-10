import { describe, expect, it } from 'vitest';
import {
  elevationFactor,
  estimateTripFuelLiters,
  gradeSpikeFactor,
  idleMinutesFromPoints,
  trafficIdleFactor,
  transmissionFactor,
  type PointLike,
} from '@/lib/consumptionModel';
import {
  findCatalogueMatch,
  resolveBaseConsumptionPer100,
  resolveVehiclePhysics,
} from '@/lib/vehiclePhysics';
import type { Vehicle } from '@/types';

const baseVehicle: Vehicle = {
  id: 1,
  name: 'Peugeot 206',
  brand: 'Peugeot',
  model: '206',
  year: 2003,
  fuelType: 'essence',
  consumptionPer100: 0, // force catalogue / segment
  tankCapacity: 50,
  defaultFuelPrice: 1.8,
  currentOdometer: 100000,
  hasOdometer: true,
  trackedKm: 0,
  estimatedFuelLiters: 40,
  isActive: true,
  createdAt: '',
  consumptionLearnFactor: 1,
};

describe('conso-improvements', () => {
  it('boîte : plus de malus L/100 (η_trans seulement en physique)', () => {
    expect(transmissionFactor(4)).toBe(1);
    expect(transmissionFactor(6)).toBe(1);
  });

  it('L/100 sans saisie → catalogue 206 (pas 7,5 figé)', () => {
    const cat = findCatalogueMatch('Peugeot', '206', 2003, 'essence');
    expect(cat?.consumption).toBeGreaterThan(4);
    expect(cat?.consumption).toBeLessThan(7);
    const l100 = resolveBaseConsumptionPer100(baseVehicle);
    expect(l100).toBe(cat!.consumption);
  });

  it('physique 206 utilise masse connue ~1025+payload', () => {
    const p = resolveVehiclePhysics(baseVehicle);
    expect(p.curbWeightKg).toBe(1025);
    expect(p.idlePowerW).toBeGreaterThan(1000);
  });

  it('dénivelé : intensité / km (côte courte compte)', () => {
    // 50 m sur 0,4 km → fort
    const short = elevationFactor(50, 0.4);
    const flat = elevationFactor(50, 20);
    expect(short).toBeGreaterThan(flat);
    expect(short).toBeGreaterThan(1.1);
  });

  it('gradeSpike détecte une côte locale', () => {
    const pts: PointLike[] = [];
    let lat = 48.1;
    let alt = 50;
    let t = 1_000_000;
    for (let i = 0; i < 20; i++) {
      pts.push({ latitude: lat, longitude: -1.6, timestamp: t, altitude: alt });
      lat += 0.00008; // ~9 m
      if (i >= 5 && i < 12) alt += 1.2; // ~13 %
      t += 1000;
    }
    expect(gradeSpikeFactor(pts)).toBeGreaterThan(1);
  });

  it('bouchon long augmente le facteur (temps + ratio)', () => {
    const short = trafficIdleFactor(0.3, 2);
    const long = trafficIdleFactor(0.3, 25);
    expect(long).toBeGreaterThan(short);
  });

  it('idleMinutesFromPoints cumule le temps arrêté', () => {
    const pts: PointLike[] = [];
    let t = 1_000_000;
    // 3 min à l’arrêt
    for (let i = 0; i < 4; i++) {
      pts.push({ latitude: 48.1, longitude: -1.6, timestamp: t });
      t += 60_000;
    }
    expect(idleMinutesFromPoints(pts)).toBeGreaterThanOrEqual(2.5);
  });

  it('heuristique sans points utilise L/100 catalogue', () => {
    const L = estimateTripFuelLiters(baseVehicle, 100, { forceHeuristic: true });
    const expected = resolveBaseConsumptionPer100(baseVehicle);
    // age + margin etc → > catalogue brut
    expect(L).toBeGreaterThan(expected * 0.9);
    expect(L).toBeLessThan(expected * 1.4);
  });
});
