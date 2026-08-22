/**
 * EL PANEL DE CUMPLIMIENTO EN UN TELEFONO, medido a 360 px.
 *
 *   node src/pruebas/panel-movil.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * Un operador puede tener que aprobar una identidad desde el telefono. No es un
 * caso raro ni un lujo: la persona que decide no siempre esta en un escritorio,
 * y lo que se decide aqui es si alguien entra o no al ecosistema. Asi que esta
 * pantalla tiene que caber en un telefono con la misma seriedad con la que tiene
 * que cuadrar la bitacora.
 *
 * El barrido general (apps-web/probar-movil-todo.mjs) no llegaba a esto. Abre
 * admin.html sin sesion, o sea que solo mide LA PUERTA: la cola de identidades,
 * la ficha de una persona, la bitacora y la mesa de cotejo estan las cuatro
 * detras del login y no las veia ninguna medida. Por eso esta prueba levanta el
 * servidor de verdad, siembra identidades por la API de verdad y entra por el
 * formulario, como el idioma de panel-segundo-factor.mjs.
 *
 * LOS TRES AGUJEROS QUE ENCONTRO, y que son lo que comprueba:
 *
 *   1. LA MESA DE COTEJO SE CORRIA DE LADO. El correo de la persona va en la
 *      cabecera, y un correo hondureño de verdad
 *      (mayra.carolina.enamorado.alvarez@corporacionordenglobal.hn) es una sola
 *      palabra de 400 px sin un espacio donde partirla. Medido a 360 px: el
 *      documento entero media 448. No se salia el correo: se salia LA MESA, con
 *      las dos caras que hay que comparar descentradas justo al compararlas. Y
 *      pasaba a los cuatro anchos, del iPhone SE al Android grande.
 *
 *   2. LA TABLA DE ROTURAS DE LA BITACORA SE RECORTABA. Todas las tablas del
 *      panel van dentro de `tarjeta scroll`; a esa se le habia quedado la
 *      palabra `scroll`. Con `.tarjeta{overflow:hidden}` y `table{min-width:720px}`
 *      la tercera columna («Entradas hasta entonces», la que dice cuanto
 *      registro habia antes de la rotura) quedaba fuera del borde SIN barra de
 *      desplazamiento: no es que costara llegar, es que no se llegaba, y sin
 *      ninguna señal de que faltaba una columna.
 *
 *   3. EL CAJON CERRADO SEGUIA EN EL ORDEN DE TABULACION. Aparcado con
 *      `translateX(100%)` esta fuera del cristal pero no del navegador: el boton
 *      «Cerrar» de una ficha CERRADA recibia el foco del teclado y un lector de
 *      pantalla leia la ficha entera. Ademas ensuciaba la medida, con cuatro
 *      elementos «fuera del ancho» en todas las pantallas del panel.
 *
 * Los nombres de la prueba son largos a proposito. El fallo original salio con
 * «Mayra Carolina Enamorado Alvarez», que en Honduras es un nombre normal, y con
 * el nombre corto de uno mismo no se ve nunca.
 *
 * GID_RAIZ apunta a otra copia del servicio (por ejemplo una sacada de git) para
 * poder medir el antes y el despues con la MISMA vara.
 */
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = process.env.GID_RAIZ ? resolve(process.env.GID_RAIZ) : join(AQUI, '..', '..')

// El ancho del telefono mas angosto que sigue en la calle. Si entra aqui, entra
// en todos.
const ANCHO = 360

const CORREO_ADMIN = 'admin@ordenglobal.org'
const CLAVE_ADMIN = 'una contrasena de operador bien larga'

/* La operadora que decide, con nombre y correo de verdad. Va como OPERADORA y
   tambien como IDENTIDAD revisada: el nombre largo tiene que caber en la
   cabecera del panel, en la fila de la cola, en el titulo de la ficha y en la
   cabecera de la mesa de cotejo, que son cuatro cajas con cuatro reglas. */
