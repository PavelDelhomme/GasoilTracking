/**
 * Scan / deep-link QR pour autoriser la connexion web.
 * Route : /qr-login?c=… ou scanner caméra.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/Button';
import { InlineBackBar } from '@/components/HeaderBackButton';
import { approveQrLogin, parseQrLoginChallenge } from '@/lib/api';
import { notify } from '@/lib/notify';

export default function QrLoginScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ c?: string; challenge?: string; scan?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(Platform.OS !== 'web');
  const handled = React.useRef(false);

  const approve = useCallback(
    async (raw: string) => {
      const challenge = parseQrLoginChallenge(raw);
      if (!challenge) {
        setMsg('QR non reconnu. Scannez le code affiché sur le site.');
        return;
      }
      if (!user) {
        setMsg('Connectez-vous d’abord dans l’app, puis rescannez.');
        return;
      }
      if (busy) return;
      setBusy(true);
      setMsg('Autorisation…');
      try {
        const res = await approveQrLogin(challenge);
        notify('Site web', res.message || 'Connexion autorisée');
        setMsg('OK — le site est connecté. Vous pouvez fermer.');
        setTimeout(() => router.back(), 900);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Échec');
      } finally {
        setBusy(false);
      }
    },
    [busy, user]
  );

  useEffect(() => {
    const fromParams = params.c || params.challenge;
    if (!fromParams || handled.current) return;
    handled.current = true;
    setScanning(false);
    void approve(String(fromParams));
  }, [params.c, params.challenge, approve]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <InlineBackBar />
        <Text style={[styles.title, { color: colors.text }]}>Connexion QR</Text>
        <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
          Le scan se fait depuis l’application mobile. Sur ce navigateur, affichez le QR dans
          Connexion, puis scannez-le avec votre téléphone.
        </Text>
        <Button title="Aller à la connexion" onPress={() => router.replace('/auth' as never)} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <InlineBackBar />
      <Text style={[styles.title, { color: colors.text }]}>Scanner le QR du site</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
        {user
          ? `Connecté en tant que ${user.email}. Pointez la caméra vers le QR du site web.`
          : 'Vous devez être connecté dans l’app pour autoriser le site.'}
      </Text>

      {!user ? (
        <Button title="Se connecter" onPress={() => router.push('/auth' as never)} />
      ) : null}

      {user && scanning ? (
        !permission?.granted ? (
          <View>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
              Autorisez la caméra pour scanner le QR.
            </Text>
            <Button title="Autoriser la caméra" onPress={() => void requestPermission()} />
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                busy
                  ? undefined
                  : ({ data }) => {
                      setScanning(false);
                      void approve(data);
                    }
              }
            />
            <View style={styles.frame} pointerEvents="none" />
          </View>
        )
      ) : null}

      {!!msg && (
        <Text
          style={{
            color: /OK|autoris/i.test(msg) ? colors.success : colors.danger,
            marginTop: 14,
            fontWeight: '700',
          }}
        >
          {msg}
        </Text>
      )}

      {user && !scanning && (
        <Button
          title="Scanner à nouveau"
          onPress={() => {
            handled.current = false;
            setMsg('');
            setScanning(true);
          }}
          style={{ marginTop: 16 }}
          loading={busy}
        />
      )}

      <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
        <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Fermer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  cameraWrap: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    backgroundColor: '#000',
  },
  frame: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    top: '20%',
    bottom: '20%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
  },
});
