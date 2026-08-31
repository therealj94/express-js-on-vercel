/* La descarga del directorio: completa, ordenada y que abra en Excel.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * La exportación leía `datos[...].lista.usuarios` — la página que se está
 * viendo— y la pantalla pide `limite: 150`. Con un filtro que daba 900
 * personas, el título decía «900 personas» y el archivo traía 150. Sin un
 * aviso, sin un error, sin nada.
 *
 * Ese es el fallo que más duele de todos los posibles aquí: no falla, MIENTE.
 * Quien abría el archivo creía tener el padrón entero y decidía con él. Un
 * botón que no descarga se nota en cinco segundos; uno que descarga de menos
 * puede no notarse nunca.
 *
 * Así que la prueba central no es «baja algo»: es «baja TODO lo que el filtro
 * dice que hay», con un padrón deliberadamente más largo que una página.
 *
 * El código vive dentro de `public/analitica.html`, que no es un módulo. Se
 * saca de ahí y se evalúa: probar una copia pegada en la prueba no probaría
 * nada — sería probar la copia.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const html = readFileSync(join(raiz, 'public', 'analitica.html'), 'utf8')

/** El bloque entero de exportación, tal como está en la página. */
function bloqueExport() {
  const desde = html.indexOf('/* ── Exportar el directorio ─')
  assert.notEqual(desde, -1, 'no se encontró el bloque de exportación')
  const hasta = html.indexOf('async function refrescarSaldos', desde)
  assert.notEqual(hasta, -1, 'no se encontró el final del bloque')
  return html.slice(desde, hasta)
}

/* ── El mundo de mentira ──────────────────────────────────────────────────
 * Un navegador mínimo: lo justo para que el código corra igual que allá.
 * Anota lo que se «bajó» en vez de bajarlo.
 */
function montar({ padron, filtros = {}, decirQueSi = true, totalDeclarado = null,
                 apiRota = false }) {
  const bajados = []
  const avisos = []
  const pedidos = []

  const dirFiltros = {
    texto: '', app: 'todas', moneda: '', pais: '', conWallet: '', conGid: '',
    conSaldo: '', saldoMin: '', inactivosDias: '', registradoDias: '',
    nuncaEntro: '', orden: 'ultimoAcceso', direccion: 'desc', ...filtros,
  }
  function filtrosDir() {
    const f = {}
    for (const [k, v] of Object.entries(dirFiltros)) if (v !== '' && v !== 'todas') f[k] = v
    f.limite = 150            // el tope de la PANTALLA: el que causaba el fallo
    return f
  }

  // El servidor: pagina de verdad y respeta `desde`/`limite`, con su tope de
  // 500 como la ruta real. Un doble que devuelve siempre todo es un sitio
  // donde este fallo no puede aparecer.
  async function api(ruta) {
    if (apiRota) throw new Error('Error 503')
    const q = new URLSearchParams(ruta.split('?')[1] || '')
    pedidos.push({ desde: Number(q.get('desde') || 0), limite: Number(q.get('limite') || 100) })
    const limite = Math.min(500, Number(q.get('limite')) || 100)
    const desde = Number(q.get('desde')) || 0
    // `totalDeclarado` sirve para el caso feo: el servidor DICE que hay 900 y
    // entrega 300. Es el desajuste que dejaba el archivo corto en silencio.
    return {
      total: totalDeclarado ?? padron.length,
      usuarios: padron.slice(desde, desde + limite),
    }
  }

  const doc = {
    createElement: () => ({
      set href(v) { this._href = v },
      get href() { return this._href },
      remove() {},
      click() { bajados.push({ nombre: this.download, blob: this._blob }) },
    }),
    body: { appendChild(a) { a._blob = ultimoBlob } },
  }
  let ultimoBlob = null
  class BlobFalso {
    constructor(partes, opciones) {
      this.type = (opciones || {}).type || ''
      this.partes = partes
      ultimoBlob = this
    }
    bytes() {
      const trozos = this.partes.map((p) =>
        typeof p === 'string' ? new TextEncoder().encode(p) : new Uint8Array(p))
      const n = trozos.reduce((s, t) => s + t.length, 0)
      const todo = new Uint8Array(n)
      let i = 0
      for (const t of trozos) { todo.set(t, i); i += t.length }
      return todo
    }
    texto() { return new TextDecoder().decode(this.bytes()) }
  }

  const entorno = {
    api, filtrosDir, dirFiltros,
    document: doc, Blob: BlobFalso, TextEncoder,
    URL: { createObjectURL: () => 'blob:falso', revokeObjectURL() {} },
    alert: (m) => avisos.push(String(m)),
    confirm: (m) => { avisos.push(String(m)); return decirQueSi },
    setTimeout: () => {},
    Date, Math, Number, Object, String, Array, Set, URLSearchParams, JSON, Uint32Array, Uint8Array,
  }
  const nombres = Object.keys(entorno)
  const fn = new Function(...nombres, `${bloqueExport()}
    return { exportar, traerTodoElDirectorio, columnasDirectorio, _nombreExport,
             EXPORT_POR_PAGINA }`)
  const api2 = fn(...nombres.map((k) => entorno[k]))
  return { ...api2, bajados, avisos, pedidos }
}

