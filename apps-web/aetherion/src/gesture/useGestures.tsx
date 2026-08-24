import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { rig } from '../kernel/rig'
import { MIRADA, rayoMirada } from '../kernel/mirada'
import { transit } from '../transit/transit'
import { wellRegistry, WELL_DEFS } from '../sky/Wells'
import { useUiStore } from '../state/uiStore'
import { audio, haptic } from '../audio/engine'

interface Ptr {
  x: number
  y: number
  sx: number
  sy: number
  t: number
}

export function GestureLayer() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const ptrs = new Map<number, Ptr>()
    let longTimer: number | null = null
    let lastTapId: string | null = null
    let lastTapTime = 0
    let edgeIntent = false
    let pinchDist = 0
    let twoFingerStartY = 0
    let mareaFired = false

    const rect = () => el.getBoundingClientRect()

    const toNdc = (x: number, y: number) => {
      const r = rect()
      ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1))
      return ndc
    }

    /* ¿El toque cayó sobre AU-RA? El corazón de la galaxia no es una casa: no
       se entra, se la llama. La wallet deja su puente en window.__AE_AURA. */
    const tocaAura = (x: number, y: number): boolean => {
      const nucleo = (window as any).__AE_NUCLEO as { r: number } | undefined
      if (!nucleo) return false
      raycaster.setFromCamera(toNdc(x, y), camera)
      const esfera = new THREE.Sphere(new THREE.Vector3(0, 0, 0), nucleo.r * 1.35)
      return raycaster.ray.intersectsSphere(esfera)
    }

    const delRayo = (): string | null => {
      const targets: THREE.Object3D[] = []
      wellRegistry.forEach((h) => targets.push(h.hit))
      const hits = raycaster.intersectObjects(targets, false)
      for (const h of hits) {
        const id = (h.object.userData as { wellId?: string }).wellId
        if (id) return id
      }
      return null
    }

    const pickWell = (x: number, y: number): string | null => {
      raycaster.setFromCamera(toNdc(x, y), camera)
      return delRayo()
    }

    /* La misma pregunta, pero desde los ojos: es la que vale con el visor
       puesto. Ver kernel/mirada.ts. */
    const pickRayo = (): string | null => {
      rayoMirada(camera, raycaster.ray)
      raycaster.near = 0
      raycaster.far = Infinity
      return delRayo()
    }

    const clearLong = () => {
      if (longTimer !== null) {
        window.clearTimeout(longTimer)
        longTimer = null
      }
    }

    const onDown = (e: PointerEvent) => {
      audio.ensure()
      audio.startAmbient()
      /* La captura falla —y REVIENTA— con un puntero sintético: AIR TOUCH
         manda eventos con un id que el navegador no conoce, y esa excepción
         se llevaba por delante el resto del gesto. Por eso pellizcar y
         arrastrar no giraba nada. */
      try { el.setPointerCapture?.(e.pointerId) } catch { /* puntero de aire */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() })
      edgeIntent = e.clientX > rect().right - rect().width * 0.14
      sim.pointer.copy(toNdc(e.clientX, e.clientY))
      sim.pointerMovedAt = sim.now

      const st = useUiStore.getState()
      if (!st.activeId && !transit.active && ptrs.size === 1) {
        clearLong()
        const x = e.clientX
        const y = e.clientY
        longTimer = window.setTimeout(() => {
          const id = pickWell(x, y)
          if (id) {
            const r = rect()
            st.openTear(x - r.left, y - r.top, id)
            audio.snap()
            haptic.tick()
          }
        }, 420)
      }

      if (ptrs.size === 2) {
        clearLong()
        const [a, b] = [...ptrs.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        twoFingerStartY = (a.y + b.y) / 2
        mareaFired = false
      }
    }

    const onMove = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId)
      if (!p) {
        sim.pointer.copy(toNdc(e.clientX, e.clientY))
        sim.pointerMovedAt = sim.now
        return
      }
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      sim.pointer.copy(toNdc(e.clientX, e.clientY))
      sim.pointerMovedAt = sim.now

      const st = useUiStore.getState()
      if (ptrs.size === 1 && !transit.active) {
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 10) {
          clearLong()
          /* ARRASTRAR LE GANA AL MENÚ. Si la mano se quedó quieta un momento
             antes de moverse, el menú radial ya se abrió; en cuanto se ve que
             la intención era GIRAR, el menú se retira solo. Antes se quedaba
             abierto y se comía el gesto. */
          if (st.tear.open) st.closeTear()
        }
        if (st.activeId) {
          if (dy > 60 && Math.abs(dy) > Math.abs(dx)) {
            ptrs.delete(e.pointerId)
            transit.requestExit()
          }
        } else if (edgeIntent) {
          if (dx < -36) {
            edgeIntent = false
            st.setPulso(true)
          }
        } else {
          rig.orbit(dx, dy)
        }
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0 && !st.activeId) {
          rig.zoomBy(pinchDist / d)
        }
        pinchDist = d
        const avgY = (a.y + b.y) / 2
        if (!mareaFired && Math.abs(avgY - twoFingerStartY) > 70) {
          st.cycleMarea(avgY < twoFingerStartY ? 1 : -1)
          mareaFired = true
          audio.sparkle()
          haptic.tick()
        }
      }
    }

    const onUp = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId)
      ptrs.delete(e.pointerId)
      clearLong()
      if (!p) return
      const st = useUiStore.getState()
      const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy)
      const dt = performance.now() - p.t

      if (ptrs.size === 0 && !transit.active && !st.activeId) {
        if (moved < 10 && dt < 260) {
          const id = pickWell(e.clientX, e.clientY)
          if (!id && tocaAura(e.clientX, e.clientY)) {
            const llamar = (window as any).__AE_AURA as (() => void) | undefined
            if (llamar) {
              audio.select(0.6)
              haptic.tick()
              llamar()
              return
            }
          }
          const now = performance.now()
          if (id && id === lastTapId && now - lastTapTime < 340) {
            transit.beginEnter(id, camera as THREE.PerspectiveCamera)
            audio.commit()
            haptic.commit()
            lastTapId = null
          } else {
            if (id) {
              audio.select(0.5)
              haptic.tick()
            }
            st.select(id)
            lastTapId = id
            lastTapTime = now
          }
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (useUiStore.getState().activeId || transit.active) return
      e.preventDefault()
      /* El trackpad manda pasos chicos y el ratón manda saltos: el mismo gesto
         tiene que acercar lo mismo en los dos, así que el salto se limita. */
      const d = Math.max(-120, Math.min(120, e.deltaY))
      rig.zoomBy(Math.exp(d * 0.0022))
    }

    /* Doble clic en el vacío: volver al encuadre de la casa. Es la salida de
       emergencia de quien se perdió girando. */
    const onDoble = (e: MouseEvent) => {
      const st2 = useUiStore.getState()
      if (st2.activeId || transit.active) return
      if (!pickWell(e.clientX, e.clientY)) rig.recentrar()
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault()
    }

    const onKey = (e: KeyboardEvent) => {
      const st = useUiStore.getState()
      if (e.key === 'Escape') {
        if (st.tear.open) st.closeTear()
        else if (st.pulsoOpen) st.setPulso(false)
        else if (st.activeId) transit.requestExit()
        else st.select(null)
      }
      if (e.key === 'e' || e.key === 'E') st.setEclipse(!st.eclipse)
      /* El teclado también manda: no todo el mundo usa rueda ni pellizco, y
         con el foco puesto en el cielo estas teclas son el timón. */
      if (st.activeId || transit.active) return
      if (e.key === '+' || e.key === '=') rig.zoomPaso(1)
      if (e.key === '-' || e.key === '_') rig.zoomPaso(-1)
      if (e.key === '0') rig.recentrar()
      const paso = 26
      if (e.key === 'ArrowLeft') rig.orbit(-paso, 0)
      if (e.key === 'ArrowRight') rig.orbit(paso, 0)
      if (e.key === 'ArrowUp') rig.orbit(0, -paso)
      if (e.key === 'ArrowDown') rig.orbit(0, paso)
    }

    /* ── EL PUENTE CON AIR TOUCH ──────────────────────────────────────────
       La mano en el aire no puede «pasar por encima» de un planeta como un
       ratón: aquí se le da a la casa una forma de PREGUNTAR qué hay bajo un
       punto de la pantalla, resaltarlo y abrirlo. Con eso, la mirada y el
       doble pellizco funcionan sobre la galaxia igual que sobre un botón. */
    const w = window as any
    w.__AE_MIRAR = (x: number, y: number) => {
      if (useUiStore.getState().activeId || transit.active) return null
      /* CON EL VISOR PUESTO NO SE PREGUNTA POR COORDENADAS.
       *
       * La pantalla está partida en dos mitades, una por ojo, así que «el
       * centro de la pantalla» no es el centro de la vista de nadie: cae en la
       * juntura, entre los dos ojos. Y peor: proyectar por la cámara de la
       * escena ignora la cabeza, que es justo lo que mueve la vista dentro del
       * visor. Las dos cosas juntas daban una puntería que señalaba un planeta
       * y abría otro.
       *
       * Con el visor puesto la pregunta correcta es geométrica: el rayo que
       * sale de los ojos hacia adelante, y qué se cruza en su camino. */
      const id = MIRADA.activa ? pickRayo() : pickWell(x, y)
      if (!id) return null
      const def = WELL_DEFS.find((d) => d.key === id)
      return { key: id, nombre: def?.name || id }
    }
    /* POR QUÉ LA PUNTERÍA NO ENCUENTRA NADA. Con el visor puesto no hay forma
       de mirar esto por la pantalla, y «no encuentra» tiene cuatro causas muy
       distintas: hay una casa abierta, hay un vuelo en curso, no hay blancos
       registrados, o el rayo apunta a un sitio vacío. Distinguirlas a ojo es
       imposible; aquí se dicen. */
    w.__AE_DIAG_PICK = () => {
      const st3 = useUiStore.getState()
      rayoMirada(camera, raycaster.ray)
      raycaster.near = 0
      raycaster.far = Infinity
      const targets: THREE.Object3D[] = []
      wellRegistry.forEach((h) => targets.push(h.hit))
      const hits = raycaster.intersectObjects(targets, false)
      return {
        casaAbierta: st3.activeId || null,
        volando: transit.active,
        blancos: targets.length,
        visibles: targets.filter((t) => t.visible).length,
        choques: hits.length,
        primero: (hits[0]?.object.userData as { wellId?: string })?.wellId || null,
        desde: raycaster.ray.origin.toArray().map((n) => Math.round(n * 10) / 10),
        hacia: raycaster.ray.direction.toArray().map((n) => Math.round(n * 100) / 100),
      }
    }
    w.__AE_RESALTAR = (id: string | null) => {
      const st2 = useUiStore.getState()
      if (st2.activeId || transit.active) return
      if (st2.selectedId !== id) st2.select(id)
    }
    w.__AE_TOCAR = (id: string) => {
      const st2 = useUiStore.getState()
      if (st2.activeId || transit.active) return
      if (!wellRegistry.has(id)) return
      st2.select(id)
      transit.beginEnter(id, camera as THREE.PerspectiveCamera)
      audio.commit()
      haptic.commit()
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDoble)
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKey)

    return () => {
      delete w.__AE_MIRAR
      delete w.__AE_RESALTAR
      delete w.__AE_TOCAR
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDoble)
      el.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
      clearLong()
    }
  }, [gl, camera])

  return null
}
