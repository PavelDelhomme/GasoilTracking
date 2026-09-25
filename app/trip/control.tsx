/**
 * Contrôle trajet depuis Hubera Maps :
 *   gasoiltracking://trip/control?action=pause|resume|stop&tripId=
 */
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { getActiveTripLite } from '@/lib/database';
import { pauseGpsTrip, resumeGpsTrip, stopGpsTripLite } from '@/lib/startFreeTrip';
import { peekLiveRouteTail } from '@/lib/locationService';
import { calculateRouteDistance } from '@/lib/calculations';

export default function TripControlFromMaps() {
  const params = useLocalSearchParams<{ action?: string; tripId?: string }>();
  const { refresh, activeVehicle } = useApp();
  const { showToast } = useToast();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const action = String(params.action || '').toLowerCase();
    const tripIdNum = Number(params.tripId);
    void (async () => {
      try {
        const live = await getActiveTripLite();
        const tripId = Number.isFinite(tripIdNum) && tripIdNum > 0 ? tripIdNum : live?.id;
        if (!tripId) {
          showToast('Aucun trajet Fuel actif.');
          return;
        }
        if (action === 'pause') {
          await pauseGpsTrip(tripId, refresh);
          showToast('Suivi Fuel en pause.');
        } else if (action === 'resume') {
          const ok = await resumeGpsTrip(tripId, refresh);
          showToast(ok ? 'Suivi Fuel repris.' : 'Localisation refusée — suivi non repris.');
        } else if (action === 'stop') {
          const tail = peekLiveRouteTail() || [];
          const km = tail.length >= 2 ? calculateRouteDistance(JSON.stringify(tail)) : 0;
          await stopGpsTripLite({
            tripId,
            vehicleId: activeVehicle?.id ?? live?.vehicleId ?? 0,
            distanceKm: km,
            refresh,
          });
          showToast('Trajet Fuel terminé.');
        } else {
          showToast('Action Maps inconnue.');
        }
      } catch {
        showToast('Impossible de commander le trajet Fuel.');
      } finally {
        router.replace('/(tabs)/maps');
      }
    })();
  }, [params.action, params.tripId, refresh, activeVehicle?.id, showToast]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
