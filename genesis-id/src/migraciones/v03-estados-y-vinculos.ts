// SFSP v0.3 · revisión de los datos que ya existen (plan, tarea 0.6).
//
//   npx tsx src/migraciones/v03-estados-y-vinculos.ts                    # solo mira
//   npx tsx src/migraciones/v03-estados-y-vinculos.ts --aplicar-vencidas # cambia datos
//
// ESTE SCRIPT NO SE HA EJECUTADO contra ninguna base. Se escribió junto con el
// cambio y se deja para que una persona lo corra cuando decida, con el mismo
// GENESIS_MONGO_URL del servicio.
//
// Dos cosas del v0.3 tocan expedientes que ya existen, y ninguna se aplica
// sola al desplegar:
//
//   1. El estado `vencida`. Una verificada cuyo documento ya caducó DEBERÍA
//      estar vencida. Sin `--aplicar-vencidas` solo se cuentan; con él se
//      pasan por `vencer()`, que deja decisión, bitácora y aviso a las apps
//      como cualquier otro cambio de estado. Después se puede encender el
//      vencimiento diario con GENESIS_VENCER_AUTO=si.
//
//   2. Los vínculos sin dirección de billetera. Desde el v0.3 no se crea
//      ninguno así, pero los viejos siguen ahí y el límite de exposición no
//      los ve. NO se arreglan desde aquí —no hay de dónde sacar una dirección
//      que la app nunca mandó—: se cuentan por app, para saber a quién pedirle
//      que vuelva a vincular (el puente ya manda la dirección siempre).
//
// No imprime correos ni nombres: solo identificadores internos y recuentos.

import { iniciar, store } from '../store.js'
import * as ids from '../motor/identidades.js'
import { estadoPublicado, type EstadoPublicado } from '../motor/estados.js'
import { normalizarDireccion } from '../lib/direccion.js'

const APLICAR = process.argv.includes('--aplicar-vencidas')
const ACTOR = 'migracion:sfsp-v0.3'

await iniciar()
const { identidades } = store.todo()

// ── Estados, tal como se publican ────────────────────────────────────────────
const porEstado: Partial<Record<EstadoPublicado, number>> = {}
for (const i of identidades) {
  const e = estadoPublicado(i.estado)
  porEstado[e] = (porEstado[e] ?? 0) + 1
}
console.log(`Identidades: ${identidades.length}`)
console.log('Por estado publicado (Apéndice A):', porEstado)

// ── Verificadas con el documento vencido ─────────────────────────────────────
const vencibles = ids.verificadasConDocumentoVencido()
console.log(`\nVerificadas con el documento ya vencido: ${vencibles.length}`)
for (const i of vencibles) console.log(`  ${i.id}  vence ${i.vencimientoDocumento}`)

// ── Vínculos sin dirección válida ────────────────────────────────────────────
const sinDireccion: Record<string, number> = {}
const invalidas: Record<string, number> = {}
let sinNormalizar = 0
for (const i of identidades) {
  for (const v of i.vinculos ?? []) {
    if (!v.direccion) { sinDireccion[v.app] = (sinDireccion[v.app] ?? 0) + 1; continue }
    const n = normalizarDireccion(v.direccion)
    if (!n) invalidas[v.app] = (invalidas[v.app] ?? 0) + 1
    else if (n !== v.direccion) sinNormalizar++
  }
}
console.log('\nVínculos SIN dirección, por app:', sinDireccion)
console.log('Vínculos con dirección INVÁLIDA, por app:', invalidas)
console.log(`Vínculos con dirección válida pero no en minúsculas: ${sinNormalizar} ` +
  '(no hace falta tocarlos: las búsquedas por dirección ya comparan en minúsculas)')

// ── Aplicar, solo si se pidió ────────────────────────────────────────────────
if (!APLICAR) {
  console.log('\nNo se cambió nada. Para vencer las de arriba: --aplicar-vencidas')
  process.exit(0)
}
let hechas = 0
for (const i of vencibles) if (ids.vencer(i.id, ACTOR).ok) hechas++
await store.guardarYa()
console.log(`\nPasadas a vencida: ${hechas} de ${vencibles.length}`)
process.exit(0)
