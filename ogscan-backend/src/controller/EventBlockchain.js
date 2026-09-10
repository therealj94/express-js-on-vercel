const { Web3 } = require("web3");
// El nodo de la cadena sale de OG_RPC. Estaba escrito a fuego en cinco
// archivos, asi que apuntar el explorador a otra red obligaba a editar
// codigo. Sin la variable se comporta igual que siempre.
const RPC_CADENA = process.env.OG_RPC || "https://ordenglobal-rpc.com/";

const web3 = new Web3(RPC_CADENA);
import mongoose from "mongoose";
import Block from "../Models/Block";
import Transaction from "../Models/Transaction";
import Address from "../Models/Address";
import Token from "../Models/TokenTx";
import ABI from "../ABI/abi.json";

const isContractAddress = async (address) => {
  const bytecode = await web3.eth.getCode(address.toLowerCase());
  return bytecode !== "0x";
};

// Cuanto avanza como maximo en cada vuelta. Un tope evita que, tras estar
// parado un rato, una sola vuelta se coma minutos de CPU y bloquee el resto.
const TOPE_POR_VUELTA = Number(process.env.OG_BLOQUES_POR_VUELTA || 150);

// Por donde va el indexado. Antes no se guardaba en ningun sitio: cada vuelta
// se miraba UNICAMENTE el bloque que fuera la punta en ese instante. Con
// vueltas de 15 segundos y bloques de 10, la mayoria de los bloques --y las
// transacciones que llevaran dentro-- no se indexaban nunca. El explorador
// quedaba con agujeros sin que nada lo delatara.
const Progreso = mongoose.models.Progreso || mongoose.model(
  "Progreso",
  new mongoose.Schema({ clave: { type: String, unique: true }, valor: String })
);

const guardarBloque = async (b) => {
  await Block.updateOne(
    { hash: b.hash },
    { $setOnInsert: {
        number: b.number.toString(),
        nonce: b.nonce ? b.nonce.toString() : "0",
        hash: b.hash,
        miner: b.miner,
        difficulty: b.difficulty ? b.difficulty.toString() : "0",
        totalDifficulty: b.totalDifficulty ? b.totalDifficulty.toString() : "0",
        extraData: b.extraData,
        size: b.size ? b.size.toString() : "0",
        gasLimit: b.gasLimit.toString(),
        gasUsed: b.gasUsed.toString(),
        timestamp: b.timestamp.toString(),
        transactions: (b.transactions || []).map((x) => (typeof x === "string" ? x : x.hash)),
      } },
    { upsert: true }
  );
};

const procesarBloque = async (currentBlock) => {
  if (!currentBlock) return;
  await guardarBloque(currentBlock);
  if (!Array.isArray(currentBlock.transactions) || currentBlock.transactions.length === 0) return;

  for (const txHash of currentBlock.transactions) {
    const txInfo = await web3.eth.getTransaction(
      typeof txHash === "string" ? txHash : txHash.hash.toString()
    );
    if (!txInfo) continue;
    txInfo.from = txInfo.from.toLowerCase();
    if (txInfo.to) txInfo.to = txInfo.to.toLowerCase();

    // Una creacion de contrato no tiene destino: sin esto reventaba.
    if (!txInfo.to) { await guardarTransaccionNormal(txInfo, currentBlock); continue; }

    const isContract = await isContractAddress(txInfo.to);
    if (!isContract) {
      await guardarTransaccionNormal(txInfo, currentBlock);
      continue;
    }

    const contractInstance = new web3.eth.Contract(ABI, txInfo.to);
    const events = await contractInstance.getPastEvents("allEvents", {
      fromBlock: currentBlock.number,
      toBlock: currentBlock.number,
    });

    // Un contrato al que se le llama pero que no emite ningun evento
    // reconocible seguia siendo una transaccion: se guarda igual, si no
    // desaparecia del historial de quien la hizo.
    if (!events || events.length === 0) {
      await guardarTransaccionNormal(txInfo, currentBlock);
      continue;
    }

    for (const event of events) {
      if (event.event === "Transfer") {
        await guardarTransferenciaToken(event, txInfo, contractInstance, currentBlock);
      } else {
        await guardarEventoDeContrato(event, txInfo, currentBlock);
      }
    }
  }
};

