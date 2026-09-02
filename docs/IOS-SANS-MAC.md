# Gasoil Tracking — iOS sans Mac (rapport)

**Date :** 2 septembre 2026  
**Objectif :** livrer une vraie app iPhone (TestFlight / App Store) **sans posséder de Mac Apple**, depuis Linux, tout en gardant Android (APK) et la web/PWA déjà en production.

---

## 1. Ce qui existe déjà (prod)

| Canal | Statut | Lien / usage |
|--------|--------|----------------|
| **Android APK** | Live | https://gasoil-tracking.delhomme.ovh/download |
| **Web / iPhone PWA** | Live | https://gasoil-tracking.delhomme.ovh — Safari → Partager → Sur l’écran d’accueil |
| **API + sync cloud** | Live | même domaine `/api` |
| **App Store iOS native** | Pas encore | nécessite compte Apple Developer + build cloud |

La PWA iPhone est **déjà utilisable comme une app** (compte, sync, trajets GPS au premier plan). Une app native App Store apporte : install via TestFlight/Store, GPS arrière-plan plus fiable, push Apple, icône « officielle ».

---

## 2. Peut-on développer iOS sans Mac chez soi ?

**Oui.** Le code reste Expo/React Native (déjà le cas). La compilation iOS se fait sur des **Mac dans le cloud** :

1. **Expo EAS Build** (recommandé pour ce projet) — build `.ipa` depuis Linux  
2. **EAS Submit** — envoi vers App Store Connect / TestFlight **sans Mac**  
3. Alternatives : Codemagic, GitHub Actions (runners macOS), location Mac cloud ponctuelle

Tu **n’as pas besoin** d’acheter un Mac pour compiler ni pour soumettre.  
Tu **as besoin** d’un **compte Apple Developer Program** (~99 € / an) pour signer et distribuer hors PWA.

---

## 3. Prérequis obligatoires (à faire une fois)

1. **Apple ID** perso  
2. Inscription **[Apple Developer Program](https://developer.apple.com/programs/)** (~99 USD/EUR / an)  
3. Compte **[Expo](https://expo.dev)** (gratuit au départ) lié au projet  
4. Créer l’app dans **App Store Connect** (nom, bundle id `com.gasoiltracking.app` déjà dans `app.json`)  
5. Sur Linux : `npm i -g eas-cli` puis `eas login`

Rien de tout cela ne nécessite un Mac physiquement chez toi.

---

## 4. Plan d’action concret (étapes)

### Phase A — Immédiat (déjà fait / en cours)
- [x] Web installable (PWA) + page `/download` multi-supports  
- [x] APK Android 1.4.5 en prod  
- [x] Profils EAS iOS ajoutés dans `eas.json` (development / preview / production)

### Phase B — Compte Apple (toi, ~30–60 min + validation Apple parfois 24–48 h)
- [ ] Payer / valider Apple Developer Program  
- [ ] App Store Connect → **My Apps** → New App → bundle `com.gasoiltracking.app`  
- [ ] Noter l’**Apple ID numérique** de l’app (ascAppId) → à mettre dans `eas.json` → `submit.production.ios.ascAppId`

### Phase C — Premier build iOS cloud (depuis ce PC Linux)
```bash
cd GasoilTracking
npm i -g eas-cli
eas login
eas build:configure   # si besoin
eas credentials       # laisser EAS gérer certificats (recommandé)
eas build --platform ios --profile preview
```
- Build **preview / internal** → lien d’install pour **appareils enregistrés** (UDID) ou TestFlight selon config  
- Puis :
```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```
- TestFlight apparaît dans App Store Connect (traitement ~15–60 min)  
- Inviter ton pote / toi-même en testeur TestFlight

### Phase D — Publication App Store
- Fiches Store (texte FR, captures iPhone — générables depuis simulateur cloud ou captures PWA)  
- Privacy / tracking declarations  
- Soumission review Apple (délai variable, souvent 1–3 jours)

---

## 5. Coûts estimés (ordre de grandeur)

| Poste | Estimation |
|--------|------------|
| Apple Developer | ~99 € / an (obligatoire pour IPA signée) |
| EAS free | quelques builds/mois (file d’attente plus lente) |
| EAS payant (si besoin) | ~19 USD / mois selon offre Expo |
| Mac physique | **0 €** si on reste 100 % cloud |

---

## 6. Limites honnêtes

- **Sans Apple Developer** : pas d’IPA installable librement ; rester sur **PWA Safari** (déjà OK pour ton pote).  
- **GPS arrière-plan iOS** : plus strict qu’Android ; la PWA ne suit pas bien écran verrouillé ; l’app native EAS améliore ça.  
- **Simulateur iOS local** : impossible sans Mac ; tests = appareil physique via TestFlight ou build internal.  
- **Push notifications** : APNs + clé `.p8` via Apple Developer (aussi sans Mac, via le site Apple).

---

## 7. Recommandation pour Gasoil Tracking

**Court terme (ce soir / demain)**  
- Nothing + Samsung + Blackview : APK **1.4.5**  
- Pote iPhone : **https://gasoil-tracking.delhomme.ovh** → Sur l’écran d’accueil  
- Invitation admin = web + APK + code dans le même mail  

**Moyen terme (quand le compte Apple est actif)**  
1. `eas build --platform ios --profile production` depuis Linux  
2. TestFlight pour validation  
3. App Store  

**Ne pas bloquer** l’usage iPhone sur l’attente App Store : la PWA couvre déjà le besoin principal.

---

## 8. Commandes utiles (rappel)

```bash
# Version live
curl -sS https://gasoil-tracking.delhomme.ovh/api/version

# Build iOS cloud (après eas login + Apple Developer)
eas build --platform ios --profile production

# Soumettre à TestFlight / ASC
eas submit --platform ios --latest
```

---

Bonne nuit — dès que le compte Apple Developer est validé, on peut lancer le premier `eas build` iOS depuis ce repo Linux sans Mac.
