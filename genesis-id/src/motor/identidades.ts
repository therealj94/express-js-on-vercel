// Motor de identidades personales.
//
// LO QUE CAMBIA RESPECTO DE LA VERSION ANTERIOR
//
// Antes existía `processIdentity(id)`: una ruta HTTP sin autenticar que ponía
// el estado en "verificada" y emitía un UID. Nada más. Ni documento, ni
// tamizado, ni persona que respondiera por la decisión. MyTokenPay la llamaba
// directamente desde el teléfono.
//
// Ahora `verificada` tiene UNA sola puerta, `aprobar()`, y esa puerta exige:
//
//   1. Un operador identificado, con permiso `identidad.aprobar`.
//   2. Que no queden bloqueos: documento válido, tamizado hecho contra listas
//      cargadas de verdad, biometría resuelta.
//   3. Si el operador decide aprobar a pesar de un bloqueo, tiene que escribir
//      por qué, y esa anulación queda marcada en la identidad y en la bitácora
//      para siempre.
//
// El GID no existe hasta ese momento. No hay identidad verificada sin decisión.

import { store } from '../store.js'
import { gidPersonal, id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import { avisar, type Evento } from '../enganches/enganches.js'
import { avisarPersona } from '../enganches/whatsapp.js'
import { enviarSinEsperar } from '../correo/enviar.js'
import { identidadAprobada, identidadRechazada } from '../correo/plantillas.js'
import { revisarDocumento } from '../kyc/documento.js'
import { parecidoNombres } from '../lib/texto.js'
import { cotejar, sinProveedor, cotejoManual, biometriaConfigurada } from '../kyc/biometria.js'
import { guardarFotos, archivarFotos, leerFotos } from '../kyc/fotosDocumento.js'
import { leerAnverso } from '../kyc/textoDocumento.js'
import { leerReverso } from '../kyc/lectura.js'
import { guardarFoto, leerFoto, borrarFoto } from '../kyc/fotoCredencial.js'

/* Una credencial necesita un cuadrado de 320 px. Aceptar más sería convertir el
   expediente en un álbum, y cada byte guardado de una persona hay que
   justificarlo. El mensaje de error se arma desde esta constante para que no
   pueda volver a mentir sobre el tope, como pasó con el de las fotos. */
const TOPE_CREDENCIAL = 400 * 1024
import type { ResultadoVivacidad } from '../kyc/vivacidad.js'
import { tamizarPersona } from '../aml/tamiz.js'
import { evaluarRiesgo, UMBRAL_DILIGENCIA_USD } from '../aml/riesgo.js'
import { abrirCasoPorTamiz } from '../aml/casos.js'
import { bloqueada } from './bloqueo.js'
import type { Identidad, EstadoIdentidad, Operador, VinculoApp } from '../types.js'

const ahora = () => new Date().toISOString()

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda
// ─────────────────────────────────────────────────────────────────────────────

export const porEmail = (email: string): Identidad | undefined =>
  store.todo().identidades.find((i) => i.email === String(email || '').toLowerCase().trim())

export const porId = (idn: string): Identidad | undefined =>
  store.todo().identidades.find((i) => i.id === idn)

export const porGid = (gid: string): Identidad | undefined =>
  store.todo().identidades.find((i) => i.gid === String(gid || '').toUpperCase())

// ─────────────────────────────────────────────────────────────────────────────
// Alta y datos declarados
// ─────────────────────────────────────────────────────────────────────────────

export function iniciar(email: string, origen: string): Identidad {
  const correo = String(email).toLowerCase().trim()
  const existente = porEmail(correo)
  if (existente) return existente

  const identidad: Identidad = {
    id: id('idn'),
    tipo: 'personal',
    email: correo,
    nombreDeclarado: null,
    fechaNacimientoDeclarada: null,
    paisResidencia: null,
    telefono: null,
    direccion: null,
    ocupacion: null,
    origenFondos: null,
    propositoCuenta: null,
    volumenEsperadoUsd: null,
    pepDeclarado: null,
    fotoCredencial: null,
    nombreLegal: null,
    fechaNacimiento: null,
    nacionalidad: null,
    numeroDocumento: null,
    tipoDocumento: null,
    vencimientoDocumento: null,
    estado: 'iniciada',
    gid: null,
    /* De dónde vino, para saber a quién avisar cuando se decida. Se saca del
       `origen` en vez de pedirlo aparte porque el origen ya lo trae —las rutas
       de aplicación llaman con `app:<clave>`— y un parámetro más es un
       parámetro que alguien olvida pasar en la ruta siguiente. */
    creadaPor: origen.startsWith('app:') ? origen.slice(4) : null,
    documento: null,
    biometria: null,
    tamiz: null,
    riesgo: null,
    pep: false,
    vinculos: [],
    decisiones: [],
    creadaEn: ahora(),
    actualizadaEn: ahora(),
    verificadaEn: null,
  }
  store.todo().identidades.push(identidad)
  store.guardar()
  registrar(origen, 'identidad.iniciada', identidad.id, { email: correo })
  return identidad
}

export interface DatosDeclarados {
  nombreCompleto?: string
  fechaNacimiento?: string
  paisResidencia?: string
  telefono?: string
  direccion?: string
  ocupacion?: string
  origenFondos?: string
  propositoCuenta?: string
  volumenEsperadoUsd?: number
  pepDeclarado?: boolean
}

export function declararDatos(idn: string, datos: DatosDeclarados, origen: string): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  if (identidad.estado === 'verificada') {
    // Una identidad ya verificada no se edita por la puerta de atrás: habría
    // que suspenderla y rehacer la verificación.
    return identidad
  }

  if (datos.nombreCompleto) identidad.nombreDeclarado = datos.nombreCompleto.trim()
  if (datos.fechaNacimiento) identidad.fechaNacimientoDeclarada = datos.fechaNacimiento
  if (datos.paisResidencia) identidad.paisResidencia = datos.paisResidencia.toUpperCase()
  if (datos.telefono) identidad.telefono = String(datos.telefono).trim()
  if (datos.direccion) identidad.direccion = String(datos.direccion).trim()
  if (datos.ocupacion) identidad.ocupacion = String(datos.ocupacion).trim()
  if (datos.origenFondos) identidad.origenFondos = String(datos.origenFondos).trim()
  if (datos.propositoCuenta) identidad.propositoCuenta = String(datos.propositoCuenta).trim()
  if (Number.isFinite(datos.volumenEsperadoUsd)) {
    identidad.volumenEsperadoUsd = Math.max(0, Number(datos.volumenEsperadoUsd))
  }
  if (typeof datos.pepDeclarado === 'boolean') {
    identidad.pepDeclarado = datos.pepDeclarado
    // Declararse PEP marca la identidad. Quitarla es decisión de un operador,
    // nunca de la propia persona: si no, bastaría con volver a declararse «no».
    if (datos.pepDeclarado) identidad.pep = true
  }

  if (identidad.estado === 'iniciada' && identidad.nombreDeclarado) identidad.estado = 'datos'

  // Tamizado preliminar con el nombre declarado, mientras no haya documento.
  // El que vale es el del documento —y por eso se rehace en `adjuntarDocumento`—
  // pero sin esto, quien declara su nombre y nunca sube el documento no se
  // tamiza nunca, y el equipo de cumplimiento pierde el aviso temprano de que
  // alguien de una lista está intentando entrar.
  if (identidad.nombreDeclarado && !identidad.nombreLegal) {
    identidad.tamiz = tamizarPersona(identidad.nombreDeclarado, {
      fechaNacimiento: identidad.fechaNacimientoDeclarada,
    })
    if (identidad.tamiz.fuertes > 0) abrirCasoPorTamiz(identidad)
    recalcularRiesgo(identidad)
  }

  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(origen, 'identidad.datos', identidad.id, {
    nombreDeclarado: identidad.nombreDeclarado,
    paisResidencia: identidad.paisResidencia,
  })
  return identidad
}

