// Línea de tiempo del trailer. Todo se calcula a partir de t (segundos), sin
// animaciones CSS ni relojes: render.mjs pide cada cuadro con window.cuadro(t)
// y el resultado es idéntico cada vez que se renderiza.

const Q = new URLSearchParams(location.search)
const V = Q.get('formato') === '9x16'
const W = V ? 1080 : 1920, H = V ? 1920 : 1080

// El corte vertical es el maestro sin la escena de Genesis ID: a partir de SALTO
// el reloj vertical salta DESPLAZA segundos hacia adelante, al cierre de marca.
const SALTO = 26.2, DESPLAZA = 8.2
const aMaestro = t => (V && t >= SALTO ? t + DESPLAZA : t)
window.DURACION = V ? 47.0 - DESPLAZA : 47.0
window.SALTO = SALTO; window.DESPLAZA = DESPLAZA

const $ = s => document.querySelector(s)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lin = (t, a, b) => clamp((t - a) / (b - a))
const eo = x => 1 - Math.pow(1 - x, 3)
const eio = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const mix = (a, b, p) => a + (b - a) * p
const ventana = (t, a, b, fi = 0.3, fo = 0.3) => Math.min(lin(t, a, a + fi), 1 - lin(t, b - fo, b))

// Encendido de un tubo de neón: dos parpadeos y queda fijo.
function neon(t, t0) {
  const d = t - t0
  if (d < 0) return 0
  const patron = [[0, 0.05, 1], [0.05, 0.11, 0.12], [0.11, 0.18, 0.95], [0.18, 0.23, 0.35], [0.23, 0.3, 1]]
  for (const [a, b, v] of patron) if (d >= a && d < b) return v
  return 1
}

// ── guion ────────────────────────────────────────────────────────────────
const L = V
  ? { fonoX: 540, fonoY: 600, fonoK: 1.38, palX: 540, palY: 300, palAlinea: 'center', palTam: 118, subTam: 38,
      subtY: 1480, subtTam: 52, titTam: 210, titSup: 44, titSub: 44, marcaImg: 150, marcaNom: 112,
      lemaY: 1200, lemaTam: 62, firmaY: 1370, bichoX: 540, bichoY: 96, bichoTam: 40, franja: 0 }
  : { fonoX: 1330, fonoY: 62, fonoK: 1.1, palX: 190, palY: 470, palAlinea: 'left', palTam: 132, subTam: 34,
      subtY: 872, subtTam: 50, titTam: 300, titSup: 46, titSub: 46, marcaImg: 190, marcaNom: 150,
      lemaY: 690, lemaTam: 58, firmaY: 820, bichoX: 70, bichoY: 56, bichoTam: 34, franja: 110 }

const PANTALLAS = [
  [12.75, 'buscar-0', 'corte'], [13.05, 'buscar-1', 'tecla'], [13.3, 'buscar-2', 'tecla'], [13.55, 'buscar-3', 'tecla'],
  [14.15, 'monto-0', 'desliza'], [14.45, 'monto-1', 'tecla'], [14.7, 'monto-2', 'tecla'], [14.95, 'monto-3', 'tecla'],
  [15.55, 'escanear', 'desliza'],
  [16.6, 'pagado', 'desliza'],
  [19.45, 'qr-cobro', 'corte'],
  [21.1, 'dividir', 'desliza'], [21.65, 'qrs-0', 'desliza'], [22.2, 'qrs-1', 'funde'], [22.7, 'qrs-2', 'funde'],
  [23.15, 'acreditado', 'desliza'],
  [23.95, 'retiro', 'desliza'],
  [26.3, 'genesis', 'desliza'],
]
// recuadros de neón sobre la interfaz, en coordenadas de la pantalla (390×844)
const FOCOS = [
  [13.0, 13.95, 16, 66, 358, 48],
  [14.35, 15.4, 18, 348, 354, 50],
  [16.75, 17.25, 60, 330, 270, 96],
  [19.8, 20.95, 66, 146, 258, 262],
  [21.75, 23.05, 18, 96, 356, 190],
  [23.3, 23.9, 70, 196, 250, 62],
  [24.35, 26.0, 16, 262, 358, 40],
]
// acercamientos de cámara al teléfono: [a, b, escala, foco y]
const CAMARA = [[14.25, 15.45, 1.12, 372], [24.2, 26.1, 1.16, 250], [19.7, 21.0, 1.06, 280]]

