import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useAppUpdateCheck } from '@/hooks/useAppUpdateCheck';

function RootNavigation() {
  const { colors, scheme } = useTheme();
  useAppUpdateCheck();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="vehicle/add"
          options={{ title: 'Ajouter un véhicule', presentation: 'modal' }}
        />
        <Stack.Screen
          name="fillup/add"
          options={{ title: 'Nouveau plein', presentation: 'modal' }}
        />
        <Stack.Screen
          name="budget/add"
          options={{ title: 'Nouveau budget', presentation: 'modal' }}
        />
        <Stack.Screen name="auth" options={{ title: 'Compte', presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppProvider>
        <RootNavigation />
      </AppProvider>
    </AuthProvider>
  );
}
