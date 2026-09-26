// SFSP v0.3 · revisión de los datos que ya existen (plan, tarea 0.6).
//
//   npx tsx src/migraciones/v03-estados-y-vinculos.ts      # solo mira
//
// SOLO LEE, SIEMPRE. Se puede correr con el servicio encendido y con el mismo
// GENESIS_MONGO_URL: abre el almacén con `iniciarSoloLectura()`, que lee el
// documento de estado, cierra la conexión y deja el almacén de este proceso
// negándose a volcar. No carga la bitácora ni migra nada.
//
// POR QUE NO CAMBIA NADA DESDE AQUÍ
//
// Tenía una bandera, `--aplicar-vencidas`, que vencía identidades desde este
// proceso. No se puede hacer así: el servicio guarda todo en memoria, vuelca
// el estado entero sobre un solo documento y lleva su propio contador de la
// bitácora sobre un índice único. Un segundo proceso que escribe le pisa la
// foto y le ocupa los sitios de la bitácora; desde ese momento el servicio no
// persiste nada más —aunque siga contestando 200— y al siguiente reinicio se
// pierde todo lo hecho en memoria. La bandera ahora se niega y lo explica.
//
// El vencimiento se aplica DENTRO del servicio: GENESIS_VENCER_AUTO=si hace que
// la vuelta diaria del temporizador de listas (src/aml/temporizador.ts) pase a
// `vencida` las verificadas con el documento caducado, con decisión, bitácora y
// aviso a las apps como cualquier otro cambio de estado. Esa vuelta necesita el
// temporizador de listas encendido (GENESIS_LISTAS_AUTO no en «no»).
//
// Dos cosas del v0.3 tocan expedientes que ya existen, y ninguna se aplica
// sola al desplegar:
//
//   1. El estado `vencida`. Una verificada cuyo documento ya caducó DEBERÍA
//      estar vencida. Aquí solo se cuentan, para saber qué va a pasar antes de
//      encender GENESIS_VENCER_AUTO.
//
//   2. Los vínculos sin dirección de billetera. Desde el v0.3 no se crea
//      ninguno así, pero los viejos siguen ahí y el límite de exposición no
//      los ve. NO se arreglan desde aquí —no hay de dónde sacar una dirección
//      que la app nunca mandó—: se cuentan por app, para saber a quién pedirle
//      que vuelva a vincular (el puente ya manda la dirección siempre).
//
// No imprime correos ni nombres: solo identificadores internos y recuentos.

// La bandera vieja se rechaza ANTES de abrir nada.
if (process.argv.slice(2).some((a) => a.startsWith('--aplicar'))) {
  console.error(
    'Este script ya no cambia datos: solo lee.\n' +
    'Vencer desde un proceso aparte del servicio deja al servicio sin poder guardar\n' +
    '(le pisa el estado y le ocupa la bitácora) y termina en pérdida de datos.\n' +
    'Para vencer las verificadas con el documento caducado, encienda\n' +
    'GENESIS_VENCER_AUTO=si en el servicio: lo hace él mismo en su vuelta diaria.')
  process.exit(2)
}

const { iniciarSoloLectura, store } = await import('../store.js')
const ids = await import('../motor/identidades.js')
const { estadoPublicado } = await import('../motor/estados.js')
const { normalizarDireccion } = await import('../lib/direccion.js')
type EstadoPublicado = import('../motor/estados.js').EstadoPublicado

await iniciarSoloLectura()
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

console.log('\nNo se cambió nada: este script solo lee. Las vencibles de arriba las pasa a ' +
  'vencida el propio servicio con GENESIS_VENCER_AUTO=si.')
process.exit(0)
