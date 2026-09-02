import { useEffect, useState } from 'react';

/** true seulement après montage client — évite mismatch SSR */
export function useIsClient() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
