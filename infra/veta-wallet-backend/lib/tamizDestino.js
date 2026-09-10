// La dirección de destino, contra las listas de sanciones, ANTES de enviar.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUE NO EXISTIA ESTO, QUE ES LO GRAVE
//
// Todas las piezas estaban puestas: Genesis ID tiene 19.321 registros de la
// OFAC cargados y al día, expone `/api/v1/tamiz/direccion/:addr`, el puente
// del backend publica `/genesis/tamiz/:direccion`, la app hasta tiene escrito
// el método `tamizarDireccion` en su cliente. Y NADIE llamaba a ninguno de
// ellos. Ni la web, ni la app, ni el backend.
//
// Peor: la cabecera de `reporteAml.js` afirmaba que «el tamizado de la
// dirección de destino ya se hace aparte y antes». No se hacía en ningún
// sitio. Un comentario que asegura un control que no existe es más peligroso
// que no tener el comentario, porque el siguiente que pase da el control por
// hecho y no lo busca.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUE VA EN EL BACKEND Y NO EN LA PANTALLA
//
// Porque la web y la app envían por la MISMA ruta. Puesto acá, el control
// cubre las dos de una vez, y sobre todo no se puede saltar: un control que
// vive en el cliente lo quita cualquiera que sepa abrir las herramientas del
// navegador. Un tamizado que se puede esquivar no es un tamizado.
//
// ══════════════════════════════════════════════════════════════════════════
// QUE PASA CUANDO NO SE PUEDE COMPROBAR
//
// Se deja pasar, y se deja escrito. Es una decisión con la que hay que estar
// de acuerdo a sabiendas: la alternativa —bloquear todos los envíos cuando
// Genesis no contesta— convierte cualquier hipo de un servicio en una
// billetera caída para todo el mundo, y eso también es un daño real.
//
// Lo que NO se hace es fingir. Una dirección que no se pudo tamizar queda con
// `tamizado: false` en el registro, que es distinto de `sancionada: false`.
// Enseñar «sin sanciones» sobre una consulta que nunca ocurrió es la mentira
// que este archivo existe para no contar.

const BASE = () => (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '');
const CLAVE = () => (process.env.GENESIS_API_KEY || '').trim();

/* Tres segundos y ni uno más. Esto corre EN MEDIO de un envío, con la persona
   mirando la pantalla: un tamizado lento se vive como una billetera lenta. */
const PLAZO_MS = Number(process.env.GENESIS_TAMIZ_TIMEOUT_MS || 3000);

/* La misma dirección se repite mucho —quien manda a su propia cuenta de otro
   sitio, o le paga al mismo comercio cada semana— y la lista de la OFAC no
   cambia cada minuto. Diez minutos de memoria evitan una ida y vuelta en el
   momento de más prisa, sin que un alta reciente tarde en verse. */
const VIDA_MS = 10 * 60 * 1000;
const cache = new Map();

function deCache(dir) {
  const e = cache.get(dir);
  if (!e) return undefined;
  if (Date.now() - e.en > VIDA_MS) { cache.delete(dir); return undefined; }
  return e.valor;
}

function aCache(dir, valor) {
  if (cache.size > 5000) cache.clear();
  cache.set(dir, { valor, en: Date.now() });
}

/**
 * @returns {{tamizado: boolean, sancionada: boolean, ficha: object|null}}
 *   `tamizado:false` significa «no se pudo comprobar», y NO es lo mismo que
 *   «no está sancionada». Quien llame tiene que poder distinguirlo.
 */
export async function tamizarDestino(direccion) {
  const dir = String(direccion || '').toLowerCase().trim();
  if (!dir) return { tamizado: false, sancionada: false, ficha: null };

  const guardado = deCache(dir);
  if (guardado !== undefined) return guardado;

  const clave = CLAVE();
  if (!clave) {
    console.error('[tamiz] SIN GENESIS_API_KEY: los envíos salen sin tamizar');
    return { tamizado: false, sancionada: false, ficha: null };
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), PLAZO_MS);
  try {
    const r = await fetch(`${BASE()}/api/v1/tamiz/direccion/${encodeURIComponent(dir)}`, {
      headers: { 'X-API-Key': clave },
      signal: control.signal,
    });
    if (!r.ok) throw new Error('Genesis contestó ' + r.status);
    const d = await r.json();
    const salida = {
      tamizado: d?.tamizado === true,
      sancionada: d?.sancionada === true,
      ficha: d?.ficha ?? null,
    };
    // Solo se guarda lo que se pudo comprobar de verdad: cachear un fallo
    // sería quedarse diez minutos sin control por un tropiezo de red.
    if (salida.tamizado) aCache(dir, salida);
    return salida;
  } catch (e) {
    console.error('[tamiz] no se pudo comprobar', dir, '—', e?.message);
    return { tamizado: false, sancionada: false, ficha: null };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * El «no» que se le da a la persona.
 *
 * No se dice QUE lista ni POR QUE, y es a propósito: el detalle de una
 * coincidencia es información de cumplimiento, y dársela a quien la disparó le
 * enseña a esquivarla. Se dice que no se puede y a quién escribir.
 */
export const negativaPorSancion = () => ({
  message: 'No podemos completar este envío. Escribinos y lo revisamos con vos: wa.me/50432136457',
  code: 'destino-no-permitido',
});
