// Rutas del panel de cumplimiento. Todas exigen sesión de operador y el
// permiso que corresponda al rol.

import { Router } from 'express'
import { exigeOperador, exigePermiso } from '../middleware/proteger.js'
import { store } from '../store.js'
import * as ids from '../motor/identidades.js'
import * as biz from '../motor/negocios.js'
import * as casos from '../aml/casos.js'
import {
  cargarListas, estadoListas, buscar as buscarEnListas,
  importarDeOfac, importarTexto, cargarDesdeMongo,
} from '../aml/listas.js'
import { estadoTemporizador, unaVuelta } from '../aml/temporizador.js'
import { consultar, verificarCadena, anclaje, registrar, sellar } from '../audit/bitacora.js'
import { verEnganche, ponerEnganche, quitarEnganche, probarEnganche, EVENTOS }
  from '../enganches/enganches.js'
import { resumenMovimientos, buscarMovimientos } from '../aml/almacenMovimientos.js'
import { crearOperador, PERMISOS, quitarSegundoFactor, saludSegundoFactor } from '../auth/operadores.js'
import { entregarExpediente } from '../motor/expediente.js'
import * as vieja from '../motor/cadenaVieja.js'
import { recorrido } from '../motor/demo.js'
import { crearAplicacion, revocar, rotar, ALCANCES } from '../auth/aplicaciones.js'
import { biometriaConfigurada, proveedorBiometria } from '../kyc/biometria.js'
import { leerFotos } from '../kyc/fotosDocumento.js'
import { leerFoto as leerRetrato } from '../kyc/fotoCredencial.js'
import { estadoGafi, aplicarGafi, guardarGafiEnMongo, fechaListasGafi, diasDesdeActualizacion, nombrePais } from '../aml/paises.js'
import { DOCUMENTOS_EXIGIDOS, UMBRAL_UBO } from '../motor/negocios.js'
import type { Rol } from '../types.js'

export const panelRouter = Router()

