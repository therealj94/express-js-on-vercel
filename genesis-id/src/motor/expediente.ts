/**
 * El expediente completo de una persona, para el derecho de acceso.
 *
 * POR QUE EXISTE
 *
 * Cualquiera puede pedir que se le diga qué se tiene sobre ella. Hasta ahora se
 * atendía a mano: un operador entraba a cinco pantallas distintas, copiaba
 * trozos y armaba un correo. Eso tiene dos problemas y ninguno es la comodidad.
 *
 * El primero es que a mano se olvida algo. Los datos de una persona no viven en
 * un sitio: están en el expediente, en el padrón de cada aplicación, en los
 * movimientos vigilados, en los casos de cumplimiento y en la bitácora. Quien
 * arme eso de memoria va a dejarse uno, y una entrega incompleta ante un
 * regulador es peor que no haberla hecho.
 *
 * El segundo es que sacar el expediente completo de una persona ES un
 * acontecimiento que hay que poder auditar. Hecho a mano no queda registrado en
 * ninguna parte. Hecho por esta función, sí.
 *
 * LO QUE NO HACE, Y ES A PROPOSITO
 *
 * No mete las imágenes dentro. Un anverso, un reverso y un rostro en base64 son
 * megabytes que convertirían esto en algo que no se puede ni abrir ni mandar por
 * correo. Se dice CUALES hay, y el operador las descarga del panel como ya hacía.
 *
 * No es un borrado ni lo prepara. Es lo contrario: es enseñar.
 */

import { store } from '../store.js'
import { registrar, consultar } from '../audit/bitacora.js'
import { leerFotos } from '../kyc/fotosDocumento.js'
import { leerFoto } from '../kyc/fotoCredencial.js'
import { movimientosDe } from '../aml/almacenMovimientos.js'
import { fichaPorEmail } from '../directorio/padron.js'

/**
 * Reúne todo lo que el sistema tiene sobre una persona.
 *
 * `actor` es quien lo pide, y queda escrito en la bitácora. No es opcional.
 */
export async function expedienteCompleto(identidadId: string, actor: string): Promise<{
  ok: boolean
  error?: string
  expediente?: Record<string, unknown>
}> {
  const datos = store.todo()
  const identidad = datos.identidades.find((i) => i.id === identidadId)
  if (!identidad) return { ok: false, error: 'No existe esa identidad' }

  const correo = identidad.email
  const gid = identidad.gid || null

  /* La bitácora se filtra por lo que IDENTIFICA a la persona, no por texto
     libre: buscar su nombre traería entradas de homónimos y de operadores que
     se llamen igual, y una entrega tiene que ser exacta en las dos direcciones,
     ni de menos ni de más. */
  const suyas = consultar({ limite: 100000 }).filter((e) =>
    e.objeto === identidadId ||
    e.objeto === correo ||
    (gid && e.objeto === gid) ||
    e.actor === correo)

  const negocios = datos.negocios.filter((n) =>
    n.emailDueno === correo ||
    (gid && n.gidDueno === gid) ||
    (n.beneficiarios || []).some((b) => b.gid && gid && b.gid === gid))

  const casos = datos.casos.filter((c) =>
    c.identidadId === identidadId || (gid && c.gid === gid))

  return {
    ok: true,
    expediente: {
      generado: {
        // Se firma la entrega: quién la pidió y cuándo. Un documento que llega a
        // manos de una persona o de un regulador tiene que decir de dónde sale.
        en: new Date().toISOString(),
        porOperador: actor,
        aviso: 'Entrega del derecho de acceso. Las imágenes del documento no van ' +
          'dentro de este archivo por su tamaño; se entregan aparte.',
      },
      identidad,
      negocios,
      casos,
      movimientos: gid ? await movimientosDe(gid).catch(() => []) : [],
      // La ficha del padrón junta las cuentas de la persona en TODAS las
      // aplicaciones del ecosistema, que es lo que a nadie se le ocurre mirar
      // cuando arma esto a mano.
      cuentasEnLasApps: await fichaPorEmail(correo).catch(() => null),
      bitacora: suyas,
      imagenes: {
        aviso: 'Se indica cuáles existen. Se descargan desde el panel.',
        /* Se lee y se tira: solo interesa SI hay, no el contenido. Meter los
           megabytes de un anverso en base64 dentro de esto lo volveria un
           archivo que no se puede ni abrir ni mandar. */
        documento: Boolean(await leerFotos(identidadId).catch(() => null)),
        retratoCredencial: Boolean(await leerFoto(identidadId).catch(() => null)),
      },
    },
  }
}

/** Lo mismo, dejando escrito en la bitácora que se sacó. */
export async function entregarExpediente(identidadId: string, actor: string, motivo: string) {
  const r = await expedienteCompleto(identidadId, actor)
  if (!r.ok) return r

  const e = r.expediente as any
  /* Sacar el expediente entero de una persona es justo el tipo de acto que un
     inspector va a querer ver registrado: quién lo sacó, de quién y por qué.
     Se anota DESPUES de armarlo, para que un fallo a mitad no deje escrito que
     se entregó algo que nunca salió. */
  registrar(actor, 'expediente.entregado', identidadId, {
    motivo,
    entradasBitacora: e.bitacora.length,
    negocios: e.negocios.length,
    casos: e.casos.length,
    movimientos: e.movimientos.length,
  })
  return r
}
