// Modo demostración.
//
// Sin Genesis ID configurado no hay forma de verificar a nadie, y sin
// verificación no se puede operar: la plataforma sería una vitrina vacía.
// En modo demo se siembran usuarios ya «verificados» (con GID de prueba,
// reconocible por el sufijo -D), saldos del grifo, métodos de pago y anuncios
// en varios países, para que cualquiera pueda recorrer el flujo entero:
// abrir una orden, chatear, marcar pagado, liberar, apelar.
//
// Se activa con ORDENEX_DEMO=1, y por defecto cuando NO hay clave de Genesis
// y no se está en producción. En producción nunca se activa solo.

import { store } from '../store.js'
import { Dec } from '../lib/decimal.js'
import * as usuarios from './usuarios.js'
import * as billetera from './billetera.js'
import * as metodosPago from './metodosPago.js'
import * as anuncios from './anuncios.js'
import { genesisConfigurado } from './genesis.js'
import { hayPrecioMetal, referenciaFiat } from './precios.js'
import { registrar } from './bitacora.js'
import type { Usuario } from '../types.js'

const EN_PRODUCCION = process.env.NODE_ENV === 'production'

export function modoDemo(): boolean {
  const v = (process.env.ORDENEX_DEMO || '').trim()
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return !EN_PRODUCCION && !genesisConfigurado()
}

export interface UsuarioDemo {
  apodo: string; pais: string; agente: boolean; descripcion: string; email: string
}

const CONTRASENA = 'demo1234'

const SEMILLA: (Omit<UsuarioDemo, 'email'> & { metodos: { tipo: string; banco?: string; campos: Record<string, string> }[]; saldo: string })[] = [
  { apodo: 'OroTegus', pais: 'HN', agente: true, descripcion: 'Agente de cambio en Tegucigalpa · vende y compra ORIGEN en lempiras', saldo: '25000',
    metodos: [{ tipo: 'transferencia', banco: 'BAC Credomatic', campos: { cuenta: '730012345678', tipoCuenta: 'Ahorro' } }, { tipo: 'tigo-money', campos: { telefono: '+504 9988 7766' } }] },
  { apodo: 'CambioChapin', pais: 'GT', agente: true, descripcion: 'Agente en Ciudad de Guatemala · quetzales', saldo: '18000',
    metodos: [{ tipo: 'transferencia', banco: 'Banco Industrial', campos: { cuenta: '0010-2233-4455', tipoCuenta: 'Monetaria' } }] },
  { apodo: 'PixBrasil', pais: 'BR', agente: true, descripcion: 'Agente en São Paulo · reales por PIX', saldo: '40000',
    metodos: [{ tipo: 'pix', campos: { llave: 'oro@ordenglobal.link', tipoLlave: 'correo' } }] },
  { apodo: 'NequiCol', pais: 'CO', agente: false, descripcion: 'Usuario en Bogotá · pesos colombianos por Nequi', saldo: '9000',
    metodos: [{ tipo: 'nequi', campos: { telefono: '+57 310 555 1234' } }] },
  { apodo: 'YapePeru', pais: 'PE', agente: false, descripcion: 'Usuario en Lima · soles por Yape', saldo: '6000',
    metodos: [{ tipo: 'yape', campos: { telefono: '+51 987 654 321' } }] },
  { apodo: 'SpeiMX', pais: 'MX', agente: true, descripcion: 'Agente en Ciudad de México · pesos por SPEI', saldo: '30000',
    metodos: [{ tipo: 'transferencia', banco: 'BBVA México', campos: { clabe: '012180001234567890', cuenta: '0123456789' } }] },
  { apodo: 'SinpeCR', pais: 'CR', agente: false, descripcion: 'Usuario en San José · colones por SINPE Móvil', saldo: '5000',
    metodos: [{ tipo: 'sinpe-movil', campos: { telefono: '+506 8888 1234' } }] },
  { apodo: 'PagoMovilVE', pais: 'VE', agente: true, descripcion: 'Agente en Caracas · bolívares por Pago Móvil', saldo: '20000',
    metodos: [{ tipo: 'pago-movil', banco: 'Banco de Venezuela', campos: { telefono: '+58 412 555 9876', cedula: 'V-12345678' } }] },
  { apodo: 'MercadoAR', pais: 'AR', agente: false, descripcion: 'Usuario en Buenos Aires · pesos por Mercado Pago', saldo: '7000',
    metodos: [{ tipo: 'mercado-pago', campos: { alias: 'oro.digital.mp', cvu: '0000003100012345678901' } }] },
  { apodo: 'Comprador1', pais: 'HN', agente: false, descripcion: 'Comprador nuevo en Honduras, sin saldo: para probar comprar', saldo: '0',
    metodos: [{ tipo: 'transferencia', banco: 'Banco Atlántida', campos: { cuenta: '1234567890', tipoCuenta: 'Ahorro' } }] },
]

