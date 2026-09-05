export type RouteCoord = { latitude: number; longitude: number };

export type TripMapRef = {
  fitToCoordinates: (
    coordinates: RouteCoord[],
    options?: {
      edgePadding?: { top: number; right: number; bottom: number; left: number };
      animated?: boolean;
    }
  ) => void;
  setCenter?: (latitude: number, longitude: number, zoom?: number) => void;
};

export type TripMapProps = {
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  routePoints: RouteCoord[];
  accentColor: string;
  /** Position GPS actuelle (point bleu) */
  userLocation?: RouteCoord | null;
  /** Trajet en pause */
  paused?: boolean;
  /** Itinéraire prévu (OSRM) vers la destination */
  plannedRoute?: RouteCoord[];
  /** Marqueur destination */
  destination?: RouteCoord | null;
};
