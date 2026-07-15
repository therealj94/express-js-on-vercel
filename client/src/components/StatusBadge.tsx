import { BadgeCheck, Clock, ShieldAlert, ShieldQuestion } from 'lucide-react'
import type { KycStatus } from '../types'

const CONFIG: Record<KycStatus, { label: string; className: string; icon: typeof BadgeCheck }> = {
  verified: {
    label: 'Verificado',
    className: 'text-ok bg-ok/10 border-ok/30',
    icon: BadgeCheck,
  },
  pending: {
    label: 'En revisión',
    className: 'text-warn bg-warn/10 border-warn/30',
    icon: Clock,
  },
  rejected: {
    label: 'Rechazado',
    className: 'text-danger bg-danger/10 border-danger/30',
    icon: ShieldAlert,
  },
  unsubmitted: {
    label: 'Sin verificar',
    className: 'text-muted bg-white/5 border-border',
    icon: ShieldQuestion,
  },
}

export function StatusBadge({ status }: { status: KycStatus }) {
  const config = CONFIG[status]
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config.className}`}>
      <Icon size={13} strokeWidth={2.25} />
      {config.label}
    </span>
  )
}