const ANUNCIOS: { apodo: string; lado: 'compra' | 'venta'; activo: 'ORIGEN' | 'AUKA' | 'AGKA'; margen?: number; cantidad: string; min: string; max: string; ventana: 15 | 30 | 45 | 60; terminos: string }[] = [
  { apodo: 'OroTegus', lado: 'venta', activo: 'ORIGEN', margen: 101.5, cantidad: '5000', min: '500', max: '60000', ventana: 15, terminos: 'Solo cuentas a nombre del comprador. No escriba «ORIGEN» en la referencia del pago.' },
  { apodo: 'OroTegus', lado: 'compra', activo: 'ORIGEN', margen: 98.5, cantidad: '5000', min: '500', max: '60000', ventana: 30, terminos: 'Pago inmediato tras confirmar. Libere con calma: pago solo desde mi cuenta BAC.' },
  { apodo: 'CambioChapin', lado: 'venta', activo: 'ORIGEN', margen: 102, cantidad: '3000', min: '200', max: '25000', ventana: 30, terminos: 'Transferencia desde cualquier banco de Guatemala.' },
  { apodo: 'PixBrasil', lado: 'venta', activo: 'ORIGEN', margen: 101, cantidad: '10000', min: '100', max: '50000', ventana: 15, terminos: 'PIX instantâneo. Envie o comprovante no chat.' },
  { apodo: 'PixBrasil', lado: 'venta', activo: 'AUKA', margen: 102.5, cantidad: '5', min: '1000', max: '80000', ventana: 30, terminos: 'Onças de ouro. Somente PIX.' },
  { apodo: 'NequiCol', lado: 'venta', activo: 'ORIGEN', margen: 103, cantidad: '2000', min: '50000', max: '4000000', ventana: 30, terminos: 'Nequi únicamente. Pago con comprobante.' },
  { apodo: 'YapePeru', lado: 'venta', activo: 'ORIGEN', margen: 102, cantidad: '1500', min: '50', max: '5000', ventana: 15, terminos: 'Yape al instante.' },
  { apodo: 'SpeiMX', lado: 'venta', activo: 'ORIGEN', margen: 101.2, cantidad: '8000', min: '500', max: '150000', ventana: 30, terminos: 'SPEI a la CLABE indicada. Sin terceros.' },
  { apodo: 'SpeiMX', lado: 'compra', activo: 'ORIGEN', margen: 99, cantidad: '8000', min: '500', max: '150000', ventana: 30, terminos: 'Compro ORIGEN, pago por SPEI en minutos.' },
  { apodo: 'SinpeCR', lado: 'venta', activo: 'ORIGEN', margen: 102.8, cantidad: '900', min: '5000', max: '500000', ventana: 15, terminos: 'SINPE Móvil al número indicado.' },
  { apodo: 'PagoMovilVE', lado: 'venta', activo: 'ORIGEN', margen: 104, cantidad: '6000', min: '2000', max: '400000', ventana: 15, terminos: 'Pago Móvil BDV. Enviar capture del pago.' },
  { apodo: 'PagoMovilVE', lado: 'venta', activo: 'AGKA', margen: 103, cantidad: '100', min: '2000', max: '400000', ventana: 30, terminos: 'Onzas de plata digital.' },
  { apodo: 'MercadoAR', lado: 'venta', activo: 'ORIGEN', margen: 105, cantidad: '2500', min: '20000', max: '4000000', ventana: 30, terminos: 'Mercado Pago o transferencia al CVU.' },
]

