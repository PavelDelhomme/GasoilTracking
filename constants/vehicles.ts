import type { FuelType } from '@/types';

export type VehiclePreset = {
  brand: string;
  model: string;
  year: number;
  consumption: number;
  fuel: FuelType;
  tank: number;
  /** Compteur souvent HS / illisible sur ces modèles */
  odometerUnreliable?: boolean;
};

/** Catalogue searchable (conso & réservoir indicatifs) */
export const VEHICLE_CATALOG: VehiclePreset[] = [
  // Peugeot
  { brand: 'Peugeot', model: '806 Roland Garros', year: 2000, consumption: 8.2, fuel: 'diesel', tank: 80, odometerUnreliable: true },
  { brand: 'Peugeot', model: '806', year: 1998, consumption: 8.5, fuel: 'diesel', tank: 80, odometerUnreliable: true },
  { brand: 'Peugeot', model: '806', year: 2002, consumption: 7.9, fuel: 'diesel', tank: 80 },
  { brand: 'Peugeot', model: '206', year: 2003, consumption: 6.2, fuel: 'essence', tank: 50 },
  { brand: 'Peugeot', model: '206 HDi', year: 2004, consumption: 4.8, fuel: 'diesel', tank: 50 },
  { brand: 'Peugeot', model: '207', year: 2008, consumption: 5.5, fuel: 'essence', tank: 50 },
  { brand: 'Peugeot', model: '208', year: 2015, consumption: 4.2, fuel: 'diesel', tank: 50 },
  { brand: 'Peugeot', model: '308', year: 2016, consumption: 4.5, fuel: 'diesel', tank: 53 },
  { brand: 'Peugeot', model: '3008', year: 2019, consumption: 5.2, fuel: 'diesel', tank: 53 },
  { brand: 'Peugeot', model: '407', year: 2006, consumption: 6.8, fuel: 'diesel', tank: 66 },
  { brand: 'Peugeot', model: '508', year: 2018, consumption: 4.6, fuel: 'diesel', tank: 55 },
  { brand: 'Peugeot', model: '5008', year: 2020, consumption: 5.4, fuel: 'diesel', tank: 56 },
  { brand: 'Peugeot', model: 'Partner', year: 2010, consumption: 6.0, fuel: 'diesel', tank: 60 },
  { brand: 'Peugeot', model: 'Boxer', year: 2012, consumption: 8.5, fuel: 'diesel', tank: 90 },
  // Citroën
  { brand: 'Citroën', model: '2CV', year: 1985, consumption: 7.5, fuel: 'essence', tank: 38, odometerUnreliable: true },
  { brand: 'Citroën', model: 'C3', year: 2014, consumption: 4.4, fuel: 'diesel', tank: 45 },
  { brand: 'Citroën', model: 'C4', year: 2015, consumption: 4.7, fuel: 'diesel', tank: 50 },
  { brand: 'Citroën', model: 'C5', year: 2010, consumption: 6.2, fuel: 'diesel', tank: 71 },
  { brand: 'Citroën', model: 'Berlingo', year: 2011, consumption: 5.8, fuel: 'diesel', tank: 60 },
  { brand: 'Citroën', model: 'Jumpy', year: 2018, consumption: 6.5, fuel: 'diesel', tank: 69 },
  { brand: 'Citroën', model: 'XSARA Picasso', year: 2004, consumption: 6.5, fuel: 'diesel', tank: 60 },
  { brand: 'Citroën', model: 'Evasion', year: 2000, consumption: 8.0, fuel: 'diesel', tank: 80 },
  // Renault
  { brand: 'Renault', model: 'Clio II', year: 2002, consumption: 6.0, fuel: 'essence', tank: 50 },
  { brand: 'Renault', model: 'Clio III', year: 2008, consumption: 5.2, fuel: 'diesel', tank: 45 },
  { brand: 'Renault', model: 'Clio IV', year: 2015, consumption: 4.5, fuel: 'diesel', tank: 45 },
  { brand: 'Renault', model: 'Clio V', year: 2021, consumption: 4.0, fuel: 'essence', tank: 42 },
  { brand: 'Renault', model: 'Mégane III', year: 2012, consumption: 5.0, fuel: 'diesel', tank: 60 },
  { brand: 'Renault', model: 'Scenic', year: 2007, consumption: 6.2, fuel: 'diesel', tank: 60 },
  { brand: 'Renault', model: 'Espace IV', year: 2005, consumption: 7.5, fuel: 'diesel', tank: 83 },
  { brand: 'Renault', model: 'Kangoo', year: 2013, consumption: 5.5, fuel: 'diesel', tank: 50 },
  { brand: 'Renault', model: 'Master', year: 2016, consumption: 8.0, fuel: 'diesel', tank: 105 },
  { brand: 'Renault', model: 'Twingo', year: 2010, consumption: 5.5, fuel: 'essence', tank: 40 },
  { brand: 'Renault', model: 'Zoe', year: 2020, consumption: 17.0, fuel: 'electrique', tank: 52 },
  // Volkswagen
  { brand: 'Volkswagen', model: 'Golf IV', year: 2002, consumption: 6.5, fuel: 'diesel', tank: 55 },
  { brand: 'Volkswagen', model: 'Golf VII', year: 2018, consumption: 4.8, fuel: 'diesel', tank: 50 },
  { brand: 'Volkswagen', model: 'Polo', year: 2016, consumption: 4.3, fuel: 'diesel', tank: 45 },
  { brand: 'Volkswagen', model: 'Passat', year: 2015, consumption: 5.0, fuel: 'diesel', tank: 66 },
  { brand: 'Volkswagen', model: 'Tiguan', year: 2019, consumption: 5.8, fuel: 'diesel', tank: 58 },
  { brand: 'Volkswagen', model: 'Transporter T5', year: 2010, consumption: 8.2, fuel: 'diesel', tank: 80 },
  // Autres FR / EU
  { brand: 'Toyota', model: 'Yaris Hybrid', year: 2022, consumption: 3.8, fuel: 'essence', tank: 36 },
  { brand: 'Toyota', model: 'Corolla', year: 2019, consumption: 4.5, fuel: 'essence', tank: 43 },
  { brand: 'Toyota', model: 'RAV4', year: 2020, consumption: 5.5, fuel: 'essence', tank: 55 },
  { brand: 'Mercedes', model: 'W123', year: 1982, consumption: 9.5, fuel: 'diesel', tank: 65, odometerUnreliable: true },
  { brand: 'Mercedes', model: 'Classe A', year: 2016, consumption: 4.8, fuel: 'diesel', tank: 43 },
  { brand: 'Mercedes', model: 'Classe C', year: 2018, consumption: 5.2, fuel: 'diesel', tank: 66 },
  { brand: 'Mercedes', model: 'Vito', year: 2014, consumption: 7.5, fuel: 'diesel', tank: 75 },
  { brand: 'BMW', model: 'E30', year: 1989, consumption: 8.8, fuel: 'essence', tank: 55, odometerUnreliable: true },
  { brand: 'BMW', model: 'Série 3', year: 2017, consumption: 5.0, fuel: 'diesel', tank: 57 },
  { brand: 'Fiat', model: 'Panda', year: 2010, consumption: 5.1, fuel: 'essence', tank: 35 },
  { brand: 'Fiat', model: '500', year: 2015, consumption: 5.0, fuel: 'essence', tank: 35 },
  { brand: 'Fiat', model: 'Ducato', year: 2015, consumption: 8.5, fuel: 'diesel', tank: 90 },
  { brand: 'Ford', model: 'Fiesta', year: 2014, consumption: 4.5, fuel: 'diesel', tank: 42 },
  { brand: 'Ford', model: 'Focus', year: 2016, consumption: 4.8, fuel: 'diesel', tank: 53 },
  { brand: 'Ford', model: 'Transit', year: 2018, consumption: 8.0, fuel: 'diesel', tank: 80 },
  { brand: 'Opel', model: 'Corsa', year: 2015, consumption: 4.4, fuel: 'diesel', tank: 45 },
  { brand: 'Opel', model: 'Astra', year: 2017, consumption: 4.7, fuel: 'diesel', tank: 48 },
  { brand: 'Dacia', model: 'Sandero', year: 2019, consumption: 4.8, fuel: 'essence', tank: 50 },
  { brand: 'Dacia', model: 'Duster', year: 2020, consumption: 5.5, fuel: 'diesel', tank: 50 },
  { brand: 'Dacia', model: 'Logan', year: 2016, consumption: 5.0, fuel: 'diesel', tank: 50 },
  { brand: 'Audi', model: 'A3', year: 2016, consumption: 4.6, fuel: 'diesel', tank: 50 },
  { brand: 'Audi', model: 'A4', year: 2018, consumption: 5.0, fuel: 'diesel', tank: 54 },
  { brand: 'Nissan', model: 'Qashqai', year: 2018, consumption: 5.2, fuel: 'diesel', tank: 55 },
  { brand: 'Nissan', model: 'Micra', year: 2015, consumption: 5.0, fuel: 'essence', tank: 41 },
  { brand: 'Seat', model: 'Ibiza', year: 2017, consumption: 4.5, fuel: 'diesel', tank: 40 },
  { brand: 'Skoda', model: 'Octavia', year: 2018, consumption: 4.7, fuel: 'diesel', tank: 50 },
  { brand: 'Hyundai', model: 'i20', year: 2019, consumption: 5.0, fuel: 'essence', tank: 40 },
  { brand: 'Kia', model: 'Ceed', year: 2020, consumption: 4.8, fuel: 'diesel', tank: 50 },
  { brand: 'Volvo', model: 'V40', year: 2016, consumption: 4.5, fuel: 'diesel', tank: 62 },
  { brand: 'Mini', model: 'Cooper', year: 2015, consumption: 5.5, fuel: 'essence', tank: 44 },
];

/** Favoris affichés en cartes (dont 806 Roland Garros) */
export const PRESET_VEHICLES: VehiclePreset[] = [
  VEHICLE_CATALOG.find((v) => v.model === '806 Roland Garros')!,
  VEHICLE_CATALOG.find((v) => v.model === 'Clio IV')!,
  VEHICLE_CATALOG.find((v) => v.model === '206' && v.year === 2003)!,
  VEHICLE_CATALOG.find((v) => v.model === '2CV')!,
  VEHICLE_CATALOG.find((v) => v.model === 'Golf VII')!,
  VEHICLE_CATALOG.find((v) => v.model === 'Yaris Hybrid')!,
  VEHICLE_CATALOG.find((v) => v.model === 'W123')!,
  VEHICLE_CATALOG.find((v) => v.model === 'E30')!,
].filter(Boolean);

export function searchVehicles(query: string): VehiclePreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return VEHICLE_CATALOG.slice(0, 40);
  return VEHICLE_CATALOG.filter((v) =>
    `${v.brand} ${v.model} ${v.year} ${v.fuel}`.toLowerCase().includes(q)
  ).slice(0, 50);
}
