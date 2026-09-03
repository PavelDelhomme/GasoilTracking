import { Alert, Platform } from 'react-native';

/** Alert compatible web + natif */
export function notify(title: string, message?: string) {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(text);
    return;
  }
  Alert.alert(title, message);
}

export function confirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = 'OK',
  onCancel?: () => void
) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel', onPress: onCancel },
    { text: confirmLabel, onPress: onConfirm },
  ]);
}
