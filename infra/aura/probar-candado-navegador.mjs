/* Que el candado de AU-RA abra lo que cierra el candado.js QUE SE DESPACHA.
 *
 * POR QUE ESTA PRUEBA EXISTE, Y POR QUE NO BASTA LA OTRA
 *
 * `probar-candado-aura.py` comprueba que candado.py abre un bulto cerrado con
 * la receta de candado.js — pero esa receta esta escrita a mano DENTRO de la
 * prueba, en Python. Si yo lei mal el JavaScript, las dos mitades estan mal de
 * la misma forma y la prueba pasa igual. Es el fallo clasico de una prueba de
 * compatibilidad: comprueba que uno esta de acuerdo consigo mismo.
 *
 * Esta abre un navegador de verdad, carga el `candado.js` del repositorio —el
 * mismo fichero que se sirve en app.vetawallet.com— y le hace cerrar un bulto
 * para la llave de AU-RA. Despues candado.py lo abre. Si alguien cambia la
 * curva, el HKDF, el vector o el sabor de base64 en cualquiera de los dos
 * lados, esto se pone rojo.
 *
 * Se comprueban las DOS cosas que AU-RA necesita: el sobre del mensaje (de
 * donde saca lo que le escribieron y la llave del archivo) y los bytes del
 * adjunto (el audio de la nota de voz).
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CANDADO_JS = join(AQUI, '..', '..', 'apps-web', 'veta-wallet', 'candado.js')
const CANDADO_PY = AQUI

let mal = 0
const ok = (n, c, d = '') => {
  if (c) console.log(`  ok    ${n}${d ? '  · ' + d : ''}`)
  else { mal++; console.log(`  FALLA ${n}${d ? '\n          ' + d : ''}`) }
}

const caja = mkdtempSync(join(tmpdir(), 'candado-nav-'))
const ARCHIVO = join(caja, 'candado.json')

const py = (guion) => execFileSync('python3', ['-c', guion], {
  encoding: 'utf8', env: { ...process.env, PYTHONPATH: CANDADO_PY },
}).trim()

// 1. AU-RA se fabrica su llave y publica la parte publica.
const [ID, PUB] = py(`
from candado import Candado
c = Candado(${JSON.stringify(ARCHIVO)})
print(c.id); print(c.publica_b64)
`).split('\n')

// 2. El navegador de verdad cierra para esa llave.
const sitio = createServer((q, r) => {
  if (q.url.startsWith('/candado.js')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' })
    return r.end(readFileSync(CANDADO_JS))
  }
  r.writeHead(200, { 'Content-Type': 'text/html' })
  r.end('<!doctype html><meta charset="utf-8"><script src="/candado.js"></script>')
})
await new Promise((k) => sitio.listen(0, '127.0.0.1', k))

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const pag = await (await nav.newContext()).newPage()
await pag.goto(`http://127.0.0.1:${sitio.address().port}/`)
await pag.waitForFunction(() => typeof window.CANDADO === 'object')

const TEXTO = 'hola AU-RA, ¿me escuchás? — con tildes y ñ'
const bulto = await pag.evaluate(async ([id, pub, texto]) =>
  CANDADO.cerrar(texto, [{ id, pub }]), [ID, PUB, TEXTO])

const adj = await pag.evaluate(async () => {
  const bytes = new Uint8Array(256)
  for (let i = 0; i < 256; i++) bytes[i] = i          // los 256 valores posibles
  const c = await CANDADO.cerrarBytes(bytes)
  return { bytes: [...c.bytes], llave: c.llave, iv: c.iv }
})

await nav.close()
sitio.close()

console.log('\n── el sobre del mensaje ─────────────────────────────────────')

const abierto = py(`
import json
from candado import Candado
c = Candado(${JSON.stringify(ARCHIVO)})
print(repr(c.abrir(json.loads(${JSON.stringify(JSON.stringify(bulto))}))))
`)
ok('candado.py abre el bulto que cerró el navegador de verdad',
   abierto === JSON.stringify(TEXTO).replace(/^"|"$/g, "'").replace(/\\"/g, '"') ||
   abierto.slice(1, -1) === TEXTO,
   abierto)

console.log('\n── los bytes del adjunto (el audio de la nota) ──────────────')

const iguales = py(`
from candado import Candado
datos = bytes(${JSON.stringify(adj.bytes)})
abierto = Candado.abrir_bytes(datos, ${JSON.stringify(adj.llave)}, ${JSON.stringify(adj.iv)})
print('SI' if abierto == bytes(range(256)) else 'NO ' + repr(abierto[:20]))
`)
ok('candado.py descifra los bytes que cifró el navegador', iguales === 'SI',
   `${adj.bytes.length} bytes, los 256 valores posibles · ${iguales}`)

console.log(mal ? `\n${mal} en rojo\n` : '\nLos dos candados cuadran al byte\n')
process.exit(mal ? 1 : 0)
