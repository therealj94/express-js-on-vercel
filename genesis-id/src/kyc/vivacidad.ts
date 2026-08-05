// Prueba de vida por reto y respuesta.
//
// EL PROBLEMA QUE RESUELVE
//
// Comparar dos rostros es la parte fácil y está resuelta. Lo que de verdad
// defiende una verificación de identidad es responder a otra pregunta: ¿hay una
// persona delante de la cámara, ahora, o me están enseñando una foto de esa
// persona? Sin eso, cualquiera con una imagen sacada de una red social pasa el
// cotejo con nota alta, porque el rostro ES el correcto.
//
// COMO FUNCIONA
//
// El servidor emite un reto: una secuencia de gestos elegida al azar en el
// momento, distinta cada vez y con caducidad corta. La app graba un fotograma
// por gesto y los devuelve en orden. El servidor comprueba, gesto a gesto, que
// el rostro hizo lo que se le pidió, en el orden que se le pidió.
//
// Esto detiene lo que se ve en la práctica: una foto impresa, una foto en una
// pantalla, un pantallazo del documento, o un vídeo grabado de antemano —porque
// el vídeo tendría que contener exactamente los gestos que el servidor acaba de
// sortear, y son 4 de 24 secuencias posibles con dos minutos de vida.
//
// LO QUE NO DETIENE, DICHO CLARAMENTE
//
// Un atacante que genere vídeo en tiempo real con el rostro de la víctima y lo
// inyecte en la cámara puede seguir el reto. Contra eso hacen falta señales del
// propio dispositivo (integridad de la app, sensores de profundidad) y ninguna
// biblioteca del lado del servidor las sustituye. Por eso el resultado es una
// PUNTUACION y no un sí/no, la puntuación viaja hasta el expediente, y todo lo
// que no llega al umbral cae en la cola de revisión de una persona.

import { createHash, randomInt } from 'node:crypto'
import { detectarRostro, type RostroDetectado } from './rekognition.js'
import { id as nuevoId } from '../lib/uid.js'

export type Gesto = 'frente' | 'sonreir' | 'boca-abierta' | 'ojos-cerrados' | 'girar-cabeza'

export const INSTRUCCIONES: Record<Gesto, string> = {
  'frente': 'Mire a la cámara de frente, con gesto neutro',
  'sonreir': 'Sonría',
  'boca-abierta': 'Abra la boca',
  'ojos-cerrados': 'Cierre los ojos',
  'girar-cabeza': 'Gire la cabeza hacia un lado',
}

/** Gestos que pueden sortearse. `frente` va siempre primero y no entra en el sorteo. */
const SORTEABLES: Gesto[] = ['sonreir', 'boca-abierta', 'ojos-cerrados', 'girar-cabeza']

/** Cuántos gestos se piden además del de frente. */
const CUANTOS = 3
/** Vida del reto. Corta a propósito: es la ventana para preparar un vídeo. */
const VIDA_MS = 120000
/** Confianza mínima del atributo para dar un gesto por hecho. */
const CONFIANZA_GESTO = 0.85
/** Confianza mínima de que lo detectado es un rostro. */
const CONFIANZA_ROSTRO = 0.9
/** Grados de guiñada para dar por girada la cabeza. */
const GRADOS_GIRO = 22
/** Nitidez mínima. Una foto de una foto pierde nitidez; una pantalla, brillo. */
const NITIDEZ_MINIMA = 12

export interface Reto {
  id: string
  identidad: string
  gestos: Gesto[]
  emitidoEn: number
  usado: boolean
}

// Los retos viven en memoria a propósito: duran dos minutos, son de un solo uso
// y no son un dato que valga la pena conservar. Si mañana Genesis ID corre en
// más de una instancia habrá que moverlos a Mongo con TTL — está anotado en el
// README de despliegue.
const retos = new Map<string, Reto>()

function purgar(): void {
  const limite = Date.now() - VIDA_MS
  for (const [id, r] of retos) if (r.emitidoEn < limite) retos.delete(id)
}

