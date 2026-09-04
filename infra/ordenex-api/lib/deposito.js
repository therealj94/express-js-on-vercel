// Cómo nace la dirección de depósito de una persona, y quién puede firmarla.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO VIVE EN UN SITIO Y NO EN TRES
//
// Hasta ahora la dirección nacía dentro de portafolioController.js y el
// barrido descifraba la llave dentro de adminController.js. Cada sitio con su
// copia del criterio. Con DOS ORÍGENES conviviendo —las llaves guardadas de
// antes y las direcciones derivadas de ahora— dos copias del criterio son dos
// oportunidades de que una se quede vieja, y quedarse vieja aquí significa
// una dirección que se publicó y que nadie puede barrer.
//
// ══════════════════════════════════════════════════════════════════════════
// LA CONVIVENCIA, Y POR QUÉ NO SE MIGRA A NADIE
//
// Hay usuarios con `llaveDepositoCifrada` ya guardada. NO se les cambia la
// dirección, y la tentación de migrar «solo a los que nunca depositaron» no
// resiste mirar el código: portafolioController crea la dirección Y LA DEVUELVE
// EN LA MISMA RESPUESTA HTTP. No existe una dirección creada que no haya salido
// por el cable. Así que «nunca depositó» NO prueba «nadie tiene la dirección»:
// pudo copiarla a su exchange como destino frecuente y no haber mandado nada
// todavía. El conjunto migrable es vacío.
//
// El balance además es asimétrico: migrar ahorra UN BLOB CIFRADO en la base;
// no migrar evita UN DEPÓSITO PERDIDO. Y el conjunto viejo es finito, cerrado
// y decreciente — no crece ni un usuario más desde que la derivación esté
// configurada.
//
// El blob viejo NO SE BORRA NUNCA, ni el día que su dueño se dé de baja: es lo
// único que puede recuperar un depósito que llegue tarde.
//
// ══════════════════════════════════════════════════════════════════════════
// LA COMPROBACIÓN QUE VALE POR TODAS
//
// Antes de firmar, la dirección que sale de la llave tiene que ser EXACTAMENTE
// la que se le enseñó a la persona. Si no lo es —semilla equivocada, índice
// pisado, blob de otro, migración a medias— firmar sería firmar desde una
// dirección que no es la suya.
//
// Es la traducción exacta de la regla de lib/cripto.js:18-26 («descifrar con la
// clave equivocada puede dar basura que parece texto») al mundo de la
// derivación: derivar con la semilla equivocada SIEMPRE da una dirección que
// parece dirección. La única prueba es compararla con la que se publicó.
//
// Esta comprobación hoy NO EXISTE en adminController.js:252-270, que descifra y
// firma con lo que salga. No muerde porque el blob siempre fue el correcto; con
// dos orígenes conviviendo, muerde.

const { Wallet } = require('ethers');
const { Usuario, Contador } = require('../models');
const { cifrar, descifrarLlavePrivada } = require('./cripto');
const derivacion = require('./derivacion');

/** La generación de semilla en curso. Ver lib/derivacion.js sobre por qué existe. */
const GENERACION = Number(process.env.ORDENEX_SEMILLA_GENERACION || 1);

const CLAVE_CONTADOR = 'indiceDeposito';

/**
 * El siguiente índice, atómico y monótono.
 *
 * Nunca reutiliza uno ya dado, ni siquiera si el usuario que lo tenía se borró:
 * reutilizar un índice es darle a alguien el buzón de otro, con el historial de
 * depósitos del otro dentro.
 */
