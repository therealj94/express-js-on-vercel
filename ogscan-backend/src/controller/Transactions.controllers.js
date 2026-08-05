const { Web3 } = require("web3");
const web3 = new Web3("https://ordenglobal-rpc.com/");
import Transaction from "../Models/Transaction";

// En el esquema, `blockNumber` y `transactionIndex` son String. Eso hace que
// .sort({ blockNumber: -1 }) ordene alfabeticamente y no por numero: "985671"
// gana a "1484788" porque empieza por 9. El resultado visible era que la lista
// de "ultimas transacciones" mostraba una de hace mas de un año como la mas
// reciente. Se ordena convirtiendo a numero dentro de la propia consulta.
// Todos los campos numericos estan guardados como String. Se convierten dentro
// de la consulta para poder ordenar y filtrar de verdad. Se usa $convert con
// onError en vez de $toDouble porque hay valores como "0." (con el punto
// suelto) que hacen fallar la conversion estricta y tumbarian la consulta
// entera.
const NUMERICOS = {
  $addFields: {
    _bn: { $convert: { input: "$blockNumber",       to: "double", onError: 0, onNull: 0 } },
    _ti: { $convert: { input: "$transactionIndex",  to: "double", onError: 0, onNull: 0 } },
    _ts: { $convert: { input: "$timestamp",         to: "double", onError: 0, onNull: 0 } },
    _v:  { $convert: { input: "$value",             to: "double", onError: 0, onNull: 0 } },
  },
};
const ORDENAR = { $sort: { _bn: -1, _ti: -1 } };
// Los campos auxiliares no se devuelven al cliente.
const LIMPIAR = { $project: { _bn: 0, _ti: 0, _ts: 0, _v: 0 } };

const POR_DEFECTO = 10;
const MAXIMO = 100;

function cuantas(valor) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAXIMO) : POR_DEFECTO;
}

function desde(valor) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Construye el $match de los filtros a partir de la query. Se filtra en la base
// de datos, no en el cliente: filtrar en el navegador solo esconderia filas de
// la pagina actual y daria totales falsos.
function construirFiltro(q) {
  const filtro = {};

  // Simbolo: ORIGEN es la moneda nativa, CONTRACT son interacciones con
  // contratos, y el resto son tokens.
  if (q.simbolo && String(q.simbolo).trim()) {
    filtro.symbol = String(q.simbolo).trim();
  }

  // Rango de fechas, en segundos unix.
  const d = numero(q.desdeFecha);
  const h = numero(q.hastaFecha);
  if (d !== null || h !== null) {
    filtro._ts = {};
    if (d !== null) filtro._ts.$gte = d;
    if (h !== null) filtro._ts.$lte = h;
  }

  // Rango de cantidad. Ojo con la semantica: cuando la transaccion es una
  // transferencia de token reconocida, `value` guarda la cantidad DEL TOKEN,
  // no de ORIGEN. Por eso este filtro casi siempre se usa junto con `simbolo`.
  const min = numero(q.minValor);
  const max = numero(q.maxValor);
  if (min !== null || max !== null) {
    filtro._v = {};
    if (min !== null) filtro._v.$gte = min;
    if (max !== null) filtro._v.$lte = max;
  }

  // Busqueda libre por hash, remitente o destinatario.
  const texto = String(q.q || "").trim().toLowerCase();
  if (texto) {
    const escapado = texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filtro.$or = [
      { hash: { $regex: escapado, $options: "i" } },
      { from: { $regex: escapado, $options: "i" } },
      { to: { $regex: escapado, $options: "i" } },
    ];
  }

  return filtro;
}