panelRouter.use(exigeOperador)

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/resumen', async (_req, res) => {
  const d = store.todo()
  // Los movimientos salieron del documento de estado: el recuento y el volumen
  // los cuenta la base, no un `reduce` sobre un array que ya no está.
  const mov = await resumenMovimientos()
  const porEstado = (estado: string) => d.identidades.filter((i) => i.estado === estado).length

  res.json({
    identidades: {
      total: d.identidades.length,
      verificadas: porEstado('verificada'),
      enRevision: porEstado('en-revision') + porEstado('biometria') + porEstado('documento'),
      rechazadas: porEstado('rechazada'),
      suspendidas: porEstado('suspendida'),
      sinTerminar: porEstado('iniciada') + porEstado('datos'),
      riesgoAlto: d.identidades.filter((i) => i.riesgo?.nivel === 'alto' || i.riesgo?.nivel === 'inaceptable').length,
      /* ── LAS QUE ORDENSCAN NO PUEDE VER ─────────────────────────────────
       *
       * El explorador pregunta por DIRECCION: «¿hay identidad verificada
       * detras de esta?». Genesis la busca en los vinculos de cada identidad,
       * asi que una identidad verificada cuyo vinculo no trae direccion es
       * invisible desde ordenscan — para siempre, y sin que nada lo diga.
       *
       * Pasa con las que se ataron antes de que existiera ese campo. La
       * conexion funciona (comprobado: ordenscan contesta `consultado: true`),
       * pero sobre una identidad sin direccion contesta «no verificada», que
       * se lee como si estuviera desconectado.
       *
       * Se cuenta aqui para que se vea en vez de sospecharse. Si este numero
       * es cero, ordenscan y Genesis ID dicen exactamente lo mismo.
       */
      verificadasSinDireccion: d.identidades.filter(
        (i) => i.estado === 'verificada'
          && !i.vinculos.some((v) => (v.direccion || '').trim())).length,
      pep: d.identidades.filter((i) => i.pep).length,
    },
    negocios: {
      total: d.negocios.length,
      verificados: d.negocios.filter((n) => n.estado === 'verificado').length,
      enRevision: d.negocios.filter((n) => n.estado === 'documentos' || n.estado === 'en-revision').length,
      rechazados: d.negocios.filter((n) => n.estado === 'rechazado').length,
    },
    casos: casos.resumenCasos(),
    movimientos: mov,
    // Este bloque es el que dice si el sistema está en condiciones de operar.
    salud: {
      almacen: store.estado(),
      listas: estadoListas(),
      biometria: biometriaConfigurada() ? proveedorBiometria() : 'sin proveedor',
      listasGafi: estadoGafi(),
      bitacora: verificarCadena(),
      apps: d.aplicaciones.filter((a) => a.activa).length,
      sso: Boolean(process.env.GENESIS_SSO_SECRETO),
    },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Identidades
// ─────────────────────────────────────────────────────────────────────────────

/* ── LA LISTA CORTABA EN 300 Y NO LO DECIA ──────────────────────────────────
 *
 * Habia un `.slice(0, 300)` sin aviso, y encima `total` informaba la longitud
 * de la lista YA CORTADA. O sea que con mas de 300 identidades:
 *
 *   · el tablero contaba las de verdad (`d.identidades.length`)
 *   · la lista enseñaba 300 y decia «300»
 *   · y nada explicaba la diferencia entre los dos numeros
 *
 * Peor todavia: se ordena por ultima modificacion, asi que CUALES 300 se ven
 * cambia solo. Una identidad que estaba ayer desaparece hoy sin que nadie la
 * haya tocado — basta con que otras 300 se hayan movido. Eso es exactamente
 * «estan todas pero a veces no aparece».
 *
 * Ahora `total` son las que CUADRAN con el filtro, y la pagina se pide con
 * `desde`. El panel enseña «N de M» y un boton para traer mas, asi que la
 * diferencia deja de ser invisible.
 */
const POR_PAGINA = 300

/* ── EL RECORRIDO DE DEMOSTRACION ───────────────────────────────────────────
 *
 * Enseñar el producto obligaba a abrir el expediente de una persona real
 * delante de quien mira —o sea, enseñar su documento y su cara sin que haya
 * dado permiso para eso— o a describirlo con palabras, que no convence a nadie.
 *
 * Esta ruta es la tercera opción: el camino entero con una persona que no
 * existe. No escribe nada, no cuenta para la analítica y no entra en la
 * bitácora — una demo que crea registros de mentira ensucia las cifras de
 * cumplimiento, y unas cifras con basura dentro no valen para lo único que
 * valen, que es responderle a un auditor.
 *
 * Va detrás de `identidad.ver`: no hay ningún dato real que proteger, pero el
 * panel entero está detrás de una sesión y hacer una excepción para esta ruta
 * sería una puerta más que vigilar sin ganar nada.
 */
panelRouter.get('/demo', exigePermiso('identidad.ver'), (_req, res) => {
  res.json(recorrido())
})

/* ── EL RESPALDO DE LA CADENA 8532 ──────────────────────────────────────────
 *
 * La cadena vieja se cerró el 10-ago y su nodo ya no contesta. Lo único que
 * queda es el volcado del corte — el MISMO que decidió qué saldo se llevó cada
 * quien a la 5550. Estaba en un bucket de S3 y en ningún sitio más.
 *
 * Va detrás de `identidad.ver` y no de un permiso nuevo: son direcciones y
 * saldos de una cadena pública, el mismo tipo de dato que ya ve cualquiera en
 * un explorador. Inventar un permiso para esto solo añadiría una cosa más que
 * configurar mal.
 */
panelRouter.get('/cadena-8532', exigePermiso('identidad.ver'), (req, res) => {
  const q = req.query as Record<string, string>
  res.json({
    cadena: vieja.respaldo().cadena,
    resumen: vieja.respaldo().resumen,
    ...vieja.buscar({
      texto: q.texto, tipo: q.tipo, minimo: q.minimo,
      soloConSaldo: q.conSaldo === '1',
      soloQueMovieron: q.movieron === '1',
      orden: (q.orden as any) || 'saldo',
      desde: Number(q.desde) || 0,
      limite: Number(q.limite) || 100,
    }),
  })
})

/** Qué tenía UNA dirección en la cadena vieja. Es la pregunta que llega cuando
    alguien reclama, y hasta hoy se contestaba abriendo un fichero de 5 MB. */
panelRouter.get('/cadena-8532/:direccion', exigePermiso('identidad.ver'), (req, res) => {
  const c = vieja.porDireccion(req.params.direccion)
  if (!c) return res.status(404).json({ error: 'Esa dirección no estaba en el corte de la 8532' })
  res.json({ cuenta: c, cadena: vieja.respaldo().cadena })
})

panelRouter.get('/identidades', exigePermiso('identidad.ver'), (req, res) => {
  const { estado, riesgo, texto } = req.query as Record<string, string>
  const t = (texto || '').toLowerCase()
  const desde = Math.max(0, Number(req.query.desde) || 0)
  const cuantas = Math.min(POR_PAGINA, Math.max(1, Number(req.query.limite) || POR_PAGINA))
  const cuadran = store.todo().identidades
    .filter((i) =>
      (!estado || i.estado === estado) &&
      (!riesgo || i.riesgo?.nivel === riesgo) &&
      (!t || i.email.includes(t) || (i.nombreLegal || '').toLowerCase().includes(t) ||
        (i.nombreDeclarado || '').toLowerCase().includes(t) || (i.gid || '').toLowerCase().includes(t)))
    .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn))

  const lista = cuadran
    .slice(desde, desde + cuantas)
    .map((i) => ({
      id: i.id, email: i.email, gid: i.gid, estado: i.estado,
      nombre: i.nombreLegal ?? i.nombreDeclarado,
      nacionalidad: i.nacionalidad,
      riesgo: i.riesgo?.nivel ?? null,
      puntuacion: i.riesgo?.puntuacion ?? null,
      bloqueos: i.riesgo?.bloqueos.length ?? 0,
      coincidencias: i.tamiz?.coincidencias.length ?? 0,
      pep: i.pep,
      apps: i.vinculos.map((v) => v.app),
      actualizadaEn: i.actualizadaEn,
    }))
  /* `total` son las que CUADRAN, no las que caben en esta pagina. Devolver lo
     segundo era mentir con un numero, que es la peor forma de mentir: nadie lo
     comprueba. `hayMas` va aparte para que el panel no tenga que hacer cuentas. */
  res.json({
    identidades: lista,
    total: cuadran.length,
    desde,
    hayMas: desde + lista.length < cuadran.length,
  })
})

