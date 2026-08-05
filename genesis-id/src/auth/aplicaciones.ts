// Aplicaciones del ecosistema y sus claves de API.
//
// Veta Wallet, ordenscan y MyTokenPay hablan con Genesis ID a través de estas
// claves. Cada una tiene sus propios alcances, así que una clave filtrada no da
// acceso a todo: la de ordenscan puede consultar si un GID está verificado,
// pero no puede crear identidades ni ver documentos.
//
// De la clave solo se guarda el hash. Se muestra entera una única vez, al
// crearla. Si se pierde, se revoca y se emite otra — no hay forma de
// recuperarla, y eso es exactamente lo que se quiere.

import { store } from '../store.js'
import { generarClaveApi, hashClaveApi } from '../lib/cripto.js'
import { id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import type { Aplicacion } from '../types.js'

/** Qué puede pedir cada aplicación. */
export const ALCANCES = {
  'identidad.crear': 'Iniciar una identidad para un usuario',
  'identidad.leer': 'Consultar el estado de una identidad propia',
  'identidad.documento': 'Subir documento y biometría',
  'gid.verificar': 'Comprobar si un GID está verificado (solo sí/no y nivel)',
  'gid.perfil': 'Leer el perfil básico asociado a un GID',
  'vinculo.crear': 'Atar una cuenta de la app a un GID',
  'negocio.crear': 'Registrar un negocio para KYB',
  'movimiento.enviar': 'Enviar movimientos para monitoreo AML',
  'tamiz.direccion': 'Consultar si una dirección está sancionada',
} as const

export type Alcance = keyof typeof ALCANCES

/** Las tres aplicaciones del ecosistema y lo que necesita cada una. */
export const APPS_ECOSISTEMA: { clave: string; nombre: string; alcances: Alcance[] }[] = [
  {
    clave: 'veta-wallet',
    nombre: 'Veta Wallet',
    // Es la app donde el usuario hace su KYC, así que necesita el flujo entero,
    // y además manda movimientos para el monitoreo.
    alcances: [
      'identidad.crear', 'identidad.leer', 'identidad.documento',
      'gid.verificar', 'gid.perfil', 'vinculo.crear',
      'movimiento.enviar', 'tamiz.direccion',
    ],
  },
  {
    clave: 'mytokenpay',
    nombre: 'MyTokenPay',
    // Cobros de comercios: KYC personal del dueño y KYB del negocio.
    alcances: [
      'identidad.crear', 'identidad.leer', 'identidad.documento',
      'gid.verificar', 'gid.perfil', 'vinculo.crear',
      'negocio.crear', 'movimiento.enviar',
    ],
  },
  {
    clave: 'ordenscan',
    nombre: 'ordenscan',
    // Un explorador es público: solo necesita saber si una dirección tiene
    // identidad verificada detrás. Nada de datos personales.
    alcances: ['gid.verificar', 'tamiz.direccion'],
  },
]

export function crearAplicacion(clave: string, nombre: string, alcances: string[]): {
  aplicacion: Aplicacion; clave_secreta: string
} {
  const secreta = generarClaveApi(process.env.NODE_ENV === 'production' ? 'live' : 'test')
  const aplicacion: Aplicacion = {
    id: id('app'),
    clave,
    nombre,
    hashClave: hashClaveApi(secreta),
    pistaClave: `…${secreta.slice(-6)}`,
    alcances,
    activa: true,
    creadaEn: new Date().toISOString(),
    ultimoUso: null,
  }
  store.todo().aplicaciones.push(aplicacion)
  store.guardar()
  return { aplicacion, clave_secreta: secreta }
}

/** Da de alta las tres apps del ecosistema si aún no existen. */
export function asegurarAplicaciones(): { clave: string; secreta: string }[] {
  const nuevas: { clave: string; secreta: string }[] = []
  for (const def of APPS_ECOSISTEMA) {
    if (store.todo().aplicaciones.some((a) => a.clave === def.clave)) continue
    const { clave_secreta } = crearAplicacion(def.clave, def.nombre, def.alcances)
    nuevas.push({ clave: def.clave, secreta: clave_secreta })
    registrar('sistema', 'aplicacion.creada', def.clave, { alcances: def.alcances })
  }
  return nuevas
}

export function aplicacionDeClave(clave: string): Aplicacion | null {
  if (!clave) return null
  const hash = hashClaveApi(clave)
  const app = store.todo().aplicaciones.find((a) => a.hashClave === hash)
  if (!app || !app.activa) return null
  app.ultimoUso = new Date().toISOString()
  store.guardar()
  return app
}

export function revocar(idApp: string, actor: string): boolean {
  const app = store.todo().aplicaciones.find((a) => a.id === idApp)
  if (!app) return false
  app.activa = false
  store.guardar()
  registrar(actor, 'aplicacion.revocada', app.clave, {})
  return true
}

/** Emite una clave nueva para una app existente e invalida la anterior. */
export function rotar(idApp: string, actor: string): string | null {
  const app = store.todo().aplicaciones.find((a) => a.id === idApp)
  if (!app) return null
  const secreta = generarClaveApi(process.env.NODE_ENV === 'production' ? 'live' : 'test')
  app.hashClave = hashClaveApi(secreta)
  app.pistaClave = `…${secreta.slice(-6)}`
  app.activa = true
  store.guardar()
  registrar(actor, 'aplicacion.rotada', app.clave, {})
  return secreta
}