function comoTexto(t) {
  return {
    nonce: t.nonce?.toString() ?? "0",
    hash: t.hash?.toString() ?? "",
    blockHash: t.blockHash?.toString() ?? "",
    blockNumber: t.blockNumber?.toString() ?? "0",
    transactionIndex: t.transactionIndex?.toString() ?? "0",
    from: t.from ? t.from.toString().toLowerCase() : "",
    // Antes, cuando no habia `to`, se devolvia "0x0000...000" con 35 ceros: ni
    // siquiera una direccion valida (le faltan digitos). Es mejor null explicito
    // y que el cliente muestre "creacion de contrato".
    to: t.to ? t.to.toString().toLowerCase() : null,
    value: t.value?.toString() ?? "0",
    gas: t.gas?.toString() ?? null,
    gasPrice: t.gasPrice?.toString() ?? "0",
    input: t.input?.toString() ?? "0x",
    timestamp: t.timestamp?.toString() ?? "0",
    symbol: t.symbol ? t.symbol.toString() : "",
    addressContract: t.addressContract ? t.addressContract.toString() : null,
  };
}

// Una transferencia ERC-20 se ve, en crudo, como una transaccion de valor 0
// dirigida al contrato del token. Sin decodificar el `input`, el explorador
// mostraba "Para: <contrato>" y "Valor: 0", que es justo lo contrario de lo que
// paso: alguien envio tokens a otra persona. Aqui se lee la llamada estandar
// transfer(address,uint256) — selector 0xa9059cbb — para poder mostrarlo bien.
const SELECTOR_TRANSFER = "0xa9059cbb";

function decodificarTransferencia(input) {
  const dato = String(input || "");
  if (!dato.startsWith(SELECTOR_TRANSFER) || dato.length < 10 + 128) return null;
  try {
    const p = web3.eth.abi.decodeParameters(["address", "uint256"], "0x" + dato.slice(10));
    return {
      tipo: "transferencia-token",
      destino: String(p[0]).toLowerCase(),
      cantidadCruda: p[1].toString(),
      cantidad: web3.utils.fromWei(p[1].toString(), "ether"),
    };
  } catch (e) {
    return null;
  }
}

