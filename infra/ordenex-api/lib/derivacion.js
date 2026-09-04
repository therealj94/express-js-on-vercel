// Las direcciones de depósito, calculadas en vez de guardadas.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ CAMBIA Y POR QUÉ
//
// Hoy portafolioController.js:76 crea una billetera al azar por persona con
// Wallet.createRandom(), cifra su llave privada con ORDENEX_ADM y la guarda en
// `usuario.llaveDepositoCifrada`. Funciona. Pero son MILES DE SECRETOS: cada
// usuario es una llave más en la base, y un volcado de Mongo es un volcado de
// todos los buzones — cifrados, pero ahí.
//
// Con derivación determinista la dirección de la persona 347 se CALCULA a
// partir de una semilla más el número 347. En la base no queda ninguna llave:
// queda el número. Un solo secreto que proteger en vez de miles, y un volcado
// de Mongo deja de abrir nada.
//
// ══════════════════════════════════════════════════════════════════════════
// EL COSTO, DICHO DE FRENTE: LA SEMILLA NO SE PUEDE ROTAR
//
// Con el esquema de hoy, si ORDENEX_ADM se filtra se rota: se descifra todo
// con la vieja, se recifra con la nueva, y las direcciones NO cambian. Es un
// guion de una tarde.
//
// Con derivación no hay guion. Las direcciones SON la semilla. Solo se puede
// emitir una GENERACIÓN nueva y darle a cada persona una dirección nueva —
// pero quien guardó la vieja en su exchange sigue mandando a la dirección
// comprometida para siempre, y eso ya no es reparar: es correr contra el
// ladrón. Por eso `generacionDeposito` existe desde el primer día aunque hoy
// valga siempre 1: añadirlo después obligaría a adivinar la generación de
// miles de filas.
//
// Se acepta ese costo a cambio de que la base deje de guardar secretos. Pero
// SOLO con las tres guardas puestas:
//
//   1. la huella comprobada al cargar (aquí abajo),
//   2. la dirección derivada comparada contra la publicada ANTES de firmar
//      (eso vive en quien barre, no aquí),
//   3. el índice único en Mongo.
//
// Sin esas tres, esto es PEOR que lo que hay hoy: cambia un fallo ruidoso
// —AES que no descifra, y lib/cripto.js lo canta— por un fallo mudo: una
// dirección de otro universo que parece perfecta, que se le enseña a alguien,
// que recibe dinero, y que nadie puede barrer nunca.
//
// ══════════════════════════════════════════════════════════════════════════
// LA RUTA ES ESTÁNDAR A PROPÓSITO
//
// m/44'/60'/0'/0/i — la de Ethereum, y la misma para Polygon, BSC y Ethereum:
// las tres comparten secp256k1 y formato de dirección, así que UNA derivación
// sirve para las tres y a la persona se le enseña UNA dirección. No se usan
// 966 (Polygon) ni 714 (BNB): serían tres direcciones por persona sin ganar
// nada.
//
// Y no se usa una ruta «secreta». La oscuridad de una ruta no es seguridad
// —el secreto es la semilla— y en cambio la ruta estándar significa que el día
// de la reconstrucción de emergencia CUALQUIER billetera del mundo recupera
// los fondos sin depender de este repositorio. Ese día importa más.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ UNA FRASE Y NO UN HEX
//
// Una frase BIP-39 lleva checksum: una palabra mal copiada FALLA AL CARGAR. Un
// hex crudo mal copiado deriva direcciones perfectamente válidas de otro
// universo — direcciones que se le enseñan a la gente, que reciben dinero, y
// que nadie puede barrer jamás. Es el fallo más caro de todo el diseño y el
// checksum es lo único que lo detecta gratis. Y una frase se escribe en papel
// para el respaldo humano; un hex de 64 caracteres se copia mal.

const { HDNodeWallet, Mnemonic } = require('ethers');

/** La rama de la que cuelga cada persona. */
const RUTA_BASE = "m/44'/60'/0'/0";

/**
 * El índice 0 queda RESERVADO y no se le da a nadie.
 *
 * Es el que enseña por omisión cualquier billetera de consumo si un día
 * alguien importa la frase «para mirar». Conviene que ese primer casillero
 * esté vacío: una dirección con dinero de un cliente en el primer hueco que
 * ve quien abre la frase es una invitación a un error caro.
 */
const INDICE_MINIMO = 1;

/** El tope del hijo no endurecido de BIP-32. */
const INDICE_MAXIMO = 2 ** 31 - 1;

const frase = () => (process.env.ORDENEX_SEMILLA_DEPOSITOS || '').trim().replace(/\s+/g, ' ');
const xpubDelEntorno = () => (process.env.ORDENEX_SEMILLA_XPUB || '').trim();

function fallo(codigo, status, mensaje) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  e.status = status;
  return e;
}

