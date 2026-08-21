/* Imprime el documento a PDF con Chromium, en A4 y con el color de fondo.
   `printBackground` no es opcional acá: sin él, un documento cuyo diseño ES el
   fondo sale en blanco con letras claras encima, o sea ilegible. */
import { chromium } from 'playwright'
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--font-render-hinting=none'] })
const pag = await (await nav.newContext({ locale:'es-HN' })).newPage()
const err = []; pag.on('pageerror', e => err.push(String(e)))
await pag.goto('http://127.0.0.1:8795/documento.html', { waitUntil:'networkidle' })
// Se espera a que los datos medidos esten puestos: imprimir antes deja rayas
// donde tenian que ir los numeros.
await pag.waitForFunction(() => document.body.dataset.listo === '1', { timeout:15000 })
await pag.waitForTimeout(900)
const quedan = await pag.evaluate(() =>
  [...document.querySelectorAll('[id^="d-"],[id^="t-"]')].filter(e => e.textContent.trim() === '—')
    .map(e => e.id))
if (quedan.length) console.log('  SIN DATO:', quedan.join(', '))

/* ¿SE DESBORDA ALGUNA HOJA?
 *
 * La hoja tiene `overflow:hidden`, así que un exceso NO se ve como un error:
 * se ve como un párrafo que se corta a media frase, o como texto pisando el
 * pie. Pasó de verdad en la página de PULSE2CHAT y solo se descubrió mirando
 * la imagen. Se mide: el contenido tiene que caber dentro del alto de la hoja
 * menos lo que ocupa el pie. */
const gordas = await pag.evaluate(() => {
  const fuera = []
  document.querySelectorAll('.hoja').forEach((h, i) => {
    const c = h.querySelector('.cuerpo')
    const pie = h.querySelector('.pie')
    // el ultimo hijo real del cuerpo, comparado con donde empieza el pie
    const ultimo = [...c.children].filter(e => e.offsetHeight).pop()
    if (!ultimo) return
    const abajo = ultimo.getBoundingClientRect().bottom
    const techo = pie ? pie.getBoundingClientRect().top - 4
                      : h.getBoundingClientRect().bottom - 20
    if (abajo > techo) fuera.push(`hoja ${i + 1} se pasa ${Math.round(abajo - techo)} px`)
  })
  return fuera
})
if (gordas.length) { console.log('  SE DESBORDA:\n    ' + gordas.join('\n    ')); process.exitCode = 1 }
else console.log('  todas las hojas caben')

/* ¿HAY TEXTO RECORTADO DENTRO DE ALGUNA CAJA?
 *
 * La comprobación de arriba mide si el contenido se pasa del final de la hoja.
 * No ve lo otro: una caja con `overflow:hidden` que se come su propio texto.
 * Pasó DOS VECES por lo mismo, meter una frase larga en el componente que es
 * para cifras, y las dos veces desapareció un bloque entero del PDF sin que
 * nada lo dijera. Se mide lo que cada caja necesita contra lo que le cabe. */
const cortadas = await pag.evaluate(() => {
  const malas = []
  document.querySelectorAll('.hoja *').forEach((e) => {
    const st = getComputedStyle(e)
    if (st.overflow === 'visible' && st.overflowY === 'visible') {
      // el padre puede estar recortando aunque este no lo haga
      const rec = e.closest('[style*="overflow"], .rejilla, .hoja, .captura, .p2cplaca')
      if (!rec || rec === e) return
    }
    const sobraAlto = e.scrollHeight - e.clientHeight
    const sobraAncho = e.scrollWidth - e.clientWidth
    if (sobraAlto > 2 || sobraAncho > 2) {
      const st2 = getComputedStyle(e)
      if (st2.overflow === 'hidden' || st2.overflowY === 'hidden' || st2.overflowX === 'hidden') {
        malas.push(`${e.className || e.tagName} recorta ${sobraAlto}px de alto, ` +
                   `${sobraAncho}px de ancho: «${(e.textContent || '').trim().slice(0, 46)}»`)
      }
    }
  })
  return [...new Set(malas)]
})
if (cortadas.length) {
  console.log('  TEXTO RECORTADO DENTRO DE UNA CAJA:\n    ' + cortadas.join('\n    '))
  process.exitCode = 1
} else console.log('  ninguna caja se come su texto')
await pag.pdf({ path:'Orden-Global-Donde-estamos.pdf', format:'A4', printBackground:true,
  margin:{top:0,right:0,bottom:0,left:0}, preferCSSPageSize:true })
console.log(err.length ? '  errores: ' + err.join(' | ') : '  sin errores')
await nav.close()
