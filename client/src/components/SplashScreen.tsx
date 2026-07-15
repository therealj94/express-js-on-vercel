import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const start = Date.now()
    const duration = 1500
    let raf: number
    const tick = () => {
      const elapsed = Date.now() - start
      const pct = Math.min(100, Math.round((elapsed / duration) * 100))
      setProgress(pct)
      if (pct < 100) {
        raf = requestAnimationFrame(tick)
      } else {
        setTimeout(() => setExiting(true), 220)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <AnimatePresence onExitComplete={onDone}>
      {!exiting && (
        <motion.div
          key="splash"
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg overflow-hidden"
        >
          <div className="pointer-events-none absolute inset-0 bg-app-gradient" />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute h-[36rem] w-[36rem] rounded-full bg-gradient-brand opacity-20 blur-[110px]"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center gap-8"
          >
            <div className="relative">
              <span className="absolute inset-0 -m-6 rounded-[2rem] border border-white/10 animate-pulse-ring" />
              <img
                src="/logo.jpg"
                alt="MyTokenPay"
                className="relative h-14 w-auto rounded-xl sm:h-16"
              />
            </div>

            <div className="flex w-52 flex-col items-center gap-3">
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-brand"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="font-display text-[11px] uppercase tracking-[0.28em] text-muted-2">
                Sistema Financiero Social
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
