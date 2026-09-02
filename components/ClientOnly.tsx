import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';

/**
 * Évite toute hydratation SSR↔client sur web : ne monte l’app qu’après le 1er paint client.
 * Sur native, rend immédiatement.
 */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(Platform.OS !== 'web');

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot} accessibilityLabel="Chargement">
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
});
