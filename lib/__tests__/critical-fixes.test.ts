import { describe, expect, it } from 'vitest';
import { compareSemver } from '../semver';
import { userFacingReleaseNotes } from '../releaseNotes';
import { presetDisplayName, searchVehicles } from '../../constants/vehicles';
import { compareSemver as apiCompare, pickLatestRelease } from '../../api/src/semver.js';

describe('compareSemver', () => {
  it('ordonne correctement', () => {
    expect(compareSemver('1.4.69', '1.4.68')).toBeGreaterThan(0);
    expect(compareSemver('1.4.67', '1.4.68')).toBeLessThan(0);
    expect(compareSemver('1.4.70', '1.4.70')).toBe(0);
  });
  it('ignore suffixes non numériques', () => {
    expect(compareSemver('1.4.69x', '1.4.68')).toBeGreaterThan(0);
  });
  it('API et client alignés', () => {
    expect(apiCompare('1.4.70', '1.4.69')).toBe(compareSemver('1.4.70', '1.4.69'));
  });
});

describe('pickLatestRelease', () => {
  it('prend le max semver même si id plus petit', () => {
    const best = pickLatestRelease([
      { id: 108, version: '1.4.67', apk_filename: 'a.apk' },
      { id: 107, version: '1.4.68', apk_filename: 'b.apk' },
    ]);
    expect(best?.version).toBe('1.4.68');
  });
  it('refuse les lignes sans apk', () => {
    const best = pickLatestRelease([
      { id: 1, version: '9.9.9', apk_filename: null },
      { id: 2, version: '1.0.0', apk_filename: 'x.apk' },
    ]);
    expect(best?.version).toBe('1.0.0');
  });
});

describe('userFacingReleaseNotes', () => {
  it('masque GitHub Actions', () => {
    const n = userFacingReleaseNotes(
      'v1.4.67 — trajets (GitHub Actions ac542f91)',
      '1.4.67'
    );
    expect(n.toLowerCase()).not.toMatch(/github/);
    expect(n).toMatch(/1\.4\.67|Corrections/);
  });
  it('conserve une note propre', () => {
    const n = userFacingReleaseNotes(
      'Choisissez l’itinéraire avant de démarrer la navigation.',
      '1.4.69'
    );
    expect(n).toContain('itinéraire');
  });
});

describe('vehicles search', () => {
  it('priorise 208 vs 108', () => {
    const r208 = searchVehicles('208');
    expect(r208[0]?.model).toBe('208');
    const r108 = searchVehicles('108');
    expect(r108[0]?.model).toBe('108');
  });
  it('affiche année + carburant', () => {
    const p = searchVehicles('208')[0]!;
    expect(presetDisplayName(p)).toMatch(/208 · \d{4}/);
  });
});

/** Logique syncPreferNewer (extrait) : poids seul ne tire pas si remote plus vieux. */
function shouldPull(remoteAt: number, localAt: number, remoteW: number, localW: number) {
  const remoteClearlyNewer = remoteAt > localAt + 2000;
  const remoteRicherAndNotOlder = remoteW > localW + 5 && remoteAt >= localAt - 2000;
  return remoteClearlyNewer || remoteRicherAndNotOlder;
}

describe('syncPreferNewer policy', () => {
  it('ne tire pas un cloud plus riche mais plus vieux', () => {
    expect(shouldPull(1_000, 10_000, 100, 10)).toBe(false);
  });
  it('tire si cloud clairement plus récent', () => {
    expect(shouldPull(20_000, 10_000, 5, 50)).toBe(true);
  });
  it('tire si plus riche et horloge comparable', () => {
    expect(shouldPull(10_000, 10_000, 100, 10)).toBe(true);
  });
});
