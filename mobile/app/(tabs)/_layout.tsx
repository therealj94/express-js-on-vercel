import { Tabs } from 'expo-router'
import { Home, Compass, LayoutGrid } from 'lucide-react-native'
import { useTheme } from '../../src/hooks/useTheme'

export default function TabsLayout() {
  const { colors } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted2,
        tabBarStyle: {
          backgroundColor: colors.bgSoft,
          borderTopColor: colors.border,
          height: 62,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="explorar"
        options={{ title: 'Explorar', tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="panel"
        options={{ title: 'Mi cuenta', tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }}
      />
    </Tabs>
  )
}
