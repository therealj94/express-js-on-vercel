// Prueba la banda sonora en un navegador real.
//
// No se puede escuchar desde aquí, así que se mide: se interceptan los nodos de
// Web Audio y se comprueba lo que de verdad importa — que las cinco capas
// arranquen enganchadas al mismo reloj, que las ganancias cambien al cambiar de
// capítulo, que el filtro se abra a lo largo del relato, que los efectos suenen
// una sola vez y que apagar el sonido lo apague.

import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, join } from 'path'

const RAIZ = '/tmp/ogsite'
const TIPOS = { '.html': 'text/html', '.mp3': 'audio/mpeg', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }

const servidor = createServer(async (req, res) => {
  try {
    const ruta = join(RAIZ, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'))
    const datos = await readFile(ruta)
    res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] || 'application/octet-stream' })
    res.end(datos)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(ok => servidor.listen(0, ok))
const base = process.env.SITIO || `http://127.0.0.1:${servidor.address().port}`

// Contra producción el navegador tiene que salir por el mismo proxy que el
// resto del entorno; contra el servidor local, directo.
const externo = /^https?:\/\/(?!127\.0\.0\.1)/.test(base)
const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  ...(externo && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
})
const pagina = await navegador.newPage({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: externo,
})

const errores = []
pagina.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()) })
pagina.on('pageerror', e => errores.push(e.message))
// Las tipografías vienen de fuera y aquí no hay salida a internet: eso no es
// un defecto de la página.
pagina.on('requestfailed', r => { if (r.url().startsWith(base))
  errores.push('no cargó: ' + r.url().replace(base,'') + ' — ' + (r.failure()||{}).errorText) })

// Se enganchan los nodos antes de que la página cargue, para poder leer qué
// hace realmente el audio en vez de suponerlo.
await pagina.addInitScript(() => {
  window.__espia = { fuentes: [], efectos: 0, ganancias: {}, filtro: [] }
  const AC = window.AudioContext
  const crearGain = AC.prototype.createGain
  const crearFuente = AC.prototype.createBufferSource
  const crearFiltro = AC.prototype.createBiquadFilter
  AC.prototype.createBufferSource = function () {
    const s = crearFuente.call(this)
    const start = s.start.bind(s)
    s.start = (cuando, desfase) => {
      window.__espia.fuentes.push({ cuando, desfase, dur: s.buffer && s.buffer.duration, bucle: s.loop })
      return start(cuando, desfase)
    }
    return s
  }
  AC.prototype.createGain = function () {
    const g = crearGain.call(this)
    const fijar = g.gain.setTargetAtTime.bind(g.gain)
    g.gain.setTargetAtTime = (v, t, c) => { g.__ultimo = v; return fijar(v, t, c) }
    return g
  }
  AC.prototype.createBiquadFilter = function () {
    const f = crearFiltro.call(this)
    const fijar = f.frequency.setTargetAtTime.bind(f.frequency)
    f.frequency.setTargetAtTime = (v, t, c) => { window.__espia.filtro.push(Math.round(v)); return fijar(v, t, c) }
    return f
  }
})

await pagina.goto(base, { waitUntil: 'load' })
await pagina.waitForTimeout(600)

// Entrar con el sonido encendido, como haría cualquiera.
await pagina.click('#gate-sound')   // encender el sonido como lo haría cualquiera
await pagina.click('.gate-langs button')   // entrar en español
await pagina.waitForTimeout(5000)          // que carguen las cinco capas

