const { Web3 } = require("web3");
// El nodo de la cadena sale de OG_RPC. Estaba escrito a fuego en cinco
// archivos, asi que apuntar el explorador a otra red obligaba a editar
// codigo. Sin la variable se comporta igual que siempre.
const RPC_CADENA = process.env.OG_RPC || "https://ordenglobal-rpc.com/";

const web3 = new Web3(RPC_CADENA);
import Block from "../Models/Block";

export const allBlocks1 = async (req, res) => {
  try {
    const lastBlockCount = req.query.lastBlock;
    const blocksFromDB = await Block.find({})
      .sort({ number: -1 })
      .limit(lastBlockCount);

    const blockInfo = blocksFromDB.map((block) => {
      return {
        number: block.number.toString(),
        nonce: block.nonce.toString(),
        hash: block.hash.toString(),
        miner: block.miner.toString(),
        difficulty: block.difficulty.toString(),
        totalDifficulty: block.totalDifficulty.toString(),
        extraData: block.extraData.toString(),
        size: block.size.toString(),
        gasLimit: block.gasLimit.toString(),
        gasUsed: block.gasUsed.toString(),
        timestamp: block.timestamp.toString(),
        transactions: block.transactions.length,
      };
    });

    res.status(202).json({ blockInfo: blockInfo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en la solicitud" });
  }
};

export const idBlock1 = async (req, res) => {
  try {
    const { id } = req.params;
    const blockNumber = Number(id);

    // Verifica que el número sea válido
    if (isNaN(blockNumber)) {
      return res.status(400).json({ error: "ID de bloque no válido" });
    }

    const block = await Block.findOne({ number: blockNumber });

    if (!block) {
      return res
        .status(404)
        .json({ error: "No se encontró información para este bloque" });
    }

    const blockData = {
      number: block.number.toString(),
      nonce: block.nonce.toString(),
      hash: block.hash.toString(),
      miner: block.miner.toString(),
      difficulty: block.difficulty.toString(),
      totalDifficulty: block.totalDifficulty.toString(),
      extraData: block.extraData.toString(),
      size: block.size.toString(),
      gasLimit: block.gasLimit.toString(),
      gasUsed: block.gasUsed.toString(),
      timestamp: block.timestamp.toString(),
    };

    res.status(202).json({ blockInfo: blockData });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error al obtener información del bloque" });
  }
};

export const totalBlock = async (req, res) => {
  try {
    const confirmedBlockNumber = await web3.eth.getBlockNumber();
    const blockMax = Number(confirmedBlockNumber);
    const string = blockMax.toString();
    res.status(202).json({ blockTotal: string });
  } catch (error) {
    console.log(error);
  }
};

export const idBlock = async (req, res) => {
  try {
    const { id } = req.params;
    const blockNumber = Number(id);
    // Verifica que el número sea válido
    if (isNaN(blockNumber)) {
      return res.status(400).json({ error: "ID de bloque no válido" });
    }
    const confirmedBlockNumber = await web3.eth.getBlockNumber();
    const blockMax = Number(confirmedBlockNumber);

    if (blockNumber > blockMax) {
      return res.status(404).json({ error: "No se mino este bloque aun" });
    }

    const block = await web3.eth.getBlock(blockNumber);
    if (!block) {
      return res.status(404).json({ error: "El nodo no devolvio ese bloque" });
    }

    // Antes esta respuesta no incluia las transacciones, ni siquiera cuantas.
    // La consecuencia era que la ficha de un bloque en el explorador mostraba
    // siempre "Transacciones 0", incluso en bloques que claramente tenian gas
    // gastado — y no habia forma de llegar desde un bloque a sus transacciones.
    const transactions = Array.isArray(block.transactions)
      ? block.transactions.map((t) => (typeof t === "string" ? t : t?.hash)).filter(Boolean)
      : [];

    const blockData = {
      number: block.number.toString(),
      nonce: block.nonce?.toString() ?? "0",
      hash: block.hash?.toString() ?? "",
      // En PolyBFT `miner` es siempre la direccion cero: el proponente del
      // bloque va firmado dentro de extraData, no en esta cabecera. Se envia
      // tal cual viene del nodo, pero el cliente no debe presentarlo como
      // "validador" porque no lo es.
      miner: block.miner?.toString() ?? "",
      difficulty: block.difficulty?.toString() ?? "0",
      totalDifficulty: block.totalDifficulty?.toString() ?? "0",
      extraData: block.extraData?.toString() ?? "",
      size: block.size?.toString() ?? "0",
      gasLimit: block.gasLimit?.toString() ?? "0",
      gasUsed: block.gasUsed?.toString() ?? "0",
      timestamp: block.timestamp?.toString() ?? "0",
      parentHash: block.parentHash?.toString() ?? "",
      transactions,
      transactionCount: transactions.length,
    };

    res.status(200).json({ blockInfo: blockData });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error al obtener información del bloque" });
  }
};

// Cuantos bloques devuelve si no se pide una cantidad, y el techo duro.
const BLOQUES_POR_DEFECTO = 10;
const BLOQUES_MAXIMO = 50;

export const allBlocks = async (req, res) => {
  try {
    // Antes esto era `const lastBlock = req.query.lastBlock` a secas. Sin el
    // parametro en la URL quedaba `undefined`, y `blockNumber - undefined` da
    // NaN: la condicion del bucle era falsa desde la primera vuelta y la ruta
    // devolvia siempre una lista vacia. Por eso /block/allBlocks no mostraba
    // nada. Ahora hay un valor por defecto.
    //
    // Y hay un techo: el bucle lanza una consulta al nodo por cada bloque, en
    // paralelo. Con ?lastBlock=100000 salian cien mil consultas de golpe contra
    // el mismo nodo que sostiene la cadena — cualquiera podia tumbarlo desde el
    // navegador.
    const pedido = Number.parseInt(req.query.lastBlock, 10);
    const cantidad = Number.isFinite(pedido) && pedido > 0
      ? Math.min(pedido, BLOQUES_MAXIMO)
      : BLOQUES_POR_DEFECTO;

    const confirmedBlockNumber = await web3.eth.getBlockNumber("lasted");
    const blockNumber = Number(confirmedBlockNumber);

    const blockPromises = [];
    // `i > blockNumber - cantidad` (no `>=`): pedir 3 devolvia 4 bloques.
    for (let i = blockNumber; i > blockNumber - cantidad && i >= 0; i--) {
      blockPromises.push(web3.eth.getBlock(i));
    }

    const blockResponses = await Promise.all(blockPromises);
    const blockInfo = [];
    for (const block of blockResponses) {
      // Un bloque puede venir null si el nodo aun no lo tiene. Antes se accedia
      // a block.number igual y reventaba toda la peticion con un 500.
      if (!block) continue;

      blockInfo.push({
        number: block.number.toString(),
        nonce: block.nonce?.toString() ?? "0",
        hash: block.hash?.toString() ?? "",
        miner: block.miner?.toString() ?? "",
        difficulty: block.difficulty?.toString() ?? "0",
        totalDifficulty: block.totalDifficulty?.toString() ?? "0",
        extraData: block.extraData?.toString() ?? "",
        size: block.size?.toString() ?? "0",
        gasLimit: block.gasLimit?.toString() ?? "0",
        gasUsed: block.gasUsed?.toString() ?? "0",
        timestamp: block.timestamp?.toString() ?? "0",
        transactions: Array.isArray(block.transactions) ? block.transactions.length : 0,
      });
    }

    res.status(200).json({ blockInfo });
  } catch (error) {
    console.error("[allBlocks]", error);
    res.status(500).json({ error: "Error en la solicitud" });
  }
};
