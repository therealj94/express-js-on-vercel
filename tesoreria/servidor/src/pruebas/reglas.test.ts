// Pruebas de las reglas (app/reglas.js) tal como las carga el servidor.
// Son las invariantes que sostienen todo: si una de estas falla, el resto del
// sistema es decoración.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { R, SEMILLA } from '../reglas.js'
import { sha256 } from '../cripto.js'

const fresco = () => { const e = R.clon(SEMILLA.estado); R.sellarLibro(e, sha256); return e }
const ctx = (rol = 'presidente', actor = 'J. Enamorado') => ({ actor, rol, hash: sha256 })

test('la semilla cuadra: ORIGEN respaldado por encima del objetivo', () => {
  const r = R.respaldo(fresco())
  assert.equal(r.valorUnidad, 2)
  assert.equal(r.emitido, 50500000)
  assert.equal(r.admisible, 59145000)
  assert.equal(r.salud, 'ok')
  assert.equal(r.libre, 6270000)
})

test('un certificado vencido o en revisión vale cero', () => {
  const e = fresco()
  assert.equal(R.valorAdmisible(e.reservas.find((r: any) => r.id === 'RES-AG-07')), 0)
  assert.equal(R.valorAdmisible(e.reservas.find((r: any) => r.id === 'RES-PLA-06')), 0)
})

test('la valuación en oro mueve el respaldo: si el oro baja, el ORIGEN vale más gramos de reserva… y el ratio se recalcula', () => {
  const e = fresco()
  const r = R.ejecutar(e, 'politica.oro', { usdPorGramo: 220, fuente: 'prueba' }, ctx())
  const s = R.respaldo(r.estado)
  assert.equal(s.valorUnidad, 4)
  assert.equal(s.emitido, 101000000)
  assert.equal(s.salud, 'bad')       // 59 M de reservas no cubren 101 M de ORIGEN
  assert.equal(R.puedeEmitir(r.estado, 1).ok, false)
})

test('no se emite ORIGEN si el ratio cae bajo el mínimo', () => {
  const e = fresco()
  assert.throws(() => R.ejecutar(e, 'origen.emitir', { unidades: 3000000, reservaId: 'RES-AU-01' }, ctx()), /bajo el mínimo/)
  const ok = R.ejecutar(e, 'origen.emitir', { unidades: 100000, reservaId: 'RES-AU-01' }, ctx())
  assert.equal(ok.estado.origen.emitido, 26100000)
})

test('no se quema ORIGEN comprometido en tokens', () => {
  assert.throws(() => R.ejecutar(fresco(), 'origen.quemar', { unidades: 5000000, motivo: 'x' }, ctx()), /comprometido/)
})

test('el rol decide: el auditor no puede nada, el tesorero no firma', () => {
  assert.throws(() => R.ejecutar(fresco(), 'reserva.revision', { id: 'RES-AU-01' }, ctx('auditor', 'A')), /permiso/)
  assert.throws(() => R.ejecutar(fresco(), 'solicitud.firmar', { id: 'SOL-0001' }, ctx('tesorero', 'M. Arroyo')), /permiso/)
})

test('aprobar exige firmas suficientes y respaldo libre', () => {
  let e = fresco()
  assert.throws(() => R.ejecutar(e, 'solicitud.aprobar', { id: 'SOL-0001' }, ctx()), /Faltan firmas/)
  e = R.ejecutar(e, 'solicitud.firmar', { id: 'SOL-0001', firmante: 'J. Enamorado' }, ctx()).estado
  e = R.ejecutar(e, 'solicitud.firmar', { id: 'SOL-0001', firmante: 'M. Arroyo' }, ctx('consejero', 'M. Arroyo')).estado
  e = R.ejecutar(e, 'solicitud.aprobar', { id: 'SOL-0001' }, ctx()).estado
  assert.equal(R.respaldo(e).libre, 270000)
  // Una solicitud firmada por todos pero que excede lo libre no pasa, aunque venga con causa y evidencias.
  const s = e.solicitudes.find((x: any) => x.id === 'SOL-0002')
  s.origenRequerido = 2000000
  s.firmas = ['J. Enamorado', 'M. Arroyo', 'L. Bermúdez'].map((quien) => ({ quien, ts: new Date().toISOString() }))
  assert.throws(() => R.ejecutar(e, 'solicitud.aprobar', { id: 'SOL-0002' }, ctx()), /Solo hay/)
  assert.equal(R.puedeEmitir(e, 2000000).ok, false)
})