/**
 * Guarda la foto de la credencial.
 *
 * Es la única imagen que Genesis ID almacena, y lo hace por un motivo
 * concreto: el GID vale en todas las apps del ecosistema, y una credencial que
 * solo se ve completa en el teléfono que subió la foto no sirve para eso.
 *
 * Se acota el tamaño en serio. Una credencial necesita un cuadrado de 320 px;
 * aceptar más sería convertir el expediente en un álbum, y cada byte guardado
 * de una persona hay que justificarlo.
 */
export async function guardarFotoCredencial(idn: string, base64: string, origen: string):
  Promise<{ ok: boolean; error?: string; identidad?: Identidad }> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, error: 'Identidad no encontrada' }

  const limpio = String(base64 || '').replace(/^data:image\/[a-z+]+;base64,/i, '').replace(/\s+/g, '')
  if (limpio) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) return { ok: false, error: 'La foto no es base64 válido' }
    const bytes = Math.floor((limpio.length * 3) / 4)
    if (bytes > TOPE_CREDENCIAL) {
      return { ok: false, error: `La foto pesa ${Math.round(bytes / 1024)} kB y el máximo son ${Math.round(TOPE_CREDENCIAL / 1024)} kB` }
    }
  }

  /* EL RETRATO NO ENTRA EN EL EXPEDIENTE. Vivía dentro, y con él dentro cada
     persona verificada dejaba hasta medio megabyte permanente en el documento
     de estado; con unas treinta se pasaba de los 16 MB de MongoDB y `volcar()`
     empezaba a fallar en silencio. Se guarda aparte ANTES de tocar nada, y si
     ese guardado falla no se toca el expediente: mejor un retrato que no se
     pudo cambiar que un expediente que dice tener uno que no existe. */
  try {
    if (limpio) await guardarFoto(identidad.id, limpio)
    else await borrarFoto(identidad.id)
  } catch (e: any) {
    return { ok: false, error: 'No se pudo guardar la foto ahora mismo. Probá de nuevo.' }
  }
  identidad.fotoCredencial = null

  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(origen, 'identidad.fotoCredencial', identidad.id, { quitada: !limpio })
  return { ok: true, identidad }
}

// ─────────────────────────────────────────────────────────────────────────────
// Documento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recibe la MRZ del documento, la comprueba, tamiza contra sanciones con el
 * nombre REAL del documento (no con el declarado) y recalcula el riesgo.
 */
export function adjuntarDocumento(
  idn: string, mrz: string, origen: string, textoAnverso?: string | null,
): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null

  const revision = revisarDocumento(mrz, {
    nombreCompleto: identidad.nombreDeclarado,
    fechaNacimiento: identidad.fechaNacimientoDeclarada,
  }, textoAnverso)
  identidad.documento = revision

  // Los datos válidos del documento pasan a ser los oficiales de la identidad.
  if (revision.datos) {
    // EL NOMBRE COMPLETO, NO EL RECORTADO POR EL ANCHO DE LA MRZ.
    //
    // La zona de lectura mecánica corta: en una cédula hondureña «JOSE» sale
    // «JOS», y ese recorte acababa impreso en la credencial —«MEDARDO JOS
    // ORDONEZ ENAMORADO»— como si la persona se llamara así. Cuando el anverso
    // confirmó el nombre declarado y el del documento es su versión cortada, el
    // que vale es el entero: es el mismo nombre, sin la mutilación del formato.
    const declarado = identidad.nombreDeclarado
    const recortado = revision.datos.nombreCompleto
    const esRecorteDe = Boolean(
      declarado && revision.anverso.nombreConfirmado &&
      parecidoNombres(declarado, recortado) >= 0.95)
    identidad.nombreLegal = esRecorteDe ? declarado! : recortado
    identidad.fechaNacimiento = revision.datos.fechaNacimiento
    identidad.nacionalidad = revision.datos.nacionalidad
    identidad.numeroDocumento = revision.datos.numeroDocumento
    identidad.tipoDocumento = `${revision.datos.formato}/${revision.datos.tipoDocumento}`
    identidad.vencimientoDocumento = revision.datos.fechaVencimiento
  }

  // El tamizado se hace con el nombre del documento: es el que vale. Tamizar
  // con el declarado dejaría que cualquiera esquive las listas escribiendo mal
  // su propio nombre a propósito.
  if (identidad.nombreLegal) {
    identidad.tamiz = tamizarPersona(identidad.nombreLegal, {
      fechaNacimiento: identidad.fechaNacimiento,
      nacionalidades: identidad.nacionalidad ? [identidad.nacionalidad] : [],
    })
    if (identidad.tamiz.fuertes > 0 || identidad.tamiz.posibles > 0) {
      abrirCasoPorTamiz(identidad)
    }
  }

  // El estado solo avanza. Poner «documento» siempre hacía retroceder a
  // quien ya había pasado el rostro: el registro cámara-primero lee el
  // documento, hace la prueba de vida y DESPUÉS confirma sus datos, y al
  // confirmarlos vuelve a mandar la misma MRZ para que el cotejo del nombre se
  // haga con lo que declaró. Ese reenvío no puede borrar el rostro.
  if (identidad.estado === 'iniciada' || identidad.estado === 'datos') identidad.estado = 'documento'
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()

  registrar(origen, 'identidad.documento', identidad.id, {
    aceptable: revision.aceptable,
    hallazgos: revision.hallazgos.filter((h) => h.gravedad !== 'ok').map((h) => h.clave),
    coincidenciasTamiz: identidad.tamiz?.coincidencias.length ?? 0,
  })
  return identidad
}

