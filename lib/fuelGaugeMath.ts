/** Conversion tap / glisser → fraction de jauge (0–1). */

/** Barre horizontale (legacy / tests). */
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

/**
 * Demi-cercle tableau de bord : E à gauche (π) → F à droite (0), via le haut.
 * Centre = pivot de l’aiguille (bas du demi-cercle).
 */
export function gaugeFractionFromArcTouch(
  pageX: number,
  pageY: number,
  centerPageX: number,
  centerPageY: number
): number {
  if (
    !Number.isFinite(pageX) ||
    !Number.isFinite(pageY) ||
    !Number.isFinite(centerPageX) ||
    !Number.isFinite(centerPageY)
  ) {
    return 0;
  }
  const dx = pageX - centerPageX;
  const dy = centerPageY - pageY; // Y écran → math (haut positif)
  let angle = Math.atan2(dy, dx); // −π…π ; 0 = droite, π/2 = haut, π = gauche
  if (angle < 0) angle = 0;
  if (angle > Math.PI) angle = Math.PI;
  return Math.max(0, Math.min(1, 1 - angle / Math.PI));
}

/** Angle rad (π=E … 0=F) pour une fraction 0–1. */
export function gaugeArcAngle(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return Math.PI * (1 - f);
}

export function gaugePolar(
  cx: number,
  cy: number,
  r: number,
  fraction: number
): { x: number; y: number } {
  const a = gaugeArcAngle(fraction);
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

/** Arc SVG E→F (sens horaire écran = via le haut). Demi-cercle ≤ 180° → large-arc toujours 0. */
export function gaugeArcPath(
  cx: number,
  cy: number,
  r: number,
  fromF: number,
  toF: number
): string {
  const f0 = Math.max(0, Math.min(1, fromF));
  const f1 = Math.max(0, Math.min(1, toF));
  if (f1 <= f0 + 0.0005) return '';
  const start = gaugePolar(cx, cy, r, f0);
  const end = gaugePolar(cx, cy, r, f1);
  // Important : f1-f0 > 0.5 ne doit PAS activer large-arc (sinon SVG prend le long chemin
  // par le bas → « débordement » au-delà de 50 %).
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
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
