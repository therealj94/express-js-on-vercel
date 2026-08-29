/**
 * El documento OpenAPI de Genesis ID.
 *
 * ── POR QUE SE GENERA EN VEZ DE ESCRIBIRSE ──────────────────────────────────
 *
 * Un archivo `openapi.yaml` escrito a mano dura sano hasta el primer cambio de
 * ruta que nadie copie ahí. Después empieza a mentir, y una documentación que
 * miente es peor que no tener ninguna: sin documentación el integrador lee el
 * código o pregunta; con documentación falsa construye encima y lo descubre en
 * producción.
 *
 * Aquí las RUTAS y los ALCANCES se leen del enrutador de Express y del propio
 * `exigeApp`: si una ruta se añade, se quita o cambia de permiso, este
 * documento lo refleja el mismo día, sin que nadie se acuerde.
 *
 * Lo que sí se escribe a mano es lo que ninguna máquina puede sacar del código:
 * qué hace cada ruta, por qué, y qué NO hace. Eso vive en `TEXTOS`. Y una
 * prueba comprueba las dos direcciones —ninguna ruta sin texto, ningún texto
 * sin ruta— para que la parte escrita tampoco pueda separarse de la real.
 *
 * ── POR QUE OPENAPI 3.1 ─────────────────────────────────────────────────────
 *
 * Por los `webhooks`, que son un campo de primer nivel desde la 3.1. En 3.0 los
 * avisos había que documentarlos con un `callbacks` colgado de alguna ruta o,
 * lo más común, en un párrafo de prosa: en los dos casos las herramientas no se
 * enteran y el integrador no puede generar el cliente que los recibe.
 */

import type { Router } from 'express'
import { EVENTOS } from '../enganches/enganches.js'

/** Lo que se sabe de una ruta con solo mirar el enrutador. */
export interface RutaViva {
  metodo: string
  /** Con `:id`, como lo escribe Express. */
  camino: string
  alcances: string[]
}

/** Lee las rutas de un enrutador de Express, con sus alcances. */
export function rutasDe(router: Router, prefijo: string): RutaViva[] {
  const salida: RutaViva[] = []
  for (const capa of (router as any).stack || []) {
    if (!capa.route) continue
    /* El alcance sale del middleware, no de una lista paralela. Ver
       `exigeApp`. Una ruta sin `exigeApp` es una ruta ABIERTA, y aparece con
       los alcances vacíos: eso se ve en el documento, que es donde tiene que
       verse. */
    const alcances: string[] = []
    for (const c of capa.route.stack || []) {
      for (const a of (c.handle as any)?.alcances || []) alcances.push(a)
    }
    for (const metodo of Object.keys(capa.route.methods)) {
      salida.push({ metodo: metodo.toUpperCase(), camino: prefijo + capa.route.path, alcances })
    }
  }
  return salida
}

const s = (tipo: string, descripcion?: string) => ({ type: tipo, ...(descripcion ? { description: descripcion } : {}) })

type Texto = {
  resumen: string
  descripcion?: string
  /** Cuerpo de la petición, como propiedades de un objeto. */
  cuerpo?: Record<string, unknown>
  obligatorios?: string[]
  /** Lo que devuelve un 200, en prosa corta. */
  devuelve?: string
  /** Códigos distintos de 200 que el integrador tiene que manejar. */
  errores?: Record<string, string>
}

/**
 * Lo que ninguna máquina puede leer del código.
 *
 * La clave es `MÉTODO camino`, exactamente como sale del enrutador.
 */
