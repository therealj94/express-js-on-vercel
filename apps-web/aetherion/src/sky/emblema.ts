import * as THREE from 'three'

/* LA CARA DE CADA CASA.
 *
 * Un planeta sin marca es una bolita de color: bonita y muda. Aquí se cocinan
 * las tres texturas que hacen que una casa se reconozca de un vistazo:
 *
 *   · emblemaTextura  — el logotipo REAL de la app (el PNG de la casa) o, si
 *                       esa app no tiene logotipo, su ícono de línea tal cual
 *                       lo dibuja la wallet. Nada inventado: son las mismas
 *                       marcas que la persona ya conoce del Núcleo.
 *   · letreroTextura  — el nombre, en la tipografía de la casa.
 *   · planetaTextura  — la piel del planeta, tejida con los colores de marca.
 *
 * Todo se dibuja en un canvas y se cachea por clave: ocho casas son ocho
 * texturas, no ochenta.
 */

const cache = new Map<string, THREE.Texture>()

function lienzo(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

function deLienzo(c: HTMLCanvasElement, clave: string) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  cache.set(clave, t)
  return t
}

/* El ícono de línea de la wallet es un puñado de <path d="…">: Path2D los
   dibuja en canvas sin pasar por el DOM. El lienzo del ícono es de 24×24,
   como el viewBox del que salen. */
function pintarIcono(g: CanvasRenderingContext2D, ico: string, lado: number, color: string) {
  const trozos = ico.match(/d="([^"]+)"/g) || []
  if (!trozos.length) return false
  g.save()
  g.translate(lado * 0.5, lado * 0.5)
  const k = (lado * 0.62) / 24
  g.scale(k, k)
  g.translate(-12, -12)
  g.strokeStyle = color
  g.lineWidth = 1.7
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.shadowColor = color
  g.shadowBlur = 6
  for (const t of trozos) {
    const d = t.slice(3, -1)
    try { g.stroke(new Path2D(d)) } catch { /* un path raro no tumba el planeta */ }
  }
  /* Los círculos y rectángulos del ícono llegan como etiquetas sueltas: se
     dibujan aparte porque no son <path>. */
  for (const m of ico.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
    g.beginPath(); g.arc(+m[1], +m[2], +m[3], 0, Math.PI * 2); g.stroke()
  }
  for (const m of ico.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"(?: rx="([\d.]+)")?/g)) {
    const [x, y, w, h, r] = [+m[1], +m[2], +m[3], +m[4], +(m[5] || 0)]
    g.beginPath()
    if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r)
    else g.rect(x, y, w, h)
    g.stroke()
  }
  g.restore()
  return true
}

export interface CaraDef {
  key: string
  logo?: string
  ico?: string
  halo: string
  lente?: string
  zoom?: number
}

/* LA LENTE DE LA CASA. Los logotipos del ecosistema vienen de dos maneras:
   unos calados (fondo transparente) y otros sobre su propio cuadro oscuro. En
   el Núcleo clásico todos se ven bien porque van dentro de una LENTE redonda,
   y aquí se hace igual: el planeta lleva su marca en la misma lente que la
   persona ya conoce. Un cuadrado pegado sobre un mundo se vería como una
   calcomanía; un disco con su aro de luz se ve como una insignia.

   El emblema nace con el ícono de línea y se completa cuando el logotipo
   termina de bajar: el planeta nunca queda esperando a una imagen. */
export function emblemaTextura(def: CaraDef): THREE.Texture {
  const clave = `em:${def.key}`
  const hecho = cache.get(clave)
  if (hecho) return hecho
  const L = 256
  const { c, g } = lienzo(L, L)
  const lente = def.lente || '#0a1018'

  const fondo = () => {
    g.clearRect(0, 0, L, L)
    // el halo que despega la insignia del planeta
    const brillo = g.createRadialGradient(L / 2, L / 2, L * 0.38, L / 2, L / 2, L * 0.5)
    brillo.addColorStop(0, hexA(def.halo, 0.34))
    brillo.addColorStop(1, hexA(def.halo, 0))
    g.fillStyle = brillo
    g.fillRect(0, 0, L, L)
    // la lente
    g.save()
    g.beginPath()
    g.arc(L / 2, L / 2, L * 0.42, 0, Math.PI * 2)
    g.closePath()
    const cristal = g.createLinearGradient(0, L * 0.12, 0, L * 0.88)
    cristal.addColorStop(0, hexA(lente, 0.99))
    cristal.addColorStop(1, hexA(lente, 0.94))
    g.fillStyle = cristal
    g.fill()
    g.restore()
  }

  const aro = () => {
    g.save()
    g.beginPath()
    g.arc(L / 2, L / 2, L * 0.38, 0, Math.PI * 2)
    g.strokeStyle = hexA(def.halo, 0.75)
    g.lineWidth = 4
    g.shadowColor = def.halo
    g.shadowBlur = 16
    g.stroke()
    g.restore()
  }

  fondo()
  if (def.ico) {
    g.save()
    g.beginPath(); g.arc(L / 2, L / 2, L * 0.42, 0, Math.PI * 2); g.clip()
    pintarIcono(g, def.ico, L, '#f6efe0')
    g.restore()
  }
  aro()
  const tex = deLienzo(c, clave)

  if (def.logo) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      fondo()
      g.save()
      g.beginPath(); g.arc(L / 2, L / 2, L * 0.38, 0, Math.PI * 2); g.clip()
      const caja = L * 0.74 * (def.zoom || 1)
      const k = Math.min(caja / img.width, caja / img.height)
      const w = img.width * k
      const h = img.height * k
      g.drawImage(img, (L - w) / 2, (L - h) / 2, w, h)
      g.restore()
      aro()
      tex.needsUpdate = true
    }
    img.onerror = () => { /* sin logotipo queda el ícono, que ya está pintado */ }
    img.src = def.logo
  }
  return tex
}

