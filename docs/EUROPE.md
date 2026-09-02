# Europe & devises

Gasoil Tracking fonctionne dans toute l’**Europe au sens large** (UE + UK + Islande + Suisse + Balkans + Ukraine + Turquie…).

## Pays / devise

- Sélecteur **Pays / devise** sur l’écran Accueil.
- Chaque pays a une devise (`EUR`, `GBP`, `CHF`, `NOK`, `SEK`, `DKK`, `ISK`, `PLN`, …), une locale d’affichage et un prix carburant indicatif.
- Liste : `constants/europe.ts`.

## Conversion monétaire

- Taux vs EUR via [Frankfurter](https://www.frankfurter.app/) (BCE), avec cache local + fallback offline (`lib/currency.ts`).
- Au changement de pays vers une autre devise : option **Convertir** (véhicules, budgets, trajets, pleins) ou **Sans convertir**.
- `formatEuro()` affiche la devise du pays choisi (nom historique de la fonction).

## Saisie

- Pleins, budgets et prix véhicule utilisent la devise active (`£`, `CHF`, `kr`, …).
- GPS / carte / trajets : disponibles partout (OSM / Nominatim).

## Limite stations open data

Les prix stations automatiques viennent de l’open data **français** (`data.economie.gouv.fr`). Hors France : saisie manuelle des litres et du montant (le suivi budget / trajets reste complet).

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `constants/europe.ts` | Pays, devises, prix indicatifs |
| `lib/currency.ts` | FX + formatage |
| `context/LocaleContext.tsx` | État pays + conversion DB |
| `components/CountryPickerCard.tsx` | UI sélecteur |
| `lib/fuelPrices.ts` | Stations FR uniquement |
