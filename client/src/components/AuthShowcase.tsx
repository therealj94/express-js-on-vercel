import { motion } from 'framer-motion'
import { BadgeCheck, MapPin, TrendingUp } from 'lucide-react'

export function AuthShowcase({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative hidden overflow-hidden lg:block">
      <img src="/hero-people.jpg" alt="Personas pagando con código QR en comercios afiliados" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/10" />
      <div className="absolute inset-0 bg-app-gradient opacity-70 mix-blend-multiply" />

      <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-display text-2xl font-bold leading-snug xl:text-3xl">{title}</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{subtitle}</p>
        </motion.div>

        <div className="mt-8 flex flex-wrap gap-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="glass flex items-center gap-2.5 rounded-2xl px-4 py-3 animate-float"
          >
            <BadgeCheck size={18} className="text-ok" />
            <div>
              <p className="text-sm font-semibold leading-none">Genesis ID</p>
              <p className="mt-1 text-[11px] text-muted">Verificación KYC/KYB</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="glass flex items-center gap-2.5 rounded-2xl px-4 py-3 animate-float"
            style={{ animationDelay: '0.6s' }}
          >
            <MapPin size={18} className="text-blue" />
            <div>
              <p className="text-sm font-semibold leading-none">6 países</p>
              <p className="mt-1 text-[11px] text-muted">Cobertura regional</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.65 }}
            className="glass flex items-center gap-2.5 rounded-2xl px-4 py-3 animate-float"
            style={{ animationDelay: '1.1s' }}
          >
            <TrendingUp size={18} className="text-violet" />
            <div>
              <p className="text-sm font-semibold leading-none">1.5%</p>
              <p className="mt-1 text-[11px] text-muted">Comisión por cobro</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
