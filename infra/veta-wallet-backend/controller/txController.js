import axios from "axios";
import ChainId from "../models/ChainId";
import Users from "../models/Users";
import Tx from "../models/Tx";
// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
export const getTxForChainIdScan = async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;
    // Antes esto leia config.json, que es un ARRAY de 6 cadenas, con
    // `config[id]` donde id es un chain_id (137, 56, 1...). Un array indexado
    // por 137 devuelve undefined, asi que este endpoint solo podia funcionar
    // para los ids 0 a 5 — es decir, para ninguna cadena real. Ademas leia
    // `chainData.api` y la clave del JSON es `api_scan`.
    //
    // La coleccion ChainId ya tiene exactamente estos datos y se consulta por
    // chain_id de verdad. Se lee de ahi y config.json deja de existir.
    const chainData = await ChainId.findOne({ chain_id: Number(id) });
    if (!chainData) {
      res.status(404).json({ message: "chain no encontrada" });
      return;
    }
    const scanUrl = chainData.api_scan;
    if (!scanUrl) {
      res
        .status(400)
        .json({
          message: "la cadena no tiene un URL de explorador configurado",
        });
      return;
    }
    // La clave sale de la cadena o del entorno. Antes estaba escrita aqui, en
    // el codigo, publicada en el repositorio.
    const apiKey = chainData.api_key || process.env.SCAN_API_KEY || "";
    const apiUrl = `${scanUrl}?module=account&action=txlist&address=${address}&apikey=${encodeURIComponent(apiKey)}`;
    const response = await axios.get(apiUrl);

    const transactions = response.data.result;

    const transactionData = [];
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const hash = transaction.hash;
      const functionName = transaction.functionName;

      const transactionInfo = { hash: hash, functionName: functionName };
      transactionData.push(transactionInfo);
    }
    res.json(transactionData);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "error al obtener los tokens de la cuenta" });
  }
};

// export const addTxForBD = async (req, res) => {
//   try {
//     const { amount, recipient, hash, chain_id, coin, address } = req.body;

//     const user = await Users.findOne({ address: address });

//     if (!user) {
//       return res.status(404).json({ message: "user not found" });
//     }

//     const newTransaction = new Tx({
//       amount: amount ,
//       recipient: recipient,
//       hash: hash,
//       chain_id: chain_id,
//       coin: coin
//     });

//     user.transaction.push(newTransaction);

//     await Promise.all([user.save(), newTransaction.save()])

//     res.status(201).json({ message: "transaction added to user successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "error adding transaction to user" });
//   }

// }

export const allTx = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const transactions = user.transaction;

    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving transactions" });
  }
};

export const txForId = async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;

    console.log("index", id);
    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const transaction = user.transaction[id];

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving transaction" });
  }
};

export const txForChainId = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;
    const { chain_id } = req.body;

    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    console.log("user", user);

    const transactions = user.transaction.filter(
      (tx) => tx.chain_id === chain_id
    );
    console.log("transactions", transactions);

    if (transactions.length === 0) {
      return res
        .status(404)
        .json({ message: "No transactions found for the given chain_id" });
    }

    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving transactions" });
  }
};

export const txForChainIdForIndex = async (req, res) => {
  try {
    const { id } = req.params;
    const { chain_id } = req.body;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;
    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const transactions = user.transaction.filter(
      (tx) => tx.chain_id === chain_id
    );

    if (transactions.length === 0) {
      return res
        .status(404)
        .json({ message: "No transactions found for the given chain_id" });
    }

    if (transactions.length <= id) {
      return res.status(404).json({ message: "No existe ese index" });
    }

    res.json(transactions[id]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving transactions" });
  }
};
