// Verifica el codificador de QR contra la implementacion de referencia.
//
// "Parece un QR" no es una prueba. Un solo bit mal puesto y el telefono no lee
// el codigo, y eso no se ve mirando la imagen — se ve comparando modulo a
// modulo contra una implementacion que ya funciona.
//
// La referencia se fuerza a modo byte. Sin eso optimiza segmentos (parte el
// texto en tramos numericos y alfanumericos para ahorrar espacio) y produce un
// codigo distinto pero igual de valido: la comparacion fallaria sin que hubiera
// nada roto.
//
//   node qr.prueba.mjs

import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const ref = require('../veta-wallet-app/node_modules/qrcode')

// El archivo se evalua como lo evalua el navegador: un <script> suelto, sin
// sistema de modulos. Importarlo con require() no sirve — el repositorio
// declara "type": "module", node trata el .js como ESM, `module` no existe y el
// export queda vacio. La prueba tiene que cargar el mismo codigo que sirve la
// pagina, no una version envuelta para que node la acepte.
const marco = { exports: {} }
new Function('module', 'exports', readFileSync(new URL('./veta-wallet/qr.js', import.meta.url), 'utf8'))(marco, marco.exports)
const QR = marco.exports

let fallos = 0, distintaMascara = 0, casos = 0

// Lo que decide si un telefono lee el codigo son los datos, la correccion de
// errores, la retícula y el formato. La mascara no: cual se uso va escrita
// dentro del propio codigo, y cualquier lector deshace la que sea.
//
// Por eso la prueba no exige que la matriz salga identica a la de la
// referencia. Exige que exista una de las ocho mascaras con la que salga
// identica — eso demuestra que todo lo que importa coincide. Cuando ademas
// coincide la mascara elegida, mejor; cuando no, es que las dos puntuaron casi
// igual (se vio un caso con 466 contra 467) y las dos son validas.
const comprobar = (etiqueta, texto) => {
  casos++
  const r = ref.create([{ data: texto, mode: 'byte' }], { errorCorrectionLevel: 'M' })
  const n = r.modules.size
  const suyo = (y, x) => (r.modules.data[y * n + x] ? 1 : 0)
  const mio = QR.matriz(texto)
  if (mio.length !== n) {
    console.log(`  FALLA ${etiqueta}\n         version distinta: ${(mio.length - 17) / 4} vs ${(n - 17) / 4}`)
    return fallos++
  }
  const igual = m => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x] !== suyo(y, x)) return false
    return true
  }
  if (igual(mio)) return console.log(`  ok    ${etiqueta.padEnd(46)} ${n}×${n}`)

  const version = (n - 17) / 4
  const palabras = QR._piezas.entrelazar(QR._piezas.bits(texto, version), version)
  for (let k = 0; k < 8; k++) {
    if (igual(QR._piezas.armar(version, palabras, k))) {
      distintaMascara++
      return console.log(`  ok    ${etiqueta.padEnd(46)} ${n}×${n}  (otra mascara, misma informacion)`)
    }
  }
  let malos = 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (mio[y][x] !== suyo(y, x)) malos++
  console.log(`  FALLA ${etiqueta}\n         ${malos} de ${n * n} modulos distintos con las ocho mascaras`)
  fallos++
}

// ── lo que de verdad generan las dos aplicaciones ────────────────────────────
console.log('cargas reales:')
comprobar('direccion de billetera', '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2')
comprobar('cobro de MyTokenPay', 'mtp://pago?comercio=mtp-hn-1&origen=12.5')
comprobar('enlace para recibir', 'https://www.vetawallet.com/recibir/0x1234567890abcdef1234567890abcdef12345678')
comprobar('nombre con acentos', 'Ñandú café · Tegucigalpa · 12,50 ORIGEN')
comprobar('un solo caracter', 'a')

// ── y todas las versiones, porque el codificador las ofrece ─────────────────
// Aqui aparecio el fallo que importaba: de la version 1 a la 6 todo coincidia y
// de la 7 en adelante nada. La 7 es donde el estandar añade el bloque con el
// numero de version, que faltaba — y sin reservarle sitio los datos se metian
// dentro.
console.log('\ntodas las versiones:')
const CAP = { 1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152, 9: 180,
              10: 213, 11: 251, 12: 287, 13: 331, 14: 362, 15: 412 }
for (let v = 1; v <= 15; v++) comprobar(`version ${v} (${CAP[v]} bytes)`, 'A'.repeat(CAP[v]))

console.log(fallos
  ? `\n${fallos} caso(s) no coinciden`
  : `\nCoincide con la referencia en los ${casos} casos` +
    (distintaMascara ? ` (${distintaMascara} con otra mascara igual de valida)` : ', modulo a modulo'))
process.exit(fallos ? 1 : 0)
