const { Web3 } = require("web3");
const web3 = new Web3("https://ordenglobal-rpc.com/");
import Transaction from "../Models/Transaction";

export const allTransactions = async (req, res) => {
  try {
    const allTransactionsFromDB = await Transaction.find({}).sort({
      blockNumber: -1,
    });

    const allTransactions = allTransactionsFromDB.map((transaction) => {
      return {
        nonce: transaction.nonce.toString(),
        hash: transaction.hash.toString(),
        blockHash: transaction.blockHash.toString(),
        blockNumber: transaction.blockNumber.toString(),
        transactionIndex: transaction.transactionIndex.toString(),
        from: transaction.from.toLowerCase().toString(),
        to: transaction.to
          ? transaction.to.toLowerCase().toString()
          : "0x00000000000000000000000000000000000",
        value: transaction.value.toString(),
        gasPrice: transaction.gasPrice.toString(),
        input: transaction.input.toString(),
        timestamp: transaction.timestamp.toString(),
        symbol: transaction.symbol ? transaction.symbol.toString() : "",
        addressContract: transaction.addressContract
          ? transaction.addressContract.toString()
          : null,
      };
    });

    res.status(200).json({ transactions: allTransactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const idTransaction = async (req, res) => {
  try {
    const { hash } = req.params;

    const transactionFromDB = await Transaction.findOne({ hash: hash });

    if (!transactionFromDB) {
      res.status(404).json({ error: "Transacción no encontrada" });
      return;
    }

    const transactionData = {
      nonce: transactionFromDB.nonce.toString(),
      hash: transactionFromDB.hash.toString(),
      blockHash: transactionFromDB.blockHash.toString(),
      blockNumber: transactionFromDB.blockNumber.toString(),
      transactionIndex: transactionFromDB.transactionIndex.toString(),
      from: transactionFromDB.from.toLowerCase().toString(),
      to: transactionFromDB.to
        ? transactionFromDB.to.toLowerCase().toString()
        : "0x00000000000000000000000000000000000",
      value: transactionFromDB.value.toString(),
      gas: transactionFromDB.gas.toString(),
      gasPrice: transactionFromDB.gasPrice.toString(),
      input: transactionFromDB.input.toString(),
      timestamp: transactionFromDB.timestamp.toString(),
      symbol: transactionFromDB.symbol
        ? transactionFromDB.symbol.toString()
        : "",
      addressContract: transactionFromDB.addressContract
        ? transactionFromDB.addressContract.toString()
        : null,
    };

    res.status(202).json({ transaction: transactionData });
  } catch (error) {
    console.log(error);
  }
};

export const totalTranscations = async (req, res) => {
  try {
    const allTransactionsFromDB = await Transaction.find({});
    const transactionCount = allTransactionsFromDB.length;

    res.status(200).json({
      totalTransactions: transactionCount,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
