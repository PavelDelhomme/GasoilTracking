export function freeTripNote(isWeb: boolean): string {
  return isWeb ? 'Suivi GPS web (onglet ouvert)' : 'Suivi GPS libre (arrière-plan)';
}
