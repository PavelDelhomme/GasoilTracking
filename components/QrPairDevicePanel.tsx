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
import { Button } from '@/components/Button';
import { ensureFreshAccessToken, startQrPair, statusQrLogin, type QrLoginStart } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

/**
 * Compte web déjà connecté : affiche un QR pour connecter un autre appareil
 * (téléphone / autre navigateur) sans retaper le mot de passe.
 * Le suivi utilise /status (sans consommer la session).
 */
export function QrPairDevicePanel() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [qr, setQr] = useState<QrLoginStart | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'expired' | 'error'>('idle');
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    setError('');
    setStatus('pending');
    try {
      // Renouvelle silencieusement l’access token (pas de re-login demandé)
      const token = await ensureFreshAccessToken();
      if (!token) {
        setError('Session locale incomplète — rechargez la page (F5), sans vous déconnecter.');
        setStatus('error');
        return;
      }
      const started = await startQrPair();
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
              const res = await statusQrLogin(started.challengeId);
              if (stoppedRef.current) return;
              if (res.status === 'rate_limited') {
                schedulePoll();
                return;
              }
              if (res.status === 'consumed') {
                stop();
                setStatus('done');
                showToast('Autre appareil connecté');
                return;
              }
              if (res.status === 'expired' || res.status === 'missing') {
                stop();
                setStatus('expired');
                return;
              }
              // approved = encore en attente du scan / claim
              schedulePoll();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur de suivi QR');
              setStatus('error');
              stop();
            }
          })();
        }, 1600);
      };
      schedulePoll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Impossible de générer le QR';
      // Ancien message trompeur : access expiré alors que l’UI montrait encore le compte
      if (/non authentifi|token invalide|expir/i.test(msg)) {
        setError('Renouvellement de session… réessayez « Actualiser le QR ».');
      } else {
        setError(msg);
      }
      setStatus('error');
    }
  }, [showToast, stop]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !user) return;
    void begin();
    return () => stop();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS !== 'web') return null;

  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>
        Connecter un autre appareil
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
        Scannez ce QR avec l’app mobile, ou ouvrez le lien sur un autre navigateur — sans mot de
        passe (~2 min).
      </Text>

      {status === 'pending' && qr?.qrDataUrl ? (
        <View style={{ alignItems: 'center' }}>
          <Image
            source={{ uri: qr.qrDataUrl }}
            style={{ width: 220, height: 220, borderRadius: 12 }}
            accessibilityLabel="QR code pour connecter un autre appareil"
          />
          <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 13 }}>
            Expire dans {secondsLeft}s
          </Text>
          <ActivityIndicator style={{ marginTop: 8 }} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
            En attente de l’autre appareil…
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
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={{ color: colors.success, fontWeight: '700', textAlign: 'center' }}>
            Autre appareil connecté
          </Text>
          <Button title="Générer un autre QR" onPress={() => void begin()} />
        </View>
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
    padding: 14,
    marginTop: 12,
  },
});
