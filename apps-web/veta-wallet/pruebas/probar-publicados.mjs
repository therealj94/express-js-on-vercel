/* QUE SE PUBLICA, Y QUE NO SE LE ESCONDE A NADIE.
 *
 * Esta prueba existe por las dos formas en que este cambio se rompe solo:
 *
 *   1. Alguien vuelve a listar un activo despublicado sin querer —toca una de
 *      las copias de la tabla y no las otras— y Ordenex le abre mercado a algo
 *      que la billetera no enseña, o al reves.
 *
 *   2. Alguien «limpia» la tabla borrando los nueve despublicados. Eso no los
 *      deja de publicar: le apaga el saldo de la pantalla a quien los tenga.
 *      Es el error caro, y es el que mas facil parece una mejora.
 *
 * Se comprueban las TRES copias de la web y la regla de la lista.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createContext, runInContext } from 'node:vm'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..', '..', '..')

const PUBLICADOS = ['ORIGEN', 'AUKA', 'AGKA', 'ONDK', 'IBS', 'HARV']
const DESPUBLICADOS = ['MNKA', 'AUBEX', 'ASL', 'LOVE', 'REST', 'SOL', 'AIT', 'AGRO', 'POLITICAL']
const TODOS = [...PUBLICADOS, ...DESPUBLICADOS]

let fallos = 0
const ok = (que, cond) => {
  console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}`)
  if (!cond) fallos++
}
const mismos = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

function cargar(ruta) {
  const ctx = createContext({ window: {}, fetch: () => {}, console })
  runInContext(readFileSync(join(raiz, ruta), 'utf8') + '; this.__C = CADENA;', ctx)
  return ctx.__C
}

console.log('\nLa tabla, en sus tres copias\n')

const billetera = cargar('apps-web/veta-wallet/cadena.js')
const ordenex = cargar('apps-web/ordenex/cadena.js')

for (const [nombre, C] of [['billetera', billetera], ['ordenex', ordenex]]) {
  // Los quince siguen ahi: es lo que permite leer el saldo de un despublicado.
  ok(`${nombre}: la tabla conserva los quince activos`,
    mismos(C.TOKENS.map(t => t.s), TODOS))
  ok(`${nombre}: publica exactamente los seis`, mismos(C.PUBLICOS, PUBLICADOS))
  for (const s of DESPUBLICADOS) {
    ok(`${nombre}: ${s} se sigue leyendo pero no se publica`,
      C.TOKENS.some(t => t.s === s) && !C.esPublico(s))
  }
}

// La tercera copia: el backend, que es de donde salen los saldos.
const saldos = readFileSync(join(raiz, 'infra/veta-wallet-backend/lib/saldos.js'), 'utf8')
const enBackend = [...saldos.matchAll(/simbolo:\s*"([A-Z]+)"/g)].map(m => m[1])
ok('backend: sigue leyendo los quince', mismos(enBackend, TODOS))

console.log('\nOrdenex no abre mercado a lo despublicado\n')

ok('los pares son solo de lo publicado',
  mismos(ordenex.PARES, PUBLICADOS.filter(s => s !== 'ORIGEN').map(s => `${s}-ORIGEN`)))
for (const s of DESPUBLICADOS) {
  ok(`baseDe('${s}-ORIGEN') no resuelve`, ordenex.baseDe(`${s}-ORIGEN`) === null)
}
ok("baseDe('AUKA-ORIGEN') sigue resolviendo", ordenex.baseDe('AUKA-ORIGEN') === 'AUKA')

console.log('\nLa regla de la lista: se ve lo publicado, y ademas lo que uno tenga\n')

/* Es la misma expresion que usa `listaTokens()` en app.js y
   `tokensFromBalances()` en las dos apps de telefono. Si alguna se separa de
   esta, se separa de la decision. */
const aLaVista = (filas) => filas.filter(x => x.publico !== false || (x.cant ?? 0) > 0)

const caso = [
  { s: 'ORIGEN', publico: true, cant: 10 },
  { s: 'AUKA', publico: true, cant: 0 },
  { s: 'MNKA', publico: false, cant: 5000 },
  { s: 'AGRO', publico: false, cant: 0 },
]
const visto = aLaVista(caso).map(x => x.s)
ok('un publicado en cero se sigue viendo', visto.includes('AUKA'))
ok('un DESPUBLICADO CON SALDO se sigue viendo — no se le esconde el dinero a nadie',
  visto.includes('MNKA'))
ok('un despublicado en cero se va', !visto.includes('AGRO'))

console.log('\nLas apps de telefono aplican la misma regla\n')

for (const app of ['veta-wallet-app', 'orden-global-app']) {
  const data = readFileSync(join(raiz, app, 'src/data.js'), 'utf8')
  const meta = [...data.matchAll(/^ {2}([A-Z]+):\s*\{ s: '\1'.*?publico: (true|false)/gm)]
    .map(m => [m[1], m[2] === 'true'])
  ok(`${app}: la tabla conserva los quince`, mismos(meta.map(m => m[0]), TODOS))
  ok(`${app}: publica exactamente los seis`,
    mismos(meta.filter(m => m[1]).map(m => m[0]), PUBLICADOS))
  // El filtro tiene que dejar pasar lo que se tiene. Si alguien lo cambia por
  // un `m.publico !== false` a secas, esta linea se pone roja.
  ok(`${app}: el filtro deja pasar un despublicado con saldo`,
    /Number\(b\.qty\) > 0/.test(data))
}

console.log(fallos ? `\n${fallos} en rojo\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
