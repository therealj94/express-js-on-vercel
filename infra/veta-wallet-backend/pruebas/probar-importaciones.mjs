/* Que cada `import` de un paquete exista en package.json.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * El 21-ago un `import bcrypt from "bcryptjs"` —el paquete se llama `bcrypt`,
 * sin el js— compilo sin una queja y tumbo el servicio entero: babel no
 * resuelve los imports, los resuelve node al arrancar, y para entonces ya
 * estaba desplegado. Quince minutos de 503 para todos.
 *
 * Es el fallo mas barato de cometer y el mas caro de descubrir: no lo ve el
 * editor, no lo ve `node --check`, y el build de Heroku lo da por bueno.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { builtinModules } from 'module'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const pkg = JSON.parse(readFileSync(RAIZ + '/package.json', 'utf8'))
/* LOS QUE SOLO EXISTEN CON EL PREFIJO `node:`.
 *
 * `builtinModules` NO los trae, y no es un descuido de Node: los dejó fuera a
 * propósito porque no se pueden importar sin el prefijo, así que ponerlos en
 * esa lista haría creer que `import 'test'` funciona.
 *
 * Sin esto, esta prueba marcaba `node:test` como «no está en package.json» y
 * pedía instalar como dependencia algo que viene dentro de Node. Un archivo
 * que usa el corredor de pruebas de Node quedaba en rojo para siempre, y el
 * arreglo obvio —agregarlo a package.json— habría instalado un paquete ajeno
 * con ese nombre. */
const SOLO_CON_PREFIJO = ['test', 'test/reporters', 'sea', 'sqlite']

const tengo = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
  ...builtinModules, ...builtinModules.map(m => 'node:' + m),
  ...SOLO_CON_PREFIJO.map(m => 'node:' + m),
])

function archivos(dir) {
  const fuera = []
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git' || n.startsWith('.')) continue
    const r = dir + '/' + n
    if (statSync(r).isDirectory()) fuera.push(...archivos(r))
    else if (n.endsWith('.js') || n.endsWith('.mjs')) fuera.push(r)
  }
  return fuera
}

let fallos = 0
for (const r of archivos(RAIZ)) {
  const txt = readFileSync(r, 'utf8')
  const usados = new Set()
  for (const m of txt.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) usados.add(m[1])
  for (const m of txt.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) usados.add(m[1])

  for (const u of usados) {
    if (u.startsWith('.') || u.startsWith('/')) continue      // ruta local
    // Un subcamino como `@scure/bip39/wordlists/english.js` cuelga del paquete.
    const paquete = u.startsWith('@') ? u.split('/').slice(0, 2).join('/') : u.split('/')[0]
    if (!tengo.has(paquete)) {
      console.log(` FALLA  ${r.replace(RAIZ + '/', '')} importa «${u}» y no está en package.json`)
      fallos++
    }
  }
}
console.log(fallos ? `\n${fallos} importación(es) que no existen\n` : '\nTodo importa algo que existe\n')
process.exit(fallos ? 1 : 0)