/** Ficha completa. Es la vista donde el operador decide, así que va todo. */
panelRouter.get('/identidades/:id', exigePermiso('identidad.ver'), async (req, res) => {
  const i = ids.porId(req.params.id)
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  ids.recalcularRiesgo(i)

  // Las fotos del documento pendiente ya no viven dentro del expediente —son
  // megabytes que reventaban el documento de estado— sino en su propio almacén.
  // Aquí se vuelven a juntar, porque esta es justamente la pantalla donde un
  // operador tiene que verlas para decidir.
  //
  // Se devuelve una COPIA: escribirlas de vuelta en el objeto de memoria las
  // metería otra vez en el estado en el siguiente guardado, que es exactamente
  // el fallo que se está arreglando.
  const imagenes = await leerFotos(i.id).catch(() => null)
  /* CADA VEZ QUE ALGUIEN MIRA UN DOCUMENTO, QUEDA ESCRITO QUIÉN FUE.
     Conservar las imágenes cinco años solo se sostiene si se puede decir quién
     las abrió y cuándo; un archivo de cédulas al que se entra sin dejar rastro
     no es un archivo de cumplimiento, es un problema esperando. Se registra la
     lectura, nunca la imagen: la bitácora se exporta a auditores. */
  if (imagenes) {
    // Se anota QUÉ se abrió, no solo que se abrió. Si un día hay que explicar
    // una aprobación, importa si el operador tenía el rostro delante o no.
    registrar(req.operador!.email, 'identidad.documentoVisto', i.id, {
      estado: i.estado,
      caras: ['anverso', 'reverso', ...(imagenes.rostro ? ['rostro'] : [])],
      conRostro: Boolean(imagenes.rostro),
    })
  }
  // El retrato de la credencial vive en OTRO almacen aparte, por la misma razon
  // y con el mismo cuidado: se adosa a la copia, nunca al objeto de memoria.
  const fotoCredencial = await leerRetrato(i.id).catch(() => null)
  /* Los países viajan como ISO-3 y el panel los pintaba tal cual: «HN», «HND».
     Un operador que revisa a mano no tiene por qué traducir códigos, y con
     doscientos y pico países no hay quien se los sepa. El nombre se resuelve
     AQUÍ, con la misma tabla que ya usa el tamizado del GAFI: una sola tabla en
     la casa, y no una copia en el navegador que se quede vieja.

     Se manda el nombre Y el código: el código es el dato del expediente y hay
     que poder verlo, el nombre es para leerlo. */
  const conPais = (c?: string | null) =>
    c ? { codigo: String(c).toUpperCase(), nombre: nombrePais(String(c)) } : null
  const copia = {
    ...i,
    fotoCredencial,
    paisResidenciaNombre: conPais(i.paisResidencia),
    nacionalidadNombre: conPais(i.nacionalidad),
  }
  /* Las imágenes viajan SIEMPRE que existan, haya documento o no.
     Antes se colgaban de `documento`, así que un expediente al que todavía no
     se le había adjuntado el documento llegaba al panel sin ninguna imagen —
     incluido el rostro, que sí existía. El operador veía «no hay ninguna imagen
     guardada» sobre un expediente que sí tenía cara. */
  const salida: any = { ...copia }
  if (imagenes) {
    if (salida.documento) salida.documento = { ...salida.documento, imagenes }
    salida.rostroCotejo = imagenes.rostro ?? null
  }
  res.json({ identidad: salida })
})

/* Los cotejos que el operador declara haber hecho, tal como los pide la mesa
   de cotejo. La lista vive aquí y no en el navegador para que la bitácora no
   dependa de lo que una página quiera mandar: lo que llegue fuera de estas
   claves se descarta.

   `sin-imagen` es lo que se firma cuando el expediente no tiene NINGUNA imagen:
   ahí no se puede declarar haber comparado un rostro, y lo honesto —y lo que
   hay que poder leer después en la bitácora— es que se aprobó sin haberlo
   visto. */
const COTEJOS_DECLARABLES = new Set(['caras', 'datos', 'riesgo', 'sin-imagen'])

panelRouter.post('/identidades/:id/aprobar', exigePermiso('identidad.aprobar'), async (req, res) => {
  const { motivo, anulacion, revisado } = req.body ?? {}
  const r = await ids.aprobar(req.params.id, req.operador!, String(motivo || ''), anulacion ? String(anulacion) : undefined)
  if (!r.ok) return res.status(400).json({ error: r.motivo, bloqueos: r.bloqueos })
  /* QUÉ MIRÓ ANTES DE FIRMAR.
     La pantalla de revisión no habilita «Aprobar» hasta que el operador marca
     que comparó las caras, cotejó los datos contra la imagen y leyó los
     hallazgos. Esa declaración solo vale si queda escrita: si no, la casilla es
     un trámite que nadie puede auditar después. Se anota aparte de la
     aprobación —no dentro— para que el expediente diga «aprobó» y la bitácora
     diga además «y esto dijo haber mirado».
     Que llegue vacío es normal y no bloquea nada: por la API se aprueba sin
     pasar por esa pantalla. */
  const declarados = Array.isArray(revisado)
    ? revisado.map(String).filter((c) => COTEJOS_DECLARABLES.has(c))
    : []
  if (declarados.length) {
    registrar(req.operador!.email, 'identidad.cotejosDeclarados', req.params.id, {
      cotejos: declarados,
      completo: declarados.length === COTEJOS_DECLARABLES.size,
    })
  }
  res.json({ ok: true, gid: r.identidad!.gid, identidad: r.identidad })
})