/* Un color de la casa con la transparencia que haga falta. Los colores llegan
   en #rrggbb, que es como los escribe la wallet. */
function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  const v = parseInt(n.slice(0, 6), 16)
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`
}

export function letreroTextura(nombre: string, color: string): THREE.Texture {
  const clave = `nb:${nombre}`
  const hecho = cache.get(clave)
  if (hecho) return hecho
  const W = 512
  const H = 128
  const { c, g } = lienzo(W, H)
  const texto = nombre.toUpperCase()
  g.font = '700 54px Cinzel, "Bodoni Moda", Didot, Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.letterSpacing = '3px'
  /* El nombre se lee sobre cualquier fondo del cielo: primero su propia
     sombra, después la letra en crema. */
  g.shadowColor = 'rgba(0,0,0,0.85)'
  g.shadowBlur = 18
  g.fillStyle = 'rgba(4,8,16,0.78)'
  g.fillText(texto, W / 2, H / 2)
  g.shadowColor = color
  g.shadowBlur = 18
  g.fillStyle = '#fdf7ea'
  g.fillText(texto, W / 2, H / 2)
  return deLienzo(c, clave)
}

/* LA PIEL DE CADA MUNDO.
 *
 * Los colores son siempre los de la marca —eso no se negocia: la casa se tiene
 * que reconocer— pero la SUPERFICIE cambia con la naturaleza del planeta. Un
 * gigante gaseoso no se parece a un mundo helado ni a una forja, y esa
 * diferencia es lo que hace que ocho planetas se recuerden como ocho sitios y
 * no como ocho bolas de distinto color. */
export function planetaTextura(key: string, grad: string[], natura = 'gigante'): THREE.Texture {
  const clave = `pl:${key}:${natura}`
  const hecho = cache.get(clave)
  if (hecho) return hecho
  const W = 512
  const H = 256
  const { c, g } = lienzo(W, H)
  const [claro, medio, hondo] = [grad[0] || '#ffffff', grad[1] || '#888888', grad[2] || '#101010']

  const base = g.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0, hondo)
  base.addColorStop(0.35, medio)
  base.addColorStop(0.62, claro)
  base.addColorStop(1, hondo)
  g.fillStyle = base
  g.fillRect(0, 0, W, H)

  const azar = (() => { let s = 0; for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } })()

  if (natura === 'gigante') {
    // bandas anchas de gigante gaseoso, con su ojo de tormenta
    for (let i = 0; i < 16; i++) {
      const y = (i / 16) * H + Math.sin(i * 2.1) * 6
      g.globalAlpha = 0.10 + ((i * 17) % 9) / 42
      g.fillStyle = i % 2 === 0 ? claro : hondo
      g.beginPath()
      g.ellipse(W / 2 + Math.sin(i * 1.3) * 40, y, W * 0.8, 6 + ((i * 29) % 13), 0, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 0.5
    g.fillStyle = claro
    g.beginPath(); g.ellipse(W * 0.66, H * 0.62, 46, 22, 0.2, 0, Math.PI * 2); g.fill()
    g.globalAlpha = 0.35
    g.fillStyle = hondo
    g.beginPath(); g.ellipse(W * 0.66, H * 0.62, 26, 12, 0.2, 0, Math.PI * 2); g.fill()
  } else if (natura === 'helado') {
    // casquetes polares y grietas de hielo
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = 0.06 + azar() * 0.1
      g.strokeStyle = '#ffffff'
      g.lineWidth = 0.6 + azar() * 1.6
      g.beginPath()
      const x0 = azar() * W, y0 = azar() * H
      g.moveTo(x0, y0)
      g.lineTo(x0 + (azar() - 0.5) * 90, y0 + (azar() - 0.5) * 40)
      g.stroke()
    }
    g.globalAlpha = 0.85
    const casq = (arriba: boolean) => {
      const gg = g.createLinearGradient(0, arriba ? 0 : H, 0, arriba ? H * 0.22 : H * 0.78)
      gg.addColorStop(0, 'rgba(255,255,255,0.95)')
      gg.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gg
      g.fillRect(0, arriba ? 0 : H * 0.78, W, H * 0.22)
    }
    casq(true); casq(false)
  } else if (natura === 'forja') {
    // vetas de metal encendido: lo que se funde y se acuña
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = 0.12 + azar() * 0.3
      g.strokeStyle = i % 3 === 0 ? '#ffd08a' : claro
      g.lineWidth = 1 + azar() * 3.5
      g.beginPath()
      let x = azar() * W, y = azar() * H
      g.moveTo(x, y)
      for (let k = 0; k < 6; k++) { x += (azar() - 0.4) * 70; y += (azar() - 0.5) * 26; g.lineTo(x, y) }
      g.stroke()
    }
  } else if (natura === 'oceano') {
    // nubes altas sobre agua: la palabra que fluye
    for (let i = 0; i < 22; i++) {
      g.globalAlpha = 0.08 + azar() * 0.16
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.ellipse(azar() * W, azar() * H, 30 + azar() * 90, 5 + azar() * 12, azar() * 0.6, 0, Math.PI * 2)
      g.fill()
    }
  } else if (natura === 'jardin') {
    // manchas de vida y una bruma cálida encima
    for (let i = 0; i < 30; i++) {
      g.globalAlpha = 0.08 + azar() * 0.14
      g.fillStyle = i % 4 === 0 ? claro : medio
      g.beginPath()
      g.ellipse(azar() * W, azar() * H, 14 + azar() * 48, 8 + azar() * 22, azar() * 3, 0, Math.PI * 2)
      g.fill()
    }
  } else if (natura === 'bunker') {
    // roca seca con cráteres: lo que custodia no tiene atmósfera que perder
    for (let i = 0; i < 34; i++) {
      const x = azar() * W, y = azar() * H, r = 4 + azar() * 20
      g.globalAlpha = 0.16 + azar() * 0.14
      g.fillStyle = hondo
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
      g.globalAlpha = 0.12
      g.fillStyle = claro
      g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.7, 0, Math.PI * 2); g.fill()
    }
  } else if (natura === 'boveda') {
    // oro viejo en capas: la banca guarda por estratos
    for (let i = 0; i < 22; i++) {
      const y = (i / 22) * H
      g.globalAlpha = 0.10 + ((i * 23) % 11) / 48
      g.fillStyle = i % 2 === 0 ? '#e9d9a8' : hondo
      g.fillRect(0, y, W, 3 + ((i * 13) % 7))
    }
  } else if (natura === 'nucleo') {
    // malla de luz por dentro: la memoria viva
    g.globalAlpha = 0.34
    g.strokeStyle = claro
    g.lineWidth = 1
    const pts: Array<[number, number]> = []
    for (let i = 0; i < 40; i++) pts.push([azar() * W, azar() * H])
    for (const [x, y] of pts) {
      for (const [x2, y2] of pts) {
        const d = Math.hypot(x - x2, y - y2)
        if (d > 8 && d < 70) { g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke() }
      }
    }
    g.globalAlpha = 0.8
    g.fillStyle = '#ffffff'
    for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill() }
  } else {
    // faro: pálido y liso, con un pulso de luz en el ecuador
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = 0.06 + azar() * 0.08
      g.fillStyle = claro
      g.fillRect(0, azar() * H, W, 2 + azar() * 6)
    }
    g.globalAlpha = 0.3
    g.fillStyle = claro
    g.fillRect(0, H * 0.48, W, 6)
  }
  g.globalAlpha = 1

  // el terminador: un borde de noche que le da bulto a la esfera
  const noche = g.createLinearGradient(0, 0, W, 0)
  noche.addColorStop(0, 'rgba(0,0,0,0.55)')
  noche.addColorStop(0.42, 'rgba(0,0,0,0)')
  noche.addColorStop(0.78, 'rgba(0,0,0,0)')
  noche.addColorStop(1, 'rgba(0,0,0,0.62)')
  g.fillStyle = noche
  g.fillRect(0, 0, W, H)

  return deLienzo(c, clave)
}

export function limpiarCaras() {
  cache.forEach((t) => t.dispose())
  cache.clear()
}