/** Un padrón cualquiera, tan largo como se pida. */
const gente = (n) => Array.from({ length: n }, (_, i) => ({
  email: `p${i}@ejemplo.org`,
  nombre: i % 7 === 0 ? `Ana "Añí" ${i}` : `Persona ${i}`,
  usuario: `p${i}`,
  app: i % 2 ? 'veta' : 'mytokenpay',
  pais: i % 3 ? 'HN' : 'MX',
  direccionWallet: '0x' + String(i).padStart(40, '0'),
  gid: i % 4 ? `GID-${i}` : '',
  estadoGenesis: i % 4 ? 'verificado' : '',
  creadoEn: '2026-01-0' + ((i % 9) + 1),
  ultimoAcceso: '2026-08-0' + ((i % 9) + 1),
  saldos: { ORIGEN: i, ONDK: i % 5 },
}))

/* ── Lo que la hizo nacer ────────────────────────────────────────────────── */

test('BAJA TODO lo que el filtro dice que hay, no la página de 150', async () => {
  const m = montar({ padron: gente(900) })
  const { filas, total } = await m.traerTodoElDirectorio()
  assert.equal(total, 900)
  assert.equal(filas.length, 900,
    'el archivo sale corto: es exactamente el fallo que se está arreglando')
})

test('y pide por páginas de 500, que es lo que admite la ruta', async () => {
  const m = montar({ padron: gente(900) })
  await m.traerTodoElDirectorio()
  assert.deepEqual(m.pedidos.map((p) => p.desde), [0, 500])
  assert.ok(m.pedidos.every((p) => p.limite <= 500),
    'pidió más de lo que la ruta acepta: el servidor lo recorta y falta gente')
})

test('un padrón corto se trae de una sola vez, sin pedir de más', async () => {
  const m = montar({ padron: gente(12) })
  const { filas } = await m.traerTodoElDirectorio()
  assert.equal(filas.length, 12)
  assert.equal(m.pedidos.length, 1)
})

test('el orden que devuelve el servidor se respeta, fila por fila', async () => {
  const m = montar({ padron: gente(700) })
  const { filas } = await m.traerTodoElDirectorio()
  filas.forEach((u, i) => assert.equal(u.email, `p${i}@ejemplo.org`,
    `la fila ${i} no es la que estaba en pantalla: paginar rompió el orden`))
})

const botonFalso = (t = 'Bajar a Excel') =>
  ({ textContent: t, parentElement: { querySelectorAll: () => [] } })

test('si faltan filas PREGUNTA, y si se dice que no, NO baja nada', async () => {
  // El servidor dice 900 y entrega 300: el archivo saldría corto sin que
  // nadie lo note. Es la razón de ser de todo esto.
  const m = montar({ padron: gente(300), totalDeclarado: 900, decirQueSi: false })
  await m.exportar(botonFalso(), 'xlsx')
  assert.equal(m.bajados.length, 0, 'bajó un archivo incompleto sin permiso')
  const aviso = m.avisos.join(' ')
  assert.ok(aviso.includes('900') && aviso.includes('300'),
    `el aviso no dice cuántas faltan: ${aviso}`)
  assert.ok(aviso.includes('INCOMPLETO'), aviso)
})

test('y si se dice que sí, baja — pero después de haber avisado', async () => {
  const m = montar({ padron: gente(300), totalDeclarado: 900, decirQueSi: true })
  await m.exportar(botonFalso(), 'xlsx')
  assert.equal(m.bajados.length, 1)
  assert.ok(m.avisos.some((a) => a.includes('INCOMPLETO')),
    'bajó el archivo corto sin decir una palabra')
})

/* ── El archivo ──────────────────────────────────────────────────────────── */