panelRouter.post('/identidades/:id/rechazar', exigePermiso('identidad.rechazar'), async (req, res) => {
  const r = await ids.rechazar(req.params.id, req.operador!, String(req.body?.motivo || ''))
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, identidad: r.identidad })
})

panelRouter.post('/identidades/:id/suspender', exigePermiso('identidad.suspender'), async (req, res) => {
  const r = await ids.suspender(req.params.id, req.operador!, String(req.body?.motivo || 'Sin motivo'))
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, identidad: r.identidad })
})

panelRouter.post('/identidades/:id/revision', exigePermiso('identidad.revisar'), (req, res) => {
  const i = ids.enviarARevision(req.params.id, req.operador!.email, String(req.body?.motivo || ''))
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ ok: true, identidad: i })
})

/** Cotejo del rostro hecho por una persona, mientras no haya proveedor. */
panelRouter.post('/identidades/:id/biometria', exigePermiso('identidad.revisar'), (req, res) => {
  const { coincide, nota } = req.body ?? {}
  if (typeof coincide !== 'boolean') {
    return res.status(400).json({ error: 'Hace falta indicar si el rostro coincide (true/false)' })
  }
  const i = ids.resolverBiometriaManual(req.params.id, req.operador!, coincide, nota)
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ ok: true, identidad: i })
})

/**
 * Reinicia una verificación para que la persona la rehaga.
 *
 * No borra el expediente —en cumplimiento no se borra— sino que limpia lo que
 * hay que volver a aportar. Exige el permiso de revisar y un motivo escrito.
 */
panelRouter.post('/identidades/:id/reiniciar', exigePermiso('identidad.revisar'), async (req, res) => {
  const motivo = String(req.body?.motivo || '').trim()
  if (motivo.length < 8) {
    return res.status(400).json({ error: 'Hace falta un motivo escrito para reiniciar una verificación' })
  }
  const i = await ids.reiniciar(req.params.id, req.operador!, motivo)
  if (!i) {
    return res.status(400).json({
      error: 'No se encontró la identidad, o ya está verificada (habría que suspenderla primero)',
    })
  }
  res.json({ ok: true, identidad: i })
})

panelRouter.post('/identidades/:id/pep', exigePermiso('identidad.revisar'), (req, res) => {
  const { pep, nota } = req.body ?? {}
  const i = ids.marcarPep(req.params.id, req.operador!, Boolean(pep), String(nota || ''))
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ ok: true, identidad: i })
})

// ─────────────────────────────────────────────────────────────────────────────
// Negocios
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/negocios', exigePermiso('negocio.ver'), (req, res) => {
  const { estado } = req.query as Record<string, string>
  const lista = store.todo().negocios
    .filter((n) => !estado || n.estado === estado)
    .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
    .map((n) => ({
      id: n.id, gid: n.gid, razonSocial: n.razonSocial, nombreComercial: n.nombreComercial,
      pais: n.pais, estado: n.estado, categoria: n.categoria,
      riesgo: n.riesgo?.nivel ?? null,
      bloqueos: n.riesgo?.bloqueos.length ?? 0,
      beneficiarios: n.beneficiarios.length,
      documentosPendientes: n.documentos.filter((d) => !d.recibidoEn).length,
      actualizadoEn: n.actualizadoEn,
    }))
  res.json({ negocios: lista, umbralUbo: UMBRAL_UBO, documentosExigidos: DOCUMENTOS_EXIGIDOS })
})

panelRouter.get('/negocios/:id', exigePermiso('negocio.ver'), (req, res) => {
  const n = biz.porId(req.params.id)
  if (!n) return res.status(404).json({ error: 'Negocio no encontrado' })
  biz.recalcular(n)
  res.json({ negocio: n })
})

panelRouter.post('/negocios/:id/documento', exigePermiso('negocio.revisar'), (req, res) => {
  const { clave, referencia } = req.body ?? {}
  const n = biz.recibirDocumento(req.params.id, String(clave || ''), String(referencia || ''), req.operador!.email)
  if (!n) return res.status(404).json({ error: 'Negocio o documento no encontrado' })
  res.json({ ok: true, negocio: n })
})

panelRouter.post('/negocios/:id/aprobar', exigePermiso('negocio.aprobar'), async (req, res) => {
  const { motivo, anulacion } = req.body ?? {}
  const r = await biz.aprobarNegocio(req.params.id, req.operador!, String(motivo || ''), anulacion ? String(anulacion) : undefined)
  if (!r.ok) return res.status(400).json({ error: r.motivo, bloqueos: r.bloqueos })
  res.json({ ok: true, gid: r.negocio!.gid, negocio: r.negocio })
})