export interface ResultadoFotos {
  ok: boolean
  /** Va también cuando falla, si la identidad existe: distingue el 404 del resto. */
  identidad?: Identidad
  motivo?: string
  /**
   * Lo que la máquina alcanzó a leer del frente, para que la app se lo diga a
   * la persona EN EL MOMENTO — «no se distingue la foto del titular, tomála de
   * nuevo» vale oro con la cámara todavía en la mano y nada tres días después.
   * null cuando no hay lector configurado: entonces no se afirma nada.
   */
  lectura?: {
    rostroEnFrente: boolean | null
    nombreConfirmado: boolean | null
    fechaConfirmada: boolean | null
  } | null
  /**
   * La máquina leyó la MRZ del reverso y cuadró: el documento pasó las mismas
   * comprobaciones que por el teléfono y `datos` trae lo leído. Sin esto, el
   * expediente sigue esperando a que un operador lo lea.
   */
  mrzLeida?: boolean
}

/**
 * El documento entrado como DOS FOTOS, para quien se verifica desde un
 * navegador.
 *
 * POR QUE EXISTE ESTE CAMINO
 *
 * La lectura de la zona mecánica la hace ML Kit dentro del teléfono. En un
 * navegador ese lector no existe, y pedirle a la gente que teclee a mano las
 * dos líneas de su pasaporte —cuarenta y cuatro caracteres cada una, con los
 * dígitos de control— era pedir un imposible: el trámite se caía ahí.
 *
 * Así que por la web entran las dos caras y **las lee una persona**. Aquí no se
 * comprueba nada del documento, y por eso este camino no rellena `datos` ni
 * toca `nombreLegal`: lo que no se leyó, no se sabe.
 *
 * LO QUE SI SE HACE, PORQUE NO PUEDE NO HACERSE
 *
 * El tamizado contra listas de sanciones se ejecuta igual, con el nombre
 * DECLARADO. Es peor que tamizar con el del documento —quien miente su nombre
 * esquiva la lista—, pero saltárselo del todo sería dejar una puerta sin
 * cerrar, y el operador va a cotejar el nombre contra la foto de todas formas.
 *
 * LAS IMAGENES
 *
 * Genesis ID no guarda fotos de documentos: se comparan y se descartan. Este es
 * el único sitio donde se conservan, y es a la fuerza, porque un operador tiene
 * que verlas para decidir. Se borran solas en cuanto hay decisión —aprobada o
 * rechazada—, así que no se acumulan.
 *
 * NO van dentro del expediente, sino en su propio almacén (`kyc/fotosDocumento`).
 * Guardarlas aquí metía megabytes de base64 en el documento de estado, que es
 * uno solo para todo el motor y no puede pasar de 16 MB: unas pocas
 * verificaciones pendientes a la vez bastaban para que fallara el guardado de
 * TODO —identidades incluidas— hasta el siguiente reinicio, que se lo llevaba
 * por delante. El expediente solo guarda que el documento entró por fotos.
 *
 * Se guardan ANTES de tocar el expediente y se espera a que estén: decirle a la
 * persona que su documento quedó aportado cuando el operador no va a tener nada
 * que mirar es dejar el trámite parado sin que nadie lo sepa.
 */
