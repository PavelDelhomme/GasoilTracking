'use client';

import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Enregistre le service worker (web uniquement) et active les nouvelles versions. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const secure =
      window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!secure) return;

    let cancelled = false;

    void (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        if (cancelled) return;
        void reg.update();

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage?.('SKIP_WAITING');
              reg.waiting?.postMessage('SKIP_WAITING');
            }
          });
        });

        if (reg.waiting) {
          reg.waiting.postMessage('SKIP_WAITING');
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