// ── La carga, perezosa y con memoria ────────────────────────────────────────
//
// Perezosa porque las pruebas cambian las variables de entorno DESPUÉS de que
// los require ya corrieron; leerlas al importar clavaría las de producción
// para siempre. Es la misma razón que lib/genesis.js:21-24 deja escrita.
let cargado = null;

function cargar() {
  if (cargado && cargado.frase === frase() && cargado.xpub === xpubDelEntorno()) return cargado;

  const f = frase();
  const xEnv = xpubDelEntorno();
  const c = { frase: f, xpub: xEnv, base: null, neutro: null, huella: null, motivo: null };

  // ══════════════════════════════════════════════════════════════════════
  // LA XPUB ES OPCIONAL, Y ESO ES DELIBERADO
  //
  // Con la frase sola alcanza: la xpub se calcula de ella. Pedir las dos
  // convertía la puesta en marcha en dos pasos, uno de ellos con un dato de
  // 111 caracteres que hay que copiar sin equivocarse — y un paso de más en
  // una tarea que se hace una vez es un paso donde alguien se equivoca.
  //
  // La xpub sigue valiendo la pena DESPUÉS, y para dos cosas distintas:
  //
  //   · Es lo único que puede llevar el proceso web para calcular direcciones
  //     SIN poder firmarlas. Ese es el reparto que hace que una intrusión en
  //     la web no se lleve la semilla.
  //   · Puesta junto a la frase, delata una frase EQUIVOCADA al arrancar —
  //     la de pruebas en producción, la de otro entorno, una rotación a
  //     medias— que de otro modo derivaría direcciones impecables de otro
  //     universo.
  //
  // Sin ella el dinero NO queda desprotegido: la comprobación que de verdad
  // impide firmar desde la dirección de otro es la de lib/deposito.js, que
  // compara la dirección derivada contra la que se le publicó a la persona, y
  // esa funciona igual. Lo que se pierde es enterarse ANTES, al arrancar, en
  // vez de en el primer barrido.
  if (xEnv) {
    try {
      c.neutro = HDNodeWallet.fromExtendedKey(xEnv);
      c.huella = c.neutro.fingerprint;
    } catch (e) {
      c.motivo = 'la ORDENEX_SEMILLA_XPUB no tiene forma de xpub';
      c.neutro = null;
    }
  } else if (!f) {
    c.motivo = 'falta ORDENEX_SEMILLA_DEPOSITOS (o al menos ORDENEX_SEMILLA_XPUB)';
  }

  // Si la xpub no cargó, ESE es el problema y no se pisa con otro. Comparar la
  // frase contra una xpub que ni siquiera tiene forma daría el motivo «la
  // frase no corresponde», que manda a revisar la frase —que puede estar
  // perfecta— en vez de la variable que está mal escrita.
  if (f) {
    try {
      // Mnemonic valida el checksum aquí: una palabra mal copiada muere en
      // esta línea y no dentro de tres semanas, con el dinero de alguien en
      // una dirección que nadie puede barrer.
      Mnemonic.fromPhrase(f);
      const base = HDNodeWallet.fromPhrase(f, '', RUTA_BASE);
      const xpubDeLaFrase = base.neuter().extendedKey;

      if (xEnv && !c.neutro) {
        // La xpub está puesta pero mal escrita. ESE es el problema y no se pisa
        // con «la frase no corresponde», que mandaría a revisar una frase que
        // puede estar perfecta en vez de la variable que está mal copiada.
        // El motivo ya quedó puesto arriba.
      } else if (!xEnv) {
        // Solo frase: ella misma es la fuente. Se calcula su xpub y se sigue.
        // No hay nada contra qué comprobarla, y eso se dice en el panel en vez
        // de fingir que está verificada.
        c.neutro = base.neuter();
        c.huella = c.neutro.fingerprint;
        c.base = base;
        c.soloFrase = true;
        c.motivo = null;
      } else if (xpubDeLaFrase !== xEnv) {
        // LA GUARDA QUE VALE POR TODAS. Una frase con checksum VÁLIDO pero
        // EQUIVOCADA —la de pruebas en producción, la de otro entorno, una
        // rotación a medias— pasa todos los demás controles y deriva
        // direcciones impecables de otro universo. La xpub es el único
        // testigo público que la delata. Es el mismo criterio de
        // lib/cripto.js:18-26, subido un nivel: la forma estricta del dato.
        c.motivo = 'la frase no corresponde a la ORDENEX_SEMILLA_XPUB de este entorno';
      } else {
        c.base = base;
        c.motivo = null;
      }
    } catch (e) {
      // El mensaje NO lleva la frase ni un trozo de ella: un error se copia a
      // un chat, a un ticket, a un log de terceros.
      c.motivo = 'la ORDENEX_SEMILLA_DEPOSITOS no es una frase BIP-39 válida';
    }
  }

  cargado = c;
  return c;
}

