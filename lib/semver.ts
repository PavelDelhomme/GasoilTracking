/** Compare a.b.c — positif si a > b. Ignore suffixes non numériques. */
export function compareSemver(a: string, b: string): number {
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
