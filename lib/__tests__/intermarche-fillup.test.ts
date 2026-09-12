import { describe, expect, it } from 'vitest';
import { hasMatchingFillUp, INTERMARCHE_GUERCHE_FILL } from '@/lib/intermarcheFillUp';

describe('plein Intermarché La Guerche 12/09', () => {
  it('détecte le plein déjà saisi (même jour / litres / montant)', () => {
    expect(
      hasMatchingFillUp(
        [
          {
            vehicleId: 3,
            date: '2026-09-12T12:50:00+02:00',
            liters: 34.62,
            totalCost: 75.09,
          },
        ],
        3,
        INTERMARCHE_GUERCHE_FILL
      )
    ).toBe(true);
  });

  it('n’écrase pas un autre plein du même jour', () => {
    expect(
      hasMatchingFillUp(
        [
          {
            vehicleId: 3,
            date: '2026-09-12T08:00:00+02:00',
            liters: 10,
            totalCost: 20,
          },
        ],
        3,
        INTERMARCHE_GUERCHE_FILL
      )
    ).toBe(false);
  });

  it('a le prix/L cohérent avec le ticket', () => {
    expect(
      Math.round((INTERMARCHE_GUERCHE_FILL.totalCost / INTERMARCHE_GUERCHE_FILL.liters) * 1000) /
        1000
    ).toBe(INTERMARCHE_GUERCHE_FILL.pricePerLiter);
  });
});