/** ¿Se pueden CALCULAR direcciones? Basta la xpub; no dice nada de la frase. */
function hayDerivacion() {
  return Boolean(cargar().neutro);
}

/** ¿Se puede FIRMAR? Hace falta la frase Y que su xpub sea la de este entorno. */
function puedeFirmar() {
  return Boolean(cargar().base);
}

/**
 * Los 8 hex del fingerprint de la xpub. NO es secreto: no permite derivar
 * nada. Existe para que el panel enseñe de un vistazo que el proceso web y el
 * que barre van con LA MISMA semilla — dos huellas distintas significan que
 * uno está calculando direcciones que el otro no puede barrer.
 */
function huella() {
  return cargar().huella;
}

/** Por qué no se puede, en palabras y sin filtrar nada. Null si todo va bien. */
function motivo() {
  return cargar().motivo;
}

/**
 * El índice de una persona.
 *
 * Un `"347"` string se RECHAZA, no se convierte. Una conversión silenciosa es
 * cómo dos trozos de código acaban derivando dos índices distintos para el
 * mismo usuario — y dos índices distintos son dos direcciones, una de ellas
 * publicada y la otra no.
 */
function indice(i) {
  if (typeof i !== 'number' || !Number.isSafeInteger(i) || i < INDICE_MINIMO || i > INDICE_MAXIMO) {
    throw fallo('INDICE_INVALIDO', 400,
      `El índice de depósito tiene que ser un entero entre ${INDICE_MINIMO} y ${INDICE_MAXIMO}.`);
  }
  return i;
}

/**
 * La dirección de esa persona, derivada de la xpub NEUTRA.
 *
 * En este camino NO existe ninguna llave privada en memoria, ni un instante:
 * el nodo neutro de ethers ni siquiera tiene la propiedad. Por eso el proceso
 * web puede calcular direcciones llevando solo la xpub, y que no pueda firmar
 * no es una convención que alguien pueda saltarse — es aritmética.
 */
function direccionDe(i) {
  const n = indice(i);
  const c = cargar();
  if (!c.neutro) throw fallo('SIN_SEMILLA', 503, `No se pueden derivar direcciones: ${c.motivo}.`);
  return c.neutro.deriveChild(n).address;
}

/**
 * El firmante de esa persona, conectado al proveedor.
 *
 * Es el ÚNICO sitio del código que materializa una llave de depósito. Lanza
 * SIN_SEMILLA en el proceso que solo lleva la xpub, que es lo que hace real la
 * separación entre el que atiende la web y el que barre.
 */
function firmanteDe(i, proveedor) {
  const n = indice(i);
  const c = cargar();
  if (!c.base) {
    // Hay frase pero no sirve = NO COINCIDE. No hay frase = falta la semilla.
    // Distinguirlos importa: el primero manda a revisar QUÉ frase se puso, el
    // segundo a ponerla. Confundirlos manda a buscar al sitio equivocado justo
    // cuando el barrido está parado.
    throw fallo(c.frase ? 'SEMILLA_NO_COINCIDE' : 'SIN_SEMILLA', 503,
      `No se puede firmar desde una dirección de depósito: ${c.motivo}.`);
  }
  const w = c.base.deriveChild(n);
  return proveedor ? w.connect(proveedor) : w;
}

/**
 * El cuadro del panel. Nunca el valor de la frase, ni su largo, ni sus últimas
 * letras — igual que ORDENEX_ADM en lib/configuracion.js:43-47.
 *
 * La xpub tampoco sale: no es secreto de FIRMA, pero sí de privacidad. Con
 * ella se enumeran todas las direcciones de depósito de la casa, pasadas y
 * futuras, sin tocar Mongo. La huella sí, que no deriva nada.
 */
function estado() {
  const c = cargar();
  return {
    ruta: RUTA_BASE,
    indiceMinimo: INDICE_MINIMO,
    puedeCalcular: Boolean(c.neutro),
    puedeFirmar: Boolean(c.base),
    huella: c.huella,
    // `comprobada` es distinto de `puedeFirmar`: con la xpub puesta, la frase
    // se comprobó contra ella; sin xpub, la frase se cree. Las dos firman, pero
    // solo una avisaría si fuera la frase equivocada.
    comprobada: Boolean(c.base) && !c.soloFrase,
    motivo: c.motivo,
  };
}

module.exports = {
  RUTA_BASE, INDICE_MINIMO, INDICE_MAXIMO,
  hayDerivacion, puedeFirmar, huella, motivo,
  direccionDe, firmanteDe, estado,
  // Solo para las pruebas: olvidar lo cargado. El require de CommonJS devuelve
  // siempre el mismo objeto, asi que sin esto una prueba no puede comprobar
  // que pasa cuando falta la semilla.
  _adentro: { indice, cargar, olvidar: () => { cargado = null; } },
};
