import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ARCHETYPES, MODULES, WELL_DEFS } from '../sky/Wells'
import { transit } from '../transit/transit'
import { useUiStore } from '../state/uiStore'
import { audio, haptic } from '../audio/engine'

const spring = { type: 'spring' as const, stiffness: 420, damping: 30 }

export function Overlays() {
  const selectedId = useUiStore((s) => s.selectedId)
  const activeId = useUiStore((s) => s.activeId)
  const pulsoOpen = useUiStore((s) => s.pulsoOpen)

  return (
    <div className="ae-hud" style={{ pointerEvents: 'none' }}>
      <AnimatePresence>{selectedId && !activeId && <WhisperCard key="w" />}</AnimatePresence>
      <TearMenu />
      <AnimatePresence>{pulsoOpen && <Pulso key="p" />}</AnimatePresence>
      <AnimatePresence>{activeId && <DimensionPanel key={activeId} />}</AnimatePresence>
    </div>
  )
}

function WhisperCard() {
  const id = useUiStore((s) => s.selectedId)!
  const well = WELL_DEFS.find((w) => w.key === id)
  if (!well) return null
  const arch = ARCHETYPES[well.arch]
  const st = useUiStore.getState()

  const attune = () => {
    st.select(null)
    window.setTimeout(() => {
      const cam = (window as any).__aeCamera as import('three').PerspectiveCamera
      if (cam) transit.beginEnter(well.key, cam)
    }, 0)
    audio.commit()
    haptic.commit()
  }

  return (
    <motion.div
      className="ae-panel ae-whisper"
      initial={{ opacity: 0, y: 26, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.95 }}
      transition={spring}
    >
      <h3>{well.name}</h3>
      <p>
        {arch.label} · {well.intent}
        {well.pending > 0 ? ` · ${well.pending} pulsos` : ''}
      </p>
      <div className="ae-row">
        <button className="ae-btn primary" onClick={attune}>
          {(window as any).__AE_LANG === 'en' ? 'ENTER' : 'ENTRAR'}
        </button>
        <button
          className="ae-btn"
          onClick={() => {
            well.pending = 0
            st.showToast(`Pulsos de ${well.name} en silencio`)
            st.select(null)
          }}
        >
          SILENCIAR
        </button>
      </div>
    </motion.div>
  )
}

const TEAR_OPTIONS = ['Sintonizar', 'Abrir en órbita', 'Anclar espora', 'Silenciar pulsos']

function TearMenu() {
  const tear = useUiStore((s) => s.tear)
  const close = useUiStore((s) => s.closeTear)
  if (!tear.open || !tear.id) return null
  const st = useUiStore.getState()

  const act = (opt: string) => {
    const well = WELL_DEFS.find((w) => w.key === tear.id)
    if (!well) return close()
    if (opt === 'Sintonizar') {
      close()
      window.setTimeout(() => {
        const cam = (window as any).__aeCamera as import('three').PerspectiveCamera
        if (cam) transit.beginEnter(well.key, cam)
      }, 0)
    } else if (opt === 'Abrir en órbita') {
      st.select(well.key)
      close()
    } else if (opt === 'Anclar espora') {
      st.showToast(`Espora anclada a ${well.name}`)
      close()
    } else {
      well.pending = 0
      st.showToast(`Pulsos de ${well.name} en silencio`)
      close()
    }
    audio.snap()
    haptic.tick()
  }

  return (
    <div className="ae-tear-backdrop" onClick={close}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.7 }}
        style={{
          position: 'absolute',
          left: tear.x,
          top: tear.y,
          width: 4,
          height: 4,
          marginLeft: -2,
          marginTop: -2,
          borderRadius: '50%',
          background: '#9fdcff',
          boxShadow: '0 0 24px 8px rgba(159,220,255,0.6)',
          pointerEvents: 'none',
        }}
      />
      {TEAR_OPTIONS.map((opt, i) => {
        const ang = -Math.PI / 2 + (i / TEAR_OPTIONS.length) * Math.PI * 2 + 0.4
        const R = 104
        const x = tear.x + Math.cos(ang) * R
        const y = tear.y + Math.sin(ang) * R * 0.85
        return (
          <motion.button
            key={opt}
            className="ae-tear-item"
            style={{ left: x, top: y }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring, delay: i * 0.04 }}
            onClick={(e) => {
              e.stopPropagation()
              act(opt)
            }}
          >
            {opt}
          </motion.button>
        )
      })}
    </div>
  )
}

function Orb({
  label,
  value,
  color,
  onNudge,
}: {
  label: string
  value: number
  color: string
  onNudge: (d: number) => void
}) {
  const accX = useRef(0)
  return (
    <div className="ae-orb-row">
      <div
        className="ae-orb"
        onPointerDown={(e) => {
          accX.current = e.clientX
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === 'mouse') return
          const dx = e.clientX - accX.current
          if (Math.abs(dx) > 14) {
            onNudge(Math.sign(dx))
            accX.current = e.clientX
            haptic.tick()
          }
        }}
      >
        <i
          style={{
            background: `radial-gradient(circle at ${50 + value * 40}% 50%, ${color}, transparent 70%)`,
            opacity: 0.35 + Math.abs(value) * 0.65,
          }}
        />
      </div>
      <div>
        <div className="ae-orb-label">{label}</div>
        <div className="ae-orb-value">{Math.round(value * 100)}%</div>
      </div>
    </div>
  )
}

