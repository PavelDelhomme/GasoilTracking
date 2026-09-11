/**
 * Point d’entrée tutoriel — overlay coach (le state vit dans TutorialContext).
 */
export { TutorialOverlay as OnboardingTutorial } from '@/components/TutorialOverlay';
export {
  replayOnboarding,
  resetOnboardingFlag,
  ONBOARDING_REPLAY_EVENT,
} from '@/context/TutorialContext';
