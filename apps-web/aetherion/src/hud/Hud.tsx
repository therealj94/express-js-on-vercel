import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { sim } from '../kernel/sim'
import { rig } from '../kernel/rig'
import { useUiStore } from '../state/uiStore'

function useAltitude() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (ref.current) ref.current.textContent = rig.altitudeLabel()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return ref
}

export function Hud() {
  const altRef = useAltitude()
  const marea = useUiStore((s) => s.marea)
  const toast = useUiStore((s) => s.toast)
  const [clock, setClock] = useState('')

  useEffect(() => {
    const t = window.setInterval(() => {
      const d = new Date()
      setClock(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      )
    }, 1000)
    setClock(new Date().toLocaleTimeString().slice(0, 5))
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="ae-hud">
      <div className="ae-topbar">
        <div className="ae-arc">
          <svg width="54" height="14" viewBox="0 0 54 14">
            <path
              d="M4 12 A 26 26 0 0 1 50 12"
              fill="none"
              stroke="#ffd98a"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.85"
            />
          </svg>
          <span>{clock}</span>
          <span style={{ opacity: 0.6 }}>87%</span>
        </div>
        <span className="ae-altitude" ref={altRef} />
      </div>

      <div className="ae-tideline">
        {(['alba', 'pleamar', 'bajamar'] as const).map((m) => (
          <div key={m} className={`ae-tide-dot ${marea === m ? 'on' : ''}`} />
        ))}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.key}
            className={`ae-toast ${toast.urgent ? 'urgent' : ''}`}
            initial={{ opacity: 0, y: -14, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <FpsMeter />
    </div>
  )
}

function FpsMeter() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (ref.current) {
        const fps = Math.round(1000 / Math.max(1, sim.frameEma))
        ref.current.textContent = `${fps} FPS · NIVEL ${useUiStore.getState().tier}`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div className="ae-fps" ref={ref} />
}
