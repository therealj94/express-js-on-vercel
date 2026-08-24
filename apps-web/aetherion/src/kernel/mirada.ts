import * as THREE from 'three'

/* ADÓNDE MIRA LA PERSONA. Una sola respuesta, para todos.
 *
 * ══ EL FALLO QUE ESTO CIERRA ══════════════════════════════════════════════
 *
 * Con el visor puesto hay DOS orientaciones distintas y es fácil confundirlas:
 *
 *   · la de la CÁMARA de la escena, que la mueve el timón —arrastrar con el
 *     dedo, orbitar, la película—; y
 *   · la de la CABEZA, que la mueve el giroscopio del teléfono.
 *
 * Lo que la persona ve es la composición de las dos: `cuerpo = cámara × cabeza`.
 * El Visor la calcula bien y con ella dibuja los dos ojos. Pero todo lo que
 * tiene que aparecer DELANTE DE LA CARA —las letras de la historia, el botón
 * del pórtico, la retícula— se estaba colocando usando la orientación de la
 * cámara a secas.
 *
 * Con la cabeza quieta las dos coinciden y no se nota nada. En cuanto alguien
 * gira la cabeza —o sea, siempre, porque para eso es un visor— las letras se
 * quedan clavadas donde apunta el timón y la persona mira hacia otro lado. No
 * es que no se dibujaran: es que estaban fuera de la vista. Por eso «se puso el
 * visor y no salían las letras», y por eso la retícula apuntaba a un planeta
 * distinto del que se estaba mirando.
 *
 * En pantalla el fallo es invisible, y en una prueba de escritorio también: sin
 * giroscopio, `cabeza` es la identidad y las dos orientaciones son la misma. Un
 * visor de verdad es el único sitio donde se ve.
 *
 * ══ CÓMO SE CIERRA ════════════════════════════════════════════════════════
 *
 * El Visor publica aquí la pose compuesta en cada cuadro, y cualquiera que
 * necesite saber hacia dónde mira la persona lo pregunta aquí en vez de
 * deducirlo por su cuenta. Una sola fuente: si mañana aparece otra manera de
 * mover la cabeza, se arregla en un sitio y no en cinco.
 *
 * Con un visor de VERDAD (WebXR) esto se queda apagado a propósito: ahí es el
 * propio motor el que mete la pose del casco dentro de la cámara de la escena,
 * así que la cámara YA es la cabeza y preguntarle a ella es lo correcto.
 */
export const MIRADA = {
  /* Solo en cartón y 360, donde la composición la hacemos nosotros. */
  activa: false,
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
}

/** Deja en `pos` y `quat` la pose desde la que se está mirando de verdad. */
export function poseMirada(
  camara: THREE.Camera,
  pos: THREE.Vector3,
  quat: THREE.Quaternion,
): void {
  if (MIRADA.activa) {
    pos.copy(MIRADA.pos)
    quat.copy(MIRADA.quat)
  } else {
    pos.copy(camara.position)
    quat.copy(camara.quaternion)
  }
}

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()

/** El rayo que sale de los ojos hacia adelante. Es lo que hay que usar para
 *  preguntar «¿qué tengo en el centro de la vista?»: dentro de un visor no hay
 *  puntero y el centro de la pantalla no significa nada —la pantalla está
 *  partida en dos mitades—, así que la pregunta se hace con el rayo, no con
 *  coordenadas. */
export function rayoMirada(camara: THREE.Camera, rayo: THREE.Ray): THREE.Ray {
  poseMirada(camara, tmpPos, tmpQuat)
  rayo.origin.copy(tmpPos)
  rayo.direction.set(0, 0, -1).applyQuaternion(tmpQuat).normalize()
  return rayo
}

/* UNA VENTANITA PARA MIRAR ESTO DESDE FUERA.
 *
 * Dentro de un visor casi nada se puede comprobar con una captura de pantalla:
 * la imagen está partida en dos y lo que importa —hacia dónde apunta la
 * cabeza— no se ve en los píxeles. Sin esto, «la puntería no encuentra nada»
 * no se distingue de «no hay nada donde estás mirando», y son dos problemas
 * completamente distintos. */
if (typeof window !== 'undefined') {
  (window as any).__AE_DIAG_MIRA = () => {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(MIRADA.quat)
    return {
      activa: MIRADA.activa,
      desde: MIRADA.pos.toArray().map((n) => Math.round(n * 10) / 10),
      hacia: dir.toArray().map((n) => Math.round(n * 100) / 100),
      /* Cuánto se aparta del centro de la galaxia: si esto es chico, se está
         mirando al sol —donde no hay casas— y no encontrar nada es correcto. */
      grados: Math.round(
        (Math.acos(Math.max(-1, Math.min(1,
          dir.dot(MIRADA.pos.clone().negate().normalize())))) * 180) / Math.PI),
    }
  }
}
