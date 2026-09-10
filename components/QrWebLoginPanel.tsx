import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { pollQrLogin, startQrLogin, type QrLoginStart } from '@/lib/api';

type Props = {
  onLoggedIn: () => void | Promise<void>;
};

/**
 * Panneau QR pour connexion web : l’app mobile (déjà connectée) scanne le code.
 */
export function QrWebLoginPanel({ onLoggedIn }: Props) {
  const { colors } = useTheme();
  const { applySession } = useAuth();
  const [qr, setQr] = useState<QrLoginStart | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'expired' | 'error'>('idle');
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef = useRef(1500);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (pollRef.current) clearTimeout(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }, []);

  const begin = useCallback(async () => {
    stop();
    stoppedRef.current = false;
    delayRef.current = 1500;
    setError('');
    setStatus('pending');
    try {
      const started = await startQrLogin();
      setQr(started);
      const exp = new Date(started.expiresAt).getTime();
      setSecondsLeft(Math.max(0, Math.ceil((exp - Date.now()) / 1000)));

      tickRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((exp - Date.now()) / 1000));
        setSecondsLeft(left);
        if (left <= 0) {
          setStatus('expired');
          stop();
        }
      }, 1000);

      const schedulePoll = () => {
        if (stoppedRef.current) return;
        pollRef.current = setTimeout(() => {
          void (async () => {
            if (stoppedRef.current) return;
            try {
              const res = await pollQrLogin(started.challengeId);
              if (stoppedRef.current) return;
              if (res.status === 'rate_limited') {
                delayRef.current = Math.min(delayRef.current * 2, 12_000);
                schedulePoll();
                return;
              }
              delayRef.current = 1500;
              if (res.status === 'pending') {
                schedulePoll();
                return;
              }
              if (res.status === 'expired') {
                setStatus('expired');
                stop();
                return;
              }
              if (res.status === 'approved' && res.token && res.user) {
                stop();
                setStatus('done');
                await applySession(res.token, res.user, res.refreshToken);
                await onLoggedIn();
                return;
              }
              schedulePoll();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur de suivi QR');
              setStatus('error');
              stop();
            }
          })();
        }, delayRef.current);
      };
      schedulePoll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de générer le QR');
      setStatus('error');
    }
  }, [applySession, onLoggedIn, stop]);

  useEffect(() => {
    if (Platform.OS === 'web') void begin();
    return () => stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
          Connexion par QR
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          Sur le site, un QR s’affiche. Dans l’app déjà connectée : Mon compte → Scanner le QR du
          site.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 4 }}>
        Connexion rapide (QR)
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
        Ouvrez Gasoil Tracking sur votre téléphone (déjà connecté), puis scannez ce code.
      </Text>

      {status === 'pending' && qr?.qrDataUrl ? (
        <View style={{ alignItems: 'center' }}>
          <Image
            source={{ uri: qr.qrDataUrl }}
            style={{ width: 220, height: 220, borderRadius: 12 }}
            accessibilityLabel="QR code de connexion"
          />
          <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 13 }}>
            Expire dans {secondsLeft}s
          </Text>
          <ActivityIndicator style={{ marginTop: 8 }} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
            En attente du scan…
          </Text>
        </View>
      ) : null}

      {(status === 'expired' || status === 'error') && (
        <View style={{ alignItems: 'center', gap: 10 }}>
          {!!error && <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text>}
          {status === 'expired' && (
            <Text style={{ color: colors.warning, textAlign: 'center' }}>QR expiré</Text>
          )}
          <Button title="Générer un nouveau QR" onPress={() => void begin()} />
        </View>
      )}

      {status === 'done' && (
        <Text style={{ color: colors.success, fontWeight: '700', textAlign: 'center' }}>
          Connecté !
        </Text>
      )}

      <Pressable onPress={() => void begin()} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>
          Actualiser le QR
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },
});
