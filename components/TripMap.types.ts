export type RouteCoord = { latitude: number; longitude: number };

export type TripMapRef = {
  fitToCoordinates: (
    coordinates: RouteCoord[],
    options?: {
      edgePadding?: { top: number; right: number; bottom: number; left: number };
      animated?: boolean;
    }
  ) => void;
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
};
