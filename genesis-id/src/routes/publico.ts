/**
 * Lo único de Genesis ID que se sirve sin pedir nada a cambio.
 *
 * ── QUE HACE AQUI UNA RUTA PUBLICA EN UN PRODUCTO DE CUMPLIMIENTO ───────────
 *
 * Toda la garantía de la bitácora terminaba, hasta ahora, en nuestra palabra.
 * Está encadenada, está firmada, se verifica sola — pero todo eso lo dice el
 * mismo servicio que guarda los datos, y a un regulador o a un banco
 * corresponsal eso les vale exactamente lo que les valga nuestra credibilidad.
 *
 * El ancla en la cadena 5550 cambia eso, pero solo si alguien de fuera PUEDE
 * MIRARLA. Un ancla que hay que pedirnos por correo no es una prueba: es otra
 * vez nuestra palabra, con más pasos.
 *
 * Así que esto publica los PUNTEROS —qué día, cuántos asientos, qué hash, y en
 * qué transacción quedó escrito— y nada más. La prueba no está aquí. Está en la
 * cadena, y quien quiera comprobarla la lee del nodo directamente, sin pasar
 * por este servicio.
 *
 * ── LO QUE ESTA LISTA NO PUEDE HACER, Y SE DICE EN VOZ ALTA ─────────────────
 *
 * Podríamos OMITIR un ancla de esta lista. Es la única manipulación que queda
 * en pie, y no se tapa con más código nuestro: se tapa enumerando las
 * transacciones de la dirección del ancla en el explorador, que las lista
 * todas, las hayamos puesto aquí o no. Por eso se publica también la
 * DIRECCION: es lo que hace que esta lista sea comprobable en vez de creíble.
 *
 * ── LO QUE NO SE PUBLICA ────────────────────────────────────────────────────
 *
 * Ningún asiento, ningún nombre, ninguna identidad. Un hash y una cuenta de
 * asientos no dicen quién se verificó ni cuándo; dicen que el registro no se
 * cortó. Es justo lo que hay que poder demostrar y justo lo que no hace falta
 * enseñar.
 */

import { Router } from 'express'
import { store } from '../store.js'
import { direccionDelAncla, renglonAncla, estadoAncla } from '../audit/ancla.js'
import { construirOpenApi, rutasDe } from '../api/openapi.js'
import { direccionDelEmisor } from '../credencial/credencial.js'
import { appsRouter } from './apps.js'
import { directorioAppsRouter } from './directorio.js'

export const publicoRouter = Router()

/* Sin caché: alguien que comprueba un ancla necesita la lista de ahora, no la
   que un intermediario guardó hace una hora. */
publicoRouter.use((_req, res, siguiente) => {
  res.setHeader('Cache-Control', 'no-store')
  siguiente()
})

/**
 * El documento OpenAPI.
 *
 * Va en lo público y sin clave a propósito: quien está decidiendo si integrar
 * Genesis ID todavía no tiene clave, y pedirle una para leer la documentación
 * es pedirle que se comprometa antes de saber qué le ofrecen.
 */
publicoRouter.get('/openapi.json', (req, res) => {
  const servidor = `${req.protocol}://${req.get('host')}`
  res.json(construirOpenApi(
    [...rutasDe(appsRouter, '/api/v1'), ...rutasDe(directorioAppsRouter, '/api/v1/directorio')],
    servidor))
})

publicoRouter.get('/anclas', (_req, res) => {
  const anclas = store.todo().anclas
  const conCadena = anclas.filter((a) => a.tx)

  res.json({
    que: 'Anclas de la bitácora de auditoría de Genesis ID.',
    comoSeComprueba:
      'Cada ancla con `tx` está escrita en la cadena. Pida al nodo '
      + '`eth_getTransactionByHash` con ese hash, pase el campo `input` de '
      + 'hexadecimal a texto y compare el renglón con el de aquí. Si no coinciden, '
      + 'el bueno es el de la cadena.',
    /* La dirección es pública por definición: sin ella no se pueden enumerar
       las anclas por fuera de esta lista, que es lo único que la hace algo más
       que una promesa. La LLAVE no sale de aquí ni entera ni en trozos. */
    direccion: direccionDelAncla(),
    cadenaId: Number(process.env.GENESIS_CADENA_ID || 5550),
    rpc: process.env.GENESIS_ANCLA_RPC?.trim()
      || process.env.GENESIS_RPC_URL?.trim()
      || 'https://rpc.ordenglobal-rpc.com/',
    formato: 'GENESIS-ID/ANCLA/1 <fecha ISO> n=<asientos> h=<hash> integra=<0|1>',
    total: anclas.length,
    enLaCadena: conCadena.length,
    /* Las que no llegaron a la cadena se publican IGUAL, marcadas. Esconder un
       día en que el ancla falló sería exactamente la clase de silencio contra
       la que existe todo esto. */
    anclas: anclas.map((a) => ({
      ...a,
      renglon: renglonAncla(a),
      enLaCadena: Boolean(a.tx),
    })).reverse(),
    atrasada: estadoAncla().atrasada,
  })
})

