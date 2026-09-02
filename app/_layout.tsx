import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';
import { ClientOnly } from '@/components/ClientOnly';
import { AppUpdateModal } from '@/components/AppUpdateModal';
import { useAppUpdateCheck } from '@/hooks/useAppUpdateCheck';

function RootNavigation() {
  const { colors, scheme } = useTheme();
  const update = useAppUpdateCheck();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
          headerRight: () => <ThemeToggleButton />,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="vehicle/add"
          options={{ title: 'Ajouter un véhicule', presentation: 'modal' }}
        />
        <Stack.Screen
          name="vehicle/edit"
          options={{ title: 'Modifier le véhicule', presentation: 'modal' }}
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
        <Stack.Screen name="verify" options={{ title: 'Vérification email', headerShown: true }} />
        <Stack.Screen name="admin" options={{ title: 'Administration' }} />
        <Stack.Screen name="trip/add" options={{ title: 'Trajet manuel', presentation: 'modal' }} />
        <Stack.Screen name="trip/import" options={{ title: 'Import Google Maps', presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Détail du trajet' }} />
        <Stack.Screen name="place/add" options={{ title: 'Nouveau lieu', presentation: 'modal' }} />
        <Stack.Screen name="place/route" options={{ title: 'Trajet régulier', presentation: 'modal' }} />
        <Stack.Screen name="fillup/station" options={{ title: 'Station essence', presentation: 'modal' }} />
      </Stack>
      <AppUpdateModal
        visible={update.visible}
        info={update.info}
        force={update.force}
        busy={update.busy}
        progress={update.progress}
        error={update.error}
        onUpdate={update.startUpdate}
        onLater={update.dismiss}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <ClientOnly>
      <ThemeProvider>
        <LocaleProvider>
          <AuthProvider>
            <AppProvider>
              <RootNavigation />
            </AppProvider>
          </AuthProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ClientOnly>
  );
}
