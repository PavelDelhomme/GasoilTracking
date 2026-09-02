'use client';

import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Enregistre le service worker (web uniquement). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const secure =
      window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!secure) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore */
    });
  }, []);
  return null;
}
