/** Conversion tap / glisser → fraction de jauge (0–1). */

export function gaugeFractionFromTouch(
  pageX: number,
  trackPageX: number,
  trackWidth: number
): number {
  if (!Number.isFinite(pageX) || !Number.isFinite(trackPageX) || !(trackWidth > 0)) {
    return 0;
  }
  return Math.max(0, Math.min(1, (pageX - trackPageX) / trackWidth));
}

export function gaugeMarkLabel(fraction: number): string {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0.03) return 'Vide';
  if (Math.abs(f - 0.25) <= 0.04) return '1/4';
  if (Math.abs(f - 0.5) <= 0.04) return '1/2';
  if (Math.abs(f - 0.75) <= 0.04) return '3/4';
  if (f >= 0.97) return 'Plein';
  return `${Math.round(f * 100)} %`;
}
