import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { GALAXY } from '../sky/galaxy'
import { WELL_DEFS } from '../sky/Wells'
import { samplePath } from '../sky/lattice'
import { getRadialTexture } from '../sky/textures'
import { useUiStore } from '../state/uiStore'
import { audio, haptic } from '../audio/engine'

interface Pulse {
  active: boolean
  pathIdx: number
  t: number
  target: number
  speed: number
  wellKey: string
  urgent: boolean
}

class PulsePool {
  pulses: Pulse[]
  pos: Float32Array
  geometry: THREE.BufferGeometry
  material: THREE.PointsMaterial
  points: THREE.Points

  constructor(n: number, color: string, size: number) {
    this.pulses = Array.from({ length: n }, () => ({
      active: false,
      pathIdx: 0,
      t: 0,
      target: 1,
      speed: 0.5,
      wellKey: '',
      urgent: false,
    }))
    this.pos = new Float32Array(n * 3).fill(-9999)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.material = new THREE.PointsMaterial({
      size,
      map: getRadialTexture(),
      color: new THREE.Color(color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.95,
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
  }

  spawn(pulse: Omit<Pulse, 'active' | 't'>): boolean {
    const p = this.pulses.find((q) => !q.active)
    if (!p) return false
    Object.assign(p, pulse, { active: true, t: 0 })
    return true
  }

  update(dt: number, onArrive: (p: Pulse) => void) {
    const v = new THREE.Vector3()
    for (let i = 0; i < this.pulses.length; i++) {
      const p = this.pulses[i]
      if (!p.active) continue
      p.t += p.speed * dt
      if (p.t >= p.target) {
        p.active = false
        this.pos[i * 3 + 1] = -9999
        onArrive(p)
        continue
      }
      samplePath(GALAXY.paths[p.pathIdx], p.t, v)
      this.pos[i * 3] = v.x
      this.pos[i * 3 + 1] = v.y
      this.pos[i * 3 + 2] = v.z
    }
    ;(this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
}

function arrive(p: Pulse, st: ReturnType<typeof useUiStore.getState>) {
  const well = WELL_DEFS.find((w) => w.key === p.wellKey)
  if (!well) return
  if (well.arch === 'binary' || well.arch === 'torus') {
    well.pending = Math.min(9, well.pending + 1)
  }
  if (p.urgent) {
    st.showToast(`Pulso urgente · ${well.name}`, true)
    audio.chime(true)
    haptic.alert()
  } else {
    if (Math.random() < 0.35) st.showToast(`${well.name} · nuevo pulso`)
    audio.chime(false)
    haptic.tick()
  }
}

export function Pulses() {
  const calm = useMemo(() => new PulsePool(16, '#9fdcff', 0.55), [])
  const urgentPool = useMemo(() => new PulsePool(6, '#ffd98a', 0.8), [])
  const nextSpawn = useRef(4)

  useFrame((_, dt) => {
    nextSpawn.current -= dt
    if (nextSpawn.current <= 0) {
      nextSpawn.current = 5 + Math.random() * 8
      const isUrgent = Math.random() < 0.18
      /* Dentro de la wallet no se inventan avisos: un pulso viajando hacia
         un pozo se lee como una notificación, y la casa no fabrica datos.
         En standalone quedan como demo del mecanismo. */
      if ((window as any).__AE_ABRIR) return
      const well = WELL_DEFS[Math.floor(Math.random() * WELL_DEFS.length)]
      const dur = isUrgent ? 0.9 : 1.8 + Math.random() * 0.8
      const pool = isUrgent ? urgentPool : calm
      pool.spawn({
        pathIdx: well.pathIdx,
        target: Math.min(0.999, well.t),
        speed: Math.min(0.999, well.t) / dur,
        wellKey: well.key,
        urgent: isUrgent,
      })
    }

    const st = useUiStore.getState()
    calm.update(dt, (p) => arrive(p, st))
    urgentPool.update(dt, (p) => arrive(p, st))
  })

  return (
    <>
      <primitive object={calm.points} />
      <primitive object={urgentPool.points} />
    </>
  )
}
