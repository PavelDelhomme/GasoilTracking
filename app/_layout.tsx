import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { AccountDrawerProvider } from '@/context/AccountDrawerContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppUpdateProvider, useAppUpdate } from '@/context/AppUpdateContext';
import { HeaderActions } from '@/components/HeaderActions';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { AccountDrawer } from '@/components/AccountDrawer';
import { ClientOnly } from '@/components/ClientOnly';
import { AppUpdateModal } from '@/components/AppUpdateModal';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';

function RootNavigation() {
  const { colors, scheme } = useTheme();
  const update = useAppUpdate();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RegisterServiceWorker />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
          headerRight: () => <HeaderActions />,
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
        <Stack.Screen name="fillup/add" options={{ title: 'Nouveau plein', presentation: 'modal' }} />
        <Stack.Screen name="fillup/[id]" options={{ title: 'Détail du plein' }} />
        <Stack.Screen name="fillup/station" options={{ title: 'Station essence', presentation: 'modal' }} />
        <Stack.Screen
          name="budget/add"
          options={{ title: 'Nouveau budget', presentation: 'modal' }}
        />
        <Stack.Screen name="auth" options={{ title: 'Compte', presentation: 'modal' }} />
        <Stack.Screen name="verify" options={{ title: 'Vérification email', headerShown: true }} />
        <Stack.Screen
          name="admin"
          options={{
            title: 'Administration',
            headerBackVisible: true,
            headerLeft: () => <HeaderBackButton />,
          }}
        />
        <Stack.Screen
          name="account"
          options={{
            title: 'Mon compte',
            headerLeft: () => <HeaderBackButton />,
          }}
        />
        <Stack.Screen
          name="reset-password"
          options={{
            title: 'Nouveau mot de passe',
            headerLeft: () => <HeaderBackButton fallbackHref="/auth" />,
          }}
        />
        <Stack.Screen name="trip/add" options={{ title: 'Trajet manuel', presentation: 'modal' }} />
        <Stack.Screen name="trip/import" options={{ title: 'Import Google Maps', presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Détail du trajet' }} />
        <Stack.Screen name="place/add" options={{ title: 'Nouveau lieu', presentation: 'modal' }} />
        <Stack.Screen name="place/edit" options={{ title: 'Modifier le lieu', presentation: 'modal' }} />
        <Stack.Screen name="place/route" options={{ title: 'Trajet régulier', presentation: 'modal' }} />
      </Stack>
      <AccountDrawer />
      <AppUpdateModal
        visible={update.visible}
        info={update.info}
        force={update.force}
        busy={update.busy}
        progress={update.progress}
        error={update.error}
        onUpdate={update.startUpdate}
        onLater={update.snoozeLater}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <ClientOnly>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <LocaleProvider>
              <AuthProvider>
                <AppProvider>
                  <AppUpdateProvider>
                    <AccountDrawerProvider>
                      <RootNavigation />
                    </AccountDrawerProvider>
                  </AppUpdateProvider>
                </AppProvider>
              </AuthProvider>
            </LocaleProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ClientOnly>
  );
}
