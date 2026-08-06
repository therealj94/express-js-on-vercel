import { Tabs } from 'expo-router'
import { Home, Compass, LayoutGrid } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../src/hooks/useTheme'

export default function TabsLayout() {
  const { colors } = useTheme()
  // La barra de navegación de Android (los botones de abajo) se dibuja ENCIMA
  // de la app: sin este margen, las pestañas quedan tapadas por ella.
  const insets = useSafeAreaInsets()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted2,
        tabBarStyle: {
          backgroundColor: colors.bgSoft,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
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
