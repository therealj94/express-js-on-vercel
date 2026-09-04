// Lo mio: el portafolio, los retiros y los movimientos.
//
// Aqui vive el circuito completo del retiro — la operacion mas peligrosa de
// la casa, porque es la unica donde el dinero SALE. El orden es el del
// contrato: tamiz → debitar → firmar → anotar con hash → AML, con la
// reserva de idempotencia (retiroKey) puesta ANTES de debitar, que es donde
// un reintento doble empezaria a costar plata.

const { getAddress } = require('ethers');
const { Usuario, Cuenta, Asiento, Deposito, Retiro } = require('../models');
const ledger = require('../lib/ledger');
const cadena = require('../lib/cadena5550');
const { asegurarDireccion } = require('../lib/deposito');
const { TOKENS, PORSIMBOLO } = require('../lib/tokens');
const billeteras = require('../lib/billeteras');
const comisionSalida = require('../lib/comisionSalida');

// lib/genesis.js se carga PEREZOSO y a demanda: si el modulo falta o truena
// al cargar, tiene que caerse SOLO el retiro (fail-closed, con su 503) y no
// el proceso entero al montar las rutas. El portafolio y los movimientos no
// necesitan a Genesis para nada.
function genesisPerezoso() {
  try {
    return require('../lib/genesis');
  } catch (e) {
    return null;
  }
}

// Un monto valido de esta casa: string de digitos, entero, positivo, y que
// quepa en un uint256 (78 digitos ya se pasa). Todo lo demas — floats,
// notacion cientifica, negativos, "1e18" — se rechaza en la puerta.
function montoValido(v) {
  if (typeof v !== 'string' || !/^[0-9]{1,78}$/.test(v)) return false;
  try {
    return BigInt(v) > 0n;
  } catch {
    return false;
  }
}

