import { create } from 'zustand'

export type NotificationKind = 'promo' | 'reward' | 'kyc' | 'welcome' | 'wallet'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
}

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

const SEED: AppNotification[] = [
  {
    id: 'n-1',
    kind: 'welcome',
    title: 'Bienvenido a MyTokenPay',
    body: 'Explora comercios afiliados y gana puntos ORIGEN en cada compra. Tienes 480 puntos de regalo para empezar.',
    createdAt: minutesAgo(2),
    read: false,
  },
  {
    id: 'n-2',
    kind: 'promo',
    title: '2x1 en Volcán Rooftop Lounge',
    body: 'Promo exclusiva para usuarios: 2x1 en cócteles de autor de jueves a sábado en San Salvador.',
    createdAt: minutesAgo(140),
    read: false,
  },
  {
    id: 'n-3',
    kind: 'reward',
    title: 'Nuevo premio disponible',
    body: 'Ya puedes canjear una noche gratis frente al mar en Roatán Dive & Stay por 600 puntos.',
    createdAt: minutesAgo(60 * 20),
    read: true,
  },
  {
    id: 'n-4',
    kind: 'promo',
    title: 'Café gratis cerca de ti',
    body: 'Origen Coffee Lab regala una bebida por 50 puntos ORIGEN. Válido esta semana.',
    createdAt: minutesAgo(60 * 46),
    read: true,
  },
]

interface NotificationsState {
  items: AppNotification[]
  unreadCount: () => number
  markAllRead: () => void
  markRead: (id: string) => void
  push: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: SEED,
  unreadCount: () => get().items.filter((n) => !n.read).length,
  markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
  markRead: (id) => set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  push: (n) =>
    set((s) => ({
      items: [
        { ...n, id: `n-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), read: false },
        ...s.items,
      ],
    })),
}))
