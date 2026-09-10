import * as THREE from 'three'
import { sim, clamp, norm, easeInOut, easeOutCubic, easeOutBack } from '../kernel/sim'
import { UP, rig } from '../kernel/rig'
import { wellRegistry } from '../sky/Wells'
import { getRadialTexture } from '../sky/textures'
import { useUiStore } from '../state/uiStore'
import { audio, haptic } from '../audio/engine'

const ENTER_MS = 1650
const EXIT_MS = 1250

export class Burst {
  readonly N = 600
  pos: Float32Array
  vel: Float32Array
  life: Float32Array
  geometry: THREE.BufferGeometry
  material: THREE.PointsMaterial
  points: THREE.Points

  constructor() {
    this.pos = new Float32Array(this.N * 3).fill(-9999)
    this.vel = new Float32Array(this.N * 3)
    this.life = new Float32Array(this.N)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.material = new THREE.PointsMaterial({
      size: 0.16,
      map: getRadialTexture(),
      color: new THREE.Color('#bfe6ff'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
  }

  emit(
    origin: THREE.Vector3,
    count: number,
    opts: {
      speed: number
      dir?: THREE.Vector3
      jitter?: number
      radial?: boolean
      radialCenter?: THREE.Vector3
    }
  ) {
    let placed = 0
    for (let i = 0; i < this.N && placed < count; i++) {
      if (this.life[i] > 0) continue
      const j = opts.jitter ?? 0.12
      this.pos[i * 3] = origin.x + (Math.random() - 0.5) * j
      this.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * j
      this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * j
      let vx: number, vy: number, vz: number
      if (opts.radial && opts.radialCenter) {
        vx = this.pos[i * 3] - opts.radialCenter.x
        vy = this.pos[i * 3 + 1] - opts.radialCenter.y
        vz = this.pos[i * 3 + 2] - opts.radialCenter.z
        const l = Math.hypot(vx, vy, vz) || 1
        const sp = opts.speed * (0.5 + Math.random())
        vx = (vx / l) * sp
        vy = (vy / l) * sp
        vz = (vz / l) * sp
      } else if (opts.dir) {
        const sp = opts.speed * (0.5 + Math.random())
        vx = opts.dir.x * sp + (Math.random() - 0.5) * opts.speed * 0.25
        vy = opts.dir.y * sp + (Math.random() - 0.5) * opts.speed * 0.25
        vz = opts.dir.z * sp + (Math.random() - 0.5) * opts.speed * 0.25
      } else {
        const a = Math.random() * Math.PI * 2
        const b = Math.acos(2 * Math.random() - 1)
        const sp = opts.speed * (0.4 + Math.random())
        vx = Math.sin(b) * Math.cos(a) * sp
        vy = Math.cos(b) * sp
        vz = Math.sin(b) * Math.sin(a) * sp
      }
      this.vel[i * 3] = vx
      this.vel[i * 3 + 1] = vy
      this.vel[i * 3 + 2] = vz
      this.life[i] = 0.45 + Math.random() * 0.35
      placed++
    }
  }

  update(dt: number) {
    let alive = 0
    let minLife = 1
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue
      alive++
      this.life[i] -= dt
      minLife = Math.min(minLife, this.life[i])
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -9999
    }
    this.material.opacity = alive > 0 ? clamp(minLife / 0.3, 0, 1) * 0.85 : 0
    ;(this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
}

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpLook = new THREE.Vector3()

class Transit {
  active = false
  mode: 'enter' | 'exit' | null = null
  wid: string | null = null
  private t0 = 0
  private curve: THREE.CatmullRomCurve3 | null = null
  private lookFrom = new THREE.Vector3()
  private lookTo = new THREE.Vector3()
  private enterStart = new THREE.Vector3()
  private hoverPos = new THREE.Vector3()
  private nudgePos = new THREE.Vector3()
  private fired = new Set<string>()
  readonly burst = new Burst()
  private insideAngle = 0
  private enterDur = ENTER_MS
  private exitDur = EXIT_MS
  exitRequested = false

  requestExit() {
    this.exitRequested = true
  }

  beginEnter(wid: string, cam: THREE.PerspectiveCamera) {
    if (this.active || useUiStore.getState().activeId) return
    const handle = wellRegistry.get(wid)
    if (!handle) return
    useUiStore.getState().closeTear()
    this.active = true
    this.mode = 'enter'
    this.wid = wid
    this.fired.clear()
    this.t0 = performance.now()
    this.enterDur = sim.reducedMotion ? 1150 : ENTER_MS
    rig.enabled = false

    const wp = handle.getPos().clone()
    const dir = wp.clone().sub(cam.position).normalize()
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize()
    this.enterStart.copy(cam.position)
    this.hoverPos.copy(wp).addScaledVector(dir, -(handle.radius + 1.3))
    this.nudgePos.copy(wp).addScaledVector(dir, -handle.radius * 0.55)
    const mid = this.enterStart.clone().lerp(this.hoverPos, 0.42).addScaledVector(side, 1.5)
    mid.y += 0.7
    this.curve = new THREE.CatmullRomCurve3(
      [this.enterStart.clone(), mid, this.hoverPos.clone()],
      false,
      'catmullrom',
      0.35
    )
    this.lookFrom.set(0, 0.4, 0)
    this.lookTo.copy(wp)

    audio.prep()
    haptic.tick()
  }

  beginExitFrom(cam: THREE.PerspectiveCamera) {
    const st = useUiStore.getState()
    if (!st.activeId || this.active) return
    const handle = wellRegistry.get(st.activeId)
    if (!handle) {
      st.setActive(null)
      return
    }
    this.active = true
    this.mode = 'exit'
    this.wid = st.activeId
    this.fired.clear()
    this.t0 = performance.now()
    this.exitDur = sim.reducedMotion ? 850 : EXIT_MS

    const start = cam.position.clone()
    const mid = start.clone().lerp(this.hoverPos, 0.5)
    mid.y += 0.4
    this.curve = new THREE.CatmullRomCurve3(
      [start, this.hoverPos.clone(), this.enterStart.clone()],
      false,
      'catmullrom',
      0.35
    )
    this.lookFrom.copy(handle.getPos())
    this.lookTo.set(0, 0.4, 0)

    audio.whoosh(false)
    haptic.ramp(160)
    this.burst.emit(handle.getPos(), 130, {
      speed: 2.4,
      radial: true,
      radialCenter: handle.getPos(),
      jitter: handle.radius,
    })
  }

  private cue(name: string, atMs: number, e: number, fn: () => void) {
    if (e >= atMs && !this.fired.has(name)) {
      this.fired.add(name)
      fn()
    }
  }

  update(now: number, cam: THREE.PerspectiveCamera, dt: number) {
    if (!this.active || !this.curve || !this.mode || !this.wid) return
    this.burst.update(dt)
    const e = now - this.t0
    const handle = wellRegistry.get(this.wid)
    if (!handle) return

    if (this.mode === 'enter') {
      const s = this.enterDur / ENTER_MS
      const th = (ms: number) => ms * s

      let prog = 0
      if (e < th(120)) prog = 0
      else if (e < th(450)) prog = 0.55 * easeInOut(norm(e, th(120), th(450)))
      else prog = 0.55 + 0.45 * easeInOut(norm(e, th(450), th(900)))

      sim.timeScaleT = THREE.MathUtils.lerp(1, 0.2, norm(e, th(150), th(430)))
      sim.desatT = 0.16 * norm(e, th(200), th(600))

      const atmo = handle.atmo.uniforms
      if (e > th(380)) {
        atmo.uDensity.value = THREE.MathUtils.damp(atmo.uDensity.value, 1.35, 6, dt)
        atmo.uBoost.value = THREE.MathUtils.damp(atmo.uBoost.value, 0.8, 6, dt)
      }

      sim.edge = Math.sin(Math.PI * norm(e, th(400), th(1080)))
      sim.distortT = 0.08 + 0.34 * Math.sin(Math.PI * norm(e, th(430), th(1180)))
      cam.fov = THREE.MathUtils.damp(
        cam.fov,
        62 + 9 * Math.sin(Math.PI * norm(e, th(430), th(1150))),
        10,
        dt
      )

      sim.iris = norm(e, th(900), th(1070)) * (1 - norm(e, th(1140), th(1330)))

      this.cue('whoosh', th(440), e, () => {
        audio.whoosh(true)
        haptic.ramp(220)
      })

      if (e > th(470) && e < th(1020) && Math.random() < 0.75) {
        const dirToWell = tmpA.copy(this.lookTo).sub(cam.position).normalize()
        tmpB.copy(cam.position).addScaledVector(dirToWell, 0.5)
        this.burst.emit(tmpB, 5, { speed: 5.5, dir: dirToWell, jitter: 0.9 })
      }

      this.cue('land', th(1290), e, () => {
        audio.land()
        haptic.thud()
      })

      cam.position.copy(this.curve.getPoint(prog))
      if (e > th(1280)) {
        const k = easeOutBack(norm(e, th(1280), this.enterDur - 40))
        cam.position.lerp(this.nudgePos, clamp(k, 0, 1))
      }
      tmpLook.copy(this.lookFrom).lerp(this.lookTo, easeInOut(norm(e, th(110), th(720))))
      cam.up.set(0, 1, 0)
      cam.lookAt(tmpLook)
      cam.updateProjectionMatrix()

      if (e >= this.enterDur) this.finishEnter()
    } else {
      const s = this.exitDur / EXIT_MS
      const th = (ms: number) => ms * s

      sim.iris = Math.sin(Math.PI * clamp(norm(e, 20, th(300)), 0, 1)) * 0.45
      sim.distortT = 0.1 * (1 - norm(e, 0, th(700)))
      sim.edge = Math.sin(Math.PI * norm(e, 0, th(420))) * 0.5

      const prog = easeOutCubic(norm(e, th(70), th(1040)))
      cam.position.copy(this.curve.getPoint(prog))
      tmpLook.copy(this.lookFrom).lerp(this.lookTo, norm(e, th(560), th(1120)))
      cam.up.set(0, 1, 0)
      cam.lookAt(tmpLook)
      cam.fov = THREE.MathUtils.damp(cam.fov, 62, 6, dt)
      cam.updateProjectionMatrix()

      sim.timeScaleT = THREE.MathUtils.lerp(0.2, 1, norm(e, th(560), th(1100)))
      sim.desatT = 0.32 * (1 - norm(e, th(480), th(1000)))

      const atmo = handle.atmo.uniforms
      atmo.uDensity.value = THREE.MathUtils.damp(atmo.uDensity.value, 0.5, 4, dt)
      atmo.uBoost.value = THREE.MathUtils.damp(atmo.uBoost.value, 0, 4, dt)

      if (e >= this.exitDur) this.finishExit(cam)
    }
  }

  private finishEnter() {
    sim.iris = 0
    sim.edge = 0
    sim.distortT = 0.05
    sim.desatT = 0.32
    sim.timeScaleT = 0.2
    const st = useUiStore.getState()
    st.select(null)
    const wid = this.wid!
    st.setActive(wid)
    const handle = wellRegistry.get(wid)
    if (handle) {
      const c = handle.getPos()
      this.insideAngle = Math.atan2(this.nudgePos.z - c.z, this.nudgePos.x - c.x)
    }
    this.mode = null
    /* ══ Y EL VIAJE SE DA POR TERMINADO ════════════════════════════════════
     *
     * Esto faltaba, y dejaba al motor SIN CAMINO DE VUELTA. `active` quedaba
     * encendido para siempre después de entrar en un mundo, y de ahí salían
     * tres cosas muertas que parecían vivas:
     *
     *   · `beginExitFrom` empieza con «si ya hay un viaje en curso, no» — así
     *     que pedir la salida (requestExit) no hacía absolutamente nada. Ni el
     *     arrastre hacia abajo para salir de una casa, ni `AUGALAXY.exhalar()`.
     *   · `insideOrbit` —la deriva lenta alrededor del mundo en el que uno
     *     está— cuelga de la rama `else` de ese mismo interruptor: nunca corría.
     *   · y `update()` se iba en la primera línea por falta de `mode`, así que
     *     `active` encendido no estaba moviendo nada. Era una luz de ocupado
     *     sobre una habitación vacía.
     *
     * No se notaba porque la wallet nunca dependía de esto: al volver al Inicio
     * remontaba la galaxia entera de cero. Con el visor puesto no hay remonte
     * —la galaxia es lo único que hay— y volver tiene que ser un viaje de
     * verdad. Ver kernel/Casa.tsx.
     */
    this.active = false
  }

  private finishExit(cam: THREE.PerspectiveCamera) {
    sim.iris = 0
    sim.edge = 0
    sim.distortT = 0
    sim.desatT = 0
    sim.timeScaleT = 1
    useUiStore.getState().setActive(null)
    rig.resync(cam)
    rig.enabled = true
    this.active = false
    this.mode = null
    this.wid = null
    this.curve = null
    audio.commit()
    haptic.commit()
  }

  insideOrbit(cam: THREE.PerspectiveCamera, dt: number) {
    const st = useUiStore.getState()
    if (!st.activeId) return
    const handle = wellRegistry.get(st.activeId)
    if (!handle) return
    this.burst.update(dt)
    this.insideAngle += dt * 0.05
    const c = handle.getPos()
    const r = handle.radius + 2.15
    tmpA.set(
      c.x + Math.cos(this.insideAngle) * r,
      c.y + 0.55,
      c.z + Math.sin(this.insideAngle) * r
    )
    cam.position.lerp(tmpA, 1 - Math.exp(-3 * dt))
    cam.up.set(0, 1, 0)
    cam.lookAt(c)
  }
}

export const transit = new Transit()