const OP_CORREO = 'mayra.carolina.enamorado.alvarez@corporacionordenglobal.hn'
const OP_NOMBRE = 'Mayra Carolina Enamorado Alvarez'
const OP_CLAVE = 'otra contrasena bien larga de operadora'

const REVISADA_CORREO = 'jose.wilfredo.zelaya.montesdeoca@corporacionordenglobal.hn'
const REVISADA_NOMBRE = 'Jose Wilfredo Zelaya Montesdeoca'

// ── decir/comprobar, como toda prueba de la casa ────────────────────────────
let malas = 0
const decir = (ok, que, extra = '') => {
  if (!ok) malas++
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`)
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 170)}`)
}

// ── el servidor de verdad ───────────────────────────────────────────────────
const carpeta = mkdtempSync(join(tmpdir(), 'gid-movil-'))
const PUERTO = 4200 + Math.floor(Math.random() * 1200)
const base = `http://127.0.0.1:${PUERTO}`

const servidor = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: RAIZ,
  env: {
    ...process.env,
    PORT: String(PUERTO),
    GENESIS_DATA_FILE: join(carpeta, 'genesis.json'),
    GENESIS_PERMITIR_ARCHIVO: 'si',
    // Nada de red ni de relojes: se mide la caja, no el servicio.
    GENESIS_LISTAS_AUTO: 'no',
    GENESIS_ANCLA_AUTO: 'no',
    GENESIS_ADMIN_EMAIL: CORREO_ADMIN,
    GENESIS_ADMIN_PASSWORD: CLAVE_ADMIN,
    // Sin segundo factor: esa puerta ya tiene su prueba en panel-segundo-factor.mjs.
    GENESIS_2FA_ROLES: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let registro = ''
servidor.stdout.on('data', (d) => { registro += d })
servidor.stderr.on('data', (d) => { registro += d })

const pedir = async (ruta, op = {}) => {
  const r = await fetch(base + ruta, {
    ...op, headers: { 'Content-Type': 'application/json', ...(op.headers || {}) },
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) }
}

const terminar = (codigo) => {
  servidor.kill()
  rmSync(carpeta, { recursive: true, force: true })
  process.exit(codigo)
}

for (let i = 0; i < 90; i++) {
  try { if ((await fetch(base + '/healthz')).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 500))
}

console.log(`\n════ EL PANEL DE CUMPLIMIENTO A ${ANCHO} px ${'═'.repeat(24)}`)
console.log(`     servicio: ${RAIZ}`)

// ── sembrar por la API de verdad ────────────────────────────────────────────
const sesionAdmin = await pedir('/api/sesion/entrar', {
  method: 'POST', body: JSON.stringify({ email: CORREO_ADMIN, contrasena: CLAVE_ADMIN }),
})
if (sesionAdmin.estado !== 200) {
  console.error('no se pudo entrar como admin:', sesionAdmin.estado, registro.slice(-1500))
  terminar(1)
}
const conSesion = { Authorization: 'Bearer ' + sesionAdmin.cuerpo.token }

await pedir('/api/panel/operadores', {
  method: 'POST', headers: conSesion,
  body: JSON.stringify({ email: OP_CORREO, nombre: OP_NOMBRE, rol: 'admin', contrasena: OP_CLAVE }),
})

/* La clave real de veta-wallet no se puede recuperar (solo se guarda el hash),
   asi que para sembrar se rota y se usa la nueva. Mismo apaño que flujo.test.ts. */
const apps = await pedir('/api/panel/aplicaciones', { headers: conSesion })
const veta = apps.cuerpo.aplicaciones.find((a) => a.clave === 'veta-wallet')
const rotada = await pedir(`/api/panel/aplicaciones/${veta.id}/rotar`, {
  method: 'POST', headers: conSesion, body: '{}',
})
const conClave = { 'X-API-Key': rotada.cuerpo.clave_secreta }

/* Una imagen fingida, pero imagen: la ficha enseña anverso, reverso y retrato, y
   sin ellos no se mide la tira de fotos, que es media pantalla. */
const foto = 'data:image/jpeg;base64,' + 'A'.repeat(3000)

const sembrar = async (email, nombre) => {
  const alta = await pedir('/api/v1/identidades', {
    method: 'POST', headers: conClave, body: JSON.stringify({ email }),
  })
  const id = alta.cuerpo.identidad.id
  await pedir(`/api/v1/identidades/${id}/datos`, {
    method: 'POST', headers: conClave,
    body: JSON.stringify({
      nombreCompleto: nombre, fechaNacimiento: '1994-03-21', paisResidencia: 'HND',
      telefono: '+504 9876 5432',
      direccion: 'Residencial Lomas del Guijarro Sur, bloque C, casa 21, Tegucigalpa, Francisco Morazan',
      ocupacion: 'Administradora de empresas y consultora independiente',
      origenFondos: 'Salario y remesas familiares',
      propositoCuenta: 'Ahorro, remesas familiares y pago de proveedores',
      volumenEsperadoUsd: 24000, pepDeclarado: false,
    }),
  })
  await pedir(`/api/v1/identidades/${id}/documento-fotos`, {
    method: 'POST', headers: conClave, body: JSON.stringify({ anverso: foto, reverso: foto }),
  })
  return id
}

const ID_REVISADA = await sembrar(REVISADA_CORREO, REVISADA_NOMBRE)
await sembrar(OP_CORREO, OP_NOMBRE)

// ── el navegador ────────────────────────────────────────────────────────────
const nav = await chromium.launch({
  executablePath: process.env.GID_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
/* Con `hasTouch` el navegador aplica las reglas de puntero grueso, que es donde
   vive la mitad de esta clase de fallos. Sin `isMobile` a proposito: ese modo
   mete la ventana virtual de Chrome por medio y `innerWidth` deja de ser los
   360 px que se estan midiendo, y una prueba que mide otra cosa que la que dice
   medir no sirve de vara. */
const p = await nav.newPage({
  viewport: { width: ANCHO, height: 740 }, deviceScaleFactor: 3, hasTouch: true,
})

/* LA MEDIDA QUE RESUME TODO: ¿algo de esta pantalla se sale de los 360 px?
   Se pregunta al documento Y a cada elemento, porque un desbordamiento
   recortado no mueve el `scrollWidth` del documento: se lo traga en silencio,
   que es justo el caso 2 de arriba. */
const desbordes = () => p.evaluate((ancho) => {
  const nombre = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).join('.') : '')
  const fuera = []
  document.querySelectorAll('body *').forEach((el) => {
    /* Lo de dentro de un SVG no se mide: sus coordenadas son las del lienzo, no
       las de la pagina, y un `path` que «se sale» es casi siempre un adorno
       recortado a proposito por el `viewBox`. */
    if (el.closest('svg')) return
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    if (r.right <= ancho + 1 && r.left >= -1) return

    /* Desbordar no es el pecado: el pecado es desbordar SIN SALIDA. Se sube por
       los padres hasta encontrar quien manda sobre lo que sobra:
         · un contenedor que desplaza (overflow-x auto/scroll) → se llega con el
           dedo, y ese es justamente el arreglo que se le pide a una tabla;
         · cualquier otro recorte, o ninguno → lo que sobra no se alcanza. */
    let padre = el.parentElement, veredicto = 'suelto'
    while (padre && padre !== document.body) {
      const s = getComputedStyle(padre)
      if (/auto|scroll/.test(s.overflowX)) { veredicto = 'riel'; break }
      if (/hidden|clip/.test(s.overflowX)) { veredicto = 'recortado'; break }
      padre = padre.parentElement
    }
    if (veredicto === 'riel') return
    fuera.push({
      que: nombre(el).slice(0, 64), como: veredicto,
      izq: Math.round(r.left), der: Math.round(r.right),
      texto: (el.textContent || '').trim().slice(0, 34),
    })
  })
  return { documento: document.documentElement.scrollWidth, fuera: fuera.slice(0, 6) }
}, ANCHO)

const nadaSeSale = async (que) => {
  const d = await desbordes()
  decir(d.fuera.length === 0 && d.documento <= ANCHO, que,
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`)
  return d
}

// ── 1 · la puerta ───────────────────────────────────────────────────────────
console.log('\n── la puerta ─────────────────────────────────────────────────')
await p.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1200)
await nadaSeSale('nada se sale del ancho en la pantalla de entrada')

/* EL CAJON CERRADO NO EXISTE. Se comprueba antes de entrar, que es cuando mas
   claro esta que no deberia haber ninguna ficha viva. No basta con mirar la
   geometria: lo que importa es que el teclado NO se meta ahi. */
{
  const cajon = await p.evaluate(() => {
    const f = document.querySelector('#ficha')
    const b = f.querySelector('button')
    b.focus()
    return {
      abierta: f.classList.contains('abierta'),
      visibilidad: getComputedStyle(f).visibility,
      recibeFoco: document.activeElement === b,
    }
  })
  decir(!cajon.abierta && !cajon.recibeFoco,
    'el cajón de la ficha, cerrado, queda fuera del orden de tabulación',
    JSON.stringify(cajon))
}

// ── 2 · entrar como la operadora de nombre largo ────────────────────────────
console.log('\n── dentro del panel, con un nombre largo de verdad ───────────')
await p.fill('#eMail', OP_CORREO)
await p.fill('#eClave', OP_CLAVE)
await p.click('button[type=submit]')
await p.waitForTimeout(3000)

{
  const cab = await p.evaluate(() => {
    const n = document.querySelector('#qNombre')
    const salir = [...document.querySelectorAll('header .quien button')].pop()
    const c = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), der: Math.round(r.right) } }
    return { nombre: n.textContent, caja: c(n), salir: c(salir), ventana: innerWidth }
  })
  decir(cab.nombre === OP_NOMBRE, 'la cabecera enseña el nombre completo de la operadora, sin recortarlo', cab.nombre)
  /* Que SALIR siga alcanzable con el nombre largo puesto. En Ordenex el fallo
     gemelo dejo a la gente sin manera de cerrar sesion desde el telefono. */
  decir(cab.salir.der <= ANCHO + 1 && cab.salir.x >= 0,
    'y el botón de SALIR sigue dentro de la pantalla', JSON.stringify(cab.salir))

  /* EL NOMBRE NO SE PARTE PALABRA POR PALABRA. Este no es un desborde y por eso
     no lo caza ninguna medida de anchos: el nombre CABIA. Lo que pasaba es que
     le quedaba una columna de una palabra de ancho y «Mayra Carolina Enamorado
     Alvarez» caia en cuatro renglones, uno por palabra, como una tira vertical.
     La medida que lo delata no es la distancia al borde sino LOS RENGLONES, asi
     que es eso lo que se cuenta. El alto de la cabecera va detras, como aviso de
     que no vuelva a crecer, pero es el numero flojo de los dos: entre roto y
     arreglado solo iba de 167 a 154 px. */
  const alto = await p.evaluate(() => {
    const h = document.querySelector('header')
    const n = document.querySelector('#qNombre')
    const rango = document.createRange()
    rango.selectNodeContents(n)
    const renglones = new Set([...rango.getClientRects()]
      .filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top))).size
    return { cabecera: Math.round(h.getBoundingClientRect().height), renglones, ventana: innerHeight }
  })
  console.log(`           medida: cabecera ${alto.cabecera}px de ${alto.ventana}px · el nombre en ${alto.renglones} renglón(es)`)
  decir(alto.renglones <= 2, 'el nombre de la operadora no se parte palabra por palabra', JSON.stringify(alto))
  decir(alto.cabecera <= 200,
    'y la cabecera no se come media pantalla antes de empezar el trabajo', JSON.stringify(alto))
}
await nadaSeSale('nada se sale del ancho en el tablero de resumen')

// ── 3 · todas las pestañas ──────────────────────────────────────────────────
console.log('\n── una por una, las pestañas del panel ──────────────────────')
const pestanas = await p.evaluate(() =>
  [...document.querySelectorAll('#nav button[data-p]')]
    .filter((b) => !/↗/.test(b.textContent)).map((b) => b.dataset.p))

for (const pest of pestanas) {
  await p.click(`#nav button[data-p="${pest}"]`)
  await p.waitForTimeout(1500)
  await nadaSeSale(`«${pest}» entra en el ancho del teléfono`)
}

/* TODA TABLA DEL PANEL VIVE EN UN RIEL. Es la regla, no el caso: una tabla de
   seis columnas en 360 px no entra y no tiene por que, pero tiene que poder
   arrastrarse. Se comprueba sobre cada pestaña porque el fallo fue justamente
   una tabla a la que se le olvido la palabra `scroll` entre seis que si la
   tenian. */
console.log('\n── ninguna tabla queda recortada ────────────────────────────')
for (const pest of pestanas) {
  await p.click(`#nav button[data-p="${pest}"]`)
  await p.waitForTimeout(1400)
  const tablas = await p.evaluate(() => [...document.querySelectorAll('#vista table')].map((t) => {
    let padre = t.parentElement, riel = false
    while (padre && padre !== document.body) {
      if (/auto|scroll/.test(getComputedStyle(padre).overflowX)) { riel = true; break }
      padre = padre.parentElement
    }
    const r = t.getBoundingClientRect()
    return { ancho: Math.round(r.width), riel, cab: [...t.querySelectorAll('th')].map((e) => e.textContent.trim()).join('|').slice(0, 60) }
  }))
  const sinRiel = tablas.filter((t) => !t.riel && t.ancho > ANCHO)
  if (tablas.length) {
    decir(sinRiel.length === 0, `las tablas de «${pest}» se pueden arrastrar`,
      sinRiel.length ? JSON.stringify(sinRiel) : `${tablas.length} tabla(s), todas en su riel`)
  }
}

/* LA TABLA DE ROTURAS DE LA BITACORA. Solo sale cuando hay una rotura ya
   declarada, y romper la cadena de verdad para verla seria pedirle a esta
   prueba que haga de prueba de bitacora. Se le da la respuesta hecha (igual que
   Ordenex le da a su web un API fingido) y se mide LO QUE SE PINTA, que es lo
   unico que aqui se juzga. */
console.log('\n── la bitácora con una rotura ya declarada ──────────────────')
{
  let interceptada = null
  await p.route((u) => /\/api\/panel\/bitacora(\?|$)/.test(u.pathname + u.search), async (ruta) => {
    try {
      const r = await ruta.fetch()
      const j = await r.json()
      j.cadena = {
        ...j.cadena,
        sellos: [{ indice: 3, fecha: new Date().toISOString(), rotaEn: 3, entradasAntes: 12 }],
      }
      interceptada = 'ok'
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) })
    } catch (e) {
      interceptada = 'se rompió: ' + e.message
      await ruta.continue()
    }
  })
  await p.click('#nav button[data-p="bitacora"]')
  await p.waitForTimeout(1800)

  /* La `i` no es por descuido: el `h3` lleva `text-transform:uppercase` y en
     Chromium `innerText` devuelve el texto YA transformado, o sea
     «ROTURAS YA DECLARADAS». Buscando con mayusculas exactas esta comprobacion
     fallaba con la tabla delante. */
  const salioLaTabla = await p.evaluate(() => /Roturas ya declaradas/i.test(document.querySelector('#vista').innerText))
  decir(salioLaTabla, 'la tabla de «Roturas ya declaradas» se pinta', 'intercepción: ' + interceptada)

  if (salioLaTabla) {
    const t = await p.evaluate(() => {
      const h3 = [...document.querySelectorAll('#vista h3')].find((x) => /Roturas ya declaradas/i.test(x.textContent))
      const tabla = h3.parentElement.querySelector('table')
      let padre = tabla.parentElement, riel = null
      while (padre && padre !== document.body) {
        if (/auto|scroll/.test(getComputedStyle(padre).overflowX)) { riel = padre; break }
        padre = padre.parentElement
      }
      const ultima = [...tabla.querySelectorAll('th')].pop()
      const antes = Math.round(ultima.getBoundingClientRect().right)
      if (riel) riel.scrollLeft = riel.scrollWidth
      const despues = Math.round(ultima.getBoundingClientRect().right)
      return {
        anchoTabla: Math.round(tabla.getBoundingClientRect().width),
        columna: ultima.textContent.trim(), riel: !!riel, antes, despues, ventana: innerWidth,
      }
    })
    console.log(`           medida: tabla ${t.anchoTabla}px · «${t.columna}» termina en ${t.antes}px de ${t.ventana}px`)
    /* La comprobacion no es «la tabla entra en la pantalla»: tres columnas con
       `min-width:720px` no entran y no tienen por que. Es que se pueda LLEGAR a
       la ultima columna arrastrando, que es lo que el recorte impedia. */
    decir(t.riel && t.despues <= ANCHO + 1,
      'se puede LLEGAR a la última columna de la bitácora arrastrando',
      t.riel ? `desplazando el riel: ${t.antes} → ${t.despues}` : 'la tabla se recorta y ningún contenedor desplaza')
  }
  await p.unroute('**/api/panel/bitacora*')
}

