/* Que al verificar una sesion se fije DE VERDAD el algoritmo de firma.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * Todo el backend verificaba asi:
 *
 *     jwt.verify(token, process.env.PASS_TOKEN, { algorithm: "HS256" })
 *
 * Esa opcion no existe. La de `verify` es `algorithms`, en plural y en lista;
 * `algorithm` en singular es la de `sign`. jsonwebtoken no avisa de opciones
 * que no conoce: las ignora. Asi que la guardia estaba escrita, se leia bien,
 * y no hacia absolutamente nada.
 *
 * Medido con la version que corre en produccion (jsonwebtoken 9.0.2):
 *
 *     firmado en HS384, verificado con { algorithm: "HS256" }   -> ACEPTADO
 *     firmado en HS384, verificado con { algorithms: ["HS256"] } -> rechazado
 *
 * NO era un bypass: `alg: none` lo sigue rechazando la libreria por su cuenta,
 * y para firmar en HS384 hay que tener el secreto igual. Pero el mismo error
 * estaba copiado en 38 llamadas —de `send` a `isAdmin`— y una defensa que
 * parece puesta y no lo esta es peor que no tenerla, porque nadie la revisa.
 *
 * `lib/socialAuth.js` siempre lo tuvo bien, con un comentario que dice «fijado
 * a proposito: sin esto se acepta cualquiera». O sea que la casa ya sabia cual
 * era la buena; fue una copia mala que se propago.
 *
 * La prueba es de LECTURA del codigo a proposito, no de comportamiento: el
 * fallo es un nombre de opcion mal escrito, y eso no se ve ejercitando una
 * ruta —la firma sigue cuadrando— solo se ve mirando como esta escrita.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import jwt from 'jsonwebtoken'
import assert from 'assert'

/* Mira el REPOSITORIO ENTERO y no solo este backend: los dos sitios de donde
   salio la copia mala eran ficheros de plantilla —el ejemplo del proxy de
   Genesis y el fragmento de idempotencia—, o sea justo los que se copian. Una
   prueba que solo vigilara el destino y no el molde deja el error volviendo. */
const ARRIBA = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '')
const AQUI = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
/* Si el backend se despliega solo —en el slug de Heroku va sin el resto del
   repositorio— «tres arriba» no es la raiz de nada. Se comprueba en vez de
   suponerlo, y si no esta, se vigila al menos esta casa. */
const RAIZ = existsSync(ARRIBA + '/apps-web') ? ARRIBA : AQUI

function archivos(dir) {
  const fuera = []
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git' || n.startsWith('.')) continue
    if (n === 'dist' || n === 'build' || n === 'orden-global-app') continue
    const r = dir + '/' + n
    if (statSync(r).isDirectory()) fuera.push(...archivos(r))
    else if (n.endsWith('.js') || n.endsWith('.mjs')) fuera.push(r)
  }
  return fuera
}

/** El trozo de texto de una llamada, desde su parentesis hasta el que cierra. */
function llamada(s, desde) {
  const a = s.indexOf('(', desde)
  if (a < 0) return ''
  let d = 0
  for (let j = a; j < s.length && j < a + 1200; j++) {
    if (s[j] === '(') d++
    else if (s[j] === ')') { d--; if (!d) return s.slice(a, j + 1) }
  }
  return ''
}

let mal = 0
const malos = []

for (const f of archivos(RAIZ)) {
  if (f.includes('/pruebas/')) continue
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\bverify\s*\(/g)) {
    const frag = llamada(s, m.index)
    if (!frag) continue
    // `algorithm:` dentro de un verify es SIEMPRE el error: la buena es plural.
    if (/\balgorithm\s*:/.test(frag)) {
      malos.push(`${f.replace(RAIZ + '/', '')}:${s.slice(0, m.index).split('\n').length}`)
      mal++
    }
  }
}

if (malos.length) {
  console.log(`  FALLA ${malos.length} verify con la opcion en singular:`)
  for (const l of malos) console.log('          ' + l)
} else {
  console.log('  ok    ningun verify usa `algorithm:` (la de sign) en vez de `algorithms:`')
}

/* Y la razon por la que importa, comprobada contra la libreria de verdad en
   vez de citada de memoria: si esta prueba se pusiera verde por un cambio de
   jsonwebtoken que empezara a respetar el singular, habria que enterarse. */
const S = 'secreto-solo-para-esta-prueba-y-bien-largo'
const t384 = jwt.sign({ address: '0xabc' }, S, { algorithm: 'HS384' })

let colo = false
try { jwt.verify(t384, S, { algorithm: 'HS256' }); colo = true } catch { colo = false }
if (colo) {
  console.log('  ok    y sigue haciendo falta: en singular, un HS384 cuela')
} else {
  mal++
  console.log('  FALLA la libreria cambio: ahora el singular tambien restringe.')
  console.log('          Revisar si esta prueba sigue teniendo sentido antes de borrarla.')
}

try {
  jwt.verify(t384, S, { algorithms: ['HS256'] })
  mal++
  console.log('  FALLA en plural TAMPOCO restringe — la defensa no existe en ninguna forma')
} catch (e) {
  assert.match(e.message, /algorithm/i)
  console.log('  ok    en plural si restringe  · ' + e.message)
}

console.log(mal ? `\n${mal} en rojo\n` : '\nLa firma queda fijada de verdad\n')
process.exit(mal ? 1 : 0)
