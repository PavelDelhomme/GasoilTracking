/** Europe continentale + îles proches (UK, Islande…) */

export type CurrencyCode =
  | 'EUR'
  | 'GBP'
  | 'CHF'
  | 'NOK'
  | 'SEK'
  | 'DKK'
  | 'ISK'
  | 'PLN'
  | 'CZK'
  | 'HUF'
  | 'RON'
  | 'BGN'
  | 'HRK'
  | 'TRY'
  | 'UAH'
  | 'RSD'
  | 'BAM'
  | 'ALL'
  | 'MKD'
  | 'MDL';

export type EuropeCountry = {
  code: string;
  name: string;
  nameNative: string;
  currency: CurrencyCode;
  locale: string;
  /** Prix carburant indicatif local / L (devise du pays) */
  defaultFuelPrice: number;
  /** Symbole affiché (fallback si Intl indisponible) */
  symbol: string;
};

/** Liste pays Europe (sens large / continental + UK / Islande) */
export const EUROPE_COUNTRIES: EuropeCountry[] = [
  { code: 'FR', name: 'France', nameNative: 'France', currency: 'EUR', locale: 'fr-FR', defaultFuelPrice: 1.75, symbol: '€' },
  { code: 'BE', name: 'Belgium', nameNative: 'Belgique', currency: 'EUR', locale: 'fr-BE', defaultFuelPrice: 1.72, symbol: '€' },
  { code: 'LU', name: 'Luxembourg', nameNative: 'Luxembourg', currency: 'EUR', locale: 'fr-LU', defaultFuelPrice: 1.45, symbol: '€' },
  { code: 'DE', name: 'Germany', nameNative: 'Deutschland', currency: 'EUR', locale: 'de-DE', defaultFuelPrice: 1.68, symbol: '€' },
  { code: 'NL', name: 'Netherlands', nameNative: 'Nederland', currency: 'EUR', locale: 'nl-NL', defaultFuelPrice: 1.85, symbol: '€' },
  { code: 'AT', name: 'Austria', nameNative: 'Österreich', currency: 'EUR', locale: 'de-AT', defaultFuelPrice: 1.62, symbol: '€' },
  { code: 'IT', name: 'Italy', nameNative: 'Italia', currency: 'EUR', locale: 'it-IT', defaultFuelPrice: 1.78, symbol: '€' },
  { code: 'ES', name: 'Spain', nameNative: 'España', currency: 'EUR', locale: 'es-ES', defaultFuelPrice: 1.55, symbol: '€' },
  { code: 'PT', name: 'Portugal', nameNative: 'Portugal', currency: 'EUR', locale: 'pt-PT', defaultFuelPrice: 1.65, symbol: '€' },
  { code: 'IE', name: 'Ireland', nameNative: 'Éire', currency: 'EUR', locale: 'en-IE', defaultFuelPrice: 1.7, symbol: '€' },
  { code: 'FI', name: 'Finland', nameNative: 'Suomi', currency: 'EUR', locale: 'fi-FI', defaultFuelPrice: 1.8, symbol: '€' },
  { code: 'EE', name: 'Estonia', nameNative: 'Eesti', currency: 'EUR', locale: 'et-EE', defaultFuelPrice: 1.55, symbol: '€' },
  { code: 'LV', name: 'Latvia', nameNative: 'Latvija', currency: 'EUR', locale: 'lv-LV', defaultFuelPrice: 1.55, symbol: '€' },
  { code: 'LT', name: 'Lithuania', nameNative: 'Lietuva', currency: 'EUR', locale: 'lt-LT', defaultFuelPrice: 1.5, symbol: '€' },
  { code: 'SK', name: 'Slovakia', nameNative: 'Slovensko', currency: 'EUR', locale: 'sk-SK', defaultFuelPrice: 1.5, symbol: '€' },
  { code: 'SI', name: 'Slovenia', nameNative: 'Slovenija', currency: 'EUR', locale: 'sl-SI', defaultFuelPrice: 1.52, symbol: '€' },
  { code: 'GR', name: 'Greece', nameNative: 'Ελλάδα', currency: 'EUR', locale: 'el-GR', defaultFuelPrice: 1.7, symbol: '€' },
  { code: 'MT', name: 'Malta', nameNative: 'Malta', currency: 'EUR', locale: 'en-MT', defaultFuelPrice: 1.4, symbol: '€' },
  { code: 'CY', name: 'Cyprus', nameNative: 'Κύπρος', currency: 'EUR', locale: 'el-CY', defaultFuelPrice: 1.4, symbol: '€' },
  { code: 'HR', name: 'Croatia', nameNative: 'Hrvatska', currency: 'EUR', locale: 'hr-HR', defaultFuelPrice: 1.5, symbol: '€' },
  { code: 'GB', name: 'United Kingdom', nameNative: 'United Kingdom', currency: 'GBP', locale: 'en-GB', defaultFuelPrice: 1.45, symbol: '£' },
  { code: 'CH', name: 'Switzerland', nameNative: 'Schweiz', currency: 'CHF', locale: 'de-CH', defaultFuelPrice: 1.85, symbol: 'CHF' },
  { code: 'NO', name: 'Norway', nameNative: 'Norge', currency: 'NOK', locale: 'nb-NO', defaultFuelPrice: 20, symbol: 'kr' },
  { code: 'SE', name: 'Sweden', nameNative: 'Sverige', currency: 'SEK', locale: 'sv-SE', defaultFuelPrice: 18, symbol: 'kr' },
  { code: 'DK', name: 'Denmark', nameNative: 'Danmark', currency: 'DKK', locale: 'da-DK', defaultFuelPrice: 13, symbol: 'kr' },
  { code: 'IS', name: 'Iceland', nameNative: 'Ísland', currency: 'ISK', locale: 'is-IS', defaultFuelPrice: 300, symbol: 'kr' },
  { code: 'PL', name: 'Poland', nameNative: 'Polska', currency: 'PLN', locale: 'pl-PL', defaultFuelPrice: 6.5, symbol: 'zł' },
  { code: 'CZ', name: 'Czechia', nameNative: 'Česko', currency: 'CZK', locale: 'cs-CZ', defaultFuelPrice: 38, symbol: 'Kč' },
  { code: 'HU', name: 'Hungary', nameNative: 'Magyarország', currency: 'HUF', locale: 'hu-HU', defaultFuelPrice: 600, symbol: 'Ft' },
  { code: 'RO', name: 'Romania', nameNative: 'România', currency: 'RON', locale: 'ro-RO', defaultFuelPrice: 7, symbol: 'lei' },
  { code: 'BG', name: 'Bulgaria', nameNative: 'България', currency: 'BGN', locale: 'bg-BG', defaultFuelPrice: 2.5, symbol: 'лв' },
  { code: 'RS', name: 'Serbia', nameNative: 'Srbija', currency: 'RSD', locale: 'sr-RS', defaultFuelPrice: 180, symbol: 'дин' },
  { code: 'BA', name: 'Bosnia', nameNative: 'Bosna', currency: 'BAM', locale: 'bs-BA', defaultFuelPrice: 2.6, symbol: 'KM' },
  { code: 'AL', name: 'Albania', nameNative: 'Shqipëri', currency: 'ALL', locale: 'sq-AL', defaultFuelPrice: 180, symbol: 'L' },
  { code: 'MK', name: 'North Macedonia', nameNative: 'Северна Македонија', currency: 'MKD', locale: 'mk-MK', defaultFuelPrice: 80, symbol: 'ден' },
  { code: 'MD', name: 'Moldova', nameNative: 'Moldova', currency: 'MDL', locale: 'ro-MD', defaultFuelPrice: 25, symbol: 'L' },
  { code: 'UA', name: 'Ukraine', nameNative: 'Україна', currency: 'UAH', locale: 'uk-UA', defaultFuelPrice: 50, symbol: '₴' },
  { code: 'TR', name: 'Turkey', nameNative: 'Türkiye', currency: 'TRY', locale: 'tr-TR', defaultFuelPrice: 42, symbol: '₺' },
  { code: 'AD', name: 'Andorra', nameNative: 'Andorra', currency: 'EUR', locale: 'ca-AD', defaultFuelPrice: 1.4, symbol: '€' },
  { code: 'MC', name: 'Monaco', nameNative: 'Monaco', currency: 'EUR', locale: 'fr-MC', defaultFuelPrice: 1.8, symbol: '€' },
  { code: 'LI', name: 'Liechtenstein', nameNative: 'Liechtenstein', currency: 'CHF', locale: 'de-LI', defaultFuelPrice: 1.85, symbol: 'CHF' },
  { code: 'ME', name: 'Montenegro', nameNative: 'Crna Gora', currency: 'EUR', locale: 'sr-ME', defaultFuelPrice: 1.5, symbol: '€' },
];

export function getCountry(code: string): EuropeCountry {
  return EUROPE_COUNTRIES.find((c) => c.code === code) || EUROPE_COUNTRIES[0];
}

export const DEFAULT_COUNTRY_CODE = 'FR';