// ── 4 · la ficha de una persona, que es donde se decide ─────────────────────
console.log('\n── la ficha, con las imágenes del documento ─────────────────')
await p.click('#nav button[data-p="identidades"]')
await p.waitForTimeout(1600)

{
  const fila = await p.evaluate((nom) => {
    const f = [...document.querySelectorAll('.qi-fila')]
      .find((x) => x.innerText.includes(nom))
    if (!f) return null
    const n = f.querySelector('.qi-nombre')
    const r = n.getBoundingClientRect()
    return { texto: n.textContent.trim(), der: Math.round(r.right), renglones: Math.round(r.height) }
  }, REVISADA_NOMBRE)
  decir(!!fila, 'la persona de nombre largo aparece en la cola de trabajo', JSON.stringify(fila))
  if (fila) {
    decir(fila.der <= ANCHO + 1, 'y su nombre no se sale de la fila', JSON.stringify(fila))
  }
}

await p.evaluate((id) => verIdentidad(id), ID_REVISADA)
await p.waitForTimeout(2500)

{
  const abierta = await p.evaluate(() => document.querySelector('#ficha').classList.contains('abierta'))
  decir(abierta, 'la ficha se abre')
}
await nadaSeSale('la ficha entera entra en el ancho del teléfono')

{
  /* El titulo y «Cerrar» comparten renglon. Este es EL fallo que reporto José:
     un nombre largo metiendose por debajo de unos botones. */
  const cab = await p.evaluate(() => {
    const h = document.querySelector('#fTitulo')
    const b = document.querySelector('.fichaCab button')
    const rh = h.getBoundingClientRect(), rb = b.getBoundingClientRect()
    return {
      titulo: h.textContent,
      pisan: rh.right > rb.left + 1 && rh.bottom > rb.top + 1 && rh.top < rb.bottom - 1,
      tituloDer: Math.round(rh.right), botonIzq: Math.round(rb.left), botonDer: Math.round(rb.right),
    }
  })
  decir(cab.titulo === REVISADA_NOMBRE, 'el título de la ficha es el nombre completo', cab.titulo)
  decir(!cab.pisan, 'el nombre largo NO se mete por debajo del botón «Cerrar»', JSON.stringify(cab))
  decir(cab.botonDer <= ANCHO + 1, 'y «Cerrar» sigue dentro de la pantalla', JSON.stringify(cab))

  /* Las imagenes del documento. Sin verlas no se puede firmar un cotejo, asi
     que tienen que estar Y tener tamaño: una credencial de 40 px no es una
     credencial, es un sello. */
  const fotos = await p.evaluate(() => [...document.querySelectorAll('.fotos img')].map((i) => {
    const r = i.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), der: Math.round(r.right) }
  }))
  decir(fotos.length >= 2, 'la ficha enseña las imágenes del documento', `${fotos.length} imagen(es)`)
  decir(fotos.every((f) => f.der <= ANCHO + 1), 'ninguna imagen se sale del ancho', JSON.stringify(fotos))
  decir(fotos.every((f) => f.w >= 120 && f.h >= 90),
    'y se ven con tamaño suficiente para cotejar una cara', JSON.stringify(fotos))

  /* Los botones de decision. Que esten y que se alcancen: aprobar o rechazar
     desde el telefono es el motivo entero de esta pantalla. */
  const acciones = await p.evaluate(() => [...document.querySelectorAll('.acciones button')].map((b) => {
    const r = b.getBoundingClientRect()
    return { t: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), der: Math.round(r.right), izq: Math.round(r.left) }
  }))
  const aprobar = acciones.find((a) => /^Aprobar/.test(a.t))
  const rechazar = acciones.find((a) => /^Rechazar/.test(a.t))
  decir(!!aprobar && !!rechazar, 'están los botones de aprobar y rechazar', JSON.stringify(acciones.map((a) => a.t)))
  decir(acciones.every((a) => a.der <= ANCHO + 1 && a.izq >= -1),
    'y todos los botones de decisión caben en la pantalla',
    JSON.stringify(acciones.filter((a) => a.der > ANCHO + 1 || a.izq < -1)))
  decir(acciones.every((a) => a.h >= 36),
    'con alto suficiente para el dedo', JSON.stringify(acciones.filter((a) => a.h < 36)))
}

