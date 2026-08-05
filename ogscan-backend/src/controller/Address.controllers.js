const { Web3 } = require("web3");
const web3 = new Web3("https://ordenglobal-rpc.com/");
import Transaction from "../Models/Transaction";
import Token from "../Models/TokenTx";

const ABI = require("../ABI/abi.json");

export const getTransactionsByAddress = async (req, res) => {
  try {
    const { address } = req.params;

    // Sin validar, una direccion mal escrita hacia que web3.eth.getBalance
    // lanzara y la respuesta era un 500 generico. Se valida y se responde 400.
    if (!/^0x[a-fA-F0-9]{40}$/.test(String(address || ""))) {
      return res.status(400).json({
        error: "Se espera una direccion (0x + 40 caracteres)",
        recibido: address,
      });
    }

    const addr = address.toLowerCase();

    // `timestamp` es String en el esquema, asi que .sort({ timestamp: -1 })
    // ordenaba alfabeticamente. Se ordena por numero de bloque real.
    const addressData = await Transaction.aggregate([
      { $match: { $or: [{ from: addr }, { to: addr }] } },
      { $addFields: { _bn: { $toDouble: { $ifNull: ["$blockNumber", "0"] } },
                      _ti: { $toDouble: { $ifNull: ["$transactionIndex", "0"] } } } },
      { $sort: { _bn: -1, _ti: -1 } },
    ]);

    const allTransactions = addressData.map((transaction) =>
      createTransactionData(transaction)
    );

    // El saldo nativo y el de los tokens son consultas independientes al nodo.
    // Antes se pedian en serie (await, await, await…): la respuesta tardaba la
    // suma de todas. Se piden en paralelo. Y si el nodo falla en el saldo, la
    // direccion se muestra igual con sus transacciones en vez de dar un 500.
    let balanceEther = null;
    let tokensBalance = {};
    try {
      const [balanceWei, tk] = await Promise.all([
        web3.eth.getBalance(addr),
        getTokenBalances(addr),
      ]);
      balanceEther = web3.utils.fromWei(balanceWei, "ether");
      tokensBalance = tk;
    } catch (e) {
      console.error("[getTransactionsByAddress] saldo:", e.message);
    }

    res.status(200).json({
      transactions: allTransactions,
      balance: balanceEther,
      tokensBalance,
    });
  } catch (error) {
    console.error("[getTransactionsByAddress]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const getTokenData = async (req, res) => {
  try {
    const addressToken = req.params.token;

    // Esta ruta espera la DIRECCION del contrato, no el simbolo. Antes, pasarle
    // "AGKA" hacia que web3 lanzara una excepcion y la respuesta era un 500 con
    // "Error al obtener eventos" — un mensaje que sugiere una caida del
    // servidor cuando en realidad el dato de entrada estaba mal. Se valida
    // primero y se responde 400 explicando que hace falta.
    if (!/^0x[a-fA-F0-9]{40}$/.test(String(addressToken || ""))) {
      return res.status(400).json({
        error: "Se espera la direccion del contrato (0x + 40 caracteres), no el simbolo del token",
        recibido: addressToken,
      });
    }

    const contract = new web3.eth.Contract(ABI, addressToken);

    const tokenData = await contract.methods.symbol().call();
    const name = await contract.methods.name().call();
    const totalSupply = await contract.methods.totalSupply().call();
    const decimal = await contract.methods.decimals().call();

    const tokenTX = await Transaction.find({
      addressContract: addressToken.toLowerCase(),
    }).sort({ timestamp: -1 });;
    let allTransactions = [];
    if (tokenTX) {
      allTransactions = tokenTX.map((transaction) =>
        createTransactionData(transaction)
      );
    }

    const result = {
      tokenData: {
        symbol: tokenData.toString(),
        name: name.toString(),
        totalSupply: totalSupply.toString(),
        decimal: decimal.toString(),
      },
      transactions: allTransactions,
    };
    res.json({ result: result });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error al obtener eventos" });
  }
};


const tokenAddresses = {
  AGKA: "0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B",
  ONDK: "0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1",
  AUKA: "0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B",
};

const getTokenBalances = async (walletAddress) => {
  // Se consultan los tres tokens a la vez, no uno tras otro. Y si uno falla
  // (contrato caido, nodo lento), los demas se muestran igual — antes un solo
  // fallo hacia caer la respuesta entera de la direccion.
  const entradas = await Promise.all(
    Object.entries(tokenAddresses).map(async ([symbol, address]) => {
      try {
        const token = new web3.eth.Contract(ABI, address);
        const [name, balanceRaw] = await Promise.all([
          token.methods.name().call(),
          token.methods.balanceOf(walletAddress).call(),
        ]);
        return [symbol, {
          name,
          balance: web3.utils.fromWei(balanceRaw, "ether").toString(),
          contractAddress: address,
        }];
      } catch (e) {
        console.error(`[getTokenBalances] ${symbol}:`, e.message);
        return [symbol, { name: symbol, balance: "0", contractAddress: address, error: true }];
      }
    })
  );

  return Object.fromEntries(entradas);
};

function createTransactionData(transaction) {
  return {
    nonce: transaction.nonce ? transaction.nonce.toString() : null,
    hash: transaction.hash ? transaction.hash.toString() : null,
    blockHash: transaction.blockHash ? transaction.blockHash.toString() : null,
    blockNumber: transaction.blockNumber
      ? transaction.blockNumber.toString()
      : null,
    transactionIndex: transaction.transactionIndex
      ? transaction.transactionIndex.toString()
      : null,
    from: transaction.from ? transaction.from.toString() : null,
    to: transaction.to
      ? transaction.to.toString()
      : "0x00000000000000000000000000000000000",
    value: transaction.value ? transaction.value.toString() : null,
    gas: transaction.gas ? transaction.gas.toString() : null,
    gasPrice: transaction.gasPrice ? transaction.gasPrice.toString() : null,
    input: transaction.input ? transaction.input.toString() : null,
    timestamp: transaction.timestamp ? transaction.timestamp.toString() : null,
    symbol: transaction.symbol ? transaction.symbol.toString() : "",
    addressContract: transaction.addressContract
      ? transaction.addressContract.toString()
      : null,
  };
}