test('las columnas llevan el saldo total, y va como NÚMERO', async () => {
  const m = montar({ padron: gente(3) })
  const cols = m.columnasDirectorio(gente(3))
  const titulos = cols.map(([t]) => t)
  assert.deepEqual(titulos.slice(0, 10), ['Correo', 'Nombre', 'App', 'País',
    'Billetera', 'Genesis ID', 'Estado Genesis', 'Alta', 'Última conexión',
    'Saldo total'])
  assert.deepEqual(titulos.slice(10), ['ONDK', 'ORIGEN'], 'las monedas van al final y ordenadas')
  const saca = Object.fromEntries(cols)
  assert.equal(typeof saca['Saldo total']({ saldos: { ORIGEN: 2, ONDK: 3 } }), 'number')
  assert.equal(saca['Saldo total']({ saldos: { ORIGEN: 2, ONDK: 3 } }), 5)
  assert.equal(saca['Saldo total']({}), 0, 'sin saldos tiene que dar cero, no NaN')
})

test('el nombre del archivo dice qué filtro se usó', () => {
  const m = montar({ padron: gente(1), filtros: { pais: 'HN', conGid: '1' } })
  const nombre = m._nombreExport('xlsx')
  assert.ok(nombre.includes('pais-HN'), nombre)
  assert.ok(nombre.includes('conGid-1'), nombre)
  assert.ok(nombre.endsWith('.xlsx'), nombre)
  const limpio = montar({ padron: gente(1) })._nombreExport('csv')
  assert.ok(/^directorio-\d{4}-\d{2}-\d{2}\.csv$/.test(limpio), limpio)
})

test('el CSV trae UNA línea por persona, más la cabecera', async () => {
  const m = montar({ padron: gente(900) })
  const boton = { textContent: 'CSV', parentElement: { querySelectorAll: () => [] } }
  await m.exportar(boton, 'csv')
  assert.equal(m.bajados.length, 1)
  // El BOM se mira en los BYTES: `TextDecoder` se lo come al decodificar, así
  // que comprobarlo sobre el texto daría rojo con el archivo perfecto.
  assert.deepEqual([...m.bajados[0].blob.bytes().slice(0, 3)], [0xEF, 0xBB, 0xBF],
    'sin BOM, Excel rompe los acentos')
  const texto = m.bajados[0].blob.texto()
  assert.equal(texto.trim().split('\r\n').length, 901)
  assert.ok(texto.includes('"Ana ""Añí"" 0"'), 'las comillas de un nombre no se escaparon')
})

test('el .xlsx es un ZIP de verdad, con las 900 filas y los saldos como números', async () => {
  const m = montar({ padron: gente(900) })
  const boton = { textContent: 'Bajar a Excel', parentElement: { querySelectorAll: () => [] } }
  await m.exportar(boton, 'xlsx')
  assert.equal(m.bajados.length, 1)
  assert.ok(m.bajados[0].nombre.endsWith('.xlsx'))

  const bytes = m.bajados[0].blob.bytes()
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'no empieza como un ZIP')

  // Se abre con una herramienta de VERDAD, no releyendo nuestro propio ZIP:
  // un archivo que solo abre quien lo escribió no sirve de nada.
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'))
  const ruta = join(dir, 'd.xlsx')
  writeFileSync(ruta, bytes)
  const salida = execFileSync('python3', ['-c', `
import zipfile, re, sys
z = zipfile.ZipFile(${JSON.stringify(ruta)})
assert z.testzip() is None, 'el ZIP esta corrupto'
nombres = set(z.namelist())
faltan = {'[Content_Types].xml','_rels/.rels','xl/workbook.xml',
          'xl/worksheets/sheet1.xml','xl/styles.xml'} - nombres
assert not faltan, f'le faltan partes: {faltan}'
hoja = z.read('xl/worksheets/sheet1.xml').decode('utf8')
import xml.dom.minidom; xml.dom.minidom.parseString(hoja)   # XML bien formado
filas = re.findall(r'<row r="(\\d+)"', hoja)
print('filas', len(filas))
print('ultima', filas[-1])
print('autofilter', 'si' if '<autoFilter' in hoja else 'no')
print('congelada', 'si' if 'state="frozen"' in hoja else 'no')
print('numericas', len(re.findall(r'<c r="[A-Z]+\\d+"><v>', hoja)))
`], { encoding: 'utf8' })
  const leer = (k) => salida.split('\n').find((l) => l.startsWith(k + ' ')).split(' ')[1]
  assert.equal(leer('filas'), '901', 'no están las 900 personas más la cabecera')
  assert.equal(leer('ultima'), '901')
  assert.equal(leer('autofilter'), 'si', 'sin el filtro de Excel puesto')
  assert.equal(leer('congelada'), 'si', 'la cabecera no queda fija al bajar')
  assert.ok(Number(leer('numericas')) >= 900 * 3,
    'los saldos entraron como texto: en Excel no se suman ni se ordenan')
})