const PALABRAS = [
  [12.85, 14.05, 'Buscar.', 'el comercio'],
  [14.2, 15.45, 'Marcar.', 'el monto'],
  [15.55, 16.55, 'Escanear.', 'el código del comercio'],
  [16.65, 17.25, 'Listo.', 'pagado en ORIGEN', 'cian'],
  [19.55, 21.05, 'Cobrar', 'con un código QR, sin terminal'],
  [21.15, 23.9, 'Dividir', 'la cuenta de la mesa'],
  [23.95, 26.2, 'Retirar', 'en lempiras', 'cian'],
  [26.35, 30.75, 'Una sola', 'verificación con Genesis ID'],
]
const SUBTITULOS = [
  [1.0, 3.9, V ? 'En cada barrio, hay un lugar<br>que ya te conoce.' : 'En cada barrio, hay un lugar que ya te conoce.'],
  [17.5, 19.3, '¿Y si el negocio es tuyo?'],
]
const BROLL = [
  { src: 'calle', a: 0, b: 4.75, f0: 17, ult: 151, esc: [1.0, 1.07] },
  { src: 'cafe', a: 17.25, b: 19.7, f0: 1, ult: 151, esc: [1.05, 1.0], pos: V ? '34% 50%' : '62% 50%' },
  { src: 'calle', a: 34.3, b: 47.2, f0: 151, ult: 151, esc: [1.12, 1.18], fondo: true },
]

// ── construcción ────────────────────────────────────────────────────────
const escena = $('#escena')
escena.style.width = W + 'px'; escena.style.height = H + 'px'
document.documentElement.style.width = W + 'px'; document.documentElement.style.height = H + 'px'

const palabras = $('#palabras')
const palEls = PALABRAS.map(([, , txt, sub, cls]) => {
  const d = document.createElement('div')
  d.className = 'p neon ' + (cls || '')
  d.innerHTML = `${txt}<small>${sub}</small>`
  d.style.fontSize = L.palTam + 'px'
  d.querySelector('small').style.fontSize = L.subTam + 'px'
  d.querySelector('small').style.marginTop = (V ? 18 : 22) + 'px'
  if (V) { d.style.left = '0'; d.style.right = '0'; d.style.textAlign = 'center' } else d.style.left = L.palX + 'px'
  d.style.top = L.palY + 'px'
  palabras.appendChild(d)
  return d
})
const subtitulo = $('#subtitulo')
const subEls = SUBTITULOS.map(([, , txt]) => {
  const d = document.createElement('div'); d.className = 'linea'; d.innerHTML = txt
  d.style.top = L.subtY + 'px'; d.style.fontSize = L.subtTam + 'px'; d.style.lineHeight = 1.18
  subtitulo.appendChild(d); return d
})
$('#t-grande').style.fontSize = L.titTam + 'px'
$('#t-sup').style.fontSize = L.titSup + 'px'; $('#t-sup').style.marginBottom = '10px'
$('#t-sub').style.fontSize = L.titSub + 'px'; $('#t-sub').style.marginTop = (V ? 34 : 26) + 'px'
if (V) $('#t-sub').innerHTML = 'la moneda que sigue<br>el precio del <span class="neon oro" id="t-oro">oro</span>'

$('#marca-img').style.width = L.marcaImg + 'px'
$('#marca-nombre').style.fontSize = L.marcaNom + 'px'
$('#lockup').style.gap = (V ? 26 : 34) + 'px'
if (V) { $('#lockup').style.flexDirection = 'column'; $('#marca-nombre').style.fontSize = L.marcaNom + 'px' }
const pre = document.createElement('div'); pre.id = 'marca-pre'
pre.textContent = 'Todo empieza en'
Object.assign(pre.style, { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: 'Bricolage', fontWeight: 600,
  color: '#9D91B8', fontSize: (V ? 44 : 46) + 'px', top: (V ? 610 : 330) + 'px' })