export async function adjuntarDocumentoPorFotos(
  idn: string, anverso: string, reverso: string, origen: string,
): Promise<ResultadoFotos> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, motivo: 'Identidad no encontrada' }

  try {
    await guardarFotos(identidad.id, { anverso, reverso })
  } catch (e: any) {
    console.error('[identidades] no se pudieron guardar las fotos del documento:', e?.message)
    return {
      ok: false,
      identidad,
      motivo: 'No se pudieron guardar las fotos del documento. Inténtelo otra vez.',
    }
  }

  /* LA MÁQUINA LEE EL FRENTE, TAMBIÉN POR ESTA VÍA.
     La regla de la casa es que el nombre se coteja SIEMPRE contra el frente
     del documento —la zona mecánica corta los nombres largos—, y esta vía la
     tenía rota: dos fotos entraban y nadie leía nada hasta que un operador
     abría el expediente. Ahora el servidor lee el impreso con Rekognition y
     coteja nombre y fecha con la misma tolerancia a OCR que la vía del
     teléfono. La vía sigue siendo `fotos` y la decisión sigue siendo humana:
     una lectura del impreso no equivale a los dígitos de control de la MRZ. */
  const lectura = await leerAnverso(anverso, {
    nombreCompleto: identidad.nombreDeclarado,
    fechaNacimiento: identidad.fechaNacimientoDeclarada,
  })

  const hallazgos: NonNullable<Identidad['documento']>['hallazgos'] = [{
    clave: 'documento.porFotos',
    gravedad: 'aviso',
    detalle: 'Documento aportado como fotografías: hace falta que un operador lo lea y lo coteje.',
  }]
  if (lectura) {
    if (lectura.rostros !== null) {
      hallazgos.push(lectura.rostros >= 1
        ? { clave: 'anverso.rostro', gravedad: 'ok', detalle: 'La foto del titular se distingue en el frente' }
        : {
            clave: 'anverso.rostro', gravedad: 'aviso',
            detalle: 'En el frente no se distingue la foto del titular: la imagen puede estar ' +
              'borrosa, recortada, o ser la cara equivocada del documento.',
          })
    }
    hallazgos.push(!lectura.texto
      ? { clave: 'anverso.texto', gravedad: 'aviso', detalle: 'La máquina no pudo leer texto en el frente: ' + lectura.detalle }
      : lectura.nombre === true
        ? { clave: 'anverso.nombre', gravedad: 'ok', detalle: 'La máquina leyó el frente: ' + lectura.detalle }
        : lectura.nombre === false
          ? { clave: 'anverso.nombre', gravedad: 'aviso', detalle: 'La máquina leyó el frente y ' + lectura.detalle }
          : { clave: 'anverso.texto', gravedad: 'aviso', detalle: 'La máquina leyó el frente pero ' + lectura.detalle })
  }

  /* Y LEE EL REVERSO: la zona mecánica, con sus dígitos de control.
     Es lo que convierte la vía del navegador en una verificación de verdad y
     no en una cola: si la MRZ se lee y cuadra, el documento pasa las MISMAS
     comprobaciones que por el teléfono —vigencia, edad, nombre contra lo
     declarado y contra el frente— y la persona ve al instante si sirve, con
     sus datos leídos para confirmarlos. Las fotos se conservan igual para que
     el operador las mire: leer no es aprobar. Si no se lee, todo queda como
     estaba: esperando a un operador. */
  const reversoLeido = await leerReverso(reverso)
  const mrzLeida = reversoLeido.ok && Boolean(reversoLeido.mrz)

  if (mrzLeida) {
    const revision = revisarDocumento(reversoLeido.mrz!, {
      nombreCompleto: identidad.nombreDeclarado,
      fechaNacimiento: identidad.fechaNacimientoDeclarada,
    }, lectura?.texto || null)
    if (revision.datos) {
      const declarado = identidad.nombreDeclarado
      const recortado = revision.datos.nombreCompleto
      const esRecorteDe = Boolean(
        declarado && revision.anverso.nombreConfirmado &&
        parecidoNombres(declarado, recortado) >= 0.95)
      identidad.nombreLegal = esRecorteDe ? declarado! : recortado
      identidad.fechaNacimiento = revision.datos.fechaNacimiento
      identidad.nacionalidad = revision.datos.nacionalidad
      identidad.numeroDocumento = revision.datos.numeroDocumento
      identidad.tipoDocumento = `${revision.datos.formato}/${revision.datos.tipoDocumento}`
      identidad.vencimientoDocumento = revision.datos.fechaVencimiento
    }
    identidad.documento = {
      ...revision,
      hallazgos: [
        ...hallazgos.filter((h) => h.clave !== 'anverso.texto' && h.clave !== 'anverso.nombre'),
        { clave: 'mrz.automatica', gravedad: 'ok',
          detalle: 'La zona mecánica del reverso la leyó la máquina y cuadran sus dígitos de control' +
            (reversoLeido.corregida ? ' (tras corregir confusiones de lectura)' : '') },
        ...revision.hallazgos,
      ],
      via: 'fotos',
      imagenes: null,
      textoAnverso: lectura?.texto || null,
    }
  } else {
    identidad.documento = {
      // `aceptable` en falso NO significa aquí «el documento no sirve»: significa
      // «todavía no lo ha mirado nadie». La diferencia la marca `via`, y el
      // cliente tiene que leer las dos.
      aceptable: false,
      datos: null,
      hallazgos,
      edad: null,
      anverso: {
        aportado: true,
        nombreConfirmado: lectura ? lectura.nombre : null,
        fechaConfirmada: lectura ? lectura.fecha : null,
      },
      via: 'fotos',
      // Las imágenes ya están guardadas aparte; en el expediente no van nunca.
      imagenes: null,
      textoAnverso: lectura?.texto || null,
    }
  }

  // Con MRZ leída se tamiza con el nombre del documento, que es el que vale;
  // sin ella, con el declarado: peor, pero mejor que dejar la puerta sin cerrar.
  const nombreParaTamiz = mrzLeida ? identidad.nombreLegal : identidad.nombreDeclarado
  if (nombreParaTamiz) {
    identidad.tamiz = tamizarPersona(nombreParaTamiz, {
      fechaNacimiento: mrzLeida ? identidad.fechaNacimiento : identidad.fechaNacimientoDeclarada,
      nacionalidades: mrzLeida && identidad.nacionalidad ? [identidad.nacionalidad] : [],
    })
    if (identidad.tamiz.fuertes > 0 || identidad.tamiz.posibles > 0) {
      abrirCasoPorTamiz(identidad)
    }
  }

  // El estado solo avanza. Poner «documento» siempre hacía retroceder a
  // quien ya había pasado el rostro: el registro cámara-primero lee el
  // documento, hace la prueba de vida y DESPUÉS confirma sus datos, y al
  // confirmarlos vuelve a mandar la misma MRZ para que el cotejo del nombre se
  // haga con lo que declaró. Ese reenvío no puede borrar el rostro.
  if (identidad.estado === 'iniciada' || identidad.estado === 'datos') identidad.estado = 'documento'
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()

  registrar(origen, 'identidad.documentoPorFotos', identidad.id, {
    coincidenciasTamiz: identidad.tamiz?.coincidencias.length ?? 0,
    mrzLeida,
    aceptable: mrzLeida ? identidad.documento.aceptable : null,
    // Qué alcanzó a leer la máquina, para poder auditar después si el aviso
    // inmediato a la persona funcionó o estorbó.
    lectura: lectura
      ? { rostros: lectura.rostros, nombre: lectura.nombre, fecha: lectura.fecha }
      : null,
  })
  return {
    ok: true,
    identidad,
    mrzLeida,
    lectura: lectura
      ? {
          rostroEnFrente: lectura.rostros === null ? null : lectura.rostros >= 1,
          nombreConfirmado: lectura.nombre,
          fechaConfirmada: lectura.fecha,
        }
      : null,
  }
}

/**
 * Archiva las fotos del documento en cuanto hay decisión.
 *
 * Se llama desde `aprobar`, desde `rechazar` y desde `reiniciar`.
 *
 * ANTES LAS BORRABA, Y ESO CONTRADECÍA LO QUE HABÍAMOS PROMETIDO
 *
 * El razonamiento del borrado era bueno —no acumular documentos de identidad
 * ajenos— pero la política de privacidad publicada dice, por escrito y a cada
 * usuario, que los datos de verificación de identidad se conservan cinco años
 * por obligación legal. Las dos cosas no podían ser verdad a la vez, y de las
 * dos la que manda es la que ya está firmada frente a quien confió.
 *
 * Así que ahora se archivan: cifradas, con cada lectura registrada y con fecha
 * de caducidad puesta, que MongoDB hace cumplir sin que nadie tenga que
 * acordarse. Si no hay llave de cifrado, `archivarFotos` las borra —eso no
 * cambió— porque un depósito de cédulas en claro es peor que no tener archivo.
 */