async function siguienteIndice() {
  const c = await Contador.findOneAndUpdate(
    { clave: CLAVE_CONTADOR },
    { $inc: { valor: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // El contador arranca en 0 y el primer $inc lo deja en 1, que es justo
  // INDICE_MINIMO: el 0 queda libre a propósito (lib/derivacion.js).
  return Math.max(c.valor, derivacion.INDICE_MINIMO);
}

/**
 * La dirección de depósito de esta persona, creándola si no la tiene.
 *
 * Perezosa, como antes: generar quince mil llaves por adelantado sería
 * custodiar quince mil secretos que nadie pidió — y con derivación, generar
 * quince mil filas que nadie usó.
 *
 * @returns {{direccion: string|null, origen: string|null, motivo: string|null}}
 */
async function asegurarDireccion(usuario) {
  // Ya la tiene: se devuelve tal cual y NO se toca. Es la promesa de la
  // convivencia y no admite excepciones.
  if (usuario.direccionDeposito) {
    return { direccion: usuario.direccionDeposito, origen: usuario.origenDeLlave || 'guardada', motivo: null };
  }

  if (derivacion.hayDerivacion() && derivacion.puedeFirmar()) {
    return crearDerivada(usuario);
  }

  // Sin semilla se sigue por el camino de antes. Es a propósito y es temporal:
  // asi la casa no se queda sin poder dar direcciones el dia que la semilla
  // todavia no esta puesta. Pero se CANTA en cada creacion, porque una vuelta
  // silenciosa al camino viejo es como se acumulan mil llaves nuevas sin que
  // nadie se entere de que la migracion no arranco.
  console.error(
    `[deposito] SIN DERIVACION (${derivacion.motivo()}): la direccion de ${usuario._id} ` +
    `nace con llave guardada. Mientras esto siga, la base sigue acumulando secretos.`
  );
  return crearGuardada(usuario);
}

async function crearDerivada(usuario) {
  let indice = null;
  try {
    indice = await siguienteIndice();
    const direccion = derivacion.direccionDe(indice);
    const guardado = await Usuario.findOneAndUpdate(
      // La guarda `direccionDeposito: null` hace atomica la creacion: dos
      // peticiones a la vez solo dejan pasar a una. Es la misma de antes
      // (portafolioController.js:81) y sigue siendo necesaria.
      { _id: usuario._id, direccionDeposito: null },
      { $set: { direccionDeposito: direccion, origenDeLlave: 'derivada',
                indiceDeposito: indice, generacionDeposito: GENERACION } },
      { new: true }
    );
    if (guardado) return { direccion: guardado.direccionDeposito, origen: 'derivada', motivo: null };

    // Se perdio la carrera: OTRA peticion ya le puso direccion. El indice que
    // se pidio SE QUEMA y queda un hueco en la numeracion. Es correcto: un
    // hueco no cuesta nada y reciclar un indice cuesta un buzon compartido.
    const otra = await Usuario.findById(usuario._id, { direccionDeposito: 1, origenDeLlave: 1 }).lean();
    return { direccion: otra?.direccionDeposito || null, origen: otra?.origenDeLlave || null, motivo: null };
  } catch (e) {
    // El indice unico de Mongo rebotando aqui significa que dos usuarios
    // iban a compartir buzon. Es el fallo que ese indice existe para impedir
    // y tiene que gritar, no reintentar en silencio.
    const choque = e?.code === 11000;
    console.error(`[deposito] no se pudo crear la direccion derivada de ${usuario._id}` +
      `${indice !== null ? ` (indice ${indice})` : ''}: ${choque ? 'INDICE REPETIDO' : e.message}`);
    return { direccion: null, origen: null, motivo: 'no-se-pudo-derivar' };
  }
}

async function crearGuardada(usuario) {
  try {
    const nueva = Wallet.createRandom();
    // La llave se cifra ANTES de guardar nada: una direccion publicada cuya
    // llave se perdio es un buzon sin fondo, y la persona mandaria dinero a un
    // sitio que no podemos barrer.
    const blob = cifrar(nueva.privateKey);
    const guardado = await Usuario.findOneAndUpdate(
      { _id: usuario._id, direccionDeposito: null },
      { $set: { direccionDeposito: nueva.address, llaveDepositoCifrada: blob,
                origenDeLlave: 'guardada' } },
      { new: true }
    );
    if (guardado) return { direccion: guardado.direccionDeposito, origen: 'guardada', motivo: null };
    const otra = await Usuario.findById(usuario._id, { direccionDeposito: 1, origenDeLlave: 1 }).lean();
    return { direccion: otra?.direccionDeposito || null, origen: otra?.origenDeLlave || null, motivo: null };
  } catch (e) {
    console.error(`[deposito] no se pudo crear la direccion de ${usuario._id}: ${e.message}`);
    return { direccion: null, origen: null, motivo: 'no-se-pudo-crear' };
  }
}

/**
 * La llave privada que controla la dirección de depósito de esta persona.
 *
 * Devuelve `{ok:false, motivo}` en vez de lanzar porque quien la llama —el
 * barrido— recorre muchas personas y tiene que poder anotar el fallo de una y
 * seguir con las demás. Un fallo aquí NUNCA se adivina: se anota y lo mira un
 * humano.
 *
 * @returns {{ok: true, llave: string} | {ok: false, motivo: string}}
 */
function llaveDeUsuario(u) {
  let llave = null;

  if (u.origenDeLlave === 'derivada') {
    if (!derivacion.puedeFirmar()) return { ok: false, motivo: 'SIN_SEMILLA' };
    if (!Number.isSafeInteger(u.indiceDeposito)) return { ok: false, motivo: 'SIN_INDICE' };
    try {
      llave = derivacion.firmanteDe(u.indiceDeposito).privateKey;
    } catch (e) {
      return { ok: false, motivo: e.codigo || 'NO_SE_PUDO_DERIVAR' };
    }
  } else if (u.origenDeLlave === 'guardada' || (!u.origenDeLlave && u.llaveDepositoCifrada)) {
    // El segundo caso es el usuario anterior a este campo: tiene blob y no
    // tiene discriminador. Se trata como guardada, que es lo que es.
    llave = descifrarLlavePrivada(u.llaveDepositoCifrada);
    if (!llave) return { ok: false, motivo: 'LLAVE_NO_DESCIFRA' };
  } else {
    // Ni una cosa ni la otra. NO se adivina.
    return { ok: false, motivo: 'ORIGEN_DESCONOCIDO' };
  }

  // LA COMPROBACION QUE VALE POR TODAS. Ver la cabecera.
  let dice;
  try {
    dice = new Wallet(llave).address;
  } catch {
    return { ok: false, motivo: 'LLAVE_INVALIDA' };
  }
  if (dice !== u.direccionDeposito) {
    return { ok: false, motivo: 'DIRECCION_NO_COINCIDE' };
  }
  return { ok: true, llave };
}

/** Qué explicarle a un humano cuando el barrido salta a alguien. */
const MOTIVOS = {
  SIN_SEMILLA: 'la semilla de depositos no esta en este proceso',
  SEMILLA_NO_COINCIDE: 'la semilla no corresponde a la xpub de este entorno',
  SIN_INDICE: 'la fila dice derivada pero no tiene indice',
  NO_SE_PUDO_DERIVAR: 'no se pudo derivar la llave',
  LLAVE_NO_DESCIFRA: 'la llave no se pudo descifrar',
  LLAVE_INVALIDA: 'lo descifrado no es una llave privada',
  ORIGEN_DESCONOCIDO: 'no se sabe de donde sale la llave de esta direccion',
  DIRECCION_NO_COINCIDE: 'la llave NO controla la direccion que se le enseño a la persona',
};

/** Para el panel: cuántos quedan con llave guardada. Es un número que solo baja. */
async function cuantosConLlaveGuardada() {
  try {
    return await Usuario.countDocuments({ direccionDeposito: { $ne: null }, llaveDepositoCifrada: { $ne: null } });
  } catch {
    return null;
  }
}

module.exports = {
  GENERACION, MOTIVOS,
  asegurarDireccion, llaveDeUsuario, siguienteIndice, cuantosConLlaveGuardada,
};