function Pulso() {
  const setPulso = useUiStore((s) => s.setPulso)
  const marea = useUiStore((s) => s.marea)
  const setMarea = useUiStore((s) => s.setMarea)
  const eclipse = useUiStore((s) => s.eclipse)
  const setEclipse = useUiStore((s) => s.setEclipse)
  const exposureBias = useUiStore((s) => s.exposureBias)
  const setExposureBias = useUiStore((s) => s.setExposureBias)
  const volume = useUiStore((s) => s.volume)
  const setVolume = useUiStore((s) => s.setVolume)

  return (
    <motion.div
      className="ae-panel ae-pulso"
      initial={{ x: '106%' }}
      animate={{ x: 0 }}
      exit={{ x: '106%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
    >
      <h2>EL PULSO</h2>
      <Orb
        label="LUMINOSIDAD DE TU LUZ"
        value={exposureBias}
        color="#ffd98a"
        onNudge={(d) => setExposureBias(Math.max(-0.4, Math.min(0.4, exposureBias + d * 0.08)))}
      />
      <Orb
        label="DENSIDAD DEL CORO"
        value={volume}
        color="#59d9ff"
        onNudge={(d) => {
          const v = Math.max(0, Math.min(1, volume + d * 0.1))
          setVolume(v)
          audio.setVolume(v)
        }}
      />
      <div className="ae-switch">
        <span>ECLIPSE</span>
        <div
          className={`ae-pill ${eclipse ? 'on' : ''}`}
          onClick={() => {
            setEclipse(!eclipse)
            audio.duck(eclipse ? 1 : 0.5)
            haptic.tick()
          }}
        >
          <i />
        </div>
      </div>
      <div>
        <div className="ae-orb-label" style={{ marginBottom: 8 }}>
          MAREA
        </div>
        <div className="ae-seg">
          {(['alba', 'pleamar', 'bajamar'] as const).map((m) => (
            <button key={m} className={marea === m ? 'on' : ''} onClick={() => setMarea(m)}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="ae-foot">Desliza los orbes · El Núcleo regula todo lo demás</div>
      <button className="ae-btn" onClick={() => setPulso(false)}>
        CERRAR
      </button>
    </motion.div>
  )
}

function DimensionPanel() {
  const activeId = useUiStore((s) => s.activeId)
  const well = activeId ? WELL_DEFS.find((w) => w.key === activeId) : undefined
  const puente = (window as any).__AE_ABRIR as ((k: string) => void) | undefined
  const yaFue = useRef<string | null>(null)

  /* LA FUSIÓN: si la wallet dejó su puente (__AE_ABRIR), sintonizar un pozo
     ABRE LA APP DE VERDAD. Se le da medio segundo al aterrizaje del tránsito
     para que el ojo lo termine, y la wallet toma el mando. El grid de
     cristales queda solo para el modo standalone.
     
     El salto vive en un efecto y SOLO SE DISPARA UNA VEZ POR CASA. Antes se
     lanzaba en pleno dibujado: cada repintado encolaba otro salto, y al volver
     al Inicio con una casa todavía marcada como abierta, la galaxia entraba
     sola otra vez — la persona quedaba encerrada en la app sin poder salir. */
  useEffect(() => {
    if (!puente || !well) return
    if (yaFue.current === well.key) return
    yaFue.current = well.key
    const reloj = window.setTimeout(() => puente(well.key), 520)
    return () => window.clearTimeout(reloj)
  }, [puente, well])

  useEffect(() => {
    if (!activeId) yaFue.current = null
  }, [activeId])

  if (!activeId || !well) return null
  const arch = ARCHETYPES[well.arch]

  if (puente) {
    const en = (window as any).__AE_LANG === 'en'
    return (
      <motion.div
        className="ae-panel ae-dim"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 0.9, 0.24, 1] }}
      >
        <header>
          <small>{arch.label.toUpperCase()}</small>
        </header>
        <h1>{well.name}</h1>
        <p className="sub">{en ? 'Entering…' : 'Entrando…'}</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="ae-panel ae-dim"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.55, ease: [0.22, 0.9, 0.24, 1] }}
    >
      <header>
        <small>{arch.label.toUpperCase()}</small>
        <button
          className="ae-btn primary"
          style={{ flex: '0 0 auto', padding: '9px 20px' }}
          onClick={() => transit.requestExit()}
        >
          EXHALAR
        </button>
      </header>
      <h1>{well.name}</h1>
      <p className="sub">{well.intent}</p>
      <div className="ae-crystals">
        {MODULES[well.arch].concat(['Intenciones']).map((m, i) => (
          <motion.div
            key={m}
            className="ae-crystal"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 260, damping: 24 }}
          >
            {m}
          </motion.div>
        ))}
      </div>
      <div className="ae-foot">
        Los filamentos mantienen tus otras sintonías vivas · Desliza hacia abajo o pulsa EXHALAR para
        volver
      </div>
    </motion.div>
  )
}
