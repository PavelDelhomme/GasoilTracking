/**
 * Tutoriel interactif : étapes détaillées, spotlight, seed/cleanup démo isolée.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { cleanupTutorialDemo, getTutorialDemoIds, seedTutorialDemo } from '@/lib/tutorialDemo';
import { getAppFlavor } from '@/lib/appFlavor';

export const ONBOARDING_REPLAY_EVENT = 'gasoil_onboarding_replay';
const DONE_KEY = 'gasoil_onboarding_done_v2';

export type HighlightRect = { x: number; y: number; width: number; height: number };

export type TutorialStepId =
  | 'welcome'
  | 'home'
  | 'home_actions'
  | 'garage'
  | 'vehicle_detail'
  | 'maps'
  | 'trips_live'
  | 'trips_history'
  | 'budget'
  | 'fillups'
  | 'add_vehicle'
  | 'add_fields'
  | 'finish';

export type TutorialStep = {
  id: TutorialStepId;
  title: string;
  body: string;
  href?: string;
  targetId?: string;
  seedBefore?: boolean;
  cleanupOnNext?: boolean;
  /** Carte coach en haut (laisse voir le bas) ou en bas */
  coachPosition?: 'top' | 'bottom';
  demoTag?: boolean;
  /** Étape réservée flavor QA */
  qaOnly?: boolean;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Visite guidée',
    body:
      'On charge un véhicule d’exemple « Démo · Peugeot 208 » (trajets, pleins, budget). Vos vraies données ne sont pas effacées. À la fin, seule la démo est retirée. Vous pourrez relancer ce guide plus tard.',
    coachPosition: 'top',
  },
  {
    id: 'home',
    title: 'Accueil — véhicule & jauge',
    body:
      'Carte du haut : nom du véhicule démo + km. Jauge : estime le carburant restant (baisse aux trajets, remonte aux pleins). Touchez pour corriger. Les stats dessous résument conso et budget.',
    href: '/(tabs)',
    targetId: 'home-vehicle',
    seedBefore: true,
    coachPosition: 'bottom',
    demoTag: true,
  },
  {
    id: 'home_actions',
    title: 'Accueil — actions rapides',
    body:
      'Boutons du bas (ou FAB) : « Démarrer trajet » → Maps / suivi ; « Nouveau plein » → saisie carburant. Menu ☰ : compte, aide, thème, sync. Touchez Suivant pour le Garage.',
    href: '/(tabs)',
    targetId: 'home-fabs',
    coachPosition: 'top',
    demoTag: true,
  },
  {
    id: 'garage',
    title: 'Mon Garage',
    body:
      'Liste des véhicules. « Démo · Peugeot 208 » est temporaire. Activez un véhicule pour lui rattacher trajets et pleins. Appui long / poubelle pour supprimer (pas besoin pour la démo).',
    href: '/(tabs)/vehicles',
    targetId: 'garage-first',
    coachPosition: 'bottom',
    demoTag: true,
  },
  {
    id: 'vehicle_detail',
    title: 'Fiche véhicule',
    body:
      'Détail : jauge, conso, checklist entretien (huile, freins, pneus…). Cochez après un passage garage pour réinitialiser l’intervalle constructeur (km / mois). Entretien & CT : échéances, factures photo, défauts / contre-visite.',
    href: '/(tabs)/vehicles',
    targetId: 'vehicle-detail-card',
    coachPosition: 'top',
    demoTag: true,
  },
  {
    id: 'maps',
    title: 'Maps',
    body:
      'Recherche adresse en haut (autocomplétion + récents). Lieux Domicile/Travail + récents. « Suivi libre » = GPS sans destination (conso pendant que vous roulez). Destination → choix Éco / Rapide sur la carte avant de démarrer.',
    href: '/(tabs)/maps',
    targetId: 'maps-search',
    coachPosition: 'top',
    demoTag: true,
  },
  {
    id: 'trips_live',
    title: 'Écran Trajet',
    body:
      'Carte + stats du trajet en cours. Suivi libre : pas de destination, panneau vitesse + jauge. Navigation : chip direction. Sur le compte QA seulement : boutons Sim live (tests musique/PLM) — absents en prod. Le + hors trajet : saisie manuelle / import (pas un faux itinéraire).',
    href: '/(tabs)/trip',
    targetId: 'trip-live-panel',
    coachPosition: 'top',
    demoTag: true,
  },
  {
    id: 'trips_history',
    title: 'Historique trajets',
    body:
      'Liste des trajets passés du véhicule actif (ici la démo). Filtre « Depuis le plein ». Touchez un trajet pour la carte et les stats. Terminer un vrai trajet ouvre le récap puis revient sur Maps.',
    href: '/(tabs)/trip?tab=history',
    targetId: 'trip-history-list',
    coachPosition: 'top',
    demoTag: true,
  },
  {
    id: 'budget',
    title: 'Budget & lieux',
    body:
      'Enveloppe mensuelle + reste estimé. Lieux : swipe ← modifier, → supprimer ; flèches ↑↓ pour l’ordre. Trajets programmés (☰) pour domicile↔travail et estimation semaine.',
    href: '/(tabs)/budget',
    targetId: 'budget-card',
    coachPosition: 'top',
    demoTag: true,
  },
  {
    id: 'fillups',
    title: 'Pleins',
    body:
      'Historique des pleins. Nouveau plein : station proche, prix auto si connu, litres plafonnés à la place libre. Un plein complet aide l’app à apprendre votre conso réelle.',
    href: '/(tabs)/fillups',
    targetId: 'fillups-list',
    coachPosition: 'top',
    demoTag: true,
  },
  {
    id: 'add_vehicle',
    title: 'Ajouter VOTRE voiture',
    body:
      'Ce n’est plus la démo. Favoris = ajout en 1 tap. Ou cherchez un modèle catalogue. Les champs se préremplissent (conso, réservoir, masse, SCx) — vous pouvez les corriger.',
    href: '/vehicle/add',
    targetId: 'vehicle-add-form',
    coachPosition: 'top',
  },
  {
    id: 'add_fields',
    title: 'Champs du formulaire',
    body:
      'Nom : libellé affiché. Marque/modèle/année. Carburant (diesel/essence…). Conso L/100 et réservoir. Prix au litre par défaut. Compteur km (ou désactivez si HS). Masse / SCx affinente l’estimation. Enregistrez puis activez ce véhicule.',
    href: '/vehicle/add',
    targetId: 'vehicle-add-form',
    coachPosition: 'bottom',
  },
  {
    id: 'finish',
    title: 'Fin — nettoyage démo',
    body:
      'On supprime uniquement « Démo · Peugeot 208 » et ses trajets / pleins / budget / lieux démo. Votre compte et vos vrais véhicules restent. Relancer le guide recrée une démo locale propre, sans toucher à vos données.',
    href: '/(tabs)',
    cleanupOnNext: true,
    coachPosition: 'top',
  },
];