test('la valuación es un techo: no se piden tokens por encima de ella', () => {
  const e = fresco()
  assert.throws(() => R.ejecutar(e, 'solicitud.crear', { tokenId: 'SEC-ONDK', cantidad: 100000000, precio: 0.06, causa: 'revaluacion', motivo: 'x' }, ctx()), /valuación certificada/)
  // Con precio distinto al establecido tampoco.
  assert.throws(() => R.ejecutar(e, 'solicitud.crear', { tokenId: 'SEC-ONDK', cantidad: 10, precio: 0.07, causa: 'revaluacion', motivo: 'x' }, ctx()), /precio establecido/)
})

test('emitir exige cabecera Y respaldo Y capacidad', () => {
  const e = fresco()
  // ONDK no tiene cabecera.
  assert.throws(() => R.ejecutar(e, 'token.emitir', { tokenId: 'SEC-ONDK', cantidad: 1 }, ctx()), /autorizados sin emitir/)
  // MTP: forzamos cabecera, pero el ORIGEN asignado (260 k) solo cubre 2.6 M tokens.
  const t = R.buscar.utility(e, 'UTL-MTP'); t.supply.autorizado = 3200000
  assert.throws(() => R.ejecutar(e, 'token.emitir', { tokenId: 'UTL-MTP', cantidad: 300000 }, ctx()), /ORIGEN asignado/)
})

test('el mercado secundario respeta la banda y el régimen', () => {
  const e = fresco()
  assert.throws(() => R.ejecutar(e, 'orden.colocar', { tokenId: 'SEC-ONDK', lado: 'compra', cantidad: 100, precio: 0.07 }, ctx()), /fuera de banda/)
  assert.throws(() => R.ejecutar(e, 'orden.colocar', { tokenId: 'SEC-MPLE', lado: 'compra', cantidad: 100, precio: 25 }, ctx()), /suspendido/)
  const ok = R.ejecutar(e, 'orden.colocar', { tokenId: 'SEC-ONDK', lado: 'venta', cantidad: 100, precio: 0.0603 }, ctx())
  const cruce = R.ejecutar(ok.estado, 'mercado.cruzar', { tokenId: 'SEC-ONDK' }, ctx())
  assert.equal(cruce.estado.securities[0].mercado.ultimaOperacion, 0.0603)
})

test('el transfer agent bloquea lock-up y destinatarios sin Genesis ID', () => {
  const e = fresco()
  assert.throws(() => R.ejecutar(e, 'token.transferir', { tokenId: 'SEC-MPLE', de: 'TEN-006', a: 'TEN-008', cantidad: 10 }, ctx()), /lock-up/)
  const ok = R.ejecutar(e, 'token.transferir', { tokenId: 'SEC-ONDK', de: 'TEN-001', a: 'TEN-003', cantidad: 1000 }, ctx())
  assert.equal(ok.estado.tenedores.find((x: any) => x.id === 'TEN-003').cantidad, 74926000)
})

test('quemar libera respaldo y lo devuelve al pozo libre', () => {
  const e = fresco()
  const antes = R.respaldo(e).libre
  const r = R.ejecutar(e, 'token.quemar', { tokenId: 'UTL-VETA', cantidad: 100000, motivo: 'consumo' }, ctx())
  // 100 000 × 0.85 × 30 % = 25 500 USD liberados
  assert.equal(Math.round(R.respaldo(r.estado).libre - antes), 25500)
})

test('un utility no circula sin capacidad', () => {
  const e = fresco()
  assert.throws(() => R.ejecutar(e, 'capacidad.actualizar', { tokenId: 'UTL-VETA', comprometida: 1000 }, ctx()), /sin servicio/)
  assert.throws(() => R.ejecutar(e, 'solicitud.crear', { tokenId: 'UTL-MTP', cantidad: 100000, precio: 0.5, causa: 'demanda', motivo: 'x' }, ctx()), /capacidad de servicio/)
})

test('el libro se rompe si alguien toca un asiento viejo', () => {
  const e = fresco()
  const r = R.ejecutar(e, 'sistema.freno', { congelar: true }, ctx())
  assert.equal(R.verificarLibro(r.estado, sha256).ok, true)
  r.estado.libro[3].detalle = 'esto no pasó'
  const v = R.verificarLibro(r.estado, sha256)
  assert.equal(v.ok, false)
  assert.equal(v.en, r.estado.libro[3].id)
})

test('la política no admite un mínimo bajo 100 % ni más firmas que consejeros', () => {
  const e = fresco()
  assert.throws(() => R.ejecutar(e, 'politica.modificar', { ratioObjetivo: 110, ratioMinimo: 95, firmasRequeridas: 3, diasObjecion: 7, revisionValuacionMeses: 6 }, ctx()), /100%/)
  assert.throws(() => R.ejecutar(e, 'politica.modificar', { ratioObjetivo: 115, ratioMinimo: 105, firmasRequeridas: 9, diasObjecion: 7, revisionValuacionMeses: 6 }, ctx()), /consejeros/)
})