// ── GET /portafolio ─────────────────────────────────────────────────────────
// Devuelve las cuentas del ledger (LAS QUINCE, con ceros explicitos: una
// cuenta que nunca se toco ES cero — el ledger es nuestra base, no la cadena,
// y aqui el cero no es de consuelo sino la verdad) y la direccion de
// deposito, creandola la primera vez que alguien la pide.
async function portafolio(req, res) {
  const userId = req.usuario.id;
  try {
    const [usuario, propias] = await Promise.all([
      Usuario.findById(userId),
      Cuenta.find({ userId }).lean(),
    ]);
    if (!usuario) {
      return res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });
    }

    const por = new Map(propias.map((c) => [c.activo, c]));
    const cuentas = TOKENS.map((t) => {
      const c = por.get(t.s);
      return {
        activo: t.s,
        disponible: c ? c.disponible : '0',
        reservado: c ? c.reservado : '0',
      };
    });

    // La direccion de deposito se crea perezosa, la primera vez que el
    // usuario abre su portafolio: generar 15.000 llaves por adelantado seria
    // custodiar 15.000 secretos que nadie pidio. La llave se cifra ANTES de
    // guardar nada — si el cifrado no esta configurado, no se guarda ni la
    // direccion: una direccion publicada cuya llave se perdio es un buzon
    // sin fondo, y el usuario mandaria dinero a un sitio que no podemos
    // barrer.
    // Como nace la direccion y de donde sale su llave lo decide lib/deposito.js:
    // dos sitios con ese criterio se separan, y separarse aqui significa una
    // direccion publicada que nadie puede barrer. Sigue siendo perezosa y
    // atomica, y sigue devolviendose EN ESTA MISMA RESPUESTA — que es la razon
    // por la que a un usuario con direccion ya creada no se le cambia nunca:
    // no existe una direccion creada que no haya salido ya por el cable.
    //
    // Sin direccion se contesta null y se canta en el log; el resto del
    // portafolio sigue sirviendo.
    const { direccion: direccionDeposito } = await asegurarDireccion(usuario);

    /* Y la direccion de la Veta Wallet de esta persona, que viene del SSO de
       Genesis. NO es un saldo ni una cuenta de esta casa: es el dato que le
       permite a la sala enseñar «esto lo tenes en tu wallet, no aqui».

       Hace falta porque la confusion es garantizada y cara: alguien entra con
       su cuenta, ve el portafolio vacio y concluye que Ordenex «no cargo» sus
       activos. No los perdio — estan en su wallet, y una casa de cambio guarda
       lo que le DEPOSITAN. Decirlo con la direccion delante es la diferencia
       entre una pantalla que explica y una que parece rota. */
    return res.json({ cuentas, direccionDeposito, direccionWallet: usuario.direccionWallet || null });
  } catch (e) {
    console.error(`[portafolio] ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer el portafolio.', codigo: 'NO_SE_PUDO_LEER' });
  }
}

// ── POST /retiros ───────────────────────────────────────────────────────────
// { activo, cantidad, direccion, retiroKey }
//
// La retiroKey la manda el cliente y es la reserva de idempotencia: un
// reintento por timeout con la misma clave recibe el MISMO resultado, jamas
// una segunda firma. El documento Retiro en estado `pendiente` ES la reserva
// (indice unico), creada despues de validar —una direccion mal escrita no
// quema la clave— y antes de debitar — que es donde empieza a costar.
async function retirar(req, res) {
  const userId = req.usuario.id;
  const cuerpo = req.body || {};
  const { activo, cantidad, retiroKey } = cuerpo;

  // 1. Validaciones. Todas antes de tocar nada.
  if (!PORSIMBOLO[activo]) {
    return res.status(400).json({ error: 'Ese activo no existe en esta casa.', codigo: 'ACTIVO_INVALIDO' });
  }
  if (!montoValido(cantidad)) {
    return res.status(400).json({ error: 'La cantidad tiene que ser un entero de wei positivo, como string.', codigo: 'CANTIDAD_INVALIDA' });
  }
  let direccion;
  try {
    direccion = getAddress(String(cuerpo.direccion || ''));
  } catch {
    return res.status(400).json({ error: 'La direccion de destino no es valida.', codigo: 'DIRECCION_INVALIDA' });
  }
  // Ninguna billetera de la casa puede ser destino de un retiro. Mandarse
  // dinero a uno mismo y anotarlo como salido es un descuadre que despues no
  // encuentra nadie; y una de las retiradas —la de gas anterior— esta
  // COMPROMETIDA: lo que le llegue se lo lleva un bot en el bloque siguiente.
  // Por eso la comprobacion incluye las viejas y no solo las tres de ahora.
  if (billeteras.esDeLaCasa(direccion)) {
    const porQue = billeteras.porQueRetirada(direccion);
    console.error(`[retiros] ${userId} intento retirar a una billetera de la casa: ${direccion}${porQue ? ` (${porQue})` : ''}`);
    return res.status(400).json({ error: 'Esa direccion es de la casa: no se puede retirar hacia ella.', codigo: 'DIRECCION_DE_LA_CASA' });
  }
  if (typeof retiroKey !== 'string' || retiroKey.length < 8 || retiroKey.length > 100) {
    // Se exige una clave con cuerpo: sin ella un doble clic son dos retiros,
    // y eso no es un error del usuario sino nuestro por dejarlo.
    return res.status(400).json({ error: 'Falta retiroKey (entre 8 y 100 caracteres).', codigo: 'RETIRO_KEY_INVALIDA' });
  }
  if (!cadena.direccionCaliente()) {
    return res.status(503).json({ error: 'Los retiros no estan configurados.', codigo: 'SIN_CONFIGURAR' });
  }

  // LA COMISION DE SALIDA, calculada ANTES de reservar la clave: si la
  // cantidad no da ni para que salga algo, no se quema una retiroKey por una
  // operacion que no puede existir. Ver lib/comisionSalida.js — se debita lo
  // que la persona escribio y sale eso menos el 1 %.
  let corte;
  try {
    corte = comisionSalida.partir(cantidad);
  } catch (e) {
    return res.status(400).json({ error: 'La cantidad no es valida.', codigo: 'CANTIDAD_INVALIDA' });
  }
  if (BigInt(corte.neto) <= 0n) {
    // Emitir una transaccion de cero cuesta gas y no mueve nada.
    return res.status(400).json({
      error: 'Esa cantidad no alcanza para cubrir la comision de salida.',
      codigo: 'NO_CUBRE_COMISION',
      comision: corte.comision,
    });
  }

  // 2. ¿Ya se vio esta clave? El reintento recibe lo que paso la primera vez.
  try {
    const visto = await Retiro.findOne({ retiroKey }).lean();
    if (visto) return responderRepetido(res, visto, userId);
  } catch (e) {
    return res.status(503).json({ error: 'No se pudo comprobar el retiro.', codigo: 'NO_SE_PUDO_COMPROBAR' });
  }

  // 3. El tamiz de sanciones, ANTES de mover un wei (regla heredada del
  // ecosistema). Si Genesis no contesta, no hay retiro: un tamiz que no se
  // pudo hacer no es un tamiz aprobado.
  const genesis = genesisPerezoso();
  if (!genesis || typeof genesis.tamizDireccion !== 'function') {
    console.error('[retiros] lib/genesis.js no expone tamizDireccion: retiro cerrado');
    return res.status(503).json({ error: 'No se pudo comprobar la direccion de destino.', codigo: 'TAMIZ_NO_DISPONIBLE' });
  }
  let tamiz;
  try {
    tamiz = await genesis.tamizDireccion(direccion);
  } catch (e) {
    console.error(`[retiros] tamiz fallo para ${direccion}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo comprobar la direccion de destino.', codigo: 'TAMIZ_NO_DISPONIBLE' });
  }
  if (!tamiz || tamiz.sancionada === true) {
    // El mensaje es neutro a proposito: a una direccion sancionada no se le
    // explica que la delato, y a nosotros nos basta con que no salga.
    return res.status(403).json({ error: 'El retiro no se puede procesar.', codigo: 'RETIRO_RECHAZADO' });
  }

  // 4. La reserva de idempotencia: el documento en `pendiente`. Si otra
  // peticion con la misma clave gano la carrera, el indice unico lo dice y
  // se responde lo que hizo ella.
  let retiro;
  try {
    retiro = await Retiro.create({ userId, activo, cantidad, direccion, retiroKey,
                                  comision: corte.comision, neto: corte.neto, comisionPpm: corte.ppm });
  } catch (e) {
    if (e && e.code === 11000) {
      const visto = await Retiro.findOne({ retiroKey }).lean().catch(() => null);
      if (visto) return responderRepetido(res, visto, userId);
    }
    console.error(`[retiros] no se pudo reservar ${retiroKey}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo registrar el retiro.', codigo: 'NO_SE_PUDO_REGISTRAR' });
  }
  const ref = `retiro:${retiro._id}`;

  // 5. Debitar el ledger. Si no alcanza (o Mongo tose), el retiro muere aqui
  // con su fallo anotado — la clave queda quemada con ESTE resultado, y un
  // reintento honesto usa una clave nueva.
  try {
    await ledger.debitar(userId, activo, cantidad, ref);
  } catch (e) {
    await marcarFallo(retiro, `debito: ${e.message}`);
    return res.status(e.status || 409).json({
      error: e.codigo ? e.message : 'No se pudo debitar el saldo; el retiro no salio.',
      codigo: e.codigo || 'DEBITO_FALLO',
    });
  }

  // 6. Firmar desde la caliente (nonce serializado en lib/cadena5550.js).
  //
  // AQUI VIVE LA REGLA MAS CARA DE LA CASA: un tiempo agotado NO es un fallo,
  // es una DUDA. El plazo de lib/cadena5550.js corta la espera, no la
  // transaccion: si el nodo acepto el envio y tardo mas en contestar, la
  // transaccion esta en el mempool y se va a minar. Reacreditar ahi es
  // devolverle al usuario un dinero que ya salio de la caliente, y encima
  // decirle "tu saldo no se movio" cuando se movio dos veces.
  //
  // Por eso solo se reacredita cuando el modulo de la cadena AFIRMA que no
  // salio nada (`nuncaSalio`): todo lo anterior a la firma y el rechazo
  // explicito del nodo. Sin esa afirmacion, el retiro queda en `revision` con
  // el debito en pie, sin reacreditar y sin AML, esperando a que un humano
  // mire la cadena y decida. Es la unica postura que no puede regalar dinero:
  // si la transaccion salio, el debito es correcto; y si no salio, el usuario
  // recupera su saldo tras la revision, tarde pero entero.
  let envio;
  try {
    // Sale el NETO. Se debito el bruto arriba; la diferencia se le abona a la
    // casa mas abajo, DESPUES de saber que la transaccion salio.
    envio = await cadena.enviarDesdeCaliente({ a: direccion, activo, cantidadWei: corte.neto });
  } catch (e) {
    const detalle = `${e.codigo || e.code || ''} ${e.message}`.trim();

    if (e.nuncaSalio !== true) {
      await marcarRevision(retiro, `duda: ${detalle}`);
      console.error(
        `[retiros] EN DUDA: el retiro ${retiro._id} debito ${cantidad} wei de ${activo} a ${userId} y no se pudo confirmar si la transaccion salio (${detalle}). NO se reacredita: revisar la cadena desde ${cadena.direccionCaliente()} antes de tocar el saldo.`
      );
      return res.status(503).json({
        error: 'No pudimos confirmar si el retiro salio. Tu saldo sigue debitado mientras se revisa; no lo intentes de nuevo.',
        codigo: 'RETIRO_EN_REVISION',
        id: String(retiro._id),
      });
    }

    // Se SABE que no salio: se le devuelve su dinero al ledger y se anota el
    // porque. Si hasta el reverso falla, eso es un incidente y se canta con
    // todo: el usuario tiene un debito sin retiro y lo arregla un humano.
    try {
      await ledger.acreditar(userId, activo, cantidad, `${ref}:reverso`);
    } catch (e2) {
      console.error(
        `[retiros] INCIDENTE: el retiro ${retiro._id} debito ${cantidad} wei de ${activo} a ${userId}, la firma fallo (${e.message}) y el reverso TAMBIEN fallo: ${e2.message}`
      );
    }
    await marcarFallo(retiro, `firma: ${detalle}`);
    console.error(`[retiros] firma fallida ${retiro._id}: ${detalle}`);
    // El detalle crudo de ethers no viaja al cliente: puede llevar dentro el
    // saldo de la caliente o la URL del nodo.
    return res.status(503).json({ error: 'No se pudo emitir el retiro. Tu saldo no se movio.', codigo: 'FIRMA_FALLO' });
  }

  // 7. Anotar el hash. Si este guardado fallara la transaccion YA esta en la
  // cadena: se canta en el log y se responde igual con el hash — negarle al
  // usuario la prueba de un envio que si salio invita a reintentarlo.
  try {
    retiro.hash = envio.hash;
    retiro.estado = 'enviado';
    await retiro.save();
  } catch (e) {
    console.error(`[retiros] el retiro ${retiro._id} salio con hash ${envio.hash} pero no se pudo anotar: ${e.message}`);
  }

  // 7b. La comision a la cuenta 'casa', y RECIEN AHORA.
  //
  // Va despues del envio a proposito: si se abonara antes y la firma fallara,
  // habria que revertir dos movimientos en vez de uno, y el camino de reverso
  // es justo el que menos se ejecuta y menos se prueba. Con este orden, el
  // reverso devuelve el BRUTO al usuario y no hay nada mas que deshacer.
  //
  // Si el abono falla, la transaccion YA salio: no se toca el retiro, se canta
  // el incidente con todo, y lo cuadra una persona. Un usuario al que le
  // salio su dinero no puede recibir un error porque a la casa no se le pudo
  // anotar su comision.
  if (BigInt(corte.comision) > 0n) {
    try {
      await ledger.acreditar('casa', activo, corte.comision, `${ref}:comision`);
    } catch (e) {
      console.error(
        `[retiros] INCIDENTE: el retiro ${retiro._id} salio (${envio.hash}) y la comision de ${corte.comision} wei de ${activo} NO se pudo abonar a la casa: ${e.message}`
      );
    }
  }

  // 8. AML, el ultimo y en silencio: la respuesta al usuario JAMAS carga el
  // resultado del reporte (regla del ecosistema — no se avisa a nadie de si
  // salto una alerta), y un fallo aqui no deshace un retiro que ya salio.
  try {
    if (typeof genesis.reportarMovimiento === 'function') {
      await genesis.reportarMovimiento(req.usuario.gid, {
        tipo: 'retiro',
        activo,
        // Lo que SALIO de la casa, que es lo que importa para un reporte de
        // movimiento. El bruto y la comision van al lado para que cuadre.
        cantidad: corte.neto,
        bruto: cantidad,
        comision: corte.comision,
        direccion,
        hash: envio.hash,
        en: new Date().toISOString(),
      });
    } else {
      console.error('[retiros] lib/genesis.js no expone reportarMovimiento: AML sin reportar');
    }
  } catch (e) {
    console.error(`[retiros] AML del retiro ${retiro._id} no se pudo reportar: ${e.message}`);
  }

  return res.json({
    id: String(retiro._id),
    estado: 'enviado',
    hash: envio.hash,
    activo,
    // Los tres numeros, siempre. Que la respuesta traiga solo `cantidad`
    // obligaria a la pantalla a rehacer la cuenta de la comision por su lado,
    // y dos cuentas separadas del mismo numero terminan discrepando.
    cantidad,
    comision: corte.comision,
    neto: corte.neto,
    comisionPpm: corte.ppm,
    direccion,
  });
}

/** Anota el fallo de un retiro sin dejar que ese anotado tape el error real. */
async function marcarFallo(retiro, porQue) {
  try {
    retiro.estado = 'fallido';
    retiro.fallo = porQue;
    await retiro.save();
  } catch (e) {
    console.error(`[retiros] no se pudo anotar el fallo de ${retiro._id}: ${e.message}`);
  }
}

/**
 * Deja el retiro en `revision`: ni salio ni fallo, no se sabe. Es un estado
 * distinto de `fallido` a proposito, y la diferencia es de dinero, no de
 * matiz: `fallido` dice "el saldo se devolvio" y `revision` dice "el saldo
 * sigue debitado y nadie lo va a tocar hasta que un humano mire la cadena".
 * Confundirlos es lo que hacia que un plazo agotado pagara dos veces.
 *
 * Si ni siquiera esto se puede anotar, se canta lo mas fuerte que se puede:
 * un retiro que quedo `pendiente` con el saldo debitado es exactamente el
 * mismo incidente, solo que sin etiqueta que lo encuentre.
 */
async function marcarRevision(retiro, porQue) {
  try {
    retiro.estado = 'revision';
    retiro.fallo = porQue;
    await retiro.save();
  } catch (e) {
    console.error(
      `[retiros] INCIDENTE: el retiro ${retiro._id} quedo en duda (${porQue}) y NO se pudo marcar para revision: ${e.message}`
    );
  }
}

/**
 * La respuesta a una retiroKey ya vista. La clave es del usuario que la uso:
 * si otro manda la misma, es un choque (o un ataque) y se dice sin detalle.
 */
function responderRepetido(res, visto, userId) {
  if (visto.userId !== userId) {
    return res.status(409).json({ error: 'Esa retiroKey ya se uso.', codigo: 'RETIRO_KEY_AJENA' });
  }
  if (visto.estado === 'pendiente') {
    // Sigue en vuelo (o murio a mitad): no se repite la firma ni se inventa
    // un resultado. El cliente pregunta de nuevo en un rato.
    return res.status(409).json({ error: 'Ese retiro sigue en curso.', codigo: 'RETIRO_EN_CURSO' });
  }
  if (visto.estado === 'fallido') {
    return res.status(409).json({
      error: 'Ese retiro fallo y el saldo se devolvio. Para intentarlo de nuevo usa una retiroKey nueva.',
      codigo: 'RETIRO_FALLO',
      id: String(visto._id),
    });
  }
  if (visto.estado === 'revision') {
    // Ni un hash que enseñar ni un saldo que prometer: se dice la verdad, que
    // es que no se sabe. Y sobre todo NO se invita a reintentar con otra
    // clave: si la transaccion dudosa se mina, el reintento seria el segundo
    // pago del mismo retiro.
    return res.status(409).json({
      error: 'Ese retiro esta en revision: no pudimos confirmar si salio. No lo intentes de nuevo hasta que se resuelva.',
      codigo: 'RETIRO_EN_REVISION',
      id: String(visto._id),
    });
  }
  // Salio: se repite EXACTAMENTE la respuesta buena, con su hash — y con el
  // desglose GUARDADO, no recalculado. Si la tasa cambiara entre el retiro y
  // el reintento, recalcular haria que la misma operacion contestara dos
  // numeros distintos, que es justo lo que una clave de idempotencia existe
  // para impedir. Los retiros de antes de la comision no lo tienen: van en
  // null y la pantalla no pinta desglose, que es la verdad de aquel dia.
  return res.json({
    id: String(visto._id),
    estado: visto.estado,
    hash: visto.hash,
    activo: visto.activo,
    cantidad: visto.cantidad,
    comision: visto.comision ?? null,
    neto: visto.neto ?? null,
    comisionPpm: visto.comisionPpm ?? null,
    direccion: visto.direccion,
  });
}

// ── GET /movimientos ────────────────────────────────────────────────────────
// Asientos + depositos + retiros del usuario, lo mas nuevo primero, paginado
// por cursor de fecha: ?limite= (50 por omision, 200 maximo) y ?antes= (ISO;
// se devuelven los anteriores a ese instante). El cursor es `siguiente` en la
// respuesta — paginar por numero de pagina sobre tres colecciones que crecen
// por delante repetiria filas cada vez que entra un movimiento nuevo.
async function movimientos(req, res) {
  const userId = req.usuario.id;

  let limite = parseInt(req.query.limite, 10);
  if (!Number.isFinite(limite) || limite < 1) limite = 50;
  if (limite > 200) limite = 200;

  let antes = null;
  if (req.query.antes) {
    antes = new Date(String(req.query.antes));
    if (isNaN(antes.getTime())) {
      return res.status(400).json({ error: 'El cursor `antes` no es una fecha.', codigo: 'CURSOR_INVALIDO' });
    }
  }

  const filtro = { userId, ...(antes ? { en: { $lt: antes } } : {}) };
  try {
    const [asientos, depositos, retiros] = await Promise.all([
      Asiento.find(filtro)
        .sort({ en: -1 })
        .limit(limite)
        .select('ref tipo activo monto contraparte saldoDespues en')
        .lean(),
      Deposito.find(filtro)
        .sort({ en: -1 })
        .limit(limite)
        .select('activo cantidad direccion bloque en')
        .lean(),
      Retiro.find(filtro)
        .sort({ en: -1 })
        .limit(limite)
        .select('activo cantidad direccion hash estado fallo en')
        .lean(),
    ]);

    // El cursor de la proxima pagina: la fecha mas vieja devuelta, pero SOLO
    // de las colecciones que llegaron al tope — una que trajo menos ya se
    // agoto y su fecha no debe cortar a las demas.
    let siguiente = null;
    for (const lista of [asientos, depositos, retiros]) {
      if (lista.length === limite) {
        const ultima = lista[lista.length - 1].en;
        if (!siguiente || ultima > siguiente) siguiente = ultima;
      }
    }

    return res.json({
      asientos,
      depositos,
      retiros,
      siguiente: siguiente ? siguiente.toISOString() : null,
    });
  } catch (e) {
    console.error(`[movimientos] ${e.message}`);
    return res.status(503).json({ error: 'No se pudieron traer los movimientos.', codigo: 'NO_SE_PUDO_LEER' });
  }
}

module.exports = { portafolio, retirar, movimientos };