export function getVisibleTutorialSteps(): TutorialStep[] {
  const flavor = getAppFlavor();
  return TUTORIAL_STEPS.filter((s) => !s.qaOnly || flavor.key === 'qa');
}

type TutorialContextValue = {
  active: boolean;
  stepIndex: number;
  step: TutorialStep | null;
  highlight: HighlightRect | null;
  busy: boolean;
  steps: TutorialStep[];
  start: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => void;
  skip: () => Promise<void>;
  setHighlight: (r: HighlightRect | null) => void;
  registerTarget: (id: string, measure: () => void) => void;
  unregisterTarget: (id: string) => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
}) {
  const steps = useMemo(() => getVisibleTutorialSteps(), []);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = useRef(new Map<string, () => void>());
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  const step = active ? steps[stepIndex] ?? null : null;

  const measureCurrent = useCallback(() => {
    const id = steps[stepIndex]?.targetId;
    if (!id) {
      setHighlight(null);
      return;
    }
    const fn = targets.current.get(id);
    if (fn) fn();
    else setHighlight(null);
  }, [stepIndex, steps]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(measureCurrent, 500);
    return () => clearTimeout(t);
  }, [active, stepIndex, measureCurrent]);

  const goHref = (href?: string) => {
    if (href) router.push(href as never);
  };

  const markDone = async () => {
    await AsyncStorage.setItem(DONE_KEY, '1');
  };

  const start = useCallback(async () => {
    setBusy(true);
    try {
      setStepIndex(0);
      setHighlight(null);
      setActive(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const finishAll = useCallback(async () => {
    setBusy(true);
    try {
      await cleanupTutorialDemo();
      await refreshRef.current?.();
      await markDone();
      setActive(false);
      setStepIndex(0);
      setHighlight(null);
      router.replace('/(tabs)' as never);
    } finally {
      setBusy(false);
    }
  }, []);

  const skip = useCallback(async () => {
    setBusy(true);
    try {
      await cleanupTutorialDemo();
      await refreshRef.current?.();
      await markDone();
      setActive(false);
      setHighlight(null);
      router.replace('/(tabs)' as never);
    } finally {
      setBusy(false);
    }
  }, []);

  const next = useCallback(async () => {
    const current = steps[stepIndex];
    if (!current) return;
    setBusy(true);
    try {
      if (current.cleanupOnNext || current.id === 'finish') {
        await finishAll();
        return;
      }
      const nextIndex = stepIndex + 1;
      const upcoming = steps[nextIndex];
      if (!upcoming) {
        await finishAll();
        return;
      }
      if (upcoming.seedBefore) {
        await seedTutorialDemo();
        await refreshRef.current?.();
      }
      // Ouvre la fiche démo pour l’étape détail
      if (upcoming.id === 'vehicle_detail') {
        const ids = await getTutorialDemoIds();
        if (ids?.vehicleId) {
          router.push({
            pathname: '/vehicle/[id]' as never,
            params: { id: String(ids.vehicleId) },
          });
        } else {
          goHref(upcoming.href);
        }
      } else {
        goHref(upcoming.href);
      }
      setStepIndex(nextIndex);
      setHighlight(null);
      setTimeout(measureCurrent, 600);
    } finally {
      setBusy(false);
    }
  }, [stepIndex, steps, finishAll, measureCurrent]);

  const prev = useCallback(() => {
    if (stepIndex <= 0) return;
    const prevIndex = stepIndex - 1;
    setStepIndex(prevIndex);
    setHighlight(null);
    goHref(steps[prevIndex]?.href);
  }, [stepIndex, steps]);

  const registerTarget = useCallback((id: string, measure: () => void) => {
    targets.current.set(id, measure);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targets.current.delete(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const done = await AsyncStorage.getItem(DONE_KEY);
      const doneV1 = await AsyncStorage.getItem('gasoil_onboarding_done_v1');
      if (!cancelled && done !== '1' && doneV1 !== '1') {
        await start();
      }
    })();
    const sub = DeviceEventEmitter.addListener(ONBOARDING_REPLAY_EVENT, () => {
      void (async () => {
        await AsyncStorage.multiRemove([DONE_KEY, 'gasoil_onboarding_done_v1']);
        await start();
      })();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [start]);

  const value = useMemo(
    () => ({
      active,
      stepIndex,
      step,
      highlight,
      busy,
      steps,
      start,
      next,
      prev,
      skip,
      setHighlight,
      registerTarget,
      unregisterTarget,
    }),
    [active, stepIndex, step, highlight, busy, steps, start, next, prev, skip, registerTarget, unregisterTarget]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    return {
      active: false,
      stepIndex: 0,
      step: null,
      highlight: null,
      busy: false,
      steps: TUTORIAL_STEPS,
      start: async () => {},
      next: async () => {},
      prev: () => {},
      skip: async () => {},
      setHighlight: (_r: HighlightRect | null) => {},
      registerTarget: (_id: string, _m: () => void) => {},
      unregisterTarget: (_id: string) => {},
    } satisfies TutorialContextValue;
  }
  return ctx;
}

export async function resetOnboardingFlag(): Promise<void> {
  await AsyncStorage.multiRemove([DONE_KEY, 'gasoil_onboarding_done_v1']);
}

export async function replayOnboarding(): Promise<void> {
  await resetOnboardingFlag();
  DeviceEventEmitter.emit(ONBOARDING_REPLAY_EVENT);
}