panelRouter.post('/negocios/:id/rechazar', exigePermiso('negocio.rechazar'), async (req, res) => {
  const r = await biz.rechazarNegocio(req.params.id, req.operador!, String(req.body?.motivo || ''))
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, negocio: r.negocio })
})

// ─────────────────────────────────────────────────────────────────────────────
// Movimientos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todo lo que se ha movido en el ecosistema, y de quién.
 *
 * POR QUE ESTA AQUI Y NO EN ANALITICA
 *
 * La analítica no identifica a nadie a propósito: cuenta por huella anónima
 * porque la abre mucha más gente que este panel y no tiene por qué ver a nadie
 * en particular. Esta pantalla es lo contrario — responde «quién movió qué» con
 * nombre y GID delante—, así que vive del lado de cumplimiento, exige permiso
 * de casos y cada consulta queda escrita en la bitácora. Mezclarlas habría
 * convertido el tablero de métricas en un listado de operaciones con nombre.
 *
 * El nombre de la persona se resuelve AQUI, cruzando el GID con el padrón: en
 * la colección de movimientos no se guarda ni un dato personal, solo el GID.
 * Así el histórico de operaciones no envejece cuando alguien cambia de nombre,
 * y borrar una identidad no deja huérfano el rastro contable.
 */
panelRouter.get('/movimientos', exigePermiso('caso.ver'), async (req, res) => {
  const q = req.query as Record<string, string>
  const txt = (v: unknown, max = 80) => {
    const s = String(v ?? '').trim()
    return s ? s.slice(0, max) : undefined
  }
  const pagina = await buscarMovimientos({
    gid: txt(q.gid, 32),
    app: txt(q.app, 40),
    direccion: q.direccion === 'entrada' || q.direccion === 'salida' ? q.direccion : undefined,
    activo: txt(q.activo, 16),
    desde: txt(q.desde, 10),
    hasta: txt(q.hasta, 10),
    montoMin: q.montoMin ? Number(q.montoMin) : undefined,
    texto: txt(q.texto),
    limite: Number(q.limite) || 100,
    saltar: Number(q.saltar) || 0,
  })

  // El GID se cruza con el padrón una sola vez por persona, no una por
  // movimiento: una página de 100 operaciones suele ser de dos o tres personas.
  const dueños = new Map<string, { nombre: string | null; email: string; id: string; estado: string }>()
  for (const m of pagina.movimientos) {
    if (!m.gid || dueños.has(m.gid)) continue
    const i = store.todo().identidades.find((x) => x.gid === m.gid)
    if (i) dueños.set(m.gid, {
      id: i.id, email: i.email, estado: i.estado,
      nombre: i.nombreLegal ?? i.nombreDeclarado ?? null,
    })
  }

  registrar(req.operador!.email, 'movimientos.consultados', q.gid || 'todos', {
    total: pagina.total, filtros: Object.keys(q).filter((k) => q[k]).join(','),
  })

  res.json({
    ...pagina,
    movimientos: pagina.movimientos.map((m) => ({ ...m, persona: dueños.get(m.gid) ?? null })),
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Casos
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/casos', exigePermiso('caso.ver'), (req, res) => {
  const { estado, gravedad } = req.query as Record<string, string>
  res.json({ casos: casos.listarCasos({ estado: estado as any, gravedad }) })
})

panelRouter.get('/casos/:id', exigePermiso('caso.ver'), (req, res) => {
  const c = casos.porIdCaso(req.params.id)
  if (!c) return res.status(404).json({ error: 'Caso no encontrado' })
  res.json({ caso: c })
})

panelRouter.post('/casos/:id/asignar', exigePermiso('caso.gestionar'), (req, res) => {
  const c = casos.asignar(req.params.id, req.operador!, String(req.body?.a || req.operador!.email))
  if (!c) return res.status(404).json({ error: 'Caso no encontrado' })
  res.json({ ok: true, caso: c })
})

panelRouter.post('/casos/:id/nota', exigePermiso('caso.gestionar'), (req, res) => {
  const c = casos.anotar(req.params.id, req.operador!, String(req.body?.texto || ''))
  if (!c) return res.status(400).json({ error: 'Caso no encontrado o nota vacía' })
  res.json({ ok: true, caso: c })
})

panelRouter.post('/casos/:id/cerrar', exigePermiso('caso.reportar'), async (req, res) => {
  const { conReporte, conclusion, referencia } = req.body ?? {}
  const r = await casos.cerrar(req.params.id, req.operador!, Boolean(conReporte), String(conclusion || ''), referencia)
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, caso: r.caso })
})

panelRouter.get('/casos/:id/reporte', exigePermiso('caso.reportar'), async (req, res) => {
  const borrador = await casos.borradorReporte(req.params.id)
  if (!borrador) return res.status(404).json({ error: 'Caso no encontrado' })
  registrar(req.operador!.email, 'caso.reporteGenerado', req.params.id, {})
  res.json(borrador)
})