$('#marca').appendChild(pre)
$('#lema').style.top = L.lemaY + 'px'; $('#lema').style.fontSize = L.lemaTam + 'px'
$('#firma').style.top = L.firmaY + 'px'; $('#firma').style.fontSize = (V ? 30 : 28) + 'px'
$('#og').style.height = (V ? 64 : 58) + 'px'

const bicho = $('#bicho')
bicho.querySelector('img').style.height = L.bichoTam * 1.1 + 'px'
bicho.querySelector('span').style.fontSize = L.bichoTam + 'px'
bicho.style.top = L.bichoY + 'px'
if (V) { bicho.style.left = '0'; bicho.style.right = '0'; bicho.style.justifyContent = 'center' } else bicho.style.left = L.bichoX + 'px'

// ecosistema (solo en el corte horizontal)
const eco = $('#eco')
const NODOS = [
  { id: 'mtp', img: 'media/logos/mytokenpay.png', txt: 'MyTokenPay', x: 0.30, y: 0.36, t: 30.95, tam: 190, pad: 34 },
  { id: 'veta', img: 'media/logos/veta-wallet.png', txt: 'Veta Wallet', x: 0.70, y: 0.36, t: 31.25, tam: 190, pad: 26 },
  { id: 'gen', img: 'media/logos/genesis-id.png', txt: 'Genesis ID', x: 0.50, y: 0.80, t: 31.55, tam: 190, pad: 0 },
]
const nodoEls = NODOS.map(n => {
  const d = document.createElement('div'); d.className = 'nodo'
  d.style.left = n.x * W + 'px'; d.style.top = n.y * H + 'px'
  if (n.y < 0.5) d.style.flexDirection = 'column-reverse'
  d.innerHTML = `<div class="aro" style="width:${n.tam}px;height:${n.tam}px"><img src="${n.img}" style="width:${n.tam - n.pad * 2}px"></div><span style="font-size:34px">${n.txt}</span>`
  eco.appendChild(d); return d
})
const ogNodo = document.createElement('div'); ogNodo.className = 'nodo'
ogNodo.style.left = 0.5 * W + 'px'; ogNodo.style.top = 0.505 * H + 'px'
ogNodo.innerHTML = `<img src="media/logos/orden-global.png" style="width:240px;filter:drop-shadow(0 0 22px rgba(233,196,106,.55))"><span style="font-size:40px;color:#F3E6C4">Orden Global</span>`
eco.appendChild(ogNodo)
const svg = $('#eco-svg')
svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
const lineas = [[0, 1], [1, 2], [2, 0]].map(([i, j]) => {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  const a = NODOS[i], b = NODOS[j]
  l.setAttribute('x1', a.x * W); l.setAttribute('y1', a.y * H); l.setAttribute('x2', b.x * W); l.setAttribute('y2', b.y * H)
  l.setAttribute('stroke', '#C266F5'); l.setAttribute('stroke-width', '3'); l.setAttribute('stroke-linecap', 'round')
  l.style.filter = 'drop-shadow(0 0 8px #C266F5) drop-shadow(0 0 18px rgba(79,240,255,.6))'
  const largo = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H)
  l.setAttribute('stroke-dasharray', largo); l.dataset.largo = largo
  svg.appendChild(l); return l
})

// las líneas van de centro a centro de cada círculo, medido ya con las fuentes cargadas
function alinearLineas() {
  const c = nodoEls.map((d, i) => { const aro = d.querySelector('.aro'); return [NODOS[i].x * W, NODOS[i].y * H - d.offsetHeight / 2 + aro.offsetTop + aro.offsetHeight / 2] })
  ;[[0, 1], [1, 2], [2, 0]].forEach(([i, j], k) => {
    const l = lineas[k]; l.setAttribute('x1', c[i][0]); l.setAttribute('y1', c[i][1]); l.setAttribute('x2', c[j][0]); l.setAttribute('y2', c[j][1])
    const largo = Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]); l.setAttribute('stroke-dasharray', largo); l.dataset.largo = largo
  })
}

