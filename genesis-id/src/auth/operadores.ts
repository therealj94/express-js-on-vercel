// Operadores del panel y sus sesiones.
//
// Antes no había ninguno: el panel y todas las rutas de administración estaban
// abiertos a internet. Cualquiera podía listar las identidades con sus nombres,
// documentos y nacionalidades, o borrar la base entera con una sola petición.
//
// SEPARACION DE FUNCIONES
//
// Los roles no son decorativos. Quien revisa un caso no debería ser quien lo
// aprueba, y el auditor no debe poder cambiar nada. Es lo que exige cualquier
// marco de cumplimiento, y lo que evita que una sola cuenta comprometida pueda
// fabricar identidades verificadas.

import { store } from '../store.js'
import { hashContrasena, verificarContrasena, azar, cifrar, descifrar } from '../lib/cripto.js'
import {
  generarSecreto, uriOtpauth, verificar as verificarTotp,
  generarCodigosRespaldo, normalizarRespaldo,
} from './totp.js'
import { id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import type { Operador, Rol, Sesion } from '../types.js'

/** Qué puede hacer cada rol. */
export const PERMISOS: Record<Rol, string[]> = {
  // Manda: gestiona operadores y aplicaciones, además de todo lo demás.
  admin: ['*'],
  // Cumplimiento: decide sobre identidades y casos, pero no crea operadores.
  cumplimiento: [
    'identidad.ver', 'identidad.revisar', 'identidad.aprobar', 'identidad.rechazar', 'identidad.suspender',
    // Bloquear no es suspender. Suspender dice «este KYC ya no vale» y deshacerlo
    // obliga a rehacer la verificación; bloquear dice «esta persona no entra» y
    // se levanta con un clic. Cumplimiento tiene las dos porque es quien mira
    // los expedientes; el admin las tiene por el comodín.
    'identidad.bloquear',
    'negocio.ver', 'negocio.revisar', 'negocio.aprobar', 'negocio.rechazar',
    'caso.ver', 'caso.gestionar', 'caso.reportar',
    'listas.ver', 'listas.recargar', 'bitacora.ver',
    'analitica.ver', 'analitica.gestionar', 'usuarios.ver',
  ],
  // Revisor: prepara el caso y recomienda, pero no firma la aprobación.
  revisor: [
    'identidad.ver', 'identidad.revisar',
    'negocio.ver', 'negocio.revisar',
    'caso.ver', 'caso.gestionar', 'listas.ver',
    'analitica.ver',
  ],
  // Auditor: lo ve todo, no toca nada. Incluye la analítica: es justo el rol
  // que necesita mirar cifras sin poder cerrar un error como «resuelto».
  auditor: [
    'identidad.ver', 'negocio.ver', 'caso.ver', 'listas.ver', 'bitacora.ver',
    'analitica.ver',
  ],
}

export function puede(rol: Rol, permiso: string): boolean {
  const suyos = PERMISOS[rol] || []
  return suyos.includes('*') || suyos.includes(permiso)
}

const DURACION_SESION_H = Number(process.env.GENESIS_SESION_HORAS || 8)

// ─────────────────────────────────────────────────────────────────────────────
// Alta y arranque
// ─────────────────────────────────────────────────────────────────────────────

export function crearOperador(input: {
  email: string; nombre: string; rol: Rol; contrasena: string; debeCambiar?: boolean
}): Operador {
  const email = input.email.toLowerCase().trim()
  if (store.todo().operadores.some((o) => o.email === email)) {
    throw new Error('Ya existe un operador con ese correo')
  }
  const operador: Operador = {
    id: id('opr'),
    email,
    nombre: input.nombre,
    rol: input.rol,
    hashContrasena: hashContrasena(input.contrasena),
    activo: true,
    creadoEn: new Date().toISOString(),
    ultimoAcceso: null,
    debeCambiarContrasena: input.debeCambiar ?? true,
  }
  store.todo().operadores.push(operador)
  store.guardar()
  return operador
}

/**
 * Crea el primer administrador si no hay ninguno.
 *
 * Si no se define GENESIS_ADMIN_PASSWORD se genera una al azar y se imprime UNA
 * sola vez en el registro de arranque. Es preferible a dejar una contraseña por
 * defecto: una contraseña fija en el código acaba publicada en el repositorio y
 * es la puerta de entrada más común que hay.
 */
export function asegurarAdministrador(): { creado: boolean; email?: string; contrasena?: string } {
  if (store.todo().operadores.length > 0) return { creado: false }

  const email = (process.env.GENESIS_ADMIN_EMAIL || 'admin@ordenglobal.link').toLowerCase()
  const contrasena = process.env.GENESIS_ADMIN_PASSWORD || azar(18)
  crearOperador({
    email,
    nombre: 'Administrador',
    rol: 'admin',
    contrasena,
    debeCambiar: !process.env.GENESIS_ADMIN_PASSWORD,
  })
  registrar('sistema', 'operador.creado', email, { rol: 'admin', origen: 'arranque' })

  return {
    creado: true,
    email,
    contrasena: process.env.GENESIS_ADMIN_PASSWORD ? undefined : contrasena,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada y sesiones
// ─────────────────────────────────────────────────────────────────────────────

/** Intentos fallidos por correo, para frenar la fuerza bruta. */
const fallos = new Map<string, { veces: number; hasta: number }>()
const MAX_FALLOS = 5
const BLOQUEO_MS = 15 * 60 * 1000
// Los fallos se cuentan dentro de una ventana, y al vencer se vuelve a cero.
//
// POR QUE HACIA FALTA: antes el contador no bajaba nunca. Se sumaba en cada
// fallo y solo se borraba al entrar bien, así que al llegar a cinco la cuenta
// quedaba en una trampa: pasado el cuarto de hora, el PRIMER intento fallido
// volvía a poner el contador en seis y el bloqueo empezaba otra vez entero.
// Quien no recuerda su contraseña —o quien no es operador y nunca va a poder
// entrar— se quedaba encerrado en ciclos de quince minutos sin salida, y con
// el motivo tapado por el «La sesión caducó» del panel no había manera de
// saberlo. Además, sin ventana, cinco despistes repartidos en tres meses
// acababan bloqueando a un operador que jamás falló dos veces seguidas.
const VENTANA_MS = 15 * 60 * 1000

export function entrar(
  email: string,
  contrasena: string,
  ip: string | null,
  codigo = '',
): {
  ok: boolean; sesion?: Sesion; operador?: Operador; motivo?: string
  bloqueado?: boolean; faltaSegundoFactor?: boolean; debeActivarSegundoFactor?: boolean
} {
  const correo = String(email || '').toLowerCase().trim()
  const ahoraMs = Date.now()
  const previo = fallos.get(correo)
  const vigente = Boolean(previo && ahoraMs < previo.hasta)

  // El bloqueo no se alarga por reintentar: se responde y se sale sin tocar el
  // contador.
  if (previo && vigente && previo.veces >= MAX_FALLOS) {
    const minutos = Math.ceil((previo.hasta - ahoraMs) / 60000)
    return { ok: false, bloqueado: true, motivo: `Demasiados intentos. Vuelva a probar en ${minutos} minuto(s).` }
  }

  const operador = store.todo().operadores.find((o) => o.email === correo)

  // Se responde lo mismo si el correo no existe o si la contraseña está mal:
  // distinguirlos permitiría averiguar qué correos son operadores válidos.
  const valido = operador?.activo && verificarContrasena(contrasena, operador.hashContrasena)
  if (!valido) {
    const veces = (vigente ? previo!.veces : 0) + 1
    const alcanzaElTope = veces >= MAX_FALLOS
    fallos.set(correo, { veces, hasta: ahoraMs + (alcanzaElTope ? BLOQUEO_MS : VENTANA_MS) })
    // La bitácora sí distingue los tres casos que la respuesta junta a
    // propósito: sin eso no hay forma de diagnosticar por qué alguien no entra.
    const causa = !operador ? 'sin-operador' : !operador.activo ? 'desactivado' : 'contrasena'
    registrar(correo, 'sesion.fallida', correo, { ip, causa, veces })
    // El bloqueo se anota una sola vez, al cerrarse: anotar cada intento
    // rechazado engordaría la bitácora sin decir nada nuevo.
    if (alcanzaElTope) {
      registrar(correo, 'sesion.bloqueada', correo, { ip, minutos: Math.round(BLOQUEO_MS / 60000) })
    }
    return { ok: false, motivo: 'Correo o contraseña incorrectos' }
  }

  /* EL SEGUNDO FACTOR VA AQUI: despues de dar la contrasena por buena y ANTES
     de borrar el contador de fallos. Es a proposito. Si el contador se borrara
     antes, quien tuviera la contrasena podria probar codigos de seis digitos
     sin limite, y el segundo factor pasaria de barrera a molestia. */
  if (activo(operador!)) {
    const segundo = pasaSegundoFactor(operador!, codigo)
    if (!segundo.ok) {
      const veces = (vigente ? previo!.veces : 0) + 1
      const alcanzaElTope = veces >= MAX_FALLOS
      fallos.set(correo, { veces, hasta: ahoraMs + (alcanzaElTope ? BLOQUEO_MS : VENTANA_MS) })
      registrar(correo, 'sesion.fallida', correo, { ip, causa: 'segundo-factor', veces })
      if (alcanzaElTope) {
        registrar(correo, 'sesion.bloqueada', correo, { ip, minutos: Math.round(BLOQUEO_MS / 60000) })
      }
      // Que falte el codigo SI se distingue de que la contrasena este mal, y no
      // es una fuga: para llegar hasta aca ya hay que tener la contrasena buena.
      // Sin distinguirlo el panel no sabria que pedir.
      return { ok: false, faltaSegundoFactor: true, motivo: segundo.motivo }
    }
  }

  fallos.delete(correo)

  const ahora = new Date()
  const sesion: Sesion = {
    token: azar(32),
    operadorId: operador!.id,
    creadaEn: ahora.toISOString(),
    expiraEn: new Date(ahora.getTime() + DURACION_SESION_H * 3600000).toISOString(),
    ip,
  }
  store.todo().sesiones.push(sesion)
  operador!.ultimoAcceso = ahora.toISOString()
  store.guardar()
  const conSegundoFactor = activo(operador!)
  registrar(operador!.email, 'sesion.abierta', operador!.id, {
    ip, rol: operador!.rol, segundoFactor: conSegundoFactor,
  })

  return {
    ok: true, sesion, operador: operador!,
    /* Ni cerrado ni callado: quien tiene un rol de los que lo exigen y todavia
       no lo activo entra, pero el panel lo lleva a activarlo. Cerrarlo de golpe
       habria dejado fuera al equipo entero en el mismo despliegue. */
    debeActivarSegundoFactor: !conSegundoFactor && exigeSegundoFactor(operador!.rol),
  }
}

export function operadorDeSesion(token: string): Operador | null {
  if (!token) return null
  const sesion = store.todo().sesiones.find((s) => s.token === token)
  if (!sesion) return null
  if (new Date(sesion.expiraEn) < new Date()) return null
  const operador = store.todo().operadores.find((o) => o.id === sesion.operadorId)
  return operador?.activo ? operador : null
}

export function salir(token: string): void {
  const datos = store.todo()
  const i = datos.sesiones.findIndex((s) => s.token === token)
  if (i >= 0) {
    const operador = datos.operadores.find((o) => o.id === datos.sesiones[i].operadorId)
    datos.sesiones.splice(i, 1)
    store.guardar()
    if (operador) registrar(operador.email, 'sesion.cerrada', operador.id, {})
  }
}

export function cambiarContrasena(operadorId: string, actual: string, nueva: string): { ok: boolean; motivo?: string } {
  const operador = store.todo().operadores.find((o) => o.id === operadorId)
  if (!operador) return { ok: false, motivo: 'Operador no encontrado' }
  if (!verificarContrasena(actual, operador.hashContrasena)) {
    return { ok: false, motivo: 'La contraseña actual no es correcta' }
  }
  if (nueva.length < 12) {
    return { ok: false, motivo: 'La contraseña nueva debe tener al menos 12 caracteres' }
  }
  operador.hashContrasena = hashContrasena(nueva)
  operador.debeCambiarContrasena = false
  // Se cierran las demás sesiones: si la contraseña se cambia porque se filtró,
  // dejar sesiones vivas no sirve de nada.
  store.todo().sesiones = store.todo().sesiones.filter((s) => s.operadorId !== operadorId)
  store.guardar()
  registrar(operador.email, 'contrasena.cambiada', operador.id, {})
  return { ok: true }
}

/** Quita las sesiones vencidas. Se llama cada tanto desde el arranque. */
export function limpiarSesiones(): number {
  const datos = store.todo()
  const antes = datos.sesiones.length
  const ahora = new Date().toISOString()
  datos.sesiones = datos.sesiones.filter((s) => s.expiraEn > ahora)
  if (datos.sesiones.length !== antes) store.guardar()
  return antes - datos.sesiones.length
}

// ─────────────────────────────────────────────────────────────────────────────
// Segundo factor
// ─────────────────────────────────────────────────────────────────────────────

/*
 * COMO SE PONE ESTO SIN DEJAR AL EQUIPO FUERA
 *
 * Exigir el segundo factor de golpe habria cerrado el panel a todo el mundo en
 * el mismo despliegue que lo activa, empezando por quien tendria que arreglarlo.
 * Asi que va en dos tiempos, igual que el cambio de la contrasena inicial que ya
 * existia:
 *
 *   1. Quien tiene un rol de los que lo exigen y todavia no lo activo ENTRA,
 *      pero la respuesta trae `debeActivarSegundoFactor: true` y el panel lo
 *      manda a activarlo. Es un empujon, no una puerta cerrada.
 *   2. Una vez activado, ya no se puede entrar sin el codigo.
 *
 * Y para que «tenemos segundo factor» no acabe significando en la practica «lo
 * tiene activado una persona», `/healthz` publica cuantos operadores de rol
 * obligado siguen sin ponerlo. Lo que no se cuenta, no se hace.
 */

/** Roles a los que se les exige. Se puede ampliar sin tocar codigo. */
const rolesConSegundoFactor = (): Rol[] => {
  const puesto = String(process.env.GENESIS_2FA_ROLES ?? 'admin,cumplimiento')
  return puesto.split(',').map((r) => r.trim()).filter(Boolean) as Rol[]
}

export const exigeSegundoFactor = (rol: Rol): boolean =>
  rolesConSegundoFactor().includes(rol)

const activo = (o: Operador): boolean => Boolean(o.segundoFactor?.activadoEn)

/** El secreto en claro. Se guarda cifrado cuando hay llave de archivo. */
const secretoDe = (o: Operador): string | null => {
  const g = o.segundoFactor?.secreto
  return g ? descifrar(g) : null
}

/**
 * Prepara un segundo factor y devuelve lo que hay que enseniar UNA vez.
 *
 * Queda pendiente, no activo: mientras el operador no escriba un codigo bueno
 * no se le exige nada. Guardar un secreto y darlo por activo sin comprobar que
 * el telefono lo tiene de verdad es la forma mas facil de dejar a alguien fuera
 * de su propia cuenta.
 */
export function prepararSegundoFactor(operadorId: string):
  { ok: boolean; error?: string; secreto?: string; uri?: string } {
  const o = store.todo().operadores.find((x) => x.id === operadorId)
  if (!o) return { ok: false, error: 'No existe ese operador' }
  if (activo(o)) return { ok: false, error: 'Ya tiene segundo factor activo' }

  const secreto = generarSecreto()
  o.segundoFactor = {
    secreto: cifrar(secreto) ?? secreto,
    activadoEn: null,
    respaldos: [],
    respaldosUsados: 0,
  }
  store.guardar()
  registrar(o.email, 'segundofactor.preparado', o.id, {})
  return { ok: true, secreto, uri: uriOtpauth(secreto, o.email) }
}

/**
 * Activa el segundo factor comprobando que el operador ya lo tiene en el
 * telefono, y devuelve los codigos de recuperacion UNA sola vez.
 */
export function activarSegundoFactor(operadorId: string, codigo: string):
  { ok: boolean; error?: string; respaldos?: string[] } {
  const o = store.todo().operadores.find((x) => x.id === operadorId)
  if (!o?.segundoFactor) return { ok: false, error: 'No hay ningún segundo factor preparado' }
  if (activo(o)) return { ok: false, error: 'Ya está activo' }

  const secreto = secretoDe(o)
  if (!secreto) return { ok: false, error: 'No se pudo leer el secreto guardado' }

  const paso = verificarTotp(secreto, codigo)
  if (paso == null) return { ok: false, error: 'El código no es correcto' }

  const respaldos = generarCodigosRespaldo()
  o.segundoFactor.activadoEn = new Date().toISOString()
  o.segundoFactor.ultimoPaso = paso
  o.segundoFactor.respaldos = respaldos.map((c) => hashContrasena(normalizarRespaldo(c)))
  o.segundoFactor.respaldosUsados = 0
  store.guardar()
  registrar(o.email, 'segundofactor.activado', o.id, { respaldos: respaldos.length })

  // Se devuelven en claro esta unica vez. A partir de aca solo existen sus
  // hashes, igual que una contrasena.
  return { ok: true, respaldos }
}

/**
 * Quita el segundo factor. Solo un administrador, y queda escrito.
 *
 * Es la salida para el operador que perdio el telefono y gasto sus codigos de
 * recuperacion. Tambien es, por definicion, la forma de saltarse el segundo
 * factor: por eso la bitacora anota quien lo quito y a quien.
 */
export function quitarSegundoFactor(operadorId: string, actor: string):
  { ok: boolean; error?: string } {
  const o = store.todo().operadores.find((x) => x.id === operadorId)
  if (!o) return { ok: false, error: 'No existe ese operador' }
  if (!o.segundoFactor) return { ok: false, error: 'No tenía segundo factor' }
  delete o.segundoFactor
  store.guardar()
  registrar(actor, 'segundofactor.quitado', o.id, { operador: o.email, rol: o.rol })
  return { ok: true }
}

/**
 * Comprueba el segundo factor al entrar: primero el codigo del telefono, y si
 * no, uno de recuperacion.
 */
function pasaSegundoFactor(o: Operador, codigo: string): { ok: boolean; motivo?: string } {
  const sf = o.segundoFactor!
  const secreto = secretoDe(o)
  const limpio = String(codigo || '').trim()
  if (!limpio) return { ok: false, motivo: 'Hace falta el código de su aplicación de autenticación' }

  if (secreto) {
    const paso = verificarTotp(secreto, limpio)
    if (paso != null) {
      /* UN CODIGO NO SIRVE DOS VECES. Sin esto, quien lo vea por encima del
         hombro tiene treinta segundos para entrar con el mismo. */
      if (sf.ultimoPaso != null && paso <= sf.ultimoPaso) {
        return { ok: false, motivo: 'Ese código ya se usó. Espere al siguiente.' }
      }
      sf.ultimoPaso = paso
      return { ok: true }
    }
  }

  /* Uno de recuperacion. Se gasta: se quita del listado en cuanto cuadra.
     Solo se entra aca si lo escrito NO tiene forma de codigo del telefono. No
     es cosmetico: comparar contra un codigo de respaldo cuesta un scrypt, y son
     diez, asi que cada codigo de seis digitos equivocado disparaba diez scrypt
     seguidos. Se distinguen por la forma —seis digitos contra diez hexadecimales
     con guion— y distinguirlos no filtra nada, porque la forma de cada uno la
     conoce ya cualquiera que haya visto la pantalla. */
  if (/^\d{6}$/.test(limpio)) return { ok: false, motivo: 'El código no es correcto' }

  const buscado = normalizarRespaldo(limpio)
  const i = sf.respaldos.findIndex((h) => verificarContrasena(buscado, h))
  if (i >= 0) {
    sf.respaldos.splice(i, 1)
    sf.respaldosUsados++
    registrar(o.email, 'segundofactor.respaldo', o.id, { quedan: sf.respaldos.length })
    return { ok: true }
  }

  return { ok: false, motivo: 'El código no es correcto' }
}

/** Cuántos operadores de rol obligado siguen sin segundo factor. */
export function saludSegundoFactor(): {
  exigidoEnRoles: string[]
  activos: number
  obligadosSinPonerlo: number
  quienesFaltan: string[]
} {
  const ops = store.todo().operadores.filter((o) => o.activo)
  const faltan = ops.filter((o) => exigeSegundoFactor(o.rol) && !activo(o))
  return {
    exigidoEnRoles: rolesConSegundoFactor(),
    activos: ops.filter(activo).length,
    obligadosSinPonerlo: faltan.length,
    // El correo de un operador no es un dato sensible de titular y es lo unico
    // que convierte el numero en algo accionable: sin la lista, «faltan tres»
    // no dice a quien hay que escribirle.
    quienesFaltan: faltan.map((o) => o.email),
  }
}
