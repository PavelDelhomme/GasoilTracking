import { describe, expect, it } from 'vitest';
import { firstSearchParam, parseTripNavParams } from '@/lib/tripNavParams';

describe('firstSearchParam', () => {
  it('accepte string, tableau expo-router, et vide', () => {
    expect(firstSearchParam('Nantes')).toBe('Nantes');
    expect(firstSearchParam(['parc expo', 'autre'])).toBe('parc expo');
    expect(firstSearchParam(['', 'Nantes'])).toBe('Nantes');
    expect(firstSearchParam(undefined)).toBe('');
  });
});

describe('parseTripNavParams', () => {
  it('Maps → navigation prête (pas suivi libre) même si autoStart=1', () => {
    const p = parseTripNavParams({
      mode: 'nav',
      dest: 'Parc des expositions de Nantes',
      destLat: '47.2585',
      destLon: '-1.5324',
      autoStart: '1',
    });
    expect(p.mode).toBe('nav');
    expect(p.autoStartFree).toBe(false);
    expect(p.prepareNav).toBe(true);
    expect(p.dest).toMatch(/expositions/i);
    expect(p.destCoords?.latitude).toBeCloseTo(47.2585, 3);
  });

  it('lit les params en tableaux (expo-router)', () => {
    const p = parseTripNavParams({
      mode: ['nav'],
      dest: ['Exponantes'],
      destLat: ['47.25'],
      destLon: ['-1.53'],
      autoStart: ['1'],
    });
    expect(p.mode).toBe('nav');
    expect(p.prepareNav).toBe(true);
    expect(p.autoStartFree).toBe(false);
    expect(p.destKey).toContain('Exponantes');
  });

  it('une destination sans mode force quand même la nav', () => {
    const p = parseTripNavParams({ dest: 'Intermarché La Guerche' });
    expect(p.mode).toBe('nav');
    expect(p.prepareNav).toBe(true);
    expect(p.autoStartFree).toBe(false);
  });

  it('suivi libre seulement si mode=free sans destination', () => {
    const p = parseTripNavParams({ mode: 'free', autoStart: '1' });
    expect(p.mode).toBe('free');
    expect(p.autoStartFree).toBe(true);
    expect(p.prepareNav).toBe(false);
  });

  it('destLat/destLon vides ne deviennent pas 0,0', () => {
    const p = parseTripNavParams({
      mode: 'nav',
      dest: 'Maison',
      destLat: '',
      destLon: '',
      autoStart: '0',
      prepare: '0',
    });
    expect(p.destCoords).toBeNull();
    expect(p.mode).toBe('nav');
    expect(p.prepareNav).toBe(true);
  });
});
