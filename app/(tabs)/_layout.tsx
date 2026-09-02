import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

export default function TabLayout() {
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: isWeb ? 64 : undefined,
          paddingBottom: isWeb ? 10 : undefined,
          paddingTop: isWeb ? 6 : undefined,
        },
        tabBarLabelStyle: {
          fontSize: isWeb ? 11 : 10,
          fontWeight: '600',
          marginBottom: isWeb ? 2 : 0,
        },
        tabBarItemStyle: isWeb
          ? {
              paddingHorizontal: 2,
              minWidth: 64,
            }
          : undefined,
        tabBarAllowFontScaling: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <ThemeToggleButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={isWeb ? 20 : size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: 'Véhicules',
          tabBarLabel: isWeb ? 'Véhicules' : 'Véhicules',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car" size={isWeb ? 20 : size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fillups"
        options={{
          title: 'Pleins',
          tabBarLabel: 'Pleins',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="water" size={isWeb ? 20 : size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          title: 'Trajet',
          tabBarLabel: 'Trajet',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate" size={isWeb ? 20 : size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarLabel: 'Budget',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" size={isWeb ? 20 : size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