const fallos = []
const decir = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`)
  if (!ok) fallos.push(que)
}

// ── 1. las cinco capas suenan, en bucle y enganchadas al mismo reloj ─────────
const arranque = await pagina.evaluate(() => ({
  fuentes: window.__espia.fuentes,
  capas: Object.keys(EXPERIENCE.sonido().gan),
  t0: EXPERIENCE.sonido().t0,
  ahora: EXPERIENCE.sonido().ctx.currentTime,
}))
const enBucle = arranque.fuentes.filter(f => f.bucle)
decir(arranque.capas.length === 5, 'las cinco capas están sonando',
  'capas: ' + arranque.capas.join(', '))
decir(enBucle.length === 5, 'las cinco arrancaron en bucle')
decir(enBucle.every(f => Math.abs(f.dur - 89.302) < 0.05),
  'todas duran lo mismo (89,30 s)',
  'duraciones: ' + enBucle.map(f => f.dur.toFixed(3)).join(', '))

// La que llega tarde tiene que entrar por donde van las demás: su desfase
// respecto al reloj común debe coincidir con lo que ya lleva sonando el bucle.
const desvios = enBucle.map(f => {
  const esperado = ((f.cuando - arranque.t0) % 89.302 + 89.302) % 89.302
  return Math.abs(f.desfase - esperado)
})
decir(Math.max(...desvios) < 0.001, 'cada capa entró en el punto exacto del bucle',
  'desvío máximo: ' + (Math.max(...desvios) * 1000).toFixed(3) + ' ms')

// ── 2. la mezcla cambia con el capítulo ─────────────────────────────────────
const capitulos = ['prologue', 'tierra', 'boveda', 'cadena', 'origen', 'ecosistema', 'fin']
const leidas = {}
for (const id of capitulos) {
  await pagina.evaluate(cap => {
    const el = document.getElementById(cap)
    scrollTo(0, el.offsetTop + el.offsetHeight * 0.5)
  }, id)
  await pagina.waitForTimeout(900)
  leidas[id] = await pagina.evaluate(() => ({
    gan: Object.fromEntries(Object.entries(EXPERIENCE.sonido().gan).map(([k, g]) => [k, +(g.__ultimo ?? g.gain.value).toFixed(3)])),
    corte: Math.round(EXPERIENCE.sonido().filtro.frequency.value),
    efectos: Object.keys(EXPERIENCE.sonido().visto),
  }))
}

console.log('\n  capítulo     fondo pulso  alma señal cumbre   filtro')
for (const id of capitulos) {
  const g = leidas[id].gan
  console.log(`  ${id.padEnd(12)} ${['fondo','pulso','alma','senal','cumbre']
    .map(c => String(g[c] ?? 0).padStart(5)).join(' ')}   ${String(leidas[id].corte).padStart(6)} Hz`)
}

decir(leidas.prologue.gan.pulso === 0 && leidas.prologue.gan.cumbre === 0,
  'en el prólogo solo suena el colchón')
decir(leidas.tierra.gan.pulso > 0 && leidas.tierra.gan.alma === 0,
  'en la tierra entra el ritmo, todavía sin melodía')
decir(leidas.boveda.gan.alma > 0, 'en la bóveda entra la melodía')
decir(leidas.cadena.gan.senal > 0, 'en la cadena entran las campanas y los datos')
decir(leidas.origen.gan.cumbre > 0, 'en ORIGEN se abre la octava alta')
decir(['fondo','pulso','alma','senal','cumbre'].every(c => leidas.fin.gan[c] > 0),
  'en el final suenan las cinco')

// ── 3. el filtro se abre con el relato ──────────────────────────────────────
const cortes = capitulos.map(id => leidas[id].corte)
decir(cortes.every((v, i) => i === 0 || v >= cortes[i - 1] * 0.9),
  'el filtro se va abriendo capítulo a capítulo',
  cortes.join(' → ') + ' Hz')
decir(cortes[0] < 900 && cortes[cortes.length - 1] > 12000,
  'empieza tapado y termina destapado',
  `${cortes[0]} Hz al principio, ${cortes[cortes.length - 1]} Hz al final`)

// ── 4. los efectos de escena suenan, y una sola vez ─────────────────────────
decir(leidas.fin.efectos.length === 5, 'sonaron los cinco efectos de escena',
  'disparados: ' + leidas.fin.efectos.join(', '))

const antes = await pagina.evaluate(() => EXPERIENCE.sonido().visto.origen)
await pagina.evaluate(() => {   // ir y volver: no debe volver a sonar
  scrollTo(0, document.getElementById('cadena').offsetTop)
})
await pagina.waitForTimeout(500)
await pagina.evaluate(() => scrollTo(0, document.getElementById('origen').offsetTop))
await pagina.waitForTimeout(700)
const despues = await pagina.evaluate(() => EXPERIENCE.sonido().visto.origen)
decir(antes === despues, 'cruzar la frontera dos veces no repite el efecto')

// ── 5. apagar el sonido lo apaga ────────────────────────────────────────────
await pagina.evaluate(() => EXPERIENCE.toggleSound())
await pagina.waitForTimeout(1400)
const apagado = await pagina.evaluate(() => ({
  maestro: EXPERIENCE.sonido().maestro.gain.value, estado: EXPERIENCE.sonido().ctx.state,
}))
decir(apagado.estado === 'suspended' || apagado.maestro < 0.01,
  'apagar el sonido deja la página en silencio',
  `maestro ${apagado.maestro.toFixed(4)}, contexto ${apagado.estado}`)

await pagina.evaluate(() => EXPERIENCE.toggleSound())
await pagina.waitForTimeout(900)
const vuelto = await pagina.evaluate(() => ({ maestro: EXPERIENCE.sonido().maestro.gain.value, estado: EXPERIENCE.sonido().ctx.state }))
decir(vuelto.estado === 'running' && vuelto.maestro > 0.1, 'y volver a encenderlo lo devuelve',
  `maestro ${vuelto.maestro.toFixed(3)}, contexto ${vuelto.estado}`)

// ── 6. y lo único que de verdad importa: que salga sonido ───────────────────
// Todo lo anterior comprueba el cableado. Esto mide la señal que llega a los
// altavoces, que es otra cosa: una capa mal conectada, un búfer vacío o un
// filtro cerrado del todo pasarían todas las pruebas de arriba y no sonaría nada.
const medir = async cap => {
  await pagina.evaluate(c => { const e=document.getElementById(c); scrollTo(0, e.offsetTop + e.offsetHeight*0.5) }, cap)
  await pagina.waitForTimeout(1200)
  return pagina.evaluate(async () => {
    const b = EXPERIENCE.sonido()
    const a = b.ctx.createAnalyser(); a.fftSize = 2048
    b.maestro.connect(a)
    const onda = new Float32Array(a.fftSize), esp = new Float32Array(a.frequencyBinCount)
    let pico = 0, suma = 0, n = 0
    for (let i = 0; i < 150; i++) {          // tres segundos: varios compases
      await new Promise(r => setTimeout(r, 20))
      a.getFloatTimeDomainData(onda)
      for (const v of onda) { pico = Math.max(pico, Math.abs(v)); suma += v*v; n++ }
    }
    a.getFloatFrequencyData(esp)
    b.maestro.disconnect(a)
    // Dónde está la energía: sirve para ver el filtro abriéndose de verdad.
    const hz = i => i * b.ctx.sampleRate / 2 / esp.length
    const banda = (lo, hi) => { let s = 0, c = 0
      for (let i = 0; i < esp.length; i++) if (hz(i) >= lo && hz(i) < hi && isFinite(esp[i])) { s += esp[i]; c++ }
      return c ? s / c : -120 }
    return { pico, rms: Math.sqrt(suma/n), grave: banda(80, 400), agudo: banda(6000, 14000) }
  })
}
const enPrologo = await medir('prologue')
const enFinal = await medir('fin')
console.log(`\n  prólogo: pico ${enPrologo.pico.toFixed(3)} · rms ${(20*Math.log10(enPrologo.rms)).toFixed(1)} dB`
  + ` · graves ${enPrologo.grave.toFixed(0)} dB · agudos ${enPrologo.agudo.toFixed(0)} dB`)
console.log(`  final:   pico ${enFinal.pico.toFixed(3)} · rms ${(20*Math.log10(enFinal.rms)).toFixed(1)} dB`
  + ` · graves ${enFinal.grave.toFixed(0)} dB · agudos ${enFinal.agudo.toFixed(0)} dB`)

decir(enPrologo.rms > 0.002, 'en el prólogo sale sonido de verdad')
decir(enFinal.rms > enPrologo.rms * 2.2, 'el final suena claramente más lleno que el prólogo',
  `${(20*Math.log10(enFinal.rms/enPrologo.rms)).toFixed(1)} dB de diferencia`)
decir(enFinal.agudo - enPrologo.agudo > 12, 'el filtro se abre: en el final hay agudos que en el prólogo no',
  `${(enFinal.agudo - enPrologo.agudo).toFixed(0)} dB más arriba de 6 kHz`)
decir(enFinal.pico < 1.0, 'la mezcla no satura', `pico ${enFinal.pico.toFixed(3)}`)

decir(errores.length === 0, 'sin errores en la consola', errores.slice(0, 4).join('\n           '))

await navegador.close()
servidor.close()
console.log(fallos.length ? `\n${fallos.length} comprobación(es) fallaron` : '\nTodo correcto')
process.exit(fallos.length ? 1 : 0)
