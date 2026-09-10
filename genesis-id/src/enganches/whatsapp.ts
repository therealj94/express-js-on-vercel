/**
 * Avisar a la PERSONA por WhatsApp cuando se decide su identidad.
 *
 * ── QUE PROBLEMA RESUELVE, Y POR QUE NO ES EL MISMO QUE EL ENGANCHE ─────────
 *
 * El enganche avisa a las APLICACIONES; esto avisa a la PERSONA. Se parecen en
 * la tubería y no se parecen en nada más:
 *
 *   · Un enganche va a un servidor que espera JSON y sabe qué hacer con él.
 *     Esto va al teléfono de alguien que estuvo esperando una respuesta.
 *   · Un enganche se manda siempre. Esto solo si hay teléfono y solo si Meta
 *     aprobó antes la plantilla exacta que se va a mandar.
 *   · Un enganche que falla se reintenta seis veces. Este también, pero un
 *     aviso que llega tarde a una persona ya no sirve para lo mismo.
 *
 * La pantalla decía «suele tardar menos de 24 horas» y después no avisaba
 * nadie: la persona tenía que adivinar cuándo volver a mirar. El correo ya se
 * manda desde `aprobar()`; esto es lo mismo por el canal donde de verdad está
 * la gente en Centroamérica.
 *
 * ── POR QUE UNA PLANTILLA Y NO UN MENSAJE ───────────────────────────────────
 *
 * Fuera de las 24 horas desde el último mensaje de la persona, Meta NO deja
 * mandar texto libre a nadie. Y una aprobación llega días después de que la
 * persona subió sus papeles, o sea SIEMPRE fuera de esa ventana. Así que el
 * único envío posible es una plantilla que Meta aprobó de antemano, con sus
 * huecos rellenados.
 *
 * Eso tiene una consecuencia que conviene tener presente: el texto no se puede
 * cambiar en caliente. Cambiarlo es mandar una plantilla nueva a revisión y
 * esperar. Por eso los textos viven en `infra/aura/plantillas-whatsapp.py`, con
 * su propio guion, y aquí solo se nombran.
 *
 * ── SIN CONFIGURAR, NO EXISTE ───────────────────────────────────────────────
 *
 * Sin `GENESIS_WHATSAPP_CLAVE` esto no hace nada y no se queja. Es una boca más
 * que puede estar puesta o no, igual que el ancla en la cadena.
 */

import { store } from '../store.js'
import { id } from '../lib/uid.js'
import type { Identidad } from '../types.js'

const BASE = () => process.env.GENESIS_WHATSAPP_BASE?.trim() || 'https://zernio.com/api/v1'
const CLAVE = () => process.env.GENESIS_WHATSAPP_CLAVE?.trim() || ''
const CUENTA = () => process.env.GENESIS_WHATSAPP_CUENTA?.trim() || ''

export const encendido = () => Boolean(CLAVE() && CUENTA())

/**
 * Qué plantilla corresponde a cada estado.
 *
 * Los nombres son los que están dados de alta en Meta. Un estado que no esté
 * aquí sencillamente no manda nada: es preferible a inventar un texto, que
 * además Meta rechazaría.
 */
export const PLANTILLAS: Record<string, string> = {
  /* `_v2`: el primer nombre quedó bloqueado en Meta al borrar la plantilla
     que rechazaron por categoría. Ver `infra/aura/plantillas-whatsapp.py`. */
  verificada: 'genesisid_identidad_verificada_v3',
  rechazada: 'genesisid_identidad_rechazada',
  'en-revision': 'genesisid_identidad_en_revision',
  suspendida: 'genesisid_identidad_suspendida',
}

/**
 * Los huecos de cada plantilla, en orden.
 *
 * El primero es siempre el nombre de pila. `nombreLegal` viene del documento y
 * en mayúsculas —«ANA MARÍA PÉREZ GÓMEZ»—: mandarlo tal cual es gritarle a
 * alguien su nombre completo de cédula, que no es como se le habla a una
 * persona por WhatsApp.
 */
export function huecos(identidad: Identidad, motivo?: string): string[] {
  const nombre = primerNombre(identidad)
  switch (identidad.estado) {
    case 'verificada':
      /* Un solo hueco: la plantilla aprobada NO lleva el GID. Meta rechazó dos
         veces la versión que lo entregaba —lo clasifica como mensaje de
         autenticación, no de trámite—. Mandar dos huecos a una plantilla de uno
         hace que Meta rechace el ENVIO, no la plantilla: rompería en
         producción. */
      return [nombre]
    case 'suspendida':
      return [nombre, identidad.gid || '—']
    case 'rechazada':
      /* El motivo va DENTRO del aviso. Un «no se pudo» sin motivo obliga a la
         persona a escribir para preguntar qué pasó, y la deja pensando que hizo
         algo mal cuando casi siempre es una foto movida. */
      return [nombre, recortar(motivo || 'no pudimos comprobar tus datos')]
    default:
      return [nombre]
  }
}