/** Sortea una secuencia y la registra. */
export function emitirReto(identidad: string): {
  id: string; gestos: Gesto[]; instrucciones: string[]; venceEn: string; segundos: number
} {
  purgar()
  const bolsa = [...SORTEABLES]
  const elegidos: Gesto[] = []
  for (let i = 0; i < CUANTOS; i++) elegidos.push(...bolsa.splice(randomInt(bolsa.length), 1))

  const reto: Reto = {
    id: nuevoId('reto'),
    identidad,
    gestos: ['frente', ...elegidos],
    emitidoEn: Date.now(),
    usado: false,
  }
  retos.set(reto.id, reto)
  return {
    id: reto.id,
    gestos: reto.gestos,
    instrucciones: reto.gestos.map((g) => INSTRUCCIONES[g]),
    venceEn: new Date(reto.emitidoEn + VIDA_MS).toISOString(),
    segundos: VIDA_MS / 1000,
  }
}

/** Solo para las pruebas y el diagnóstico: cuántos retos hay vivos. */
export const retosVivos = () => { purgar(); return retos.size }

// ─────────────────────────────────────────────────────────────────────────────
// Comprobación de cada gesto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿El rostro hizo el gesto?
 *
 * Se evitan a propósito los gestos cuyo sentido depende de cómo interprete el
 * proveedor el signo del ángulo ("mire a la izquierda"): con la cámara frontal
 * espejada, ese criterio se equivoca a mitad de los usuarios legítimos. Girar
 * la cabeza a un lado cualquiera es igual de difícil de falsificar con una foto
 * y no tiene ambigüedad.
 */
export function evaluarGesto(gesto: Gesto, r: RostroDetectado): { ok: boolean; motivo?: string } {
  const dir = (b: { valor: boolean; confianza: number }, esperado: boolean) =>
    b.valor === esperado && b.confianza >= CONFIANZA_GESTO

  switch (gesto) {
    case 'frente':
      if (Math.abs(r.postura.guinada) > 15 || Math.abs(r.postura.cabeceo) > 20) {
        return { ok: false, motivo: 'la cabeza no está de frente' }
      }
      if (!dir(r.ojosAbiertos, true)) return { ok: false, motivo: 'no se ven los ojos abiertos' }
      return { ok: true }

    case 'sonreir':
      return dir(r.sonrisa, true) ? { ok: true } : { ok: false, motivo: 'no se detectó la sonrisa' }

    case 'boca-abierta':
      return dir(r.bocaAbierta, true) ? { ok: true } : { ok: false, motivo: 'no se detectó la boca abierta' }

    case 'ojos-cerrados':
      if (r.gafas) return { ok: false, motivo: 'hay gafas de sol; quíteselas' }
      return dir(r.ojosAbiertos, false) ? { ok: true } : { ok: false, motivo: 'los ojos siguen abiertos' }

    case 'girar-cabeza':
      return Math.abs(r.postura.guinada) >= GRADOS_GIRO
        ? { ok: true }
        : { ok: false, motivo: `la cabeza apenas giró (${Math.round(r.postura.guinada)}°)` }
  }
}

export interface PasoVivacidad {
  gesto: Gesto
  ok: boolean
  motivo?: string
  guinada?: number
  nitidez?: number
}

export interface ResultadoVivacidad {
  /** 0-1. */
  puntuacion: number
  pasos: PasoVivacidad[]
  /** El fotograma de frente, que se usa como selfie para el cotejo. */
  frenteSelfie: string | null
  avisos: string[]
  motivo?: string
}

const nulo = (motivo: string): ResultadoVivacidad =>
  ({ puntuacion: 0, pasos: [], frenteSelfie: null, avisos: [], motivo })

/**
 * Comprueba la respuesta a un reto.
 *
 * Los fotogramas llegan en el orden de los gestos. Además de cada gesto se
 * comprueban tres cosas que ninguna respuesta legítima incumple y casi todo
 * ataque sencillo sí:
 *
 *   · que no venga dos veces la misma imagen (reenvío del mismo fotograma),
 *   · que la postura cambie entre fotogramas (una foto fija no se mueve),
 *   · que la imagen tenga nitidez de cámara y no de foto de una pantalla.
 */
