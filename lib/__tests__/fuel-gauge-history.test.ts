import { describe, expect, it } from 'vitest';
import { shouldSkipDuplicateReading, FUEL_GAUGE_SOURCE_LABELS } from '../fuelGaugeHistoryCore';

describe('fuel gauge history', () => {
  it('labels FR', () => {
    expect(FUEL_GAUGE_SOURCE_LABELS.trip_start).toBe('Départ trajet');
    expect(FUEL_GAUGE_SOURCE_LABELS.trip_end).toBe('Arrivée trajet');
    expect(FUEL_GAUGE_SOURCE_LABELS.fill_up).toBe('Plein');
    expect(FUEL_GAUGE_SOURCE_LABELS.manual).toBe('Saisie');
    expect(FUEL_GAUGE_SOURCE_LABELS.model_burn).toBe('Conso estimée');
    expect(FUEL_GAUGE_SOURCE_LABELS.recompute).toBe('Recalcul');
  });

  it('dédup 20s + ΔL < 0.05 même source/trip', () => {
    const last = {
      source: 'trip_start' as const,
      tripId: 3,
      liters: 12,
      recordedAt: '2026-09-20T10:00:00.000Z',
    };
    expect(
      shouldSkipDuplicateReading(last, {
        source: 'trip_start',
        tripId: 3,
        liters: 12.02,
        recordedAt: '2026-09-20T10:00:10.000Z',
      })
    ).toBe(true);
    expect(
      shouldSkipDuplicateReading(last, {
        source: 'trip_end',
        tripId: 3,
        liters: 12,
        recordedAt: '2026-09-20T10:00:10.000Z',
      })
    ).toBe(false);
    expect(
      shouldSkipDuplicateReading(last, {
        source: 'trip_start',
        tripId: 3,
        liters: 11,
        recordedAt: '2026-09-20T10:00:10.000Z',
      })
    ).toBe(false);
  });
});
