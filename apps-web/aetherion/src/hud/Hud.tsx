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
  const bateria = useBateria()

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
          {bateria !== null && <span style={{ opacity: 0.6 }}>{bateria}%</span>}
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

      <Timon />
      {/* el medidor de cuadros es herramienta de taller: solo en modo suelto */}
      {!(window as any).__AE_ABRIR && <FpsMeter />}
    </div>
  )
}

/* LA BATERÍA, SI EL NAVEGADOR LA DA. Antes decía 87% siempre: un número
   inventado en la casa de alguien es una mentira pequeña, y aquí no se dice
   nada que no sea verdad. Sin permiso del navegador, no se muestra. */
function useBateria() {
  const [pct, setPct] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    let bat: any = null
    const leer = () => { if (vivo && bat) setPct(Math.round(bat.level * 100)) }
    const api = (navigator as any).getBattery?.()
    if (!api?.then) return
    api.then((b: any) => {
      if (!vivo) return
      bat = b
      leer()
      b.addEventListener?.('levelchange', leer)
    }).catch(() => { /* sin batería que mirar, no se inventa */ })
    return () => {
      vivo = false
      bat?.removeEventListener?.('levelchange', leer)
    }
  }, [])
  return pct
}

/* EL TIMÓN A LA VISTA. Girar con el dedo y el pellizco para acercar están muy
   bien, pero nadie tiene por qué adivinarlos: estos tres botones hacen lo
   mismo con un toque, y en el teléfono son la forma principal de moverse. */
function Timon() {
  const en = typeof window !== 'undefined' && (window as any).__AE_LANG === 'en'
  const activo = useUiStore((s) => !s.activeId && !s.pulsoOpen && !s.tear.open)
  if (!activo) return null
  /* El mando se busca AL TOCAR, no al dibujar: si este botón se pinta antes
     de que el timón se publique —pasa en la primera vuelta— quedaba atado a
     un undefined para siempre y no acercaba nada. */
  const mando = () => (window as any).__AE_VISTA
  return (
    <div className="ae-timon">
      <button type="button" aria-label={en ? 'Zoom in' : 'Acercar'} onClick={() => mando()?.acercar()}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" aria-label={en ? 'Zoom out' : 'Alejar'} onClick={() => mando()?.alejar()}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" aria-label={en ? 'Recenter' : 'Recentrar'} onClick={() => mando()?.recentrar()}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
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