export const allTransactions = async (req, res) => {
  try {
    // Antes esta ruta devolvia SIEMPRE la coleccion entera: `lastTransaction`
    // se ignoraba por completo. Con 1521 transacciones ya eran cientos de
    // kilobytes en cada carga de la portada, y solo va a crecer.
    const limite = cuantas(req.query.lastTransaction);
    const salto = desde(req.query.desde);
    const filtro = construirFiltro(req.query);
    const hayFiltro = Object.keys(filtro).length > 0;

    // El total se calcula con los mismos filtros aplicados: si no, la
    // paginacion mostraria "1521 resultados" aunque el filtro deje 3.
    const tuberia = [NUMERICOS];
    if (hayFiltro) tuberia.push({ $match: filtro });

    const [filas, conteo] = await Promise.all([
      Transaction.aggregate([...tuberia, ORDENAR, { $skip: salto }, { $limit: limite }, LIMPIAR]),
      hayFiltro
        ? Transaction.aggregate([...tuberia, { $count: "n" }])
        : Transaction.estimatedDocumentCount(),
    ]);

    const total = hayFiltro ? (conteo[0]?.n ?? 0) : conteo;

    res.status(200).json({
      transactions: filas.map(comoTexto),
      total,
      desde: salto,
      limite,
      filtrado: hayFiltro,
    });
  } catch (error) {
    console.error("[allTransactions]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Resumen para la portada: de que esta hecha la cadena. Se calcula en la base
// de datos con un solo recorrido en vez de traerse las transacciones al
// servidor para contarlas.
export const resumen = async (req, res) => {
  try {
    const [porSimbolo, porMes, rango] = await Promise.all([
      Transaction.aggregate([
        { $group: { _id: { $ifNull: ["$symbol", ""] }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
      Transaction.aggregate([
        { $addFields: { _ts: { $convert: { input: "$timestamp", to: "long", onError: 0, onNull: 0 } } } },
        { $match: { _ts: { $gt: 0 } } },
        { $addFields: { _f: { $toDate: { $multiply: ["$_ts", 1000] } } } },
        { $group: {
            _id: { a: { $year: "$_f" }, m: { $month: "$_f" } },
            n: { $sum: 1 },
        } },
        { $sort: { "_id.a": 1, "_id.m": 1 } },
      ]),
      Transaction.aggregate([
        { $addFields: { _ts: { $convert: { input: "$timestamp", to: "double", onError: 0, onNull: 0 } } } },
        { $match: { _ts: { $gt: 0 } } },
        { $group: { _id: null, primera: { $min: "$_ts" }, ultima: { $max: "$_ts" } } },
      ]),
    ]);

    res.status(200).json({
      total: porSimbolo.reduce((a, x) => a + x.n, 0),
      simbolos: porSimbolo.map((x) => ({ simbolo: x._id || "", n: x.n })),
      porMes: porMes.map((x) => ({ anio: x._id.a, mes: x._id.m, n: x.n })),
      primera: rango[0]?.primera ?? null,
      ultima: rango[0]?.ultima ?? null,
    });
  } catch (error) {
    console.error("[resumen]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const idTransaction = async (req, res) => {
  try {
    const { hash } = req.params;

    if (!/^0x[a-fA-F0-9]{64}$/.test(String(hash || ""))) {
      return res.status(400).json({
        error: "Se espera un hash de transaccion (0x + 64 caracteres)",
        recibido: hash,
      });
    }

    const fila = await Transaction.findOne({ hash });
    if (!fila) {
      return res.status(404).json({ error: "Transacción no encontrada" });
    }

    const transaction = comoTexto(fila);
    const decodificado = decodificarTransferencia(transaction.input);
    if (decodificado) transaction.transferencia = decodificado;

    // Lo que guarda el indexador no incluye si la transaccion tuvo exito, ni
    // cuanto gas gasto de verdad, ni los eventos que emitio. Sin eso un
    // explorador no sirve: una transferencia fallida se veria igual que una
    // buena. Se pide el recibo al nodo. Si el nodo no responde, la ficha se
    // muestra igual con lo que hay en el indice.
    try {
      const [recibo, ultimo] = await Promise.all([
        web3.eth.getTransactionReceipt(transaction.hash),
        web3.eth.getBlockNumber(),
      ]);
      if (recibo) {
        const gasUsado = recibo.gasUsed?.toString() ?? null;
        const precio = transaction.gasPrice;
        transaction.recibo = {
          exito: recibo.status === true || recibo.status === 1n || recibo.status === "0x1",
          gasUsado,
          // La comision es gas gastado x precio del gas. Se calcula con BigInt
          // porque el producto se sale del rango seguro de un double.
          comision: (gasUsado && precio)
            ? web3.utils.fromWei((BigInt(gasUsado) * BigInt(precio)).toString(), "ether")
            : null,
          posicionEnBloque: recibo.transactionIndex?.toString() ?? null,
          contratoCreado: recibo.contractAddress || null,
          eventos: Array.isArray(recibo.logs) ? recibo.logs.length : 0,
          confirmaciones: Math.max(0, Number(ultimo) - Number(transaction.blockNumber)),
        };
      }
    } catch (e) {
      console.error("[idTransaction] recibo:", e.message);
    }

    // 202 significa "aceptado, aun no procesado". Esto es una lectura ya
    // resuelta: corresponde 200.
    res.status(200).json({ transaction });
  } catch (error) {
    // Antes el catch solo hacia console.log: la peticion se quedaba colgada
    // sin respuesta hasta que el cliente se rendia por tiempo.
    console.error("[idTransaction]", error);
    res.status(500).json({ error: "Error al obtener la transacción" });
  }
};

export const totalTranscations = async (req, res) => {
  try {
    // Antes: Transaction.find({}) y luego .length — traia cada documento de la
    // coleccion a memoria solo para contarlos.
    const totalTransactions = await Transaction.estimatedDocumentCount();
    res.status(200).json({ totalTransactions });
  } catch (error) {
    console.error("[totalTransactions]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