// ─────────────────────────────────────────────────────────────────────────────
// Listas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El expediente completo de una persona, para el derecho de acceso.
 *
 * Pide `identidad.ver` porque es exactamente eso: ver. Lo que la distingue de
 * abrir la ficha en el panel es que reune TODO —expediente, negocios, casos,
 * movimientos, cuentas en cada aplicacion y bitacora— en una sola entrega, y
 * que deja escrito en la bitacora quien la saco, de quien y por que.
 *
 * El motivo es obligatorio. Sacar el expediente entero de una persona sin decir
 * para que es justo lo que un inspector va a preguntar.
 */
panelRouter.get('/identidades/:id/expediente', exigePermiso('identidad.ver'), async (req, res) => {
  const motivo = String(req.query.motivo || '').trim()
  if (motivo.length < 5) {
    return res.status(400).json({
      error: 'Hace falta el motivo de la entrega (por ejemplo: «solicitud de acceso de la persona, 21/08/2026»)',
    })
  }
  const r = await entregarExpediente(req.params.id, req.operador!.email, motivo)
  if (!r.ok) return res.status(404).json({ error: r.error })
  await store.guardarYa()
  res.json(r.expediente)
})

/**
 * Le quita el segundo factor a un operador. Solo un administrador.
 *
 * Es la salida para quien perdio el telefono y gasto sus codigos de
 * recuperacion. Tambien es, por definicion, la manera de saltarse el segundo
 * factor: por eso queda escrito en la bitacora con los dos nombres, el de quien
 * lo quita y el de a quien.
 */
panelRouter.delete('/operadores/:id/segundo-factor', exigePermiso('*'), async (req, res) => {
  const r = quitarSegundoFactor(req.params.id, req.operador!.email)
  if (!r.ok) return res.status(400).json({ error: r.error })
  await store.guardarYa()
  res.json({ ok: true })
})

panelRouter.get('/listas', exigePermiso('listas.ver'), (_req, res) => {
  // El estado del temporizador va acá y no solo en `/healthz` porque quien
  // tiene que darse cuenta de que el tamizado continuo se paró es el operador
  // de cumplimiento, y ese mira el panel, no la sonda de salud.
  res.json({ estado: estadoListas(), gafi: estadoGafi(), automatico: estadoTemporizador() })
})

/**
 * Dispara a mano la vuelta que normalmente corre sola.
 *
 * No sustituye al botón de la OFAC de más abajo: sirve para comprobar que el
 * camino automático funciona, con el mismo turno y el mismo registro, sin
 * esperar veinticuatro horas a saberlo.
 */
panelRouter.post('/listas/ahora', exigePermiso('listas.recargar'), async (req, res) => {
  const r = await unaVuelta(`panel:${req.operador!.email}`)
  res.status(r.ok ? 200 : 502).json({ ...r, estado: estadoListas(), automatico: estadoTemporizador() })
})

/**
 * Sustituye las listas del GAFI sin desplegar nada.
 *
 * Se pide `listas.recargar` porque cambiar esto cambia el riesgo de cada país:
 * quitar un código de aquí es dejar de marcar a todo un país, y eso tiene que
 * quedar firmado en la bitácora con nombre y apellido.
 *
 *   { "fecha": "2026-06-19", "altoRiesgo": ["IRN","PRK","MMR"], "vigilancia": ["AGO", ...] }
 */
panelRouter.post('/listas/gafi', exigePermiso('listas.recargar'), async (req, res) => {
  const antes = estadoGafi()
  const r = aplicarGafi(req.body ?? {}, `panel:${req.operador!.email}`, req.operador!.email)
  if (!r.ok) return res.status(400).json({ error: r.error, desconocidos: r.desconocidos })

  const guardadas = await guardarGafiEnMongo(req.operador!.email).catch(() => false)
  const ahora = estadoGafi()
  const salieron = antes.vigilancia.filter((c) => !ahora.vigilancia.includes(c))
  const entraron = ahora.vigilancia.filter((c) => !antes.vigilancia.includes(c))

  registrar(req.operador!.email, 'listas.gafi', 'gafi', {
    fecha: ahora.fecha, entraron, salieron, persistidas: guardadas,
  })
  res.json({
    gafi: ahora,
    cambios: { entraron, salieron },
    // Si no hay Mongo, esto se pierde en el próximo despliegue y hay que
    // decirlo: creer que quedó guardado y que no sea así es peor que no tenerlo.
    persistidas: guardadas,
    aviso: guardadas ? undefined
      : 'No hay almacén persistente: estas listas se pierden en el próximo reinicio',
  })
})

panelRouter.get('/listas/buscar', exigePermiso('listas.ver'), (req, res) => {
  res.json({ resultados: buscarEnListas(String(req.query.q || '')) })
})

/** Recarga desde el almacen (Mongo, o la carpeta) y vuelve a tamizar a todos. */
panelRouter.post('/listas/recargar', exigePermiso('listas.recargar'), async (req, res) => {
  const deMongo = await cargarDesdeMongo().catch(() => 0)
  const cargados = deMongo > 0 ? deMongo : cargarListas()
  const r = ids.retamizarTodas(req.operador!.email)
  registrar(req.operador!.email, 'listas.recargadas', 'listas', { registros: cargados, ...r })
  res.json({ ok: true, registros: cargados, ...r, estado: estadoListas() })
})

