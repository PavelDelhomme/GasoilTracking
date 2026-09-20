/**
 * Notes de version affichées à l’utilisateur (jamais de jargon CI / GitHub).
 */
export function userFacingReleaseNotes(
  raw: string | null | undefined,
  version: string
): string {
  const s = String(raw || '')
    .replace(/\s*\(GitHub Actions[^)]*\)/gi, '')
    .replace(/\s*GitHub Actions[^.]*\.?/gi, '')
    .replace(/\s*EAS Build[^.]*\.?/gi, '')
    .replace(/\s*forceUpdate[^.]*\.?/gi, '')
    .trim();

  const technical =
    /github\s*actions|eas\s*build|forceupdate|docker\s*compose|portainer|workflow|ci\/|commit\s+[a-f0-9]{7,}|sha-|vps\b|rebuild/i;

  if (!s || s.length < 12 || technical.test(s)) {
    return `Hubera Fuel — corrections et améliorations, version ${version}.`;
  }
  return s
    .replace(/Gasoil Tracking/gi, 'Hubera Fuel')
    .replace(/GasoilTracking/g, 'Hubera Fuel');
}
