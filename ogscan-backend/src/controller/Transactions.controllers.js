const { Web3 } = require("web3");
const web3 = new Web3("https://ordenglobal-rpc.com/");
import Transaction from "../Models/Transaction";

// En el esquema, `blockNumber` y `transactionIndex` son String. Eso hace que
// .sort({ blockNumber: -1 }) ordene alfabeticamente y no por numero: "985671"
// gana a "1484788" porque empieza por 9. El resultado visible era que la lista
// de "ultimas transacciones" mostraba una de hace mas de un año como la mas
// reciente. Se ordena convirtiendo a numero dentro de la propia consulta.
const ORDEN_NUMERICO = [
  { $addFields: { _bn: { $toDouble: { $ifNull: ["$blockNumber", "0"] } },
                  _ti: { $toDouble: { $ifNull: ["$transactionIndex", "0"] } } } },
  { $sort: { _bn: -1, _ti: -1 } },
];

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

    const [filas, total] = await Promise.all([
      Transaction.aggregate([...ORDEN_NUMERICO, { $skip: salto }, { $limit: limite }]),
      Transaction.estimatedDocumentCount(),
    ]);

    res.status(200).json({
      transactions: filas.map(comoTexto),
      total,
      desde: salto,
      limite,
    });
  } catch (error) {
    console.error("[allTransactions]", error);
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