/**
 * Baja la lista de la OFAC, la guarda y vuelve a tamizar a todo el mundo.
 *
 * Es la via normal para poner el tamizado en marcha: no hace falta subir
 * archivos ni montar discos. Puede tardar un minuto — son varios megabytes y
 * unas 17 000 fichas que hay que insertar e indexar.
 */
panelRouter.post('/listas/ofac', exigePermiso('listas.recargar'), async (req, res) => {
  try {
    const r = await importarDeOfac()
    // Retamizar despues de cargar es lo que convierte esto en algo util: si
    // alguien ya registrado esta en la lista, aparece ahora, no la proxima vez
    // que toque su expediente.
    const t = ids.retamizarTodas(req.operador!.email)
    registrar(req.operador!.email, 'listas.ofac', 'listas', { ...r, ...t })
    res.json({ ok: true, ...r, ...t, estado: estadoListas() })
  } catch (e: any) {
    res.status(502).json({ error: `No se pudo traer la lista de la OFAC: ${e.message}` })
  }
})

/** Importa una lista propia pegada como texto (JSON o CSV con formato OFAC). */
panelRouter.post('/listas/importar', exigePermiso('listas.recargar'), async (req, res) => {
  const { texto, fuente } = req.body ?? {}
  if (!texto || !fuente) return res.status(400).json({ error: 'Hacen falta el texto y el nombre de la fuente' })
  try {
    const r = await importarTexto(String(texto), String(fuente))
    const t = ids.retamizarTodas(req.operador!.email)
    registrar(req.operador!.email, 'listas.importadas', String(fuente), { ...r, ...t })
    res.json({ ok: true, ...r, ...t, estado: estadoListas() })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Bitácora
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/bitacora', exigePermiso('bitacora.ver'), (req, res) => {
  const { actor, accion, objeto, limite } = req.query as Record<string, string>
  res.json({
    entradas: consultar({ actor, accion, objeto, limite: limite ? Number(limite) : 200 }),
    cadena: verificarCadena(),
    anclaje: anclaje(),
  })
})

/**
 * Cierra un tramo roto de la bitácora y abre uno nuevo.
 *
 * Solo admin, y solo si de verdad está rota. NO repara nada: las entradas
 * anteriores se quedan exactamente como están. Lo único que hace es dejar
 * escrito en la propia bitácora dónde se rompió y cuántas entradas había, para
 * que a partir de ahí una manipulación nueva se vuelva a notar.
 *
 * La alternativa —recalcular los hashes— dejaría el registro en verde
 * destruyendo justo la propiedad que lo hace valer algo ante un auditor. Por
 * eso no existe esa ruta y no debe existir nunca.
 */
panelRouter.post('/bitacora/sellar', exigePermiso('*'), (req, res) => {
  const motivo = String(req.body?.motivo || '').trim()
  if (motivo.length < 10) {
    return res.status(400).json({ error: 'Hace falta un motivo: queda escrito en la bitácora para siempre.' })
  }
  const r = sellar(req.operador!.email, motivo)
  if (!r.ok) return res.status(409).json({ error: r.error })
  registrar(req.operador!.email, 'bitacora.sellada', 'bitacora', { rotaEn: r.rotaEn, motivo })
  res.json({ ok: true, rotaEn: r.rotaEn, cadena: verificarCadena() })
})

// ─────────────────────────────────────────────────────────────────────────────
// Operadores y aplicaciones (solo admin)
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/operadores', exigePermiso('*'), (_req, res) => {
  res.json({
    operadores: store.todo().operadores.map((o) => ({
      id: o.id, email: o.email, nombre: o.nombre, rol: o.rol, activo: o.activo,
      ultimoAcceso: o.ultimoAcceso, debeCambiarContrasena: o.debeCambiarContrasena,
      segundoFactorActivo: Boolean(o.segundoFactor?.activadoEn),
    })),
    roles: Object.keys(PERMISOS),
    permisos: PERMISOS,
  })
})

panelRouter.post('/operadores', exigePermiso('*'), async (req, res) => {
  const { email, nombre, rol, contrasena } = req.body ?? {}
  if (!email || !nombre || !rol || !contrasena) {
    return res.status(400).json({ error: 'Faltan email, nombre, rol y contraseña' })
  }
  if (!PERMISOS[rol as Rol]) return res.status(400).json({ error: `Rol desconocido: ${rol}` })
  if (String(contrasena).length < 12) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' })
  }
  let o
  try {
    o = crearOperador({ email, nombre, rol, contrasena })
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }

  // Se espera al volcado antes de decir «creado». Con el guardado diferido, la
  // respuesta salía con 100 ms de ventaja sobre la escritura: si el proceso se
  // reiniciaba en esa ventana —un despliegue, el apagado por inactividad del
  // plan gratuito— el operador recién creado desaparecía y nadie se enteraba,
  // porque el administrador ya había visto un «ok». Decir que existe una cuenta
  // que no existe es la peor forma de este fallo: la persona intenta entrar
  // durante días con unos datos que el servidor nunca llegó a guardar.
  try {
    await store.guardarYa()
  } catch (e: any) {
    // Si no se pudo guardar, tampoco se deja a medias en memoria: se deshace y
    // se dice la verdad. Un operador que vive solo en RAM es una cuenta que
    // funciona hoy y desaparece en el próximo reinicio.
    const datos = store.todo()
    datos.operadores = datos.operadores.filter((x) => x.id !== o!.id)
    console.error('[genesis-id] no se pudo guardar el operador nuevo:', e?.message)
    return res.status(503).json({
      error: 'No se pudo guardar en la base: el operador NO quedó creado. Inténtelo otra vez.',
    })
  }

  registrar(req.operador!.email, 'operador.creado', o.email, { rol })
  res.json({ ok: true, operador: { id: o.id, email: o.email, rol: o.rol } })
})

