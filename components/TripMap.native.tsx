import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { TripMapRef, TripMapProps } from './TripMap.types';

const TripMapNative = forwardRef<TripMapRef, TripMapProps>(function TripMapNative(
  { region, routePoints, accentColor },
  ref
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    fitToCoordinates: (coordinates, options) => {
      mapRef.current?.fitToCoordinates(coordinates, options);
    },
  }));

  return (
    <MapView
      ref={mapRef}
      style={{ height: '100%', width: '100%' }}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      region={region}
      showsUserLocation
      showsMyLocationButton
    >
      {routePoints.length > 1 && (
        <Polyline
          coordinates={routePoints.map((p) => ({
            latitude: p.latitude,
            longitude: p.longitude,
          }))}
          strokeColor={accentColor}
          strokeWidth={4}
        />
      )}
      {routePoints.length > 0 && (
        <Marker
          coordinate={{
            latitude: routePoints[0].latitude,
            longitude: routePoints[0].longitude,
          }}
          title="Départ"
          pinColor="green"
        />
      )}
    </MapView>
  );
});

export default TripMapNative;