/* ¿La cadena de ahí fuera es la misma que la que hay indexada?
 *
 * ══ POR QUE HACE FALTA PREGUNTARLO ══════════════════════════════════════════
 *
 * El 25 de agosto la 5550 se reinicio con un genesis nuevo. El explorador se
 * quedo mudo y nadie lo noto en el acto, porque por fuera parecia sano: la
 * altura la lee del RPC y salia bien.
 *
 * Lo que pasaba estaba aqui abajo. La marca de progreso decia 92.834 -la punta
 * de la cadena muerta- y la cadena nueva iba por 1.500. Como `desde > punta`,
 * el indexador se daba por adelantado y volvia sin hacer nada. No habria
 * indexado un solo bloque hasta que la cadena nueva pasara los 92.834, o sea
 * diez dias y medio despues. Mientras tanto servia las 23 transacciones de una
 * cadena que ya no existe, apuntando a bloques que nadie puede abrir.
 *
 * ══ COMO SE PREGUNTA ════════════════════════════════════════════════════════
 *
 * Por el hash del bloque CERO, que es la huella de la cadena entera: dos
 * cadenas distintas no pueden compartirlo. Comparar alturas no bastaria —una
 * cadena reiniciada acaba pasando la altura vieja y desde ahi el enredo seria
 * silencioso y permanente—.
 *
 * Cuesta una llamada al nodo por vuelta. Es barato al lado de servir datos de
 * una cadena que se murio.
 */
const mismaCadena = async () => {
  const cero = await web3.eth.getBlock(0);
  const guardado = await Block.findOne({ number: "0" }).lean();
  /* En la duda NO se borra. Solo se declara «otra cadena» cuando hay dos
     hashes de verdad y son distintos: si al nodo se le escapa el bloque cero,
     o si lo guardado esta a medias, la respuesta es «la misma» y no se toca
     nada. Equivocarse hacia el borrado costaria tirar una base buena; hacia el
     otro lado, esperar a la vuelta siguiente. */
  if (guardado && guardado.hash && cero && cero.hash) {
    return String(guardado.hash).toLowerCase() === String(cero.hash).toLowerCase();
  }
  if (guardado) return true;
  // Sin bloque cero guardado no hay con que comparar el hash. Se cae al
  // criterio pobre pero util: lo indexado tiene que caber en la cadena de hoy.
  const doc = await Progreso.findOne({ clave: "ultimoBloque" });
  if (!doc) return true;
  return Number(doc.valor) <= Number(await web3.eth.getBlockNumber());
};

/* Lo indexado pertenece a otra cadena: se tira entero.
   Se borra TODO y no solo la marca de progreso. Dejar los bloques y las
   transacciones viejas mezclados con los nuevos daria un explorador que
   responde a todo y miente en la mitad, que es peor que uno vacio. */
const olvidarLaCadenaVieja = async () => {
  const antes = {
    bloques: await Block.estimatedDocumentCount(),
    transacciones: await Transaction.estimatedDocumentCount(),
  };
  await Block.deleteMany({});
  await Transaction.deleteMany({});
  await Address.deleteMany({});
  await Token.deleteMany({});
  await Progreso.deleteMany({ clave: "ultimoBloque" });
  console.log(
    `[ogscan] la cadena no es la que estaba indexada: se borran ${antes.bloques} ` +
    `bloques y ${antes.transacciones} transacciones viejas, y se indexa desde cero`
  );
};

/* UNA VUELTA A LA VEZ.
 *
 * El temporizador dispara cada 15 s sin preguntar si la anterior termino. Casi
 * siempre da igual —una vuelta normal tarda menos— pero cuando una tarda mas,
 * dos pasadas corren a la vez sobre los mismos bloques: trabajo doble contra
 * el nodo y contra Mongo, y la marca de progreso puede irse hacia atras porque
 * la vuelta lenta la escribe despues que la rapida.
 *
 * Se vio al borrar la cadena vieja: tirar 92.838 bloques tardo mas de 15 s, y
 * el registro enseño el mensaje de borrado DOS veces y `indexados 0..149` otras
 * dos. Los upserts hicieron que no se rompiera nada, pero eso fue suerte, no
 * diseño.
 */
let vueltaEnCurso = false;