export const usuariosDemo = (): UsuarioDemo[] =>
  SEMILLA.map((s) => ({ apodo: s.apodo, pais: s.pais, agente: s.agente, descripcion: s.descripcion, email: `${s.apodo.toLowerCase()}@demo.ordenexchange` }))

export function entrarDemo(apodo: unknown): Usuario | null {
  const u = usuarios.porApodo(String(apodo || ''))
  if (!u || !u.email.endsWith('@demo.ordenexchange')) return null
  return u
}

/** Siembra una sola vez; en las siguientes arrancadas no toca nada. */
export function sembrar(): { sembrado: boolean; usuarios: number; anuncios: number } {
  if (store.todo().usuarios.some((u) => u.email.endsWith('@demo.ordenexchange'))) {
    return { sembrado: false, usuarios: 0, anuncios: 0 }
  }
  const creados = new Map<string, Usuario>()
  for (const s of SEMILLA) {
    const u = usuarios.crear({ email: `${s.apodo.toLowerCase()}@demo.ordenexchange`, contrasena: CONTRASENA, apodo: s.apodo, pais: s.pais }, 'demo')
    usuarios.verificarDemo(u, `${s.apodo} Demo`)
    // Que parezca una cuenta con historia: registrada hace tiempo.
    u.creadoEn = new Date(Date.now() - (30 + SEMILLA.indexOf(s) * 17) * 86400000).toISOString()
    if (Dec.esPositivo(s.saldo)) {
      billetera.acreditar(u.id, 'ORIGEN', s.saldo, 'faucet', null, 'Saldo de demostración')
      billetera.acreditar(u.id, 'AUKA', '10', 'faucet', null, 'Saldo de demostración')
      billetera.acreditar(u.id, 'AGKA', '200', 'faucet', null, 'Saldo de demostración')
    }
    for (const m of s.metodos) {
      try {
        metodosPago.crear(u, { pais: s.pais, tipo: m.tipo, banco: m.banco, titular: `${s.apodo} Demo`, campos: m.campos })
      } catch (e: any) {
        console.warn(`[demo] método ${m.tipo} en ${s.pais} no se pudo crear: ${e?.message}`)
      }
    }
    if (s.agente) {
      billetera.congelar(u.id, 'ORIGEN', store.todo().configuracion.garantiaAgente, 'garantia-agente', 'demo', 'Garantía de agente (demo)')
      u.agente = 'aprobado'
    }
    creados.set(s.apodo, u)
  }

  let nAnuncios = 0
  for (const a of ANUNCIOS) {
    const u = creados.get(a.apodo)!
    const misMetodos = metodosPago.listar(u.id)
    try {
      if (!hayPrecioMetal(a.activo) || referenciaFiat(a.activo, u.moneda) == null) {
        console.warn(`[demo] sin referencia para ${a.activo} en ${u.moneda}; anuncio de ${a.apodo} omitido`)
        continue
      }
      anuncios.crear(u, {
        lado: a.lado, activo: a.activo, moneda: u.moneda, pais: u.pais,
        tipoPrecio: 'flotante', margen: a.margen ?? 100,
        cantidadTotal: a.cantidad, limiteMin: a.min, limiteMax: a.max,
        metodosPagoIds: a.lado === 'venta' ? misMetodos.map((m) => m.id) : undefined,
        metodosTipos: a.lado === 'compra' ? misMetodos.map((m) => m.tipo) : undefined,
        ventanaPagoMin: a.ventana, terminos: a.terminos,
        respuestaAutomatica: 'Hola, gracias por la orden. Envíe el comprobante por aquí en cuanto pague.',
      })
      nAnuncios++
    } catch (e: any) {
      console.warn(`[demo] anuncio de ${a.apodo} (${a.lado} ${a.activo}) no se pudo crear: ${e?.message}`)
    }
  }
  registrar('sistema', 'demo.sembrada', 'demo', { usuarios: creados.size, anuncios: nAnuncios })
  store.guardar()
  return { sembrado: true, usuarios: creados.size, anuncios: nAnuncios }
}

export const CONTRASENA_DEMO = CONTRASENA
