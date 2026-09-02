import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/Colors';

export function useTheme() {
  const scheme = useColorScheme() ?? 'light';
  return { colors: Colors[scheme], scheme };
}
