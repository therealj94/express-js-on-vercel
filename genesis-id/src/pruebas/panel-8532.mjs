/* Que la sección del respaldo de la 8532 se pinte de verdad en un navegador.
 *
 * El backend ya está probado (cadena-vieja.test.ts, 15 comprobaciones). Lo que
 * esto mira es la otra mitad: que la vista arranque, que los saldos salgan
 * formateados y no como wei crudo, y que los filtros hagan algo. Un panel que
 * lanza en la primera línea deja la pantalla en «Cargando…» para siempre, y eso
 * no lo ve ninguna prueba de servidor. */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { createServer } from 'node:http'

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// La raíz se calcula, no se escribe: una ruta absoluta con el nombre de una
// máquina dentro deja de existir en cuanto la prueba se corre en otra.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const datos = JSON.parse(readFileSync(RAIZ + '/datos/cadena-8532.json', 'utf8'))

let mal = 0
const ok = (n, c, d = '') => { if (c) console.log(`  ok    ${n}${d ? '  · ' + d : ''}`)
  else { mal++; console.log(`  FALLA ${n}${d ? '\n          ' + d : ''}`) } }

/* Un panel de mentira que sirve el admin.html DE VERDAD y contesta la API con
   los datos DE VERDAD, filtrando como el servidor. */
const srv = createServer((q, r) => {
  const u = new URL(q.url, 'http://x')
  if (u.pathname === '/panel/cadena-8532') {
    const p = u.searchParams
    let c = datos.cuentas.slice()
    const t = (p.get('texto') || '').toLowerCase()
    if (t) c = c.filter((x) => (x.direccion || '').includes(t) || x.hash.includes(t))
    if (p.get('tipo')) c = c.filter((x) => x.tipo === p.get('tipo'))
    if (p.get('conSaldo') === '1') c = c.filter((x) => BigInt(x.saldo) > 0n)
    const desde = Number(p.get('desde')) || 0
    const pag = c.slice(desde, desde + 100)
    const cuerpo = JSON.stringify({
      cadena: datos.cadena, resumen: datos.resumen, cuentas: pag,
      total: c.length, desde, hayMas: desde + pag.length < c.length,
      sumaFiltrada: c.reduce((a, x) => a + BigInt(x.saldo), 0n).toString(),
    })
    r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(cuerpo)
  }
  if (u.pathname === '/panel/resumen') {
    r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{}')
  }
  /* Los ficheros de public/ se sirven DE VERDAD. Antes se devolvia admin.html
     para cualquier ruta, asi que los <script src> recibian HTML y el navegador
     lo parseaba como JavaScript: «Unexpected token '<'». Un error del arnes que
     se lee igual que uno del producto. */
  if (u.pathname !== '/admin' && u.pathname !== '/') {
    try {
      const f = readFileSync(RAIZ + '/public' + u.pathname)
      const tipo = u.pathname.endsWith('.js') ? 'text/javascript'
        : u.pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream'
      r.writeHead(200, { 'Content-Type': tipo + '; charset=utf-8' }); return r.end(f)
    } catch { r.writeHead(404); return r.end('no') }
  }
  r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  r.end(readFileSync(RAIZ + '/public/admin.html'))
})
await new Promise((k) => srv.listen(0, '127.0.0.1', k))
const BASE = `http://127.0.0.1:${srv.address().port}`

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const pag = await (await nav.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
const errores = []
pag.on('pageerror', (e) => errores.push(String(e)))
await pag.goto(BASE + '/admin')
await pag.waitForFunction(() => typeof window.VISTAS === 'object' && window.VISTAS.cadena8532,
                          null, { timeout: 15000 }).catch(() => {})

// Se entra a la vista directamente: la puerta del panel pide sesión y acá se
// está probando la PANTALLA, no la puerta —de esa ya se ocupa puerta.test.
await pag.evaluate(() => { window.api = async (u) => (await fetch(u)).json() })
await pag.evaluate(() => VISTAS.cadena8532())
await pag.waitForTimeout(1200)

const t = await pag.evaluate(() => document.querySelector('#vista')?.innerText || '')
ok('la sección se pinta', t.length > 200, `${t.length} caracteres`)
ok('dice de qué cadena habla', t.includes('8532'), t.slice(0, 80).replace(/\n/g, ' '))
ok('y que está cerrada, sustituida por la 5550',
   /cerrada/i.test(t) && t.includes('5550'))

const saldos = await pag.evaluate(() =>
  [...document.querySelectorAll('.qi-apps')].map((e) => e.textContent.trim()).slice(0, 3))
ok('los saldos salen en ORIGEN, no en wei',
   saldos.length > 0 && !saldos.some((s) => /\d{19}/.test(s)),
   saldos.join(' · '))
ok('y el más grande es el que va primero',
   (saldos[0] || '').includes('250.000.000.000'), saldos[0])

const filas = await pag.evaluate(() => document.querySelectorAll('.qi-fila').length)
ok('trae una página de cuentas, no las 332 de golpe', filas === 100, `${filas} filas`)

ok('dice cuántas hay en total', /de 332/.test(t), t.match(/\d+ de \d+[^\n]*/)?.[0] || '')

// El filtro
await pag.evaluate(() => { document.querySelector('#c8Tipo').value = 'billetera'; recargar8532() })
await pag.waitForTimeout(900)
const t2 = await pag.evaluate(() => document.querySelector('#c8Tabla')?.innerText || '')
ok('filtrar por billeteras cambia el total', /159/.test(t2), t2.slice(0, 90).replace(/\n/g, ' '))

ok('sin errores de javascript', errores.length === 0, errores.slice(0, 2).join(' · '))

await nav.close(); srv.close()
console.log(mal ? `\n${mal} en rojo\n` : '\nLa sección de la 8532 se ve\n')
process.exit(mal ? 1 : 0)
