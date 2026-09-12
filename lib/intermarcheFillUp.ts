/** Plein réel 206 — Intermarché La Guerche, 12 sept. 2026. */
export const INTERMARCHE_GUERCHE_FILL = {
  day: '2026-09-12',
  liters: 34.62,
  totalCost: 75.09,
  pricePerLiter: 2.169,
  stationName: 'Intermarché La Guerche de Bretagne',
};

export function hasMatchingFillUp(
  fills: Array<{ vehicleId: number; date: string; liters: number; totalCost: number }>,
  vehicleId: number,
  spec: { day: string; liters: number; totalCost: number },
  eps = 0.05
): boolean {
  return fills.some((f) => {
    if (Number(f.vehicleId) !== Number(vehicleId)) return false;
    if (String(f.date).slice(0, 10) !== spec.day) return false;
    return (
      Math.abs(Number(f.liters) - spec.liters) <= eps &&
      Math.abs(Number(f.totalCost) - spec.totalCost) <= eps
    );
  });
}