const TEXTOS: Record<string, Texto> = {
  'POST /api/v1/identidades': {
    resumen: 'Iniciar o retomar una identidad',
    descripcion:
      'Devuelve la identidad que ya exista para ese correo, o crea una nueva. Es '
      + 'idempotente por correo: llamarlo dos veces no crea dos expedientes.\n\n'
      + 'La aplicación que llama queda anotada como origen, y es a quien se le mandan '
      + 'los avisos cuando la identidad se decida.',
    cuerpo: { email: s('string', 'Correo ya autenticado por su aplicación') },
    obligatorios: ['email'],
    devuelve: '`{ identidad }` con el estado y los pasos que faltan.',
    errores: { '400': 'Correo ausente o mal formado' },
  },
  'POST /api/v1/identidades/:id/datos': {
    resumen: 'Declarar los datos de la persona',
    descripcion:
      'Lo que la persona dice de sí misma, antes de contrastarlo con el documento.\n\n'
      + 'Los cuatro campos de cumplimiento —ocupación, origen de fondos, propósito y '
      + 'volumen esperado— no son burocracia: son el único patrón contra el que se '
      + 'puede comparar después un movimiento. Sin ellos, cualquier cifra parece '
      + 'normal o parece sospechosa según quien la mire.',
    cuerpo: {
      nombreCompleto: s('string'), fechaNacimiento: s('string', 'AAAA-MM-DD'),
      paisResidencia: s('string', 'ISO 3166-1 alfa-2'), telefono: s('string'),
      direccion: s('string'), ocupacion: s('string'), origenFondos: s('string'),
      propositoCuenta: s('string'), volumenEsperadoUsd: s('number'),
      pepDeclarado: s('boolean', 'Si tiene o tuvo un cargo público, o un allegado que lo tenga'),
    },
    devuelve: '`{ identidad }` con el estado actualizado.',
    errores: { '404': 'Identidad no encontrada' },
  },
  'POST /api/v1/identidades/:id/documento': {
    resumen: 'Adjuntar el documento por su zona mecánica (MRZ)',
    descripcion:
      'Se pide la MRZ **ya leída**, no la imagen: el reconocimiento óptico se hace en '
      + 'el teléfono, así la foto del documento no viaja ni se almacena aquí. Es menos '
      + 'dato personal en riesgo por cada persona.\n\n'
      + 'La respuesta dice si el documento sirve y qué falla, pero **nunca** el '
      + 'resultado del tamizado de sanciones: avisar al interesado de que saltó una '
      + 'coincidencia es justo lo que no se debe hacer.',
    cuerpo: {
      mrz: s('string', 'Las dos o tres líneas de la zona mecánica'),
      textoAnverso: s('string', 'Texto del anverso, si lo hay. Se recorta a 4000 caracteres'),
    },
    obligatorios: ['mrz'],
    devuelve: '`{ identidad, documento: { aceptable, anverso, problemas[] } }`',
    errores: { '400': 'Falta la MRZ', '404': 'Identidad no encontrada' },
  },
  'POST /api/v1/identidades/:id/documento-fotos': {
    resumen: 'Adjuntar el documento como dos fotos',
    descripcion:
      'Para quien se verifica desde un navegador, donde no hay lector de zona '
      + 'mecánica. Las lee un operador.\n\n'
      + '**Cuidado al leer la respuesta:** viene `aceptable: false` porque nadie lo ha '
      + 'mirado todavía, no porque el documento se haya rechazado. Léalo junto a '
      + '`via: "fotos"`, nunca solo.\n\n'
      + 'Tope de 3 MB de base64 por cara (unos 2,2 MB de imagen).',
    cuerpo: {
      anverso: s('string', 'data:image/jpeg;base64,…'),
      reverso: s('string', 'data:image/jpeg;base64,…'),
    },
    obligatorios: ['anverso', 'reverso'],
    devuelve: '`{ identidad, documento: { via: "fotos", aceptable: false } }`',
    errores: { '400': 'Falta alguna cara, o no es una imagen', '413': 'Alguna cara pesa de más' },
  },
  'POST /api/v1/identidades/:id/vivacidad': {
    resumen: 'Pedir un reto de prueba de vida',
    descripcion:
      'Devuelve una secuencia de gestos, distinta cada vez. Es lo que impide responder '
      + 'con un vídeo preparado de antemano. La aplicación la muestra gesto a gesto y '
      + 'graba un fotograma por cada uno.',
    devuelve: '`{ reto }` con la secuencia y su identificador.',
    errores: {
      '404': 'Identidad no encontrada',
      '503': 'No hay proveedor de biometría configurado. El cotejo lo resolverá un operador',
    },
  },
  'POST /api/v1/identidades/:id/biometria': {
    resumen: 'Enviar el rostro',
    descripcion:
      'Dos formas, y la primera es la buena:\n\n'
      + '- `{ reto, fotogramas[], fotoDocumento }` — con prueba de vida.\n'
      + '- `{ selfie, fotoDocumento }` — sin ella. **Nunca aprueba sola**: queda en '
      + 'revisión de un operador.\n\n'
      + 'La puntuación de parecido no se devuelve: es un número que ayuda a afinar un '
      + 'intento de suplantación. El detalle de la vivacidad sí, porque es lo que '
      + 'permite decirle a la persona qué gesto repetir.',
    cuerpo: {
      reto: s('string'), fotogramas: { type: 'array', items: s('string'), description: 'Uno por gesto' },
      selfie: s('string'), fotoDocumento: s('string'),
    },
    devuelve: '`{ identidad, biometria: { estado, motivo, vivacidad, gestos[] } }`',
    errores: { '400': 'Falta el selfie o los fotogramas del reto', '404': 'Identidad no encontrada' },
  },
  'POST /api/v1/identidades/:id/foto': {
    resumen: 'Guardar la foto de la credencial',
    descripcion:
      'El retrato que la persona elige y que viaja con su GID a todas las aplicaciones '
      + 'del ecosistema. A diferencia del documento y del fotograma del cotejo —que '
      + 'caducan a los cinco años de la decisión— este no caduca: es la credencial, y '
      + 'una credencial que se borra sola deja de serlo.',
    cuerpo: { foto: s('string', 'data:image/jpeg;base64,…') },
    obligatorios: ['foto'],
    devuelve: '`{ ok: true, identidad }`',
    errores: {
      '400': 'La foto no vale', '413': 'Pesa de más',
      '503': 'No se pudo guardar ahora mismo — reintente; no es culpa de la foto',
    },
  },
  'GET /api/v1/identidades/:id': {
    resumen: 'Estado de una identidad',
    devuelve: '`{ identidad }` con el estado, los pasos que faltan y la foto de credencial.',
    errores: { '404': 'Identidad no encontrada' },
  },
  'GET /api/v1/identidades/por-email/:email': {
    resumen: 'Buscar una identidad por correo',
    descripcion: 'El correo va en la ruta y hay que codificarlo (`encodeURIComponent`).',
    devuelve: '`{ identidad }`, igual que la consulta por identificador.',
    errores: { '404': 'Identidad no encontrada' },
  },
  'POST /api/v1/identidades/mover-email': {
    resumen: 'Mudar una identidad al correo nuevo de esa persona',
    descripcion:
      'Las identidades se encuentran por correo, y el correo de la gente cambia. Si '
      + 'cambia en su aplicación y aquí no, la siguiente consulta no halla nada y se '
      + 'crea una identidad vacía: la persona abre su aplicación y ve que su '
      + 'verificación desapareció.\n\n'
      + 'No pisa nada que tenga valor. Si en el destino hay una identidad verificada, '
      + 'con GID o con documento, se rechaza con 409. Lo único que se descarta es la '
      + 'cáscara vacía.\n\n'
      + 'Queda en la bitácora con los dos correos: cambiar el correo es lo primero que '
      + 'hace quien se apodera de una cuenta.',
    cuerpo: { de: s('string', 'Correo actual'), a: s('string', 'Correo nuevo') },
    obligatorios: ['de', 'a'],
    devuelve: '`{ identidad, descartada }`',
    errores: { '409': 'No se puede mover: en el destino hay algo con valor' },
  },
  'GET /api/v1/identidades/por-gid/:gid': {
    resumen: 'La identidad detrás de un GID, con su correo',
    descripcion:
      'Para enlazar cuentas. Una aplicación que recibe a alguien por inicio de sesión '
      + 'único solo conoce su GID, pero las cuentas del ecosistema se enlazan por '
      + 'correo ya verificado: es lo que hace que quien se registró con contraseña y '
      + 'después entra por SSO caiga en su misma cuenta y no estrene una segunda.',
    devuelve: '`{ identidad }` con el correo, el nombre legal y la nacionalidad.',
    errores: { '400': 'GID mal formado (falla el dígito verificador)', '404': 'No encontrado' },
  },
  'POST /api/v1/vinculos': {
    resumen: 'Atar una cuenta de su aplicación a un GID',
    descripcion:
      'Es la base del inicio de sesión único, y por eso hay que ganárselo: **tiene que '
      + 'mandar el correo de la persona y tiene que ser el de la identidad**. Sin ese '
      + 'candado, una clave de API comprometida alcanzaría para suplantar a cualquier '
      + 'verificado del ecosistema.',
    cuerpo: {
      gid: s('string'), cuenta: s('string', 'El identificador de esa persona dentro de su aplicación'),
      email: s('string', 'El correo que su aplicación ya autenticó'),
      direccion: s('string', 'Dirección on-chain, si la tiene'),
    },
    obligatorios: ['gid', 'cuenta', 'email'],
    devuelve: '`{ ok: true }`',
    errores: { '403': 'El correo no es el de esa identidad' },
  },
  'GET /api/v1/gid/:gid': {
    resumen: '¿Este GID está verificado?',
    descripcion:
      'Devuelve lo mínimo: sí o no. Con el alcance `gid.perfil` añade el perfil '
      + 'público; sin él, solo el sí o el no. Un explorador de bloques no necesita '
      + 'saber el nombre ni la nacionalidad de nadie.\n\n'
      + 'Sirve igual para GID de persona y de negocio: el campo `tipo` los distingue.',
    devuelve: '`{ tipo, gid, verificada }` y, con `gid.perfil`, el perfil público.',
    errores: { '400': 'GID mal formado', '404': 'GID no encontrado' },
  },
  'GET /api/v1/direccion/:direccion': {
    resumen: '¿Hay identidad verificada detrás de esta dirección on-chain?',
    devuelve: '`{ verificada, gid }`. Nunca 404: una dirección desconocida devuelve `false`.',
  },
  'GET /api/v1/tamiz/direccion/:direccion': {
    resumen: 'Tamizar una dirección contra listas de sanciones',
    descripcion:
      '**Lea `tamizado` antes que `sancionada`.** Si no hay listas cargadas, `tamizado` '
      + 'viene en `false` y `sancionada` también — y ese `false` no quiere decir «está '
      + 'limpia», quiere decir «no se miró». Viene además un `aviso` en texto.',
    devuelve: '`{ tamizado, sancionada, aviso?, ficha }`',
  },
  'POST /api/v1/sso/token': {
    resumen: 'Emitir un token de inicio de sesión único',
    descripcion:
      'Para que la persona entre en otra aplicación del ecosistema sin repetir el KYC.\n\n'
      + '**Modelo de confianza:** su aplicación ya autenticó a la persona y responde por '
      + 'ello con su clave de API. Genesis ID comprueba que esa cuenta esté atada a ese '
      + 'GID, pero no vuelve a autenticar a nadie. Es un modelo de cliente de confianza, '
      + 'válido entre aplicaciones del mismo ecosistema; no lo sería para terceros.',
    cuerpo: { gid: s('string'), cuenta: s('string') },
    obligatorios: ['gid', 'cuenta'],
    devuelve: '`{ token, expiraEn }`',
    errores: {
      '403': 'El GID no está verificado, o esa cuenta no está atada a él en su aplicación',
      '503': 'El SSO no está configurado en este despliegue',
    },
  },
  'POST /api/v1/sso/verificar': {
    resumen: 'Canjear un token de inicio de sesión único',
    cuerpo: { token: s('string') },
    obligatorios: ['token'],
    devuelve: '`{ gid, cuenta, app }` y, con `gid.perfil`, el perfil público.',
    errores: { '401': 'Token inválido o vencido' },
  },
  'POST /api/v1/credenciales': {
    resumen: 'Emitir la credencial que se lleva la persona',
    descripcion:
      'Devuelve un documento firmado que la persona guarda y enseña. Quien lo recibe lo '
      + 'comprueba **sin llamarnos**: la firma es `personal_sign` (EIP-191, secp256k1), '
      + 'así que `ethers.verifyMessage(mensaje, firma)` la verifica y devuelve una '
      + 'dirección — la del emisor, que Genesis ID publica en la cadena 5550.\n\n'
      + 'Eso quita tres cosas de golpe: que nos enteremos de cada sitio donde esa persona '
      + 'se identifica, que una caída nuestra deje a nadie sin poder identificarse, y que '
      + 'haya que integrarse con nosotros para aceptar identidades de Orden Global.\n\n'
      + '**Pida solo los atributos que necesite.** `verificada` va siempre; el resto solo '
      + 'si se piden. Una credencial que lleva todo lo que se sabe «por si acaso» es un '
      + 'documento que la persona enseña sin saber qué está enseñando. En particular, '
      + '`mayorDeEdad` sale como un sí o un no y **no revela la fecha de nacimiento**.\n\n'
      + '**El candado es el mismo que el de `/sso/token`:** la cuenta tiene que estar '
      + 'atada a ese GID en su aplicación. Y con más motivo — un token se retira, una '
      + 'credencial ya emitida no.\n\n'
      + '**Vence.** 90 días por defecto, 365 como máximo. El vencimiento es el único '
      + 'mecanismo de revocación que funciona sin conexión, y por eso los plazos son '
      + 'cortos. La lista de revocadas se publica aparte, en la cadena.',
    cuerpo: {
      gid: s('string'),
      cuenta: s('string', 'La cuenta de esa persona en su aplicación, ya vinculada'),
      atributos: {
        type: 'array', items: { type: 'string' },
        description: 'mayorDeEdad · nacionalidad · nombre · nivelRiesgo. '
          + '`verificada` va siempre y no hace falta pedirlo',
      },
      dias: s('number', 'Vigencia. Entre 1 y 365; 90 por defecto'),
    },
    obligatorios: ['gid', 'cuenta'],
    devuelve:
      '`{ mensaje, firma, emisor, credencial, comoSeComprueba }`. Guarde y entregue '
      + '`mensaje` **tal cual**: si se vuelve a serializar, la firma deja de cuadrar.',
    errores: {
      '403': 'Esa cuenta no está atada a ese GID en su aplicación',
      '404': 'GID no encontrado',
      '503': 'La emisión de credenciales no está configurada en este despliegue',
    },
  },
  'POST /api/v1/negocios': {
    resumen: 'Abrir un expediente de empresa (KYB)',
    descripcion:
      'El dueño tiene que tener antes su identidad personal en Genesis ID, aunque sea '
      + 'iniciada: sin persona detrás no hay a quién atribuir la responsabilidad.',
    cuerpo: {
      emailDueno: s('string'), razonSocial: s('string'), nombreComercial: s('string'),
      identificadorFiscal: s('string', 'Se valida según el país'), categoria: s('string'),
      pais: s('string', 'ISO 3166-1 alfa-2'), ciudad: s('string'), direccion: s('string'),
      sitioWeb: s('string'),
    },
    obligatorios: ['emailDueno', 'razonSocial', 'nombreComercial', 'identificadorFiscal',
                   'categoria', 'pais', 'ciudad', 'direccion'],
    devuelve: '`{ negocio, id, documentosPendientes[] }`',
    errores: { '400': 'Faltan campos, el identificador fiscal no vale, o ya hay un expediente igual' },
  },
  'POST /api/v1/negocios/:id/beneficiarios': {
    resumen: 'Declarar un beneficiario final',
    cuerpo: {
      nombreCompleto: s('string'), porcentaje: s('number'), via: s('string'),
      fechaNacimiento: s('string'), nacionalidad: s('string'), gid: s('string'),
    },
    obligatorios: ['nombreCompleto', 'porcentaje'],
    devuelve: '`{ ok: true, pendientes[] }` — lo que todavía bloquea la aprobación.',
  },
  'GET /api/v1/negocios/:id': {
    resumen: 'Estado de un expediente de empresa',
    devuelve: '`{ negocio, documentosPendientes[], pendientes[] }`',
    errores: { '404': 'Negocio no encontrado' },
  },
  'POST /api/v1/movimientos': {
    resumen: 'Mandar movimientos para el monitoreo AML',
    descripcion:
      '**La respuesta no dice si saltó una alerta, y no va a decirlo.** Que la persona '
      + 'sepa que disparó una regla de monitoreo le enseña a esquivarla, y en muchas '
      + 'jurisdicciones avisarle está expresamente prohibido.\n\n'
      + 'Los movimientos sin `id` o sin `montoUsd` numérico se descartan en silencio; '
      + '`recibidos` dice cuántos entraron de verdad.',
    cuerpo: {
      gid: s('string'),
      movimientos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: s('string', 'Suyo, para no duplicar'),
            direccion: s('string', '"entrada" o "salida"'),
            contraparte: s('string'), monto: s('number'), activo: s('string'),
            montoUsd: s('number'), fecha: s('string', 'ISO 8601'),
            paisContraparte: s('string'), hash: s('string'),
          },
        },
      },
    },
    obligatorios: ['gid', 'movimientos'],
    devuelve: '`{ ok: true, recibidos }`',
  },
  'POST /api/v1/directorio/confirmar': {
    resumen: 'Confirmar una persona del directorio con su sesión',
    descripcion:
      'Se autentica con la **clave pública de telemetría** (`X-Telemetria-Key`), no con '
      + 'la clave de API: va dentro de la aplicación, que se puede descomprimir, así que '
      + 'no es un secreto y no se trata como tal.',
    cuerpo: { token: s('string'), email: s('string'), nombre: s('string'),
              direccionWallet: s('string'), pais: s('string') },
    obligatorios: ['token'],
    devuelve: '`{ ok: true }` con la persona ya confirmada en el directorio.',
    errores: {
      '400': 'No hay forma de verificar sesiones de esa aplicación',
      '401': 'Clave de telemetría inválida o revocada',
    },
  },
  'POST /api/v1/directorio/sincronizar': {
    resumen: 'Sincronizar un lote de usuarios al directorio',
    cuerpo: { usuarios: { type: 'array', items: { type: 'object' } } },
    obligatorios: ['usuarios'],
    devuelve: '`{ ok: true, ... }` con el recuento de lo que entró.',
  },
}

