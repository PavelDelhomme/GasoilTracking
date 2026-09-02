import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

/** Styles tab bar uniques (pas de branche Platform au render) → pas de mismatch */
const TAB_BAR_STYLE = {
  height: 64,
  paddingBottom: 10,
  paddingTop: 6,
} as const;

const TAB_LABEL_STYLE = {
  fontSize: 11,
  fontWeight: '600' as const,
  marginBottom: 2,
};

const TAB_ITEM_STYLE = {
  paddingHorizontal: 2,
  minWidth: 64,
};

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          ...TAB_BAR_STYLE,
        },
        tabBarLabelStyle: TAB_LABEL_STYLE,
        tabBarItemStyle: TAB_ITEM_STYLE,
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
          tabBarIcon: ({ color }) => <Ionicons name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: 'Véhicules',
          tabBarLabel: 'Véhicules',
          tabBarIcon: ({ color }) => <Ionicons name="car" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="fillups"
        options={{
          title: 'Pleins',
          tabBarLabel: 'Pleins',
          tabBarIcon: ({ color }) => <Ionicons name="water" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          title: 'Trajet',
          tabBarLabel: 'Trajet',
          tabBarIcon: ({ color }) => <Ionicons name="navigate" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarLabel: 'Budget',
          tabBarIcon: ({ color }) => <Ionicons name="wallet" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
