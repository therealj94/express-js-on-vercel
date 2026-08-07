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
  window.__espia = { fuentes: [], sonados: [], filtro: [] }
  const AC = window.AudioContext
  const crearGain = AC.prototype.createGain
  const crearFuente = AC.prototype.createBufferSource
  const crearFiltro = AC.prototype.createBiquadFilter
  AC.prototype.createBufferSource = function () {
    const s = crearFuente.call(this)
    const start = s.start.bind(s)
    s.start = (cuando, desfase) => {
      const d = s.buffer && s.buffer.duration
      window.__espia.fuentes.push({ cuando, desfase, dur: d, bucle: s.loop })
      // Cada efecto se identifica por la duración de su búfer, que es única.
      window.__espia.sonados.push({ t: Math.round(performance.now()), dur: +(d || 0).toFixed(3), bucle: !!s.loop })
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
const enBucle = arranque.fuentes.filter(f => f.bucle && Math.abs(f.dur - 89.302) < 0.05)
const maquinas = arranque.fuentes.filter(f => f.bucle && f.dur < 30)
decir(arranque.capas.length === 5, 'las cinco capas están sonando',
  'capas: ' + arranque.capas.join(', '))
decir(enBucle.length === 5, 'las cinco arrancaron en bucle')
decir(maquinas.length === 2, 'y aparte giran los dos bucles de la excavadora',
  'duraciones: ' + maquinas.map(f => f.dur.toFixed(2) + ' s').join(', '))
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
// Colocarse en un punto exacto del capítulo. Los efectos ahora dependen del
// fotograma, así que "por la mitad" ya no basta: hay que poder pedir el 0,58 de
// La Tierra, que es donde el cucharón muerde.
const irA = async (cap, p = 0.5) => {
  await pagina.evaluate(([c, q]) => {
    const el = document.getElementById(c), vh = innerHeight
    const y = el.offsetHeight > vh * 1.4
      ? el.offsetTop + q * (el.offsetHeight - vh)
      : el.offsetTop - vh + q * (el.offsetHeight + vh)
    scrollTo(0, Math.max(0, y))
  }, [cap, p])
  await pagina.waitForTimeout(700)
}
const estado = () => pagina.evaluate(() => {
  const b = EXPERIENCE.sonido()
  return {
    gan: Object.fromEntries(Object.entries(b.gan).map(([k, g]) => [k, +(g.__ultimo ?? g.gain.value).toFixed(3)])),
    maq: Object.fromEntries(Object.entries(b.maq).map(([k, m]) => [k,
      { gan: +m.gan.gain.value.toFixed(3), tono: +m.src.playbackRate.value.toFixed(3) }])),
    corte: Math.round(b.filtro.frequency.value),
    fx: Object.keys(b.visto), sonados: window.__espia.sonados.slice(),
  }
})

const capitulos = ['prologue', 'puente', 'tierra', 'boveda', 'cadena', 'origen', 'ecosistema', 'fin']
const leidas = {}
for (const id of capitulos) {
  await irA(id, 0.5)
  leidas[id] = await estado()
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
// (que suenen todos se comprueba al final, recorriendo la página de verdad)

const antes = await pagina.evaluate(() => EXPERIENCE.sonido().visto.moneda)
await pagina.evaluate(() => {   // ir y volver: no debe volver a sonar
  scrollTo(0, document.getElementById('cadena').offsetTop)
})
await pagina.waitForTimeout(500)
await pagina.evaluate(() => scrollTo(0, document.getElementById('origen').offsetTop))
await pagina.waitForTimeout(700)
const despues = await pagina.evaluate(() => EXPERIENCE.sonido().visto.moneda)
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


// ── 7. el sonido pegado al fotograma ────────────────────────────────────────
// Lo que separa una banda sonora de un efecto de biblioteca: que suene cuando
// pasa la cosa, no cuando empieza el capítulo. Se comprueba yendo a un punto
// ANTES del suceso, verificando que no ha sonado, y cruzándolo.
const cruzar = async (cap, antes, despues, fx, desde) => {
  await pagina.evaluate(() => { EXPERIENCE.sonido().visto = {} })
  if (desde) await irA(desde, 0.75)      // se entra por donde entra un lector
  await irA(cap, antes)
  const previo = (await estado()).sonados.length
  await irA(cap, despues)
  const post = await estado()
  const nuevos = post.sonados.slice(previo)
  return { sono: post.fx.includes(fx), nuevos }
}

const pala = await cruzar('tierra', 0.35, 0.72, 'pala', 'puente')
decir(pala.sono, 'la pala suena al morder la roca, no al entrar al capítulo',
  'el cucharón toca el suelo en el fotograma 32 de 54 (p = 0,58)')
await pagina.evaluate(() => { EXPERIENCE.sonido().visto = {} })
await irA('puente', 0.75); await irA('tierra', 0.35)
decir(!(await estado()).fx.includes('pala'), 'y antes de ese punto no ha sonado')

const rompe = await cruzar('boveda', 0.10, 0.30, 'desmorona', 'tierra')
decir(rompe.sono, 'el oro suena al deshacerse en píxeles',
  'la barra empieza a romperse en el fotograma 12 (p = 0,17)')

const cae = await cruzar('origen', 0.20, 0.55, 'moneda', 'cadena')
decir(cae.sono, 'la moneda golpea cuando queda de frente',
  'el disco se cierra y es legible en el fotograma 24 (p = 0,42)')
// (que el polvo suene ANTES del golpe se comprueba en la lectura completa)

// ── 8. la máquina obedece a la mano ─────────────────────────────────────────
await irA('tierra', 0.4)
const quieta = (await estado()).maq
// Un desplazamiento de verdad, para que la velocidad suavizada suba.
await pagina.evaluate(async () => {
  for (let i = 0; i < 22; i++) { scrollBy(0, 46); await new Promise(r => setTimeout(r, 16)) }
})
const moviendo = (await estado()).maq
console.log(`\n  excavadora  quieta: motor ${quieta.motor.gan} · hidráulico ${quieta.hidraulico.gan}`
  + ` (tono ${quieta.hidraulico.tono})`)
console.log(`              moviendo: motor ${moviendo.motor.gan} · hidráulico ${moviendo.hidraulico.gan}`
  + ` (tono ${moviendo.hidraulico.tono})`)
decir(quieta.motor.gan > 0.05, 'el motor ralentiza mientras nadie se mueve')
decir(moviendo.hidraulico.gan > quieta.hidraulico.gan * 1.6,
  'y los hidráulicos suben cuando la mano mueve la página')
decir(moviendo.hidraulico.tono > quieta.hidraulico.tono + 0.02,
  'la bomba además sube de tono, no solo de volumen',
  `${quieta.hidraulico.tono} → ${moviendo.hidraulico.tono}`)

await irA('cadena', 0.5)
await pagina.waitForTimeout(1400)
decir((await estado()).maq.motor.gan < 0.02, 'y la excavadora calla fuera de su capítulo')

// ── 9. el goteo: contador y rayos ───────────────────────────────────────────
await irA('prologue', 0.35)
const antesTic = (await estado()).sonados.length
await pagina.waitForTimeout(1200)
const tics = (await estado()).sonados.slice(antesTic).filter(s => s.dur < 0.2)
decir(tics.length >= 6, 'el contador que se desploma va marcando el paso',
  `${tics.length} tics en 1,2 s`)

await irA('cadena', 0.6)
const antesRayo = (await estado()).sonados.length
await pagina.waitForTimeout(1800)
const rayos = (await estado()).sonados.slice(antesRayo).filter(s => s.dur > 0.5 && s.dur < 1.2)
decir(rayos.length >= 3, 'los rayos van saltando entre los nodos de la red',
  `${rayos.length} pulsos en 1,8 s`)

// ── 10. el capítulo nuevo ───────────────────────────────────────────────────
const puente = await pagina.evaluate(() => {
  const s = document.getElementById('puente')
  const rail = [...document.querySelectorAll('#stops .lbl')].map(e => e.textContent)
  return { existe: !!s, rail, orden: [...document.querySelectorAll('.chapter')].map(e => e.id) }
})
decir(puente.existe && puente.orden[1] === 'puente',
  'el puente entra justo después del prólogo', puente.orden.join(' → '))
decir(puente.rail.includes('El puente'), 'y aparece en el riel lateral', puente.rail.join(' · '))
await pagina.evaluate(() => { EXPERIENCE.sonido().visto = {} })
await irA('puente', 0.05); await irA('puente', 0.45)
const sonPuente = await estado()
decir(sonPuente.gan.alma > 0 && sonPuente.gan.senal === 0,
  'con su propia mezcla: ya hay melodía, todavía no hay red')
decir(sonPuente.fx.includes('puente'), 'y suena el capital cruzando de un lado al otro')

// ── 11. la portada habla los dos idiomas ────────────────────────────────────
await pagina.goto(base, { waitUntil: 'load' })
await pagina.waitForTimeout(500)
const portada = await pagina.evaluate(() => {
  const g = document.getElementById('gate')
  return { texto: g.innerText, ingles: [...g.querySelectorAll('.en, .en2')].map(e => e.innerText.trim()) }
})
decir(portada.ingles.length >= 3 && /scroll/i.test(portada.texto),
  'la portada se lee también en inglés antes de elegir idioma',
  portada.ingles.join(' | '))

// ── 12. el botón del final ──────────────────────────────────────────────────
await pagina.click('#gate-sound')          // la recarga apagó el sonido
await pagina.click('.gate-langs button')
await pagina.waitForTimeout(3500)          // que vuelvan a cargar capas y efectos
const boton = await pagina.evaluate(() => {
  const b = document.getElementById('yo-quiero')
  return { letras: b.querySelectorAll('.ch').length, texto: b.innerText.trim(),
           encendidas: b.querySelectorAll('.ch.on').length }
})
decir(boton.letras > 10 && boton.texto.length > 10,
  'el botón está partido en letras y sigue leyéndose entero',
  `"${boton.texto}" en ${boton.letras} tramos`)
decir(boton.encendidas === 0, 'que empiezan escondidas, esperando al final')
await irA('fin', 0.85)
await pagina.waitForTimeout(1500)
const tras = await pagina.evaluate(() => document.querySelectorAll('#yo-quiero .ch.on').length)
decir(tras === boton.letras, 'y se levantan una a una al llegar el llamado',
  `${tras} de ${boton.letras}`)

const trasIdioma = await pagina.evaluate(() => { EXPERIENCE.swap()
  const b = document.getElementById('yo-quiero')
  return { letras: b.querySelectorAll('.ch').length, texto: b.innerText.trim() } })
decir(trasIdioma.letras > 8 && trasIdioma.texto.length > 5,
  'cambiar de idioma no vacía el botón', `"${trasIdioma.texto}"`)


// ── 13. la lectura completa, como la hace una persona ───────────────────────
// Es la única prueba que vale de verdad: bajar la página entera, sin saltos, y
// ver qué suena. Todo lo demás comprueba piezas; esto comprueba la experiencia.
await pagina.evaluate(() => { const b = EXPERIENCE.sonido(); b.visto = {}; b.pAnt = {} })
await pagina.evaluate(() => scrollTo(0, 0))
await pagina.waitForTimeout(600)
await pagina.evaluate(async () => {
  const fin = document.documentElement.scrollHeight - innerHeight
  while (scrollY < fin - 4) {
    scrollBy(0, Math.max(24, innerHeight * 0.06))
    await new Promise(r => setTimeout(r, 22))
  }
})
await pagina.waitForTimeout(900)
const recorrido = await estado()
const ESPERADOS = ['puente', 'pala', 'boveda', 'desmorona', 'cadena', 'particula', 'moneda', 'fin']
const faltan = ESPERADOS.filter(f => !recorrido.fx.includes(f))
decir(faltan.length === 0, 'leyendo la página entera suenan los ocho momentos',
  faltan.length ? 'no sonaron: ' + faltan.join(', ') : recorrido.fx.join(' · '))

// Y en el orden correcto, que es lo que hace que la escena se entienda: el polvo
// se junta y DESPUÉS el metal se cierra. Al revés, el golpe llega de la nada.
const cuando = await pagina.evaluate(() => {
  const v = EXPERIENCE.sonido().visto
  return { polvo: v.particula, golpe: v.moneda, rompe: v.desmorona, puerta: v.boveda }
})
decir(cuando.polvo < cuando.golpe, 'el polvo dorado se junta antes de que la moneda golpee',
  `${(cuando.golpe - cuando.polvo).toFixed(1)} s entre uno y otro`)
decir(cuando.puerta < cuando.rompe, 'y la bóveda se cierra antes de que el oro se deshaga',
  `${(cuando.rompe - cuando.puerta).toFixed(1)} s entre uno y otro`)

decir(errores.length === 0, 'sin errores en la consola', errores.slice(0, 4).join('\n           '))

await navegador.close()
servidor.close()
console.log(fallos.length ? `\n${fallos.length} comprobación(es) fallaron` : '\nTodo correcto')
process.exit(fallos.length ? 1 : 0)
