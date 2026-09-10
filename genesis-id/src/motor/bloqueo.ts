// El bloqueo por infracción de políticas.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ NO BASTA CON SUSPENDER
//
// Suspender ya cerraba las puertas, así que en teoría servía. En la práctica
// no, y por una razón que solo se ve al querer deshacerlo:
//
//   Suspender dice «este KYC ya no vale». Para volver atrás hay que rehacer
//   la verificación entera — el documento, el rostro, la revisión humana. Es
//   correcto cuando el documento venció o la persona saltó en una lista de
//   sanciones: ahí el KYC de verdad dejó de valer.
//
//   Bloquear dice «esta persona no entra». Su identidad sigue siendo la que
//   es: el documento es el mismo, el rostro es el mismo, la revisión ya se
//   hizo. Lo que cambió es una decisión de la empresa, y las decisiones de la
//   empresa se revierten con otra decisión, no obligando a alguien a
//   fotografiarse el pasaporte otra vez.
//
// Usar suspender para castigar convierte cada bloqueo en irreversible de
// hecho. Alguien a quien se bloqueó por error, o por algo que después se
// aclaró, tendría que rehacer todo su trámite para volver — y eso hace que
// nadie se atreva a bloquear, que es el peor resultado posible para una
// herramienta disciplinaria.
//
// LOS DOS SON ORTOGONALES. Una identidad puede estar verificada y bloqueada;
// suspendida y no bloqueada; las dos cosas a la vez. Cada una cierra las
// puertas por su cuenta y ninguna pisa a la otra.
//
// ─────────────────────────────────────────────────────────────────────────────
// EL HISTORIAL NO SE BORRA
//
// `bloqueos` es una lista a la que solo se AÑADE. Desbloquear no quita nada:
// le pone fecha de levantamiento al último. Así, dentro de un año, la pregunta
// «¿a esta persona se le bloqueó alguna vez y por qué?» tiene respuesta — que
// es justamente la pregunta que se hace cuando vuelve a pasar algo.
//
// El bloqueo VIGENTE es el último de la lista sin levantar. No se guarda
// aparte un booleano `bloqueado`: dos sitios donde vive la misma verdad es un
// sitio donde un día dicen cosas distintas.

import { store } from '../store.js'
import { registrar } from '../audit/bitacora.js'
import type { Identidad, Operador, Bloqueo } from '../types.js'

const ahora = () => new Date().toISOString()

/** Cuánto texto se le exige a un motivo. Un bloqueo sin explicación es un
 *  bloqueo que dentro de seis meses nadie sabe si levantar. */
const MINIMO_MOTIVO = 10

/** El bloqueo que está en pie, o null. Es la única fuente de la verdad. */
export function vigente(identidad: Identidad): Bloqueo | null {
  const lista = identidad.bloqueos ?? []
  for (let i = lista.length - 1; i >= 0; i--) {
    if (!lista[i].levantadoEn) return lista[i]
  }
  return null
}

/** ¿Está bloqueada esta persona ahora mismo? */
export const bloqueada = (identidad: Identidad | null | undefined): boolean =>
  Boolean(identidad && vigente(identidad))

/**
 * Lo que se le contesta a una app cuando pregunta por alguien bloqueado.
 *
 * El motivo NO viaja. Una app del ecosistema no tiene por qué saber qué hizo
 * la persona: le basta con que no entra. El motivo vive en el expediente y en
 * el panel, que es donde lo mira quien tiene que mirarlo.
 */
export const RESPUESTA = {
  error: 'El acceso de esta identidad está bloqueado',
  codigo: 'IDENTIDAD_BLOQUEADA',
}

export interface ResultadoBloqueo {
  ok: boolean
  motivo?: string
  identidad?: Identidad
}

/**
 * Bloquea el acceso de una identidad a todo el ecosistema.
 *
 * No toca `estado`, ni el GID, ni el documento, ni el rostro. Solo cierra la
 * puerta. Eso es lo que permite abrirla de nuevo con un clic.
 */
export async function bloquear(
  identidad: Identidad, operador: Operador, motivo: string, politica?: string | null,
): Promise<ResultadoBloqueo> {
  const texto = String(motivo ?? '').trim()
  if (texto.length < MINIMO_MOTIVO) {
    return { ok: false, motivo: `Hay que escribir por qué se bloquea (mínimo ${MINIMO_MOTIVO} caracteres)` }
  }
  const yaEsta = vigente(identidad)
  if (yaEsta) {
    // Bloquear a quien ya está bloqueado no es un error del que haya que
    // quejarse fuerte, pero tampoco puede añadir una segunda entrada: dos
    // bloqueos vigentes a la vez harían que levantar uno pareciera levantar
    // el bloqueo, y la persona seguiría fuera sin que nadie entienda por qué.
    return { ok: false, motivo: 'Esta identidad ya está bloqueada', identidad }
  }

  const nuevo: Bloqueo = {
    motivo: texto,
    politica: politica ? String(politica).trim() : null,
    operador: operador.email,
    desde: ahora(),
    levantadoPor: null,
    levantadoEn: null,
    levantadoMotivo: null,
  }
  identidad.bloqueos = [...(identidad.bloqueos ?? []), nuevo]
  identidad.actualizadaEn = ahora()

  // Se guarda YA, no en el volcado diferido. Un bloqueo es de las poquísimas
  // escrituras donde la ventana entre «se decidió» y «está en disco» importa:
  // si el proceso se reinicia en esos segundos, la persona sigue entrando y
  // el operador cree que la sacó.
  await store.guardarYa()
  registrar(operador.email, 'identidad.bloqueada', identidad.id, {
    gid: identidad.gid, motivo: texto, politica: nuevo.politica,
  })
  return { ok: true, identidad }
}

/**
 * Levanta el bloqueo. La identidad vuelve exactamente a donde estaba.
 *
 * Exactamente: si estaba verificada, sigue verificada y entra otra vez sin
 * repetir nada. Si estaba a medio trámite, sigue a medio trámite. El bloqueo
 * no era parte de su identidad, era una puerta cerrada por encima.
 */
export async function desbloquear(
  identidad: Identidad, operador: Operador, motivo: string,
): Promise<ResultadoBloqueo> {
  const texto = String(motivo ?? '').trim()
  if (texto.length < MINIMO_MOTIVO) {
    return { ok: false, motivo: `Hay que escribir por qué se levanta (mínimo ${MINIMO_MOTIVO} caracteres)` }
  }
  const enPie = vigente(identidad)
  if (!enPie) return { ok: false, motivo: 'Esta identidad no está bloqueada', identidad }

  enPie.levantadoPor = operador.email
  enPie.levantadoEn = ahora()
  enPie.levantadoMotivo = texto
  identidad.actualizadaEn = ahora()

  await store.guardarYa()
  registrar(operador.email, 'identidad.desbloqueada', identidad.id, {
    gid: identidad.gid, motivo: texto, bloqueadaDesde: enPie.desde, bloqueadaPor: enPie.operador,
  })
  return { ok: true, identidad }
}

/** Para el panel y el expediente: el vigente y toda la historia. */
export function paraPanel(identidad: Identidad) {
  const enPie = vigente(identidad)
  return {
    bloqueada: Boolean(enPie),
    vigente: enPie,
    historial: (identidad.bloqueos ?? []).slice().reverse(),
  }
}

export { MINIMO_MOTIVO }