function archivarFotosDocumento(identidad: Identidad): Promise<void> {
  // El expediente ya no lleva las imágenes dentro; se limpia igual por si
  // quedara algo guardado antes de que se mudaran a su propio almacén.
  if (identidad.documento?.imagenes) identidad.documento.imagenes = null

  // Un fallo aquí NO puede tumbar la decisión: aprobar o rechazar es lo
  // irreversible y lo que la persona está esperando. Queda dicho en el registro
  // para poder repasarlo.
  return archivarFotos(identidad.id).then(() => undefined).catch((e: any) => {
    console.error(
      `[identidades] no se pudieron archivar las fotos del documento de ${identidad.id}:`, e?.message)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Biometría
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaRostro {
  selfie: string
  fotoDocumento: string
  /** Reto de vivacidad ya resuelto, si lo hubo. */
  vivacidad?: ResultadoVivacidad | null
}

/**
 * Cotejo del rostro.
 *
 * QUE SE GUARDA DE VERDAD, QUE ESTE COMENTARIO DECIA MAL.
 *
 * Este texto afirmaba que «ni el selfie ni la foto del documento se guardan».
 * Era cierto cuando se escribio y dejo de serlo, y el comentario no se movio.
 * Peor: se cito como si fuera la conducta del sistema en un diagnostico que
 * salio de casa, o sea que un comentario viejo acabo siendo una afirmacion
 * falsa sobre privacidad delante de terceros.
 *
 * Lo que pasa hoy, leido del codigo:
 *   - El fotograma del cotejo SI se guarda, cifrado con AES-256-GCM, en la
 *     coleccion de documentos y con el mismo plazo de cinco anios. Se hizo a
 *     proposito para poder revisar a mano un cotejo dudoso.
 *   - Si la identidad no tiene retrato, ese mismo fotograma se copia ademas
 *     como foto de credencial (mas abajo en esta funcion).
 *   - Las fotos del documento tambien se guardan cifradas.
 *   - Los fotogramas de la prueba de vida NO se guardan: van al proveedor y
 *     no vuelven a tocar disco.
 *
 * En el expediente en claro queda solo el veredicto, la puntuacion y que gesto
 * se pidio. Las imagenes viven aparte y cifradas.
 */
export async function adjuntarBiometria(
  idn: string, entrada: EntradaRostro, origen: string,
): Promise<Identidad | null> {
  const identidad = porId(idn)
  if (!identidad) return null

  /* EL DOCUMENTO DEL COTEJO ES EL ARCHIVADO, NO EL QUE MANDE EL CLIENTE.
     Hasta hoy CompareFaces comparaba el selfie contra la `fotoDocumento` que
     venía EN LA MISMA PETICIÓN. Para un cliente honesto es la misma imagen que
     ya subió; para uno malicioso era el agujero entero: mandar su propia cara
     como «documento» y cobrar un parecido del 99 % sobre el expediente de otra
     persona. Si el frente está archivado —que es siempre en la vía del
     navegador—, se compara contra ESE; lo que diga el cuerpo de la petición no
     pinta nada. La vía del teléfono no archiva imágenes, así que ahí se sigue
     usando la del cliente: es la app de la casa, firmada, y no hay otra. */
  const archivadas = biometriaConfigurada()
    ? await leerFotos(identidad.id).catch(() => null)
    : null
  const documentoDelCotejo = archivadas?.anverso || entrada.fotoDocumento

  const v = entrada.vivacidad
  identidad.biometria = biometriaConfigurada()
    ? await cotejar({
        selfie: entrada.selfie,
        fotoDocumento: documentoDelCotejo,
        vivacidad: v ? v.puntuacion : null,
        pasosVivacidad: v?.pasos,
        avisosVivacidad: v?.avisos,
        notaVivacidad: v?.motivo,
      })
    : sinProveedor()

  /* EL ROSTRO SE QUEDA, AUNQUE NADIE LLAME A `/foto`.
     El retrato de la credencial se guardaba SOLO por su ruta aparte, y resulta
     que no la llama nadie: ni la billetera web ni la app la usan, así que
     ninguna identidad tenía rostro archivado. El operador abría el expediente
     para decidir y encontraba «no aportado» donde va la cara — o sea que se le
     pedía aprobar a alguien sin haberle visto nunca la cara, con su nombre
     quedando escrito en la bitácora.

     El selfie del cotejo estaba ahí todo el tiempo: llega en esta misma
     petición, se compara contra el documento y se tiraba. Ahora, si no hay
     retrato, se conserva ESE. No pisa nunca uno que ya exista: una app que
     suba un retrato propio y mejor sigue mandando sobre este.

     Va sin `await` bloqueante y con su propio catch: el cotejo biométrico ya
     está hecho y guardado a esta altura, y un tropiezo del almacén de fotos no
     puede tumbar una verificación. Peor un rostro que falta que un trámite que
     se cae. */
  if (entrada.selfie) {
    leerFoto(identidad.id)
      .then((ya) => (ya ? null : guardarFotoCredencial(identidad.id, entrada.selfie, origen)))
      .then((r) => {
        if (r && !r.ok) console.error('[identidades] no se conservó el rostro del cotejo:', r.error)
      })
      .catch((e) => console.error('[identidades] no se conservó el rostro del cotejo:', e?.message))
  }

  if (identidad.estado === 'documento') identidad.estado = 'biometria'
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(origen, 'identidad.biometria', identidad.id, {
    estado: identidad.biometria.estado,
    proveedor: identidad.biometria.proveedor,
    parecido: identidad.biometria.parecido,
    vivacidad: identidad.biometria.vivacidad,
    // Contra qué documento se comparó: el del archivo (la vía del navegador)
    // o el que mandó el cliente (la vía del teléfono, que no archiva).
    documentoDeArchivo: Boolean(archivadas?.anverso),
  })
  return identidad
}

/** Cotejo hecho por una persona, mientras no haya proveedor automático. */
export function resolverBiometriaManual(
  idn: string, operador: Operador, coincide: boolean, nota?: string,
): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  identidad.biometria = cotejoManual(operador.email, coincide, nota)
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(operador.email, 'identidad.biometriaManual', identidad.id, { coincide, nota })
  return identidad
}

// ─────────────────────────────────────────────────────────────────────────────
// Riesgo
// ─────────────────────────────────────────────────────────────────────────────

export function recalcularRiesgo(identidad: Identidad): Identidad {
  identidad.riesgo = evaluarRiesgo({
    documento: identidad.documento,
    tamiz: identidad.tamiz,
    biometria: identidad.biometria,
    pais: identidad.nacionalidad || identidad.paisResidencia,
    pep: identidad.pep,
    volumenEsperadoUsd: identidad.volumenEsperadoUsd,
    faltanDatos: [
      !identidad.telefono && 'telefono',
      !identidad.direccion && 'direccion',
      !identidad.ocupacion && 'ocupacion',
      !identidad.origenFondos && 'origenFondos',
      !identidad.propositoCuenta && 'propositoCuenta',
      identidad.pepDeclarado === null && 'pepDeclarado',
    ].filter(Boolean) as string[],
  })
  return identidad
}

/** Vuelve a tamizar. Se llama cuando se cargan listas nuevas. */
export function retamizar(identidad: Identidad): Identidad {
  if (!identidad.nombreLegal) return identidad
  identidad.tamiz = tamizarPersona(identidad.nombreLegal, {
    fechaNacimiento: identidad.fechaNacimiento,
    nacionalidades: identidad.nacionalidad ? [identidad.nacionalidad] : [],
  })
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  if (identidad.tamiz.fuertes > 0) abrirCasoPorTamiz(identidad)
  return identidad
}

/** Vuelve a tamizar TODAS las identidades verificadas. */
export function retamizarTodas(actor: string): { revisadas: number; conCoincidencias: number } {
  const identidades = store.todo().identidades.filter((i) => i.nombreLegal)
  let conCoincidencias = 0
  for (const i of identidades) {
    retamizar(i)
    if ((i.tamiz?.fuertes ?? 0) > 0) conCoincidencias++
  }
  store.guardar()
  registrar(actor, 'tamiz.masivo', 'identidades', { revisadas: identidades.length, conCoincidencias })
  return { revisadas: identidades.length, conCoincidencias }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisiones
// ─────────────────────────────────────────────────────────────────────────────

function anotar(identidad: Identidad, estado: EstadoIdentidad, operador: string, motivo: string) {
  identidad.decisiones.push({ estado, operador, motivo, fecha: ahora() })
  identidad.estado = estado
  identidad.actualizadaEn = ahora()

  /* El aviso a las aplicaciones sale de AQUI y no de cada función de decisión.
     Es el único sitio por el que pasan las cuatro —revisión, aprobación,
     rechazo, suspensión— y la quinta que se añada mañana. Puesto en cada una,
     se olvida en la que se escriba con prisa, y un evento que a veces no sale
     es peor que no tenerlo: el integrador se fía.

     Solo encola; no espera a nadie. Una decisión de cumplimiento no puede
     depender de que el servidor de un tercero conteste. */
  avisar(`identidad.${estado}` as Evento, identidad, { motivo })

  /* Y a LA PERSONA por WhatsApp, si tiene teléfono y está configurado.
     Va aquí por el mismo motivo que el aviso a las aplicaciones: es el único
     sitio por el que pasan las cuatro decisiones. Y va DESPUES, porque si algo
     de esto fallara, el aviso a las aplicaciones ya está encolado.

     Solo encola. Una decisión de cumplimiento no espera a WhatsApp. */
  avisarPersona(identidad, motivo)
}

export function enviarARevision(idn: string, actor: string, motivo = 'Pendiente de revisión'): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  anotar(identidad, 'en-revision', actor, motivo)
  store.guardar()
  registrar(actor, 'identidad.enRevision', identidad.id, { motivo })
  return identidad
}

export interface ResultadoAprobacion {
  ok: boolean
  identidad?: Identidad
  motivo?: string
  bloqueos?: string[]
}

/**
 * La ÚNICA vía para que una identidad quede verificada y reciba su GID.
 *
 * @param anulacion  justificación escrita para aprobar pese a los bloqueos.
 *                   Sin ella, con bloqueos presentes, la aprobación se rechaza.
 */
export async function aprobar(
  idn: string, operador: Operador, motivo: string, anulacion?: string,
): Promise<ResultadoAprobacion> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, motivo: 'Identidad no encontrada' }
  if (identidad.estado === 'verificada') {
    return { ok: false, motivo: 'La identidad ya está verificada', identidad }
  }
  if (!motivo || motivo.trim().length < 5) {
    return { ok: false, motivo: 'Hay que escribir el motivo de la aprobación' }
  }

  recalcularRiesgo(identidad)
  const bloqueos = identidad.riesgo?.bloqueos ?? []

  if (bloqueos.length && !anulacion) {
    return {
      ok: false,
      motivo: 'No se puede aprobar: hay comprobaciones sin resolver. Para aprobar igualmente hace falta una justificación escrita.',
      bloqueos,
      identidad,
    }
  }
  if (bloqueos.length && anulacion && anulacion.trim().length < 20) {
    return {
      ok: false,
      motivo: 'La justificación para anular los bloqueos tiene que explicar el porqué (mínimo 20 caracteres)',
      bloqueos,
      identidad,
    }
  }
  // El nivel inaceptable no se anula con un texto: es país prohibido o
  // sanción integral, y aprobarlo sería un incumplimiento directo.
  if (identidad.riesgo?.nivel === 'inaceptable') {
    return {
      ok: false,
      motivo: 'Riesgo inaceptable (jurisdicción prohibida o sanción integral). No se puede aprobar por esta vía.',
      bloqueos,
      identidad,
    }
  }

  identidad.gid = identidad.gid ?? gidPersonal()
  identidad.verificadaEn = ahora()
  await archivarFotosDocumento(identidad)
  anotar(identidad, 'verificada', operador.email,
    anulacion ? `${motivo} — ANULACION DE BLOQUEOS: ${anulacion}` : motivo)

  await store.guardarYa()
  registrar(operador.email, 'identidad.aprobada', identidad.id, {
    gid: identidad.gid,
    motivo,
    riesgo: identidad.riesgo?.nivel,
    puntuacion: identidad.riesgo?.puntuacion,
    anulacion: anulacion ?? null,
    bloqueosAnulados: anulacion ? bloqueos : [],
  })
  /* El aviso sale DESPUES de guardar y sin esperarlo. La pantalla decía «suele
     tardar menos de 24 horas» y después no avisaba nadie: la persona tenía que
     adivinar cuándo volver a mirar. Va sin `await` a propósito — un SES lento
     o caído no puede dejar colgado al operador ni, mucho menos, impedir una
     aprobación que ya está escrita en el expediente. */
  enviarSinEsperar(
    identidadAprobada({
      email: identidad.email,
      nombreLegal: identidad.nombreLegal,
      gid: identidad.gid,
    }),
    `aprobación de ${identidad.id}`,
  )
  return { ok: true, identidad }
}

