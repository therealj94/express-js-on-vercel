const { Web3 } = require("web3");
const web3 = new Web3("https://ordenglobal-rpc.com/");
import Block from "../Models/Block";
import Transaction from "../Models/Transaction";
import Address from "../Models/Address";
import Token from "../Models/TokenTx";
import ABI from "../ABI/abi.json";

const isContractAddress = async (address) => {
  const bytecode = await web3.eth.getCode(address.toLowerCase());
  return bytecode !== "0x";
};

const revisarNuevosBloques = async () => {
  try {
    const currentBlockNumber = await web3.eth.getBlockNumber();
    const lastProcessedBlock = await Block.findOne({
      number: currentBlockNumber.toString(),
    });

    if (lastProcessedBlock) return;

    const currentBlock = await web3.eth.getBlock(currentBlockNumber, true);
    if (!currentBlock) return;

    console.log("New block:", currentBlock.number.toString());

    if (
      Array.isArray(currentBlock.transactions) &&
      currentBlock.transactions.length > 0
    ) {
      for (const txHash of currentBlock.transactions) {
        const txInfo = await web3.eth.getTransaction(txHash.hash.toString());
        txInfo.from = txInfo.from.toLowerCase();
        if (txInfo.to) txInfo.to = txInfo.to.toLowerCase();

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

        for (const event of events) {
          if (event.event === "Transfer") {
            await guardarTransferenciaToken(
              event,
              txInfo,
              contractInstance,
              currentBlock
            );
          } else {
            await guardarEventoDeContrato(event, txInfo, currentBlock);
          }
        }
      }
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