/** Los caminos que la prueba de deriva compara. Exportado para poder cotejar. */
export const CAMINOS_DOCUMENTADOS = Object.keys(TEXTOS)

const aOpenApi = (camino: string) => camino.replace(/:(\w+)/g, '{$1}')

function parametros(camino: string) {
  const nombres = [...camino.matchAll(/:(\w+)/g)].map((m) => m[1])
  return nombres.map((n) => ({
    name: n, in: 'path', required: true, schema: { type: 'string' },
    description: n === 'gid' ? 'GID de Orden Global (con dígito verificador)'
      : n === 'email' ? 'Correo, codificado para la URL'
      : n === 'direccion' ? 'Dirección on-chain'
      : 'Identificador',
  }))
}

/**
 * Arma el documento.
 *
 * `rutas` entra por parámetro y no se importa aquí para que esta pieza no
 * arrastre medio servidor cuando se prueba.
 */
export function construirOpenApi(rutas: RutaViva[], servidor: string) {
  const paths: Record<string, any> = {}

  for (const r of rutas) {
    const clave = `${r.metodo} ${r.camino}`
    const t = TEXTOS[clave]
    const camino = aOpenApi(r.camino)
    paths[camino] = paths[camino] || {}

    const respuestas: Record<string, any> = {
      '200': { description: t?.devuelve || 'Correcto' },
      '401': { description: 'Clave de API ausente, inválida o revocada' },
      '429': { description: 'Demasiadas peticiones' },
    }
    if (r.alcances.length) {
      respuestas['403'] = { description: `Su aplicación no tiene el alcance ${r.alcances.join(', ')}` }
    }
    for (const [codigo, texto] of Object.entries(t?.errores || {})) {
      respuestas[codigo] = { description: texto }
    }

    paths[camino][r.metodo.toLowerCase()] = {
      summary: t?.resumen || `⚠ SIN DOCUMENTAR — ${clave}`,
      description: t?.descripcion,
      operationId: `${r.metodo.toLowerCase()}_${r.camino.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}`,
      tags: [r.camino.split('/')[3] || 'general'],
      /* Los alcances salen del middleware. Ver la cabecera del archivo. */
      security: [{ claveDeApi: r.alcances }],
      parameters: parametros(r.camino),
      ...(t?.cuerpo
        ? {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: t.cuerpo,
                    ...(t.obligatorios ? { required: t.obligatorios } : {}),
                  },
                },
              },
            },
          }
        : {}),
      responses: respuestas,
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Genesis ID',
      version: '2',
      summary: 'Identidad verificada, KYB y monitoreo para el ecosistema Orden Global.',
      description:
        'Toda ruta pide una clave de API en la cabecera `X-API-Key`, y solo hace lo que '
        + 'los alcances de esa clave permitan.\n\n'
        + '**Lo que una aplicación NO puede hacer:** verificar a nadie. Lo máximo que '
        + 'consigue esta API es dejar una identidad lista para que un operador decida. '
        + 'Un GID verificado solo lo emite una persona, desde el panel, y queda escrito '
        + 'en la bitácora con su nombre y su motivo.\n\n'
        + '**Cómo enterarse del resultado:** no sondee. Configure un enganche (webhook) '
        + 'y le llega el aviso firmado en cuanto se decide. Ver la sección `webhooks`.\n\n'
        + '**La bitácora de auditoría se ancla a diario en la cadena 5550** y se puede '
        + 'comprobar sin pedirnos nada: `/comprobar`.',
      contact: { name: 'Orden Global', url: 'https://genesisid.online' },
    },
    servers: [{ url: servidor }],
    tags: [
      { name: 'identidades', description: 'Alta y verificación de personas (KYC)' },
      { name: 'gid', description: 'Consultar un GID ya emitido' },
      { name: 'negocios', description: 'Expedientes de empresa (KYB)' },
      { name: 'sso', description: 'Inicio de sesión único del ecosistema' },
      { name: 'movimientos', description: 'Monitoreo de transacciones (AML)' },
      { name: 'vinculos', description: 'Atar cuentas de su aplicación a un GID' },
      { name: 'credenciales', description: 'La credencial que se lleva la persona' },
      { name: 'tamiz', description: 'Listas de sanciones' },
      { name: 'directorio', description: 'Directorio de personas del ecosistema' },
    ],
    paths,

    /**
     * Los avisos. Campo de primer nivel: es lo que la 3.1 trajo y la razón de
     * usar 3.1 y no 3.0.
     */
    webhooks: Object.fromEntries(EVENTOS.map((evento) => [evento, {
      post: {
        summary: `Aviso: ${evento}`,
        description:
          'Genesis ID lo manda a la dirección que usted configure, en cuanto pasa.\n\n'
          + '**Compruebe la firma antes de creerse nada.** La cabecera `X-Genesis-Firma` '
          + 'trae `t=<segundos>,v1=<hmac>`, donde el HMAC-SHA256 se calcula sobre '
          + '`` `${t}.${cuerpoCrudo}` `` con el secreto que se le entregó al configurar '
          + 'el enganche. Compare en tiempo constante y **rechace lo que traiga una `t` '
          + 'de hace más de cinco minutos**: sin esa comprobación, un aviso legítimo '
          + 'capturado una vez se puede reenviar para siempre.\n\n'
          + '**Puede llegar repetido.** Si su servidor tarda o falla, se reintenta seis '
          + 'veces en unas siete horas. Use `entregaId` para ignorar los que ya procesó.\n\n'
          + '**Conteste 2xx rápido.** Cualquier otra cosa cuenta como fallo. Si tiene '
          + 'trabajo que hacer, encólelo usted y conteste antes.\n\n'
          + '**No trae datos personales.** Identificador, GID, estado y fecha. Si '
          + 'necesita el detalle, pídalo con su clave por la API.',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  evento: { type: 'string', const: evento },
                  entregaId: s('string', 'Único por envío. Úselo para no procesar dos veces'),
                  fecha: s('string', 'ISO 8601'),
                  datos: {
                    type: 'object',
                    properties: {
                      identidad: s('string'), gid: s('string'), estado: s('string'),
                      motivo: s('string'),
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '2XX': { description: 'Recibido. Cualquier otra cosa se reintenta.' },
        },
      },
    }])),

    components: {
      securitySchemes: {
        claveDeApi: {
          type: 'apiKey', in: 'header', name: 'X-API-Key',
          description:
            'La clave se entrega una sola vez, al crear la aplicación, y no se puede '
            + 'volver a ver: de ella solo se guarda el hash. Si se pierde, se rota.',
        },
      },
    },
  }
}
