// Consultas a Genesis ID desde el explorador.
//
// QUE PINTA UN EXPLORADOR CONSULTANDO IDENTIDADES
//
// Dos cosas, y ninguna revela datos de nadie:
//
//   1. Si detras de una direccion hay una identidad verificada. Es lo que
//      distingue un comercio del ecosistema de una direccion cualquiera, y es
//      informacion publica por naturaleza — igual que la etiqueta de un
//      exchange en cualquier otro explorador.
//
//   2. Si una direccion esta en listas de sanciones. Esto importa mas de lo
//      que parece: alguien a punto de mandar fondos puede mirar la direccion
//      aqui ANTES de firmar. Es el unico control que funciona sin haber pasado
//      por ninguna app del ecosistema.
//
// LO QUE ORDENSCAN NO PUEDE PEDIR, POR DISEÑO
//
// Su clave de API solo tiene los alcances `gid.verificar` y `tamiz.direccion`.
// No puede crear identidades, ni leer nombres, ni documentos, ni
// nacionalidades. Aunque la clave se filtrara —y un explorador es publico, asi
// que hay que asumir que puede pasar— con ella no se saca ningun dato personal.
//
// SI NO HAY CLAVE, NO SE INVENTA NADA
//
// Sin GENESIS_API_KEY las consultas devuelven `null`, y `null` NO significa
// "no verificada" ni "no sancionada": significa "no se pudo comprobar". El
// frontend distingue los tres casos, porque enseñar "sin sanciones" cuando en
// realidad no se consulto nada es peor que no enseñar nada.

const BASE = (process.env.GENESIS_URL || "https://genesis-id.onrender.com").replace(/\/$/, "");
const CLAVE = (process.env.GENESIS_API_KEY || "").trim();

const activo = () => Boolean(CLAVE);

// Cache en memoria. Un explorador recibe muchas visitas a la misma direccion
// —cada recarga, cada enlace compartido— y no tiene sentido preguntarle a
// Genesis ID por la misma direccion cincuenta veces por minuto.
const cache = new Map();
const VIDA_MS = 5 * 60 * 1000;

function deCache(llave) {
  const e = cache.get(llave);
  if (!e) return undefined;
  if (Date.now() - e.en > VIDA_MS) { cache.delete(llave); return undefined; }
  return e.valor;
}

function aCache(llave, valor) {
  // Tope sencillo para que la cache no crezca sin fin en una pagina publica.
  if (cache.size > 5000) cache.clear();
  cache.set(llave, { valor, en: Date.now() });
}

async function pedir(ruta) {
  if (!activo()) return null;
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 6000);
  try {
    const r = await fetch(BASE + ruta, {
      signal: control.signal,
      headers: { "X-API-Key": CLAVE, Accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    // Un fallo al consultar Genesis ID NUNCA puede tumbar la ficha de una
    // direccion: el explorador tiene que seguir mostrando saldos y
    // transacciones aunque el servicio de identidad este caido.
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Que se sabe de una direccion.
 *
 * Devuelve siempre la misma forma, con `consultado` diciendo si de verdad se
 * pudo preguntar. Las dos consultas van en paralelo: son independientes y
 * encadenarlas duplicaria la espera de la ficha.
 */
export async function estadoDeDireccion(direccion) {
  const llave = String(direccion || "").toLowerCase();
  if (!llave) return { consultado: false, verificada: null, gid: null, sancionada: null };

  const guardado = deCache(llave);
  if (guardado !== undefined) return guardado;

  if (!activo()) {
    return { consultado: false, verificada: null, gid: null, sancionada: null, motivo: "sin-clave" };
  }

  const [identidad, tamiz] = await Promise.all([
    pedir(`/api/v1/direccion/${encodeURIComponent(llave)}`),
    pedir(`/api/v1/tamiz/direccion/${encodeURIComponent(llave)}`),
  ]);

  const salida = {
    consultado: Boolean(identidad || tamiz),
    verificada: identidad ? Boolean(identidad.verificada) : null,
    gid: identidad?.gid ?? null,
    // `tamizado: false` significa que Genesis ID no tiene listas cargadas. En
    // ese caso no se puede decir que la direccion este limpia.
    sancionada: tamiz && tamiz.tamizado ? Boolean(tamiz.sancionada) : null,
    ficha: tamiz?.ficha ?? null,
  };

  aCache(llave, salida);
  return salida;
}

export const genesisActivo = activo;
