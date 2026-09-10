import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { espacio } from './espacio'
import { audio } from './engine'
import { wellRegistry } from '../sky/Wells'
import { sim } from '../kernel/sim'
import { useUiStore } from '../state/uiStore'
import { transit } from '../transit/transit'

/* EL PLANO ESPACIAL, cuadro a cuadro.
 *
 * El oído va donde va la cámara QUE DIBUJA — en el visor, la del ojo; en la
 * pantalla, la de siempre — y cada mundo empuja su voz desde su posición
 * real, también mientras el acomodo los lleva de la dispersión a la órbita.
 * Elegir un mundo hace sonar su campanita DESDE el mundo, no desde el centro
 * de la cabeza. Y el sol solo zumba mientras AU-RA habla.
 */
export function Espacial() {
  const eleccion = useRef<string | null>(null)
  const pos = useRef(new THREE.Vector3())

  useFrame((state) => {
    // sin contexto todavía (nadie tocó nada): no hay nada que mover
    if (!audio.contexto) return
    espacio.oido(state.camera)

    /* En pleno tránsito las voces molestan al zarpe: se apagan y vuelven al
       aterrizar de vuelta en el cielo. */
    const mudo = transit.active
    wellRegistry.forEach((h, id) => {
      espacio.mundo(id, h.def.natura, h.getPos(), mudo)
    })

    espacio.solHabla(sim.auraBrillo)

    // la campanita posicional de elegir: una vez por elección, desde el mundo
    const sel = useUiStore.getState().selectedId
    if (sel !== eleccion.current) {
      eleccion.current = sel
      if (sel) {
        const h = wellRegistry.get(sel)
        if (h) {
          pos.current.copy(h.getPos())
          espacio.toque(pos.current, 540 + (h.def.scale ?? 1) * 160)
        }
      }
    }
  })

  // al desmontar la galaxia, el espacio calla sin cortes
  useEffect(() => () => espacio.callar(), [])

  return null
}
