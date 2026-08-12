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

const revisarNuevosBloques = async () => {
  try {
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
