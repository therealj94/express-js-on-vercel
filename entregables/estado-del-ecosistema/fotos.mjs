/* Las dos capturas del documento, sacadas de la aplicación de verdad.
 *
 * Un dibujo hecho para el folleto es exactamente lo que la gente huele. Esto
 * abre la app en un navegador, la pone en la pantalla que hace falta y la
 * fotografía: sus tipografías, sus colores, su enlace al explorador.
 *
 * Los datos son de ejemplo y NO son de nadie: nombres inventados, un monto
 * redondo y un relevo simulado. Nunca se fotografía la cuenta de una persona.
 *
 *   python3 -m http.server 8791 --directory ../..
 *   node fotos.mjs
 */
import { chromium } from 'playwright'

const SITIO = 'http://127.0.0.1:8791/apps-web/veta-wallet/index.html'
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

/** Entra a la app con una sesión de ejemplo y deja la vista pedida en pantalla. */
async function abrir({ ancho, alto, escala, rutas, vista, sembrar }) {
  const pag = await (await nav.newContext({ locale: 'es-HN',
    viewport: { width: ancho, height: alto }, deviceScaleFactor: escala })).newPage()
  await pag.route('**/*', async (r) => {
    const u = r.request().url()
    if (u.startsWith('http://127.0.0.1:8791')) return r.continue()
    const cuerpo = rutas(u)
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(cuerpo ?? {}) })
  })
  await pag.goto(SITIO, { waitUntil: 'domcontentloaded' })
  await pag.waitForTimeout(2400)
  await pag.evaluate(([v, s]) => {
    const tk = btoa(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 9999 }))
    VETA._sesion({ token: `x.${tk}.y`, correo: 'jose@ordenglobal.link',
      nombre: 'Jose Medardo Enamorado', direccion: '0x' + '1'.repeat(40) })
    VETA._identidad({ estado: 'verificada', gid: 'GID-JOSE' })
    if (s) VETA._tarjeta(s)
    document.getElementById('app')?.classList.remove('oculto')
    for (const id of ['portada', 'techo', 'acceso', 'reclave'])
      document.getElementById(id)?.classList.add('oculto')
    VETA.vista(v)
  }, [vista, sembrar])
  await pag.waitForTimeout(1600)
  return pag
}

// ── LA TARJETA. A 4x porque una captura a 1x impresa a 300 puntos por pulgada
// se ve como la foto de una foto.
{
  const pag = await abrir({ ancho: 520, alto: 820, escala: 4, vista: 'tarjeta',
    sembrar: { last4: '4242', estado: 'activa', saldo: 0 },
    rutas: () => ({}) })
  await pag.waitForTimeout(900)
  await pag.locator('.tar-escena').screenshot({ path: 'img/tarjeta.png' })
  console.log('  img/tarjeta.png')
  await pag.context().close()
}

// ── EL PAGO EN EL CHAT.
{
  const ahora = Date.now()
  const yo = 'jose@ordenglobal.link', ella = 'ana@ordenglobal.link'
  const pag = await abrir({ ancho: 430, alto: 900, escala: 3, vista: 'chat',
    rutas: (u) => {
      if (u.endsWith('/alta')) return { llave: 'x'.repeat(48) }
      if (u.endsWith('/conversaciones')) return { conversaciones: [
        { correo: ella, nombre: 'Ana Fajardo', foto: '', sinLeer: 0,
          ultimo: { tipo: 'pago', monto: '25.00', moneda: 'ORIGEN', cuando: ahora - 6e4 } }] }
      if (u.endsWith('/amistad/lista')) return { amigos: [
        { correo: ella, nombre: 'Ana Fajardo', addr: '0x' + 'a'.repeat(40), gid: 'GID-AAA', foto: '' }],
        recibidas: [], enviadas: [], bloqueados: [] }
      if (u.endsWith('/estados')) return { gente: [] }
      if (u.endsWith('/bandeja')) return { mensajes: [
        { id: 'm1', de: ella, para: yo, texto: '¿Me podés pasar lo del almuerzo?', cuando: ahora - 42e4 },
        { id: 'm2', de: yo, para: ella, texto: 'Va ahora mismo', cuando: ahora - 30e4 },
        { id: 'm3', de: yo, para: ella, tipo: 'pago', monto: '25.00', moneda: 'ORIGEN',
          texto: 'El almuerzo del jueves', hash: '0x8f3a91c2d4e7b60518a2c9f4e1d7b3a6', cuando: ahora - 6e4 },
        { id: 'm4', de: ella, para: yo, texto: '¡Recibido! Gracias 🙏', cuando: ahora - 2e4 }] }
      if (u.endsWith('/llaves/de')) return { llaves: {}, sinLlave: [] }
      if (u.endsWith('/senales')) return { senales: [] }
      return {}
    } })
  await pag.evaluate((c) => VETA.chatAbrir(c), ella)
  await pag.waitForTimeout(2400)

  /* El recorte se MIDE: dónde termina la última burbuja con su hora, más un
     poco de aire. Cortar por un porcentaje fijo fue la primera versión, y
     partía el último mensaje por la mitad — que se lee como un error, no como
     un encuadre. */
  const alto = await pag.evaluate(() => {
    const cab = document.querySelector('.cha-hcab')
    const burbujas = [...document.querySelectorAll('#chat-msgs .cha-b')]
    const ultima = burbujas[burbujas.length - 1]
    const hora = ultima.querySelector('time') || ultima
    return Math.ceil(hora.getBoundingClientRect().bottom - cab.getBoundingClientRect().top + 14)
  })
  const caja = await pag.locator('.cha-hcab').boundingBox()
  await pag.screenshot({ path: 'img/pago-en-chat.png',
    clip: { x: caja.x, y: caja.y, width: caja.width, height: alto } })
  console.log('  img/pago-en-chat.png')
  await pag.context().close()
}

await nav.close()
