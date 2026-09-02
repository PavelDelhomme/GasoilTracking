import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { TripMapRef, TripMapProps } from './TripMap.types';

const TripMapWeb = forwardRef<TripMapRef, TripMapProps>(function TripMapWeb(
  { region, routePoints, accentColor },
  _ref
) {
  return (
    <View style={[styles.fallback, { backgroundColor: '#1a1a2e' }]}>
      <Text style={styles.title}>Carte (version web)</Text>
      <Text style={styles.subtitle}>
        La carte interactive est disponible sur l&apos;app mobile.
      </Text>
      {routePoints.length > 0 ? (
        <Text style={[styles.meta, { color: accentColor }]}>
          {routePoints.length} point(s) GPS · {region.latitude.toFixed(4)},{' '}
          {region.longitude.toFixed(4)}
        </Text>
      ) : (
        <Text style={styles.meta}>Aucun tracé pour le moment</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  fallback: {
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  meta: { color: '#cbd5e1', fontSize: 13 },
});

export default TripMapWeb;