/**
 * Todo lo que hace falta para comprobar una credencial.
 *
 * Y con una advertencia que va delante de los datos, no debajo: **esto también
 * lo decimos nosotros**. Si alguien se conforma con leer de aquí la dirección
 * del emisor, no ha comprobado nada — solo ha cambiado «confiar en la firma»
 * por «confiar en esta respuesta». La dirección buena es la que está escrita en
 * la cadena, y por eso se da la transacción exacta donde leerla.
 */
publicoRouter.get('/emisor', (_req, res) => {
  const publicado = store.todo().publicado || {}
  const revocadas = store.todo().identidades
    .filter((i) => i.gid && i.estado !== 'verificada')
    .map((i) => i.gid!)
    .sort()

  res.json({
    ojo:
      'Esta respuesta la damos nosotros. Para comprobar de verdad, lea la dirección '
      + 'del emisor de la transacción `emisor.tx` en la cadena, no de aquí.',
    algoritmo: 'secp256k1-keccak-eip191 — lo mismo que `personal_sign`',
    comoSeComprueba:
      'ethers.verifyMessage(mensaje, firma) devuelve una dirección. Tiene que ser '
      + 'igual a la del emisor publicada en la cadena. Después mire `expiraEn` y la '
      + 'lista de revocadas.',
    emisor: publicado.emisor
      ? { ...publicado.emisor, enLaCadena: true }
      : {
          direccion: direccionDelEmisor(),
          enLaCadena: false,
          ojo: 'Todavía no está publicado en la cadena: comprobar una credencial '
            + 'exige, hoy, confiar en este servicio.',
        },
    cadenaId: Number(process.env.GENESIS_CADENA_ID || 5550),
    revocadas: {
      /* La lista va entera y no un hash: con un hash habría que pedírnosla para
         saber si un GID está dentro, y volveríamos al problema que la credencial
         vino a quitar. */
      gids: revocadas,
      n: revocadas.length,
      enLaCadena: publicado.revocadas || null,
      ojo: 'Entre que se suspende a alguien y que la lista se publica en la cadena '
        + 'hay una ventana de horas. Es real y por eso se dice aquí.',
    },
    pagina: '/credencial',
  })
})

/**
 * Cómo rehacer los hashes por su cuenta.
 *
 * Va aquí y no en un PDF porque un procedimiento de verificación que vive en un
 * documento adjunto se queda viejo el día que alguien toca el código. Servido
 * desde el mismo sitio que lo implementa, no puede desfasarse en silencio.
 */
publicoRouter.get('/bitacora/como-se-comprueba', (_req, res) => {
  res.json({
    eslabon: 'sha256(hashAnterior + JSON.stringify({fecha, actor, accion, objeto, detalle}))',
    ordenDeLasClaves: ['fecha', 'actor', 'accion', 'objeto', 'detalle'],
    primerHashAnterior: '0'.repeat(64),
    nota:
      'El orden de las claves importa: `JSON.stringify` respeta el orden de '
      + 'inserción y el hash cambia si se reordenan. El campo `firma` NO entra en '
      + 'el hash — es un HMAC del hash, no parte de él.',
    firma: 'HMAC-SHA256(hash) con una llave que no sale del servicio. '
      + 'Sin ella no se puede comprobar la firma desde fuera; el encadenado sí.',
    anclas: '/api/publico/anclas',
    pagina: '/comprobar.html',
  })
})
