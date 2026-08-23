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

/* La piel del planeta: los tres colores de la marca tejidos en bandas suaves,
   con el sol pegando de un lado. No es una foto de un planeta, es ESTA casa
   hecha mundo. */
export function planetaTextura(key: string, grad: string[]): THREE.Texture {
  const clave = `pl:${key}`
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

  // bandas: nubes de un mundo que gira
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * H + Math.sin(i * 2.3) * 5
    const alto = 3 + ((i * 37) % 11)
    g.globalAlpha = 0.05 + ((i * 17) % 9) / 60
    g.fillStyle = i % 3 === 0 ? claro : hondo
    g.beginPath()
    g.ellipse(W / 2 + Math.sin(i * 1.7) * 60, y, W * 0.75, alto, 0, 0, Math.PI * 2)
    g.fill()
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
