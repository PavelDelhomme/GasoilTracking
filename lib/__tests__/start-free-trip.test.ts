import { describe, expect, it } from 'vitest';
import { freeTripNote } from '@/lib/startFreeTripNote';

describe('suivi libre depuis Maps', () => {
  it('note GPS distincte web / natif', () => {
    expect(freeTripNote(true)).toMatch(/web/i);
    expect(freeTripNote(false)).toMatch(/arrière-plan/i);
  });
});