export async function rechazar(idn: string, operador: Operador, motivo: string): Promise<ResultadoAprobacion> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, motivo: 'Identidad no encontrada' }
  if (!motivo || motivo.trim().length < 5) {
    return { ok: false, motivo: 'Hay que escribir el motivo del rechazo' }
  }
  anotar(identidad, 'rechazada', operador.email, motivo)
  await archivarFotosDocumento(identidad)
  await store.guardarYa()
  registrar(operador.email, 'identidad.rechazada', identidad.id, { motivo })
  /* El rechazo se avisa con el motivo COMPLETO. Sin este correo la persona
     queda esperando indefinidamente un trámite que ya se cerró, y la pantalla
     solo se lo dice si vuelve a entrar por su cuenta. */
  enviarSinEsperar(
    identidadRechazada({
      email: identidad.email,
      nombreLegal: identidad.nombreLegal,
      motivo,
    }),
    `rechazo de ${identidad.id}`,
  )
  return { ok: true, identidad }
}

/** Retira una identidad ya verificada. El GID se conserva para la trazabilidad. */
export async function suspender(idn: string, operador: Operador, motivo: string): Promise<ResultadoAprobacion> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, motivo: 'Identidad no encontrada' }
  anotar(identidad, 'suspendida', operador.email, motivo)
  await store.guardarYa()
  registrar(operador.email, 'identidad.suspendida', identidad.id, { gid: identidad.gid, motivo })
  return { ok: true, identidad }
}

/**
 * Devuelve una identidad al principio para que la persona la rehaga.
 *
 * NO es un borrado, y no puede serlo: un expediente de cumplimiento no se
 * elimina, porque el registro de que alguien intentó verificarse —y qué se
 * encontró— es justamente lo que hay que conservar. Lo que se hace es limpiar
 * lo que la persona tiene que volver a aportar (documento, rostro, riesgo) y
 * dejar los datos declarados, para que no reescriba su nombre.
 *
 * Queda en la bitácora quién lo reinició y por qué. Una identidad ya verificada
 * no entra por aquí: para eso hay que suspenderla primero, que es una decisión
 * distinta y más seria.
 */
