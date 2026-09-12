import { describe, expect, it } from 'vitest';
import {
  isOtaFileComplete,
  otaApkFileName,
  shouldDeleteOtaAfterInstall,
  shouldReuseOtaFile,
} from '@/lib/otaApk';

describe('otaApkFileName', () => {
  it('reste dans un nom de fichier interne', () => {
    expect(otaApkFileName('1.4.121', 147)).toBe('gasoil-1.4.121-vc147.apk');
    expect(otaApkFileName('1.4.121/../x', 147)).toBe('gasoil-1.4.121..x-vc147.apk');
  });
});

describe('isOtaFileComplete', () => {
  it('refuse trop petit / absent', () => {
    expect(isOtaFileComplete(null, 40_000_000)).toBe(false);
    expect(isOtaFileComplete(500, 40_000_000)).toBe(false);
  });
  it('accepte une taille alignée sur le serveur', () => {
    expect(isOtaFileComplete(45_884_203, 45_884_203)).toBe(true);
    expect(isOtaFileComplete(45_884_203 + 10_000, 45_884_203)).toBe(true);
  });
  it('refuse un fichier tronqué', () => {
    expect(isOtaFileComplete(2_000_000, 45_884_203)).toBe(false);
  });
});

describe('shouldReuseOtaFile', () => {
  it('réutilise si le fichier est complet', () => {
    expect(
      shouldReuseOtaFile({
        exists: true,
        actualSize: 40_000_000,
        expectedSize: 40_000_000,
        fileVersionCode: 147,
        remoteVersionCode: 147,
      })
    ).toBe(true);
  });
  it('ne réutilise pas un autre versionCode', () => {
    expect(
      shouldReuseOtaFile({
        exists: true,
        actualSize: 40_000_000,
        expectedSize: 40_000_000,
        fileVersionCode: 146,
        remoteVersionCode: 147,
      })
    ).toBe(false);
  });
  it('ne réutilise pas si absent', () => {
    expect(
      shouldReuseOtaFile({
        exists: false,
        actualSize: 40_000_000,
        expectedSize: 40_000_000,
      })
    ).toBe(false);
  });
});

describe('shouldDeleteOtaAfterInstall', () => {
  it('supprime seulement une fois l’app à jour', () => {
    expect(shouldDeleteOtaAfterInstall(147, 147)).toBe(true);
    expect(shouldDeleteOtaAfterInstall(148, 147)).toBe(true);
    expect(shouldDeleteOtaAfterInstall(145, 147)).toBe(false);
  });
});
