import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from './sim'
import { useUiStore } from '../state/uiStore'
import { audio } from '../audio/engine'

const HEART_PERIOD = 60 / 52
/* Cuatro segundos: los que pidió José. Es también, y no por casualidad, el
   ritmo de una respiración tranquila de persona. */
const PULSO_PERIOD = 4

export function Kernel() {
  const lastBeat = useRef(0)
  const downStreak = useRef(0)
  const upStreak = useRef(0)
  const lastAdjust = useRef(0)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    sim.dt = dt
    sim.now += dt

    sim.breath = 0.5 + 0.5 * Math.sin((sim.now * Math.PI * 2) / 4.6)

    const phase = (sim.now % HEART_PERIOD) / HEART_PERIOD
    sim.beat = phase < 0.12 ? phase / 0.12 : Math.exp(-(phase - 0.12) * 5.2)

    /* LA RESPIRACIÓN, cada cuatro segundos. Misma forma que el latido pero
       mucho más lenta: sube en medio segundo y baja en tres y medio. Un seno
       daría una onda pareja —eso es un parpadeo—; esto es una inhalación. */
    const fase4 = (sim.now % PULSO_PERIOD) / PULSO_PERIOD
    sim.pulso = fase4 < 0.14 ? fase4 / 0.14 : Math.exp(-(fase4 - 0.14) * 3.1)

    /* El destello se apaga solo, rápido: lo enciende quien lo dispara y no
       tiene que acordarse de bajarlo. */
    if (sim.destello > 0) sim.destello = Math.max(0, sim.destello - dt * 1.9)
    const beatIdx = Math.floor(sim.now / HEART_PERIOD)
    if (beatIdx !== lastBeat.current) {
      lastBeat.current = beatIdx
      sim.beatCount++
      audio.onBeat()
    }

    sim.timeScale = THREE.MathUtils.damp(sim.timeScale, sim.timeScaleT, 5, dt)
    sim.desat = THREE.MathUtils.damp(sim.desat, sim.desatT, 5, dt)
    sim.distort = THREE.MathUtils.damp(sim.distort, sim.distortT, 7, dt)
    const eclTarget = useUiStore.getState().eclipse ? 1 : 0
    sim.eclipseT = eclTarget
    sim.eclipse = THREE.MathUtils.damp(sim.eclipse, eclTarget, 4, dt)

    const ui = useUiStore.getState()
    sim.exposureBias = ui.exposureBias
    sim.expoMul =
      ui.marea === 'alba' ? 1.0 : ui.marea === 'pleamar' ? 0.92 : 0.8
    const exposure =
      1.05 * sim.expoMul * (1 - 0.62 * sim.eclipse) + sim.exposureBias - sim.desat * 0.08
    state.gl.toneMappingExposure = Math.max(0.25, exposure)

    const ms = rawDt * 1000
    sim.frameEma = sim.frameEma * 0.95 + ms * 0.05
    const tier = ui.tier
    if (sim.now - lastAdjust.current > 2) {
      if (sim.frameEma > 19.5) {
        downStreak.current++
        upStreak.current = 0
      } else if (sim.frameEma < 14 && tier < 2) {
        upStreak.current++
        downStreak.current = 0
      } else {
        downStreak.current = 0
        upStreak.current = 0
      }
      if (downStreak.current > 45 && tier > 0) {
        useUiStore.getState().setTier((tier - 1) as 0 | 1 | 2)
        lastAdjust.current = sim.now
        downStreak.current = 0
      } else if (upStreak.current > 200 && tier < 2) {
        useUiStore.getState().setTier((tier + 1) as 0 | 1 | 2)
        lastAdjust.current = sim.now
        upStreak.current = 0
      }
    }
  })

  return null
}

export function QualityWatcher() {
  const tier = useUiStore((s) => s.tier)
  const dprCap = tier === 2 ? 2 : tier === 1 ? 1.75 : 1.25
  useFrame((state) => {
    const cap = Math.min(window.devicePixelRatio || 1, dprCap)
    if (Math.abs(state.viewport.dpr - cap) > 0.01) state.setDpr(cap)
  })
  return null
}
