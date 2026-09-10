const { Web3 } = require("web3");
// El nodo de la cadena sale de OG_RPC. Estaba escrito a fuego en cinco
// archivos, asi que apuntar el explorador a otra red obligaba a editar
// codigo. Sin la variable se comporta igual que siempre.
const RPC_CADENA = process.env.OG_RPC || "https://ordenglobal-rpc.com/";

const web3 = new Web3(RPC_CADENA);
import Transaction from "../Models/Transaction";
import Token from "../Models/TokenTx";

const ABI = require("../ABI/abi.json");
import { estadoDeDireccion } from "../lib/genesis";

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
    // Que tokens ha tocado esta direccion, para no consultar los 16 al nodo.
    const relevantes = [...new Set(
      addressData.map((t) => String(t.symbol || "").toUpperCase()).filter(Boolean)
    )];

    let balanceEther = null;
    let tokensBalance = {};
    let esContrato = false;
    // Genesis ID va fuera del try del saldo: si el servicio de identidad falla,
    // la ficha tiene que seguir mostrando saldos y transacciones igual.
    // `estadoDeDireccion` nunca lanza — devuelve consultado:false.
    const genesis = await estadoDeDireccion(addr).catch(() => null);

    try {
      const [balanceWei, tk, codigo] = await Promise.all([
        web3.eth.getBalance(addr),
        getTokenBalances(addr, relevantes),
        // Distinguir una cuenta normal de un contrato es basico en cualquier
        // explorador y el dato no costaba nada: lo dice el propio nodo.
        web3.eth.getCode(addr).catch(() => "0x"),
      ]);
      balanceEther = web3.utils.fromWei(balanceWei, "ether");
      tokensBalance = tk;
      esContrato = !!codigo && codigo !== "0x";
    } catch (e) {
      console.error("[getTransactionsByAddress] saldo:", e.message);
    }

    res.status(200).json({
      transactions: allTransactions,
      balance: balanceEther,
      tokensBalance,
      esContrato,
      // `null` en verificada o sancionada significa "no se pudo comprobar",
      // que no es lo mismo que "no". El frontend distingue los tres casos.
      identidad: genesis,
      total: allTransactions.length,
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


// Los contratos se obtuvieron preguntandole a la propia cadena: se recorrieron
// todas las direcciones que aparecen como destino en las transacciones
// indexadas, se descarto lo que no tiene codigo, y a lo que quedaba se le llamo
// symbol()/name()/decimals(). Varios simbolos tienen mas de un contrato
// desplegado (AGKA e IBS, por ejemplo); se eligio el que de verdad se usa en
// las transacciones indexadas, no el primero encontrado. TXT y TKNB se dejan
// fuera a proposito: contratos de prueba, no activos del ecosistema.
const tokenAddresses = {
  ONDK: "0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1",
  AUKA: "0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B",
  AGKA: "0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B",
  IBS:  "0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62",
  HARV: "0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923",
  AUBEX: "0xF1498640B27A66C0DC505093D70911C060e04fb0",
  ASL:  "0x69846aC960D45F9946C613DFCe1b761D37Faf098",
  LOVE: "0x638F2ba0e3E1083D1ba570b449BD266F3860D164",
  REST: "0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD",
  SOL:  "0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66",
  AIT:  "0xAE14Db486872AC07d74Ad69cC09590239b21BA2e",
  AGRO: "0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe",
  MNKA: "0x18b6680CFF71c11067bec312Fc48786bE2e54Ead",
  POLITICAL: "0x92496E1848e001428A3495409a9A9f616bB6dD3B",
};

// Catalogo publico de tokens: el frontend ya no necesita llevar la lista
// escrita a mano ni quedarse desactualizado cuando se despliegue uno nuevo.
export const listaTokens = async (req, res) => {
  const entradas = await Promise.all(
    Object.entries(tokenAddresses).map(async ([symbol, address]) => {
      try {
        const c = new web3.eth.Contract(ABI, address);
        const [name, decimals, totalSupply] = await Promise.all([
          c.methods.name().call(),
          c.methods.decimals().call(),
          c.methods.totalSupply().call(),
        ]);
        return { symbol, contrato: address, nombre: String(name),
                 decimales: String(decimals), suministro: String(totalSupply) };
      } catch (e) {
        return { symbol, contrato: address, nombre: symbol, error: true };
      }
    })
  );
  res.status(200).json({ tokens: entradas });
};

// Tokens principales de la red: se consultan siempre, aunque la direccion no
// los haya movido, porque su saldo es informacion relevante igualmente.
const PRINCIPALES = ["ONDK", "AUKA", "AGKA"];

const getTokenBalances = async (walletAddress, simbolosRelevantes) => {
  // Consultar los 16 tokens serian 32 llamadas al nodo por cada ficha de
  // direccion. Se consultan los principales mas los que esa direccion ha
  // movido de verdad, que es lo unico que puede tener saldo interesante.
  const cuales = new Set(PRINCIPALES);
  (simbolosRelevantes || []).forEach((s) => {
    if (tokenAddresses[s]) cuales.add(s);
  });

  // Se consultan a la vez, no uno tras otro. Y si uno falla (contrato caido,
  // nodo lento), los demas se muestran igual — antes un solo fallo hacia caer
  // la respuesta entera de la direccion.
  const entradas = await Promise.all(
    Object.entries(tokenAddresses).filter(([s]) => cuales.has(s)).map(async ([symbol, address]) => {
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