// grano de película: cuatro teselas de ruido fijas, una por cuadro
const granos = [1, 2, 3, 4].map(sem => {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const x = c.getContext('2d'), im = x.createImageData(256, 256)
  let s = sem * 9301
  for (let i = 0; i < im.data.length; i += 4) { s = (s * 16807) % 2147483647; const v = 128 + ((s % 90) - 45); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 }
  x.putImageData(im, 0, 0); return c.toDataURL()
})

// precarga de pantallas
const cache = {}
window.listo = Promise.all([...new Set(PANTALLAS.map(p => p[1]))].map(n => {
  const i = new Image(); i.src = `media/pantallas/${n}.jpg`; cache[n] = i.src; return i.decode()
}).concat([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))])).then(alinearLineas)

// ── cuadro ──────────────────────────────────────────────────────────────
const fono = $('#telefono'), scrA = $('#scr-a'), scrB = $('#scr-b'), foco = $('#foco'), barrido = $('#barrido')
const brollImg = $('#broll-img')
let brollActual = ''

function pantallaEn(t) {
  let i = -1
  for (let k = 0; k < PANTALLAS.length; k++) if (PANTALLAS[k][0] <= t) i = k
  return i
}

window.cuadro = async function (tv) {
  const t = aMaestro(tv)
  const fr = Math.round(tv * 30)

  // fondo que respira
  const f = $('#fondo')
  f.style.setProperty('--fx1', 18 + 6 * Math.sin(t * 0.21) + '%'); f.style.setProperty('--fy1', 22 + 5 * Math.cos(t * 0.17) + '%')
  f.style.setProperty('--fx2', 86 - 5 * Math.sin(t * 0.19) + '%'); f.style.setProperty('--fy2', 82 - 4 * Math.cos(t * 0.23) + '%')
  $('#grano').style.backgroundImage = `url(${granos[fr % 4]})`

  // b-roll
  const br = BROLL.find(b => t >= b.a && t < b.b)
  const brC = $('#broll')
  let franja = 0
  if (br) {
    const n = Math.min(br.ult, br.f0 + Math.floor((t - br.a) * 30))
    const src = `cuadros/${br.src}/${String(n).padStart(4, '0')}.jpg`
    if (src !== brollActual) { brollImg.src = src; brollActual = src; await brollImg.decode().catch(() => {}) }
    brollImg.style.objectPosition = br.pos || '50% 50%'
    let esc = mix(br.esc[0], br.esc[1], lin(t, br.a, br.b))
    let origen = '50% 50%'
    if (br.src === 'calle' && !br.fondo) { const z = eio(lin(t, 4.25, 4.75)); esc *= 1 + z * 1.6; origen = '51% 26%' }
    brollImg.style.transformOrigin = origen
    brollImg.style.transform = `scale(${esc})`
    if (br.fondo) {
      brollImg.style.filter = `blur(${V ? 16 : 20}px) brightness(.32) saturate(1.2)`
      brC.style.opacity = lin(t, 34.3, 35.2) * (1 - lin(t, 45.4, 46.6))
    } else {
      brollImg.style.filter = 'none'
      brC.style.opacity = br.src === 'cafe' ? ventana(t, br.a, br.b, 0.2, 0.25) : 1 - lin(t, 4.55, 4.75)
      franja = L.franja * ventana(t, br.a, br.b, 0.25, 0.25)
    }
  } else brC.style.opacity = 0
  $('#franja-a').style.height = $('#franja-b').style.height = franja + 'px'

  // destello violeta entre la calle y ORIGEN
  const destello = Math.max(0, 1 - Math.abs(t - 4.72) / 0.22)
  $('#negro').style.background = destello > 0 ? `rgba(194,102,245,${0.55 * destello})` : '#000'
  $('#negro').style.opacity = destello > 0 ? 1 : lin(t, 45.5, 46.9)

  // subtítulos
  SUBTITULOS.forEach(([a, b], i) => {
    const o = ventana(t, a, b, 0.25, 0.3)
    subEls[i].style.opacity = o
    subEls[i].style.transform = `translateY(${(1 - eo(lin(t, a, a + 0.5))) * 18}px)`
  })

  // ORIGEN
  const tit = $('#titulo')
  const tv0 = ventana(t, 4.6, 10.15, 0.2, 0.35)
  tit.style.opacity = tv0
  tit.style.transform = `scale(${1 + 0.05 * lin(t, 4.6, 10.15) + 0.1 * lin(t, 9.8, 10.15)})`
  $('#t-sup').style.opacity = eo(lin(t, 4.75, 5.2))
  const g = neon(t, 6.2)
  $('#t-grande').style.opacity = 0.12 + 0.88 * g
  $('#t-grande').classList.toggle('apagado', g < 0.2)
  $('#t-sub').style.opacity = eo(lin(t, 7.4, 7.9))
  $('#t-sub').style.transform = `translateY(${(1 - eo(lin(t, 7.4, 8.0))) * 20}px)`
  const oro = $('#t-oro'); oro.style.opacity = 0.35 + 0.65 * neon(t, 8.85)

  // marca: presentación y cierre
  const intro = ventana(t, 10.2, 12.95, 0.25, 0.4)
  const cierre = lin(t, 34.5, 34.9)
  const marca = $('#marca')
  const enIntro = t < 20
  marca.style.opacity = enIntro ? intro : cierre * (1 - lin(t, 45.4, 46.6))
  const t0 = enIntro ? 10.25 : 34.6
  const mImg = $('#marca-img')
  mImg.style.opacity = eo(lin(t, t0, t0 + 0.5))
  mImg.style.transform = `scale(${mix(0.72, 1, eo(lin(t, t0, t0 + 0.7)))}) rotate(${mix(-8, 0, eo(lin(t, t0, t0 + 0.7)))}deg)`
  const nom = $('#marca-nombre')
  const encendido = neon(t, enIntro ? 11.45 : 34.72)
  nom.style.opacity = 0.1 + 0.9 * encendido
  nom.classList.toggle('apagado', encendido < 0.2)
  $('#lockup').style.transform = `scale(${enIntro ? 1 + 0.04 * lin(t, 10.2, 12.95) : 1 + 0.03 * lin(t, 34.5, 46)})`
  pre.style.opacity = enIntro ? eo(lin(t, 10.35, 10.8)) : 0
  $('#lema').style.opacity = enIntro ? 0 : eo(lin(t, 36.35, 36.9))
  $('#lema').style.transform = `translateY(${(1 - eo(lin(t, 36.35, 37.0))) * 22}px)`
  $('#firma').style.opacity = enIntro ? 0 : eo(lin(t, 38.6, 39.3))

  // logo pequeño mientras se ve la app
  bicho.style.opacity = ventana(t, 12.75, 34.35, 0.4, 0.3) * (1 - ventana(t, 17.2, 19.75, 0.2, 0.25)) * (V ? 0.9 : 1)

  // teléfono
  const entra1 = eo(lin(t, 12.6, 13.2)), sale1 = eio(lin(t, 17.05, 17.45))
  const entra2 = eo(lin(t, 19.3, 19.85)), sale2 = eio(lin(t, 30.55, 31.15))
  let vis = 0, dy = 0, dx = 0, giro = 0, esc = 1
  if (t < 18.3) { vis = t >= 12.6 ? 1 : 0; dy = (1 - entra1) * (H * 0.9) + sale1 * (V ? -H : 0); dx = V ? 0 : sale1 * 900; giro = (1 - entra1) * 14 - sale1 * 10 }
  else { vis = t >= 19.3 && t < 31.2 ? 1 : 0; dx = V ? 0 : (1 - entra2) * 800; dy = V ? (1 - entra2) * H : 0; giro = (1 - entra2) * -12; esc = 1 - 0.35 * sale2; dx += V ? 0 : -sale2 * 520; }
  if (V && t >= SALTO + DESPLAZA - 0.2) vis = 0
  const fade2 = 1 - sale2
  let zoom = 1, focoY = 422
  for (const [a, b, s, fy] of CAMARA) { const k = ventana(t, a, b, 0.35, 0.35); if (k > 0) { zoom = mix(1, s, eio(k)); focoY = fy } }
  const k = L.fonoK * esc * zoom
  const flota = Math.sin(t * 0.9) * 6
  const px = L.fonoX - 195 * k + dx, py = L.fonoY + (V ? 0 : 0) + dy + flota - (zoom - 1) * (focoY - 200) * L.fonoK
  fono.style.transform = `translate(${px}px, ${py}px) perspective(1600px) rotateY(${giro + (V ? 0 : -7) + Math.sin(t * 0.5) * 2}deg) rotateX(${V ? 3 : 2}deg) scale(${k})`
  $('#telefono-capa').style.opacity = vis * (t < 18.3 ? 1 : fade2)

  const ip = pantallaEn(t)
  if (ip >= 0) {
    const [ta, nombre, tipo] = PANTALLAS[ip]
    const prev = ip > 0 ? PANTALLAS[ip - 1][1] : nombre
    const dur = tipo === 'desliza' ? 0.38 : tipo === 'funde' ? 0.25 : tipo === 'tecla' ? 0.07 : 0.001
    const p = eio(lin(t, ta, ta + dur))
    scrA.src = cache[prev]; scrB.src = cache[nombre]
    if (tipo === 'desliza') {
      scrA.style.transform = `translateX(${-p * 120}px)`; scrA.style.opacity = 1 - p * 0.9
      scrB.style.transform = `translateX(${(1 - p) * 390}px)`; scrB.style.opacity = 1
    } else {
      scrA.style.transform = scrB.style.transform = 'none'
      scrA.style.opacity = 1; scrB.style.opacity = p
    }
  }
  let fo = 0
  for (const [a, b, x, y, w, h] of FOCOS) {
    const o = ventana(t, a, b, 0.18, 0.2)
    if (o > 0) { fo = o * neon(t, a); Object.assign(foco.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }) }
  }
  foco.style.opacity = fo
  const bo = ventana(t, 15.7, 16.55, 0.1, 0.1)
  barrido.style.opacity = bo
  Object.assign(barrido.style, { left: '52px', width: '286px', top: 290 + (0.5 - 0.5 * Math.cos((t - 15.7) * 5.2)) * 270 + 'px' })

  // palabras
  PALABRAS.forEach(([a, b], i) => {
    const e = palEls[i]
    const o = neon(t, a) * (1 - lin(t, b - 0.18, b))
    e.style.opacity = t >= a && t < b ? o : 0
    e.style.transform = `translateY(${(1 - eo(lin(t, a, a + 0.4))) * 16}px)`
  })

  // ecosistema
  const ecoV = V ? 0 : ventana(t, 30.8, 34.45, 0.3, 0.3)
  eco.style.opacity = ecoV
  NODOS.forEach((n, i) => {
    const p = eo(lin(t, n.t, n.t + 0.5))
    nodoEls[i].style.opacity = p
    nodoEls[i].style.transform = `translate(-50%, -50%) scale(${mix(0.6, 1, p)})`
  })
  lineas.forEach((l, i) => { const p = eio(lin(t, 31.4 + i * 0.3, 32.2 + i * 0.3)); l.setAttribute('stroke-dashoffset', (1 - p) * l.dataset.largo) })
  const og = neon(t, 33.2)
  ogNodo.style.opacity = og
  ogNodo.style.transform = `translate(-50%, -50%) scale(${mix(0.85, 1, eo(lin(t, 33.2, 33.8)))})`
}