export async function reiniciar(idn: string, operador: Operador, motivo: string): Promise<Identidad | null> {
  const identidad = porId(idn)
  if (!identidad) return null
  if (identidad.estado === 'verificada') return null

  // Las fotos se sueltan aquí también: la persona va a subir otras, y antes se
  // iban solas con el expediente porque vivían dentro. Ahora viven aparte, y sin
  // este borrado se quedarían huérfanas para siempre — documentos de identidad
  // acumulados de trámites que ya no existen.
  await archivarFotosDocumento(identidad)
  identidad.documento = null
  identidad.biometria = null
  identidad.nombreLegal = null
  identidad.estado = identidad.nombreDeclarado ? 'datos' : 'iniciada'
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(operador.email, 'identidad.reiniciar', identidad.id, { motivo })
  return identidad
}

export function marcarPep(idn: string, operador: Operador, pep: boolean, nota: string): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  identidad.pep = pep
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(operador.email, 'identidad.pep', identidad.id, { pep, nota })
  return identidad
}

// ─────────────────────────────────────────────────────────────────────────────
// Vínculos con las apps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ata una cuenta de una app del ecosistema a la identidad.
 *
 * Es lo que hace que el mismo GID sirva en Veta Wallet, MyTokenPay y ordenscan:
 * cada app guarda su propia cuenta, pero todas apuntan a la misma persona
 * verificada una sola vez.
 */
export function vincular(
  idn: string, app: string, cuenta: string, direccion: string | null, origen: string,
): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null

  const existente = identidad.vinculos.find((v) => v.app === app && v.cuenta === cuenta)
  if (existente) {
    existente.ultimoAcceso = ahora()
    if (direccion) existente.direccion = direccion
  } else {
    const vinculo: VinculoApp = {
      app, cuenta, direccion, vinculadaEn: ahora(), ultimoAcceso: ahora(),
    }
    identidad.vinculos.push(vinculo)
    registrar(origen, 'identidad.vinculada', identidad.id, { app, cuenta, direccion })
  }
  identidad.actualizadaEn = ahora()
  store.guardar()
  return identidad
}

export const porDireccion = (direccion: string): Identidad | undefined => {
  const d = String(direccion || '').toLowerCase()
  return store.todo().identidades.find((i) =>
    i.vinculos.some((v) => (v.direccion || '').toLowerCase() === d))
}

// ─────────────────────────────────────────────────────────────────────────────
// Vistas
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que se le puede contar a una app: nunca el documento ni la biometría. */
export function perfilPublico(identidad: Identidad) {
  const bloq = bloqueada(identidad)
  return {
    gid: identidad.gid,
    /* `verificada` ES LA PUERTA, y por eso el bloqueo la cierra aquí y no solo
       en las rutas. Cualquier app del ecosistema —y cualquier ruta futura de
       esta casa— pregunta por este campo para decidir si alguien entra; si el
       bloqueo viviera únicamente en un `if` de cada ruta, la primera ruta que
       se escriba sin acordarse dejaría pasar a alguien bloqueado.
       El MOTIVO no viaja: a una app le basta con que no entra. */
    verificada: identidad.estado === 'verificada' && !bloq,
    bloqueada: bloq,
    /* El estado del trámite se dice tal cual y sin maquillar: bloquear no
       cambia el KYC de nadie. Una app que quiera distinguir «no terminó su
       verificación» de «la casa le cerró la puerta» tiene los dos campos. */
    estado: identidad.estado,
    nombre: identidad.estado === 'verificada' ? identidad.nombreLegal : null,
    nacionalidad: identidad.estado === 'verificada' ? identidad.nacionalidad : null,
    nivelRiesgo: identidad.riesgo?.nivel ?? null,
    verificadaEn: identidad.verificadaEn,
    apps: identidad.vinculos.map((v) => ({ app: v.app, direccion: v.direccion ?? null })),
  }
}

/** Lo que ve el usuario dueño de la identidad sobre su propio trámite. */
export function estadoParaUsuario(identidad: Identidad) {
  const pendientes = (identidad.riesgo?.bloqueos ?? []).length

  // Un cotejo FALLIDO no es lo mismo que uno pendiente de revisión. Casi
  // siempre es mala luz o un gesto a medias, y la persona puede repetirlo en
  // veinte segundos. Sin esta señal, la app la mandaba a esperar días por una
  // foto mal tomada — y al volver a entrar tampoco le dejaba reintentar.
  const rostroPendiente = identidad.biometria?.estado === 'fallida'

  /* QUÉ ESTÁ HECHO, paso por paso, sin presuponer un orden.
     La app y la web van cámara-primero (documento → rostro → confirmar) y
     las versiones anteriores iban al revés; con esto cualquiera retoma donde
     quedó, y quien cierra a mitad no pierde nada de lo que ya mandó. Un
     documento por fotos cuenta como hecho aunque nadie lo haya leído aún: la
     persona ya aportó lo suyo. */
  const hecho = {
    datos: Boolean(identidad.nombreDeclarado && identidad.fechaNacimientoDeclarada),
    documento: Boolean(identidad.documento?.aceptable || identidad.documento?.via === 'fotos'),
    rostro: Boolean(identidad.biometria) && !rostroPendiente,
  }
  const d = identidad.documento?.datos ?? null

  return {
    id: identidad.id,
    email: identidad.email,
    estado: identidad.estado,
    /* El bloqueo también se le dice a la propia persona, y no como un detalle
       técnico: es la única forma de que su app le enseñe algo distinto de una
       pantalla en blanco o un «error». Que no entienda por qué no entra es
       peor que saber que se le cerró el acceso. El MOTIVO no va acá — se lo
       explica quien tomó la decisión, no una pantalla. */
    bloqueada: bloqueada(identidad),
    gid: identidad.gid,
    nombreLegal: identidad.nombreLegal,
    documentoAceptable: identidad.documento?.aceptable ?? null,
    hecho,
    // Lo que dice el documento, para que la persona lo CONFIRME en vez de
    // teclearlo. Es suyo: lo acaba de leer con su cámara.
    documentoDatos: d ? {
      nombre: identidad.nombreLegal ?? d.nombreCompleto,
      fechaNacimiento: d.fechaNacimiento,
      nacionalidad: d.nacionalidad,
      numeroDocumento: d.numeroDocumento,
      tipoDocumento: `${d.formato}/${d.tipoDocumento}`,
      vencimiento: d.fechaVencimiento,
    } : null,
    nombreDeclarado: identidad.nombreDeclarado,
    fechaNacimientoDeclarada: identidad.fechaNacimientoDeclarada,
    paisResidencia: identidad.paisResidencia,
    verificadaEn: identidad.verificadaEn,
    /* POR DONDE ENTRO EL DOCUMENTO, y hace falta decirlo.
     *
     * En la via `fotos` —la del navegador— `aceptable` viene en falso porque
     * todavia no lo ha mirado nadie, NO porque el documento este mal. Un
     * cliente que lea solo `documentoAceptable` le enseña a la persona un
     * «tu documento no sirve, volve a subirlo» sobre un expediente que esta
     * perfectamente en orden y esperando turno. Las dos claves se leen juntas
     * o ninguna. */
    documentoPorFotos: identidad.documento?.via === 'fotos',
    rostroPendiente,
    /* El retrato ya no vive en el expediente, y esta función es síncrona, así
       que aquí sale siempre en null. Lo rellena `estadoParaUsuarioConFoto`,
       que es lo que usan las rutas: la credencial sigue viajando entera hacia
       las apps —sin eso se vería a medias en cualquier teléfono que no fuera
       el que subió la foto—, solo que ahora se busca donde de verdad está. */
    fotoCredencial: null as string | null,
    // Qué falta del perfil de cumplimiento, para que la app lo pida.
    faltanDatos: [
      !identidad.telefono && 'telefono',
      !identidad.direccion && 'direccion',
      !identidad.ocupacion && 'ocupacion',
      !identidad.origenFondos && 'origenFondos',
      !identidad.propositoCuenta && 'propositoCuenta',
      identidad.pepDeclarado === null && 'pepDeclarado',
    ].filter(Boolean) as string[],
    // La diligencia es proporcional al volumen declarado: bajo el umbral de
    // reporte, el perfil completo es opcional. La app usa esto para no pedir
    // ocupación y origen de fondos a quien mueve poco.
    umbralDiligenciaUsd: UMBRAL_DILIGENCIA_USD,
    diligencia: (typeof identidad.volumenEsperadoUsd === 'number' &&
      identidad.volumenEsperadoUsd < UMBRAL_DILIGENCIA_USD) ? 'simplificada' as const : 'completa' as const,
    // Al usuario se le dice qué le falta, no el detalle del análisis interno.
    faltan: identidad.estado === 'verificada' ? 0 : pendientes,
    // Se deduce de lo hecho, no del estado: el estado es una etiqueta de
    // cumplimiento y el paso siguiente es una instrucción a la persona.
    siguientePaso:
      identidad.estado === 'verificada' ? 'Listo'
        : identidad.estado === 'rechazada' ? 'Verificación rechazada'
        : identidad.estado === 'suspendida' ? 'Identidad suspendida'
        : !hecho.documento ? 'Escanear el documento de identidad'
        : rostroPendiente ? 'Repetir la comprobación del rostro'
        : !hecho.rostro ? 'Hacer la prueba de vida con la cámara'
        : !hecho.datos ? 'Confirmar los datos leídos del documento'
        : 'En revisión',
    actualizadaEn: identidad.actualizadaEn,
  }
}

