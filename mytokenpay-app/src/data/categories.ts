import type { Category } from '../types.js'

export const categories: Category[] = [
  { slug: 'restaurantes', label: 'Restaurantes', icon: 'UtensilsCrossed' },
  { slug: 'cafeterias', label: 'Cafeterías', icon: 'Coffee' },
  { slug: 'hoteles', label: 'Hoteles y hospedaje', icon: 'BedDouble' },
  { slug: 'gimnasios', label: 'Gimnasios y fitness', icon: 'Dumbbell' },
  { slug: 'belleza', label: 'Belleza y spa', icon: 'Sparkles' },
  { slug: 'vida-nocturna', label: 'Vida nocturna', icon: 'Martini' },
  { slug: 'conveniencia', label: 'Tiendas de conveniencia', icon: 'ShoppingBag' },
  { slug: 'supermercados', label: 'Supermercados', icon: 'ShoppingCart' },
  { slug: 'moda', label: 'Moda y accesorios', icon: 'Shirt' },
  { slug: 'tecnologia', label: 'Electrónica y tecnología', icon: 'Smartphone' },
  { slug: 'salud', label: 'Salud y bienestar', icon: 'HeartPulse' },
  { slug: 'educacion', label: 'Educación', icon: 'GraduationCap' },
  { slug: 'automotriz', label: 'Automotriz', icon: 'Car' },
  { slug: 'turismo', label: 'Turismo y experiencias', icon: 'Palmtree' },
  { slug: 'servicios', label: 'Servicios profesionales', icon: 'Briefcase' },
]

export const categoryBySlug = new Map(categories.map((c) => [c.slug, c]))