panelRouter.post('/operadores/:id/activo', exigePermiso('*'), (req, res) => {
  const o = store.todo().operadores.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Operador no encontrado' })
  if (o.id === req.operador!.id) {
    return res.status(400).json({ error: 'No puede desactivarse a sí mismo' })
  }
  o.activo = Boolean(req.body?.activo)
  // Al desactivar se cierran sus sesiones en el acto.
  if (!o.activo) store.todo().sesiones = store.todo().sesiones.filter((s) => s.operadorId !== o.id)
  store.guardar()
  registrar(req.operador!.email, 'operador.activo', o.email, { activo: o.activo })
  res.json({ ok: true })
})

panelRouter.get('/aplicaciones', exigePermiso('*'), (_req, res) => {
  res.json({
    aplicaciones: store.todo().aplicaciones.map((a) => ({
      id: a.id, clave: a.clave, nombre: a.nombre, pistaClave: a.pistaClave,
      alcances: a.alcances, activa: a.activa, creadaEn: a.creadaEn, ultimoUso: a.ultimoUso,
    })),
    alcancesDisponibles: ALCANCES,
  })
})

panelRouter.post('/aplicaciones', exigePermiso('*'), (req, res) => {
  const { clave, nombre, alcances } = req.body ?? {}
  if (!clave || !nombre || !Array.isArray(alcances)) {
    return res.status(400).json({ error: 'Faltan clave, nombre y alcances' })
  }
  const { aplicacion, clave_secreta } = crearAplicacion(String(clave), String(nombre), alcances)
  registrar(req.operador!.email, 'aplicacion.creada', aplicacion.clave, { alcances })
  // La clave se enseña aquí y nunca más.
  res.json({ ok: true, aplicacion: { id: aplicacion.id, clave: aplicacion.clave }, clave_secreta })
})

panelRouter.post('/aplicaciones/:id/rotar', exigePermiso('*'), (req, res) => {
  const secreta = rotar(req.params.id, req.operador!.email)
  if (!secreta) return res.status(404).json({ error: 'Aplicación no encontrada' })
  res.json({ ok: true, clave_secreta: secreta })
})

/* ── Enganches ──────────────────────────────────────────────────────────────
   Todo esto pide el permiso `*` porque poner un enganche es decidir a qué
   servidor de fuera se le van a mandar avisos de estado de identidades. Es una
   salida de datos, y las salidas de datos no las abre cualquiera. */

panelRouter.get('/aplicaciones/:id/enganche', exigePermiso('*'), (req, res) => {
  const app = store.todo().aplicaciones.find((a) => a.id === req.params.id)
  if (!app) return res.status(404).json({ error: 'Aplicación no encontrada' })
  res.json({ enganche: verEnganche(app), eventos: EVENTOS })
})

panelRouter.put('/aplicaciones/:id/enganche', exigePermiso('*'), (req, res) => {
  const app = store.todo().aplicaciones.find((a) => a.id === req.params.id)
  if (!app) return res.status(404).json({ error: 'Aplicación no encontrada' })
  const { url, eventos } = req.body ?? {}
  if (!url) return res.status(400).json({ error: 'Hace falta la dirección' })

  const r = ponerEnganche(app, String(url), Array.isArray(eventos) ? eventos.map(String) : [],
    req.operador!.email)
  if (!r.ok) return res.status(400).json({ error: r.error })
  // El secreto se enseña aquí y nunca más, igual que la clave de API.
  res.json({ ok: true, secreto: r.secreto })
})

panelRouter.delete('/aplicaciones/:id/enganche', exigePermiso('*'), (req, res) => {
  const app = store.todo().aplicaciones.find((a) => a.id === req.params.id)
  if (!app) return res.status(404).json({ error: 'Aplicación no encontrada' })
  if (!quitarEnganche(app, req.operador!.email)) {
    return res.status(404).json({ error: 'Esa aplicación no tiene enganche' })
  }
  res.json({ ok: true })
})

panelRouter.post('/aplicaciones/:id/enganche/probar', exigePermiso('*'), (req, res) => {
  const app = store.todo().aplicaciones.find((a) => a.id === req.params.id)
  if (!app) return res.status(404).json({ error: 'Aplicación no encontrada' })
  if (!probarEnganche(app)) return res.status(400).json({ error: 'No hay enganche activo' })
  res.json({ ok: true, nota: 'Mandado. Mire el resultado en el estado del enganche.' })
})

panelRouter.post('/aplicaciones/:id/revocar', exigePermiso('*'), (req, res) => {
  if (!revocar(req.params.id, req.operador!.email)) {
    return res.status(404).json({ error: 'Aplicación no encontrada' })
  }
  res.json({ ok: true })
})