/**
 * Lo mismo, con el retrato de la credencial ya buscado en su almacén.
 *
 * Es lo que devuelven las rutas. Existe como función aparte, y no dentro de
 * `estadoParaUsuario`, porque leer el retrato es una consulta a otra colección
 * —o sea, asíncrona— y hay sitios que necesitan el estado sin esperar a nadie.
 *
 * Si el almacén del retrato no contesta, la identidad sale igual sin foto: que
 * una credencial se vea sin retrato es un defecto; que la app no pueda saber si
 * alguien está verificado porque una imagen no cargó es una avería.
 */
export async function estadoParaUsuarioConFoto(identidad: Identidad) {
  const base = estadoParaUsuario(identidad)
  try {
    const foto = await leerFoto(identidad.id)
    if (foto) base.fotoCredencial = `data:image/jpeg;base64,${foto}`
  } catch (e: any) {
    console.error('[fotoCredencial] no se pudo leer el retrato:', e?.message)
  }
  return base
}

// ─────────────────────────────────────────────────────────────────────────────
// Mudar una identidad a otro correo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cambia el correo con el que se encuentra una identidad.
 *
 * POR QUE HACE FALTA, Y POR QUE NO ESTABA
 *
 * Las identidades se buscan POR CORREO (`porEmail`), y el correo de una persona
 * cambia: se muda de trabajo, deja de usar una cuenta, o simplemente quiere
 * otra. Cuando eso pasa en la billetera y aqui no, el puente pregunta por el
 * correo nuevo, no encuentra nada, y CREA UNA IDENTIDAD VACIA. La persona abre
 * su aplicacion y ve que su verificacion desaparecio.
 *
 * Paso de verdad el 22-ago-2026, y no era un caso raro: es lo que ocurre
 * siempre que alguien cambia su correo de acceso. Faltaba la pieza.
 *
 * LAS GUARDIAS, QUE SON LO QUE HACE QUE ESTO NO SEA UNA PUERTA TRASERA
 *
 * Mover una identidad verificada a otro correo es, mirado de reojo, «coger la
 * verificacion de alguien y pegarla en la direccion que yo diga». Por eso:
 *
 *   1. El destino no puede tener una identidad CON VALOR. Si ya hay una
 *      verificada, o con GID, o con documento, se rechaza. Nunca se pisa nada.
 *   2. Lo unico que se admite en el destino es la cascara vacia que crea el
 *      propio puente al no encontrar nada: estado `iniciada`, sin GID y sin
 *      documento. Esa se descarta, porque es basura que generamos nosotros.
 *   3. Queda en la bitacora, con los dos correos y quien lo pidio. Un cambio de
 *      correo es lo primero que hace quien se apodera de una cuenta; sin rastro
 *      no hay forma de distinguirlo de una mudanza legitima.
 */
export function moverEmail(
  de: string,
  a: string,
  origen: string,
): { ok: true; identidad: Identidad; descartada: string | null } | { ok: false; motivo: string } {
  const viejo = String(de || '').toLowerCase().trim()
  const nuevo = String(a || '').toLowerCase().trim()

  if (!viejo || !nuevo) return { ok: false, motivo: 'Faltan los dos correos' }
  if (viejo === nuevo) return { ok: false, motivo: 'Son el mismo correo' }
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(nuevo)) {
    return { ok: false, motivo: 'El correo de destino no tiene forma de correo' }
  }

  const identidad = porEmail(viejo)
  if (!identidad) return { ok: false, motivo: `No hay identidad con ${viejo}` }

  let descartada: string | null = null
  const enDestino = porEmail(nuevo)
  if (enDestino) {
    const tieneValor =
      enDestino.estado !== 'iniciada' ||
      enDestino.gid !== null ||
      enDestino.documento !== null ||
      enDestino.nombreLegal !== null
    if (tieneValor) {
      return {
        ok: false,
        motivo: `${nuevo} ya tiene una identidad con datos (${enDestino.id}, ${enDestino.estado}). No se pisa.`,
      }
    }
    // La cascara vacia que creo el puente al no encontrar el correo nuevo.
    const lista = store.todo().identidades
    lista.splice(lista.indexOf(enDestino), 1)
    descartada = enDestino.id
    registrar(origen, 'identidad.descartadaVacia', enDestino.id, { email: nuevo })
  }

  identidad.email = nuevo
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(origen, 'identidad.emailMovido', identidad.id, { de: viejo, a: nuevo, descartada })

  return { ok: true, identidad, descartada }
}
