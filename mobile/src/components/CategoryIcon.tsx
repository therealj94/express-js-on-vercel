import {
  UtensilsCrossed,
  Coffee,
  BedDouble,
  Dumbbell,
  Sparkles,
  Martini,
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Smartphone,
  HeartPulse,
  GraduationCap,
  Car,
  Palmtree,
  Briefcase,
  Store,
  type LucideIcon,
} from 'lucide-react-native'

const ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed,
  Coffee,
  BedDouble,
  Dumbbell,
  Sparkles,
  Martini,
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Smartphone,
  HeartPulse,
  GraduationCap,
  Car,
  Palmtree,
  Briefcase,
}

export function CategoryIcon({ name, size = 20, color = '#fff' }: { name: string; size?: number; color?: string }) {
  const Icon = ICONS[name] ?? Store
  return <Icon size={size} color={color} strokeWidth={1.75} />
}
