const { Web3 } = require("web3");
const web3 = new Web3("https://ordenglobal-rpc.com/");
import Transaction from "../Models/Transaction";
import Token from "../Models/TokenTx";

const ABI = require("../ABI/abi.json");

export const getTransactionsByAddress = async (req, res) => {
  try {
    const { address } = req.params;

    const addressData = await Transaction.find({
      $or: [{ from: address.toLowerCase() }, { to: address.toLowerCase() }],
    }).sort({ timestamp: -1 });

    const allTransactions = addressData.map((transaction) =>
      createTransactionData(transaction)
    );

    const balanceWei = await web3.eth.getBalance(address);
    const balanceEther = web3.utils.fromWei(balanceWei, "ether");
    const result = await getTokenBalances(address);

    res.status(200).json({
      transactions: allTransactions,
      balance: balanceEther,
      tokensBalance: result,
    });
  } catch (error) {
    console.log(error);
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
  const results = {};

  for (const [symbol, address] of Object.entries(tokenAddresses)) {
    const token = new web3.eth.Contract(ABI, address);

    const [name, balanceRaw] = await Promise.all([
      token.methods.name().call(),
      token.methods.balanceOf(walletAddress).call(),
    ]);

    const balance = web3.utils.fromWei(
      balanceRaw,
      "ether"
    );

    results[symbol] = {
      name,
      balance: balance.toString(),
      contractAddress: address,
    };
  }

  return results;
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
