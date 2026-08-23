import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { rig } from './rig'

/* EL ENCUADRE Y EL MANDO.
 *
 * Dos cosas que la galaxia necesitaba y no tenía:
 *
 *  1. Que el cielo se ajuste a la pantalla. Un monitor ancho y un teléfono de
 *     pie no ven el mismo campo: en vertical el ángulo horizontal es angosto y
 *     las casas se salían por los lados. La cámara abre un poco el ángulo en
 *     vertical y se pone a la distancia mínima donde el anillo entero entra.
 *  2. Un mando que la casa pueda tocar: window.__AE_VISTA lo usan los botones
 *     de acercar y alejar, el teclado y la mano en el aire de AIR TOUCH.
 */
export function Encuadre() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)

  useEffect(() => {
    const vertical = size.height > size.width
    camera.fov = vertical ? 74 : 62
    camera.updateProjectionMatrix()

    const antes = rig.reposo
    const reposo = rig.encuadrar(camera)
    /* Si la persona ya había acercado o alejado, se le respeta LA PROPORCIÓN:
       cambiar de horizontal a vertical no le deshace su encuadre. */
    const proporcion = antes > 0 ? rig.tRadius / antes : 1
    rig.tRadius = THREE.MathUtils.clamp(reposo * proporcion, rig.cerca, rig.lejos)
  }, [camera, size.width, size.height])

  useEffect(() => {
    const w = window as any
    w.__AE_VISTA = {
      acercar: () => rig.zoomPaso(1),
      alejar: () => rig.zoomPaso(-1),
      /* factor > 1 aleja, < 1 acerca: es el mismo lenguaje del pellizco */
      zoom: (factor: number) => rig.zoomBy(factor),
      girar: (dx: number, dy: number) => rig.orbit(dx, dy),
      recentrar: () => rig.recentrar(),
      estado: () => ({
        radio: rig.radius, objetivo: rig.tRadius, reposo: rig.reposo,
        libre: rig.enabled, cerca: rig.cerquita, lejos: rig.lejitos,
      }),
    }
    return () => { delete w.__AE_VISTA }
  }, [])

  return null
}