const revisarNuevosBloques = async () => {
  if (vueltaEnCurso) return;
  vueltaEnCurso = true;
  try {
    if (!(await mismaCadena())) await olvidarLaCadenaVieja();
    const punta = Number(await web3.eth.getBlockNumber());
    const doc = await Progreso.findOne({ clave: "ultimoBloque" });
    // Sin marca previa se empieza por el principio: asi el explorador se pone
    // al dia solo con toda la historia, en vueltas sucesivas.
    let desde = doc ? Number(doc.valor) + 1 : Number(process.env.OG_DESDE_BLOQUE || 0);
    if (desde > punta) return;

    const hasta = Math.min(punta, desde + TOPE_POR_VUELTA - 1);
    for (let n = desde; n <= hasta; n++) {
      const b = await web3.eth.getBlock(n, true);
      await procesarBloque(b);
      await Progreso.updateOne(
        { clave: "ultimoBloque" },
        { $set: { valor: String(n) } },
        { upsert: true }
      );
    }
    if (hasta > desde || hasta % 50 === 0) {
      console.log(`indexados ${desde}..${hasta} de ${punta}`);
    }
  } catch (error) {
    console.error("Error al revisar bloques:", error);
  } finally {
    // En `finally` y no al final del `try`: si la vuelta revienta, la bandera
    // tiene que soltarse igual. Si no, un fallo suelto dejaria el indexador
    // callado para siempre y por fuera se veria sano.
    vueltaEnCurso = false;
  }
};

const guardarTransferenciaToken = async (
  event,
  txInfo,
  contractInstance,
  currentBlock
) => {
  try {
    const from = event.returnValues[0].toLowerCase();
    const to = event.returnValues[1].toLowerCase();
    const rawValue = event.returnValues[2];

    const symbol = await contractInstance.methods.symbol().call();
    const decimals = await contractInstance.methods.decimals().call();
    const value = web3.utils.fromWei(rawValue.toString(), "ether");

    const eventObject = {
      addressContract: event.address.toLowerCase(),
      nonce: txInfo.nonce.toString(),
      hash: txInfo.hash.toString(),
      blockHash: txInfo.blockHash,
      blockNumber: txInfo.blockNumber.toString(),
      transactionIndex: txInfo.transactionIndex.toString(),
      from,
      to,
      value: value.toString(),
      gas: currentBlock.gasUsed.toString(),
      gasPrice: txInfo.gasPrice.toString(),
      input: event.event,
      timestamp: currentBlock.timestamp.toString(),
      symbol: symbol.toString(),
    };

    await Transaction.updateOne(
      { hash: txInfo.hash.toString() },
      { $setOnInsert: eventObject },
      { upsert: true }
    );
    console.log("tx saved tokens");
  } catch (error) {
    if (error.code !== 11000) {
      console.error("Error al guardar la transacción de token:", error);
    }
  }
};

const guardarEventoDeContrato = async (event, txInfo, currentBlock) => {
  try {
    const from = txInfo.from.toLowerCase();
    const to = txInfo.to ? txInfo.to.toLowerCase() : null;

    const contractTransaction = {
      nonce: txInfo.nonce.toString(),
      hash: txInfo.hash.toString(),
      blockHash: txInfo.blockHash.toString(),
      blockNumber: txInfo.blockNumber.toString(),
      transactionIndex: txInfo.transactionIndex.toString(),
      from,
      to,
      value: web3.utils.fromWei(txInfo.value.toString(), "ether"),
      gas: currentBlock.gasUsed.toString(),
      gasPrice: txInfo.gasPrice.toString(),
      input: txInfo.input,
      timestamp: currentBlock.timestamp.toString(),
      symbol: "CONTRACT",
    };

    await Transaction.updateOne(
      { hash: txInfo.hash.toString() },
      { $setOnInsert: contractTransaction },
      { upsert: true }
    );

    await updateAddress(from, contractTransaction);
    if (to) await updateAddress(to, contractTransaction);

    console.log("Contract transaction saved");
  } catch (error) {
    if (error.code !== 11000) {
      console.error("Error al guardar evento de contrato:", error);
    }
  }
};

const guardarTransaccionNormal = async (txInfo, currentBlock) => {
  try {
    const from = txInfo.from.toLowerCase();
    const to = txInfo.to ? txInfo.to.toLowerCase() : null;

    const transactionData = {
      nonce: txInfo.nonce.toString(),
      hash: txInfo.hash.toString(),
      blockHash: txInfo.blockHash.toString(),
      blockNumber: txInfo.blockNumber.toString(),
      transactionIndex: txInfo.transactionIndex.toString(),
      from,
      to,
      value: web3.utils.fromWei(txInfo.value.toString(), "ether"),
      gas: currentBlock.gasUsed.toString(),
      gasPrice: txInfo.gasPrice.toString(),
      input: txInfo.input,
      timestamp: currentBlock.timestamp.toString(),
      symbol: "ORIGEN",
    };

    await Transaction.updateOne(
      { hash: txInfo.hash.toString() },
      { $setOnInsert: transactionData },
      { upsert: true }
    );
    console.log("tx saved");
  } catch (error) {
    if (error.code !== 11000) {
      console.error("Error al guardar transacción normal:", error);
    }
  }
};

module.exports = revisarNuevosBloques;
