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
} from 'lucide-react'

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

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Store
  return <Icon className={className} strokeWidth={1.75} />
}
