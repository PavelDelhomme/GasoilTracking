/** Compare a.b.c — positif si a > b. */
export function compareSemver(a, b) {
  const pa = String(a || '0')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Dernière release = max semver (pas id DESC — évite régression OTA). */
export function pickLatestRelease(rows) {
  let best = null;
  for (const row of rows || []) {
    if (!row?.apk_filename) continue;
    if (
      !best ||
      compareSemver(row.version, best.version) > 0 ||
      (compareSemver(row.version, best.version) === 0 && Number(row.id) > Number(best.id))
    ) {
      best = row;
    }
  }
  return best;
}