/* Y que el cajon abierto se pueda CERRAR con el dedo. Nada de `dispatchEvent`:
   el clic sintetico atraviesa cualquier cosa que este encima, y «algo se pone
   encima del boton» es uno de los fallos que esto busca. */
{
  let toco = true, porQue = ''
  try {
    await p.locator('.fichaCab button').click({ timeout: 6000 })
  } catch (e) {
    toco = false
    porQue = /intercepts pointer events/.test(String(e?.message || ''))
      ? 'algo se pone encima del botón y se come el toque'
      : 'el toque no llegó al botón'
  }
  await p.waitForTimeout(700)
  const cerrada = await p.evaluate(() => !document.querySelector('#ficha').classList.contains('abierta'))
  decir(toco && cerrada, 'y se puede cerrar la ficha con el dedo', porQue)
}

// ── 5 · LA MESA DE COTEJO, que es donde de verdad se decide ─────────────────
console.log('\n── la mesa de cotejo, a pantalla completa ───────────────────')
await p.goto(`${base}/revision/${ID_REVISADA}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(3000)

{
  const d = await nadaSeSale('la mesa de cotejo no se corre de lado')
  const cab = await p.evaluate(() => {
    const c = document.querySelector('#hCorreo'), n = document.querySelector('#hNombre')
    const caja = (el) => { const r = el.getBoundingClientRect(); return { izq: Math.round(r.left), der: Math.round(r.right) } }
    return { correo: c.textContent, nombre: n.textContent, cajaCorreo: caja(c), cajaNombre: caja(n) }
  })
  decir(cab.correo === REVISADA_CORREO, 'el correo largo se enseña entero', cab.correo)
  decir(cab.cajaCorreo.der <= ANCHO + 1,
    'y el correo largo cabe en el ancho del teléfono en vez de arrastrar la mesa',
    `${JSON.stringify(cab.cajaCorreo)} · documento ${d.documento}px`)
  decir(cab.cajaNombre.der <= ANCHO + 1, 'el nombre largo también', JSON.stringify(cab.cajaNombre))

  /* LOS CUATRO BOTONES DE FUENTE, CADA UNO EN SU SITIO.
     Son el mando que decide QUE IMAGEN va en cada placa, asi que tocar el de al
     lado por error es cotejar la cara contra la cara. Estaban los cuatro en una
     fila dentro de una placa de 155 px: a cada uno le quedaban 34 px de caja y
     «Anverso» pide 40, asi que el texto se derramaba fuera de su propio boton y
     se leia «RetratoAnversoReverso» pegado.

     Ninguna medida de anchos lo veia, porque nada se salia de la PANTALLA: el
     derrame ocurria dentro de la fila. Por eso aqui se mide otra cosa (si el
     texto cabe en su propia caja, y si dos botones se pisan) y no la distancia
     al borde. */
  const fuentes = await p.evaluate(() => [...document.querySelectorAll('#fuentesA button')].map((b) => {
    const r = b.getBoundingClientRect()
    return {
      t: b.textContent.trim(),
      izq: Math.round(r.left), der: Math.round(r.right),
      arriba: Math.round(r.top), abajo: Math.round(r.bottom),
      rebosa: b.scrollWidth > b.clientWidth + 1,
      pide: b.scrollWidth, caja: b.clientWidth,
    }
  }))
  decir(fuentes.length >= 2, 'están los botones para elegir qué imagen va en cada placa',
    JSON.stringify(fuentes.map((f) => f.t)))
  const derraman = fuentes.filter((f) => f.rebosa)
  decir(derraman.length === 0, 'y a ninguno se le derrama el rótulo fuera de su botón',
    derraman.length ? JSON.stringify(derraman) : `${fuentes.length} rótulo(s), todos dentro de su caja`)

  // Y que no se pisen entre ellos: dos cajas que se solapan en las dos ejes.
  const pisados = []
  for (let i = 0; i < fuentes.length; i++) {
    for (let j = i + 1; j < fuentes.length; j++) {
      const a = fuentes[i], b = fuentes[j]
      if (a.der > b.izq + 1 && b.der > a.izq + 1 && a.abajo > b.arriba + 1 && b.abajo > a.arriba + 1) {
        pisados.push(`${a.t}/${b.t}`)
      }
    }
  }
  decir(pisados.length === 0, 'ni se pisan unos con otros', pisados.join(', ') || 'ninguno se solapa')

  /* Las dos placas siguen lado a lado, que es una decision del diseño escrita
     en su CSS: cotejar dos caras que no se pueden ver a la vez no es cotejar,
     es acordarse. Si alguien las apila, esto lo dice. */
  const placas = await p.evaluate(() => [...document.querySelectorAll('.comparador .placa')].map((x) => {
    const r = x.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }
  }))
  decir(placas.length === 2 && placas[0].y === placas[1].y,
    'las dos caras siguen lado a lado, que es lo que hace que cotejar sea cotejar',
    JSON.stringify(placas))

  /* Y los botones de firma, que es el acto. Al final del documento en movil, no
     pegados abajo comiendose media pantalla. */
  const botones = await p.evaluate(() => [...document.querySelectorAll('.firma .botones button')].map((b) => {
    const r = b.getBoundingClientRect()
    return { t: b.textContent.trim().slice(0, 22), h: Math.round(r.height), der: Math.round(r.right), izq: Math.round(r.left) }
  }))
  decir(botones.length > 0, 'están los botones de la firma', JSON.stringify(botones.map((b) => b.t)))
  decir(botones.every((b) => b.der <= ANCHO + 1 && b.izq >= -1),
    'y todos caben en el ancho', JSON.stringify(botones.filter((b) => b.der > ANCHO + 1 || b.izq < -1)))
}

console.log(`\n${malas === 0 ? 'todo en pie.' : malas + ' comprobación(es) fallaron'}\n`)
await nav.close()
terminar(malas === 0 ? 0 : 1)