export async function comprobarReto(
  idReto: string, identidad: string, fotogramas: string[],
): Promise<ResultadoVivacidad> {
  purgar()
  const reto = retos.get(String(idReto || ''))
  if (!reto) return nulo('El reto no existe o ya venció; pida uno nuevo')
  if (reto.usado) return nulo('Ese reto ya se usó; pida uno nuevo')
  if (reto.identidad !== identidad) return nulo('El reto fue emitido para otra identidad')
  if (Date.now() - reto.emitidoEn > VIDA_MS) { retos.delete(reto.id); return nulo('El reto venció; pida uno nuevo') }
  if (!Array.isArray(fotogramas) || fotogramas.length !== reto.gestos.length) {
    return nulo(`Se esperaban ${reto.gestos.length} fotogramas, llegaron ${fotogramas?.length ?? 0}`)
  }

  // Se marca usado ANTES de analizar: si el análisis falla a medias, el reto ya
  // se gastó igual. Reintentar con otro reto es barato; dejar uno reutilizable
  // permitiría ir probando fotogramas hasta acertar.
  reto.usado = true

  const huellas = new Set<string>()
  const pasos: PasoVivacidad[] = []
  const avisos: string[] = []
  let frenteSelfie: string | null = null
  const guinadas: number[] = []

  for (let i = 0; i < reto.gestos.length; i++) {
    const gesto = reto.gestos[i]
    const imagen = String(fotogramas[i] || '')

    const huella = createHash('sha256').update(imagen).digest('hex')
    if (huellas.has(huella)) {
      pasos.push({ gesto, ok: false, motivo: 'es la misma imagen que otro fotograma' })
      continue
    }
    huellas.add(huella)

    let rostro: RostroDetectado | null
    try {
      rostro = await detectarRostro(imagen, `el fotograma ${i + 1}`)
    } catch (e: any) {
      pasos.push({ gesto, ok: false, motivo: `no se pudo analizar: ${e?.message || 'error'}` })
      continue
    }

    if (!rostro) { pasos.push({ gesto, ok: false, motivo: 'no se ve ningún rostro' }); continue }
    if (rostro.confianza < CONFIANZA_ROSTRO) {
      pasos.push({ gesto, ok: false, motivo: 'lo que se ve no parece un rostro' }); continue
    }
    if (rostro.tamano < 0.12) {
      pasos.push({ gesto, ok: false, motivo: 'el rostro queda demasiado lejos de la cámara' }); continue
    }
    if (rostro.calidad.nitidez < NITIDEZ_MINIMA) {
      avisos.push(`El fotograma ${i + 1} tiene poca nitidez (${rostro.calidad.nitidez.toFixed(0)}), ` +
        'compatible con una foto de una pantalla')
    }

    guinadas.push(rostro.postura.guinada)
    const veredicto = evaluarGesto(gesto, rostro)
    pasos.push({
      gesto, ok: veredicto.ok, motivo: veredicto.motivo,
      guinada: Math.round(rostro.postura.guinada), nitidez: Math.round(rostro.calidad.nitidez),
    })
    if (gesto === 'frente' && veredicto.ok) frenteSelfie = imagen
  }

  const acertados = pasos.filter((p) => p.ok).length
  let puntuacion = acertados / pasos.length

  // Una foto quieta ante la cámara puede colar un gesto por casualidad, pero no
  // cambia de postura entre fotogramas.
  if (guinadas.length >= 2) {
    const rango = Math.max(...guinadas) - Math.min(...guinadas)
    if (rango < 3) {
      puntuacion = Math.min(puntuacion, 0.3)
      avisos.push('La postura de la cabeza no cambió entre fotogramas')
    }
  }
  if (avisos.some((a) => a.includes('nitidez'))) puntuacion = Math.min(puntuacion, 0.75)

  return {
    puntuacion,
    pasos,
    frenteSelfie,
    avisos,
    motivo: acertados === pasos.length ? undefined
      : `${pasos.length - acertados} de ${pasos.length} gestos no se cumplieron`,
  }
}

/** Solo para las pruebas: deja el registro de retos limpio. */
export function _vaciarRetos(): void { retos.clear() }