test('un carácter de control no rompe el archivo entero', async () => {
  // Excel rechaza el .xlsx COMPLETO si aparece uno. Llegan pegados desde otro
  // sistema y no se ven: un solo nombre sucio dejaría la descarga inservible
  // para todos, y el motivo sería invisible.
  const sucio = gente(1)
  sucio[0].nombre = 'Ana' + String.fromCharCode(1) + 'Bel'
  const m = montar({ padron: sucio })
  await m.exportar(botonFalso(), 'xlsx')
  assert.equal(m.bajados.length, 1)
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'))
  const ruta = join(dir, 'd.xlsx')
  writeFileSync(ruta, m.bajados[0].blob.bytes())
  execFileSync('python3', ['-c', `
import zipfile, xml.dom.minidom
z = zipfile.ZipFile(${JSON.stringify(ruta)})
xml.dom.minidom.parseString(z.read('xl/worksheets/sheet1.xml'))
`])
})

test('sin nadie que exportar lo dice y no baja un archivo vacío', async () => {
  const m = montar({ padron: [] })
  await m.exportar(botonFalso(), 'xlsx')
  assert.equal(m.bajados.length, 0)
  assert.ok(m.avisos.some((a) => a.includes('No hay nada que exportar')), m.avisos.join(' | '))
})

test('si el servidor se cae: se dice, no se baja nada, y el botón vuelve', async () => {
  const m = montar({ padron: gente(10), apiRota: true })
  const boton = botonFalso()
  await m.exportar(boton, 'xlsx')
  assert.equal(m.bajados.length, 0, 'bajó algo con el servidor caído')
  assert.ok(m.avisos.some((a) => a.includes('No se pudo armar la descarga')),
    m.avisos.join(' | '))
  assert.equal(boton.textContent, 'Bajar a Excel',
    'el botón se quedó en «Juntando…» para siempre')
})

/* ── Y que lo abra un programa de Excel de verdad ─────────────────────────
 *
 * Todo lo de arriba lee nuestro propio ZIP con nuestras propias reglas. Un
 * archivo que solo entiende quien lo escribió no sirve para nada: la única
 * comprobación que cuenta es que lo abra algo que no escribimos nosotros.
 *
 * Se salta si `openpyxl` no está en la máquina — una prueba que no se puede
 * correr no puede bloquear a nadie, pero cuando está, avisa de verdad. Los
 * avisos van como ERROR a propósito: «Workbook contains no default style» es
 * un archivo que Excel abre con reparos, y con reparos es medio abierto.
 */
test('un lector de Excel de verdad lo abre, sin un solo aviso', async (t) => {
  try {
    execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' })
  } catch {
    return t.skip('openpyxl no está en esta máquina')
  }
  const m = montar({ padron: gente(620), filtros: { pais: 'HN' } })
  await m.exportar(botonFalso(), 'xlsx')
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'))
  const ruta = join(dir, 'd.xlsx')
  writeFileSync(ruta, m.bajados[0].blob.bytes())
  const salida = execFileSync('python3', ['-W', 'error::UserWarning', '-c', `
import openpyxl
h = openpyxl.load_workbook(${JSON.stringify(ruta)}).active
print('hoja', h.title)
print('filas', h.max_row)
print('negrita', h['A1'].font.bold)
print('congelada', h.freeze_panes)
print('filtro', h.auto_filter.ref)
print('acentos', h['B2'].value)
# La prueba que de verdad importa para quien lo usa: sumar la columna.
col = [c.value for c in h['J'][1:]]
print('sumable', all(isinstance(x, (int, float)) for x in col))
print('suma', sum(col))
`], { encoding: 'utf8' })
  const leer = (k) => salida.split('\n').find((l) => l.startsWith(k + ' ')).slice(k.length + 1)
  assert.equal(leer('hoja'), 'Directorio')
  assert.equal(leer('filas'), '621', 'no están las 620 personas más la cabecera')
  assert.equal(leer('negrita'), 'True')
  assert.equal(leer('congelada'), 'A2', 'la cabecera no queda fija')
  assert.equal(leer('filtro'), 'A1:L621')
  assert.equal(leer('acentos'), 'Ana "Añí" 0', 'los acentos o las comillas se rompieron')
  assert.equal(leer('sumable'), 'True',
    'los saldos entraron como texto: en Excel no se suman ni se ordenan')
})