export function primerNombre(identidad: Identidad): string {
  const crudo = (identidad.nombreLegal || identidad.nombreDeclarado || '').trim()
  if (!crudo) return 'hola'
  const primera = crudo.split(/\s+/)[0]
  /* De MAYÚSCULAS a Capitalizada. `toLocaleLowerCase` y no `toLowerCase`
     porque hay idiomas donde no es lo mismo, y esto se va a leer en un
     teléfono con el nombre de una persona de verdad. */
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLocaleLowerCase('es')
}

/**
 * Un hueco de plantilla no admite saltos de línea ni tabulaciones: Meta lo
 * rechaza en el envío, no al crearla. O sea que un motivo con un salto de
 * línea rompería el aviso EN PRODUCCION y no en la revisión.
 */
function recortar(texto: string, tope = 180): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length <= tope ? limpio : limpio.slice(0, tope - 1) + '…'
}

/**
 * El teléfono, en el formato que quiere WhatsApp.
 *
 * Devuelve `null` cuando no hay nada usable, y eso NO es un error: hay
 * identidades sin teléfono y no pasa nada. Lo que no puede pasar es mandarle un
 * aviso a un número inventado a fuerza de rellenar dígitos.
 */
export function aE164(telefono: string | null): string | null {
  if (!telefono) return null
  const digitos = String(telefono).replace(/[^\d]/g, '')
  /* DIEZ, no ocho. Ocho dejaba pasar un número local: en Honduras y en Panamá
     el abonado son ocho dígitos, así que «9876-5432» cumplía y salía como si
     fuera un número internacional completo. Eso no es un aviso que no llega:
     es el GID de una persona en el teléfono de un desconocido.

     Con código de país no hay número real por debajo de diez. Y si por ser
     estricto se queda alguno sin aviso, eso se arregla guardando bien el
     teléfono; lo otro no se arregla. */
  if (digitos.length < 10 || digitos.length > 15) return null
  return digitos
}

/**
 * Pone en cola el aviso de una persona. Nunca lanza y nunca espera.
 *
 * Se llama desde dentro de una decisión de cumplimiento, y una decisión no se
 * puede caer —ni retrasar— porque WhatsApp esté lento.
 */
export function avisarPersona(identidad: Identidad, motivo?: string): boolean {
  /* TODO dentro del `try`, incluido leer la identidad. Se llama desde dentro
     de una aprobación: si esto lanza —una identidad a medias, un teléfono que
     no es texto—, se lleva por delante una decisión que ya estaba tomada. */
  try {
    if (!encendido()) return false
    const plantilla = PLANTILLAS[identidad.estado]
    if (!plantilla) return false
    const para = aE164(identidad.telefono)
    if (!para) return false

    store.todo().entregas.push({
      id: id(),
      canal: 'whatsapp',
      app: 'persona',
      evento: `identidad.${identidad.estado}`,
      url: para,                    // aquí la «dirección» es el teléfono
      cuerpo: JSON.stringify({ plantilla, huecos: huecos(identidad, motivo) }),
      intentos: 0,
      proximoIntento: Date.now(),
      estado: 'pendiente',
      creadaEn: new Date().toISOString(),
    })
    store.guardar()
    return true
  } catch (e: any) {
    console.error('[genesis-id] no se pudo encolar el aviso de WhatsApp:', e?.message || e)
    return false
  }
}

/**
 * Manda de verdad. Lo llama la cola de entregas, con sus reintentos.
 *
 * Lanza si falla, que es lo que la cola espera para reintentar.
 */
export async function entregarWhatsApp(para: string, cuerpo: string): Promise<void> {
  const { plantilla, huecos: h } = JSON.parse(cuerpo) as
    { plantilla: string; huecos: string[] }

  /* La ruta es la de ABRIR CONVERSACION, no una de «mandar mensaje».
     Tiene sentido y conviene decirlo: a quien nunca nos escribió no hay hilo
     al que contestar, así que empezar uno con una plantilla aprobada ES el
     envío. Si ya hubiera hilo, el mensaje se añade a ese mismo.

     Esto NO se dedujo del nombre de la ruta: la primera versión inventó un
     `/whatsapp/messages` que no existe. Está leído del contrato. */
  const r = await fetch(`${BASE()}/inbox/conversations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CLAVE()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      accountId: CUENTA(),
      participantId: para,
      templateName: plantilla,
      templateLanguage: 'es',
      /* Una lista PLANA y en el orden en que los huecos aparecen en la
         plantilla aprobada. No es un objeto con nombres: si se manda un hueco
         de más o en otro orden, Meta rechaza el envío entero. */
      templateParams: h,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) {
    const detalle = await r.text().catch(() => '')
    throw new Error(`whatsapp ${r.status}: ${detalle.slice(0, 200)}`)
  }
}

export function estadoWhatsApp() {
  const cola = store.todo().entregas.filter((e) => e.canal === 'whatsapp')
  return {
    encendido: encendido(),
    pendientes: cola.filter((e) => e.estado === 'pendiente').length,
    entregados: cola.filter((e) => e.estado === 'entregada').length,
    fallidos: cola.filter((e) => e.estado === 'fallida').length,
  }
}
