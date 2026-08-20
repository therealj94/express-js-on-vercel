import ChainId from "../models/ChainId";
import axios from "axios";
// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
export const addChain = async (req, res) => {
  try {
    const { name, chain_id, symbol, image, provider, scan, api_scan, api_key } =
      req.body;

    const existingChain = await ChainId.findOne({
      $or: [{ name: name }, { chain_id: chain_id }],
    });
    if (existingChain) {
      return res.status(400).json({
        message: "chain with the same name or chain_id already exists",
      });
    }

    const newChain = new ChainId({
      name: name,
      chain_id: chain_id,
      symbol: symbol,
      image: image,
      provider: provider,
      scan: scan,
      api_scan: api_scan,
      api_key: api_key,
    });

    await newChain.save();

    res.status(201).send("chain added successfully");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "error adding coin" });
  }
};

export const getAllChain = async (req, res) => {
  try {
    const chains = await ChainId.find();

    const response = await axios.get(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest",
      {
        headers: {
          "X-CMC_PRO_API_KEY": "5ed0c580-7aaa-4538-85fb-bc88ebe8682a",
        },
        params: {
          start: 1,
          limit: 20,
          convert: "USD",
        },
      }
    );

    const tokens = response.data.data;

    const chainsWithPrice = chains.map((chain) => {
      const symbol = chain.symbol.toLowerCase();
      const filteredToken = tokens.find(
        (token) => token.symbol.toLowerCase() === symbol.toLowerCase()
      );
      let priceData;
      // El precio de ONDK no cotiza en ningun mercado publico: lo fija la casa.
      // Estaba atado al numero de la red vieja, asi que al pasar a la 5550 el
      // codigo se iba a buscarlo fuera, no lo encontraba y devolvia 0 — la web
      // enseñaba un guion donde debia haber 2,10. Se aceptan las dos redes.
      if (chain.chain_id === 5550 || chain.chain_id === 8532) {
        priceData = "2.10";
      } else {
        priceData = filteredToken ? filteredToken.quote.USD.price : "0";
      }
      // Nunca se devuelve api_key: la app no la usa y es una credencial
      // facturable de los exploradores.
      const { api_key, ...publico } = chain.toObject();
      return { ...publico, price: priceData };
    });

    res.json(chainsWithPrice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "error retrieving chains" });
  }
};

export const getChainForId = async (req, res) => {
  try {
    const { chain_id } = req.params;
    const token = req.headers.authorization;
    let decodedToken;
    try {
      decodedToken = jwt.verify(
        token?.split(" ")[1],
        process.env.PASS_TOKEN,
        { algorithm: "HS256" }
      );
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const address = decodedToken.address.toLowerCase();
    const chain = await ChainId.findOne({ chain_id: chain_id });

    if (!chain) {
      return res.status(404).json({ message: "Chain not found" });
    }

    if (chain.chain_id === 5550 || chain.chain_id === 8532) {
      console.log(address)
      const response = await axios.get(
        `https://orden-global-scan-c4abe71e8024.herokuapp.com/address/${address}`
      );

      const txOndk = response.data.transactions;

      const allTransfers = [];

      /* Antes aquí había un `if (tx.addressContract === null)` que descartaba
         TODA transferencia de token antes de mandarla: una transferencia de
         ERC-20 siempre trae la dirección de su contrato, así que ninguna
         pasaba. Por eso la Actividad enseñaba solo ORIGEN y un envío de ONDK
         hecho de verdad no aparecía en ningún lado — ni en la web ni en el
         teléfono, que leen esta misma lista.

         El explorador ya entrega el token decodificado (símbolo, unidades
         humanas, y `from`/`to` con los TITULARES, no el contrato), así que lo
         único que había que hacer era dejarlo pasar y arrastrar el símbolo.

         Se mandan además las dos formas de cada campo —`timeStamp` y
         `timestamp`, `type` y `direction`— porque lo que ya está instalado
         ahí fuera lee las viejas: quitarlas dejaría sin fecha a quien no haya
         actualizado. Las nuevas son las que se leen bien. */
      for (const tx of txOndk) {
        const mia = (x) => x && x.toLowerCase() === address.toLowerCase();
        const sale = mia(tx.from);
        const entra = mia(tx.to);
        if (!sale && !entra) continue;

        allTransfers.push({
          value: tx.value,
          // en segundos, como lo guarda el explorador
          timeStamp: tx.timestamp,
          timestamp: tx.timestamp,
          from: tx.from || null,
          to: tx.to || null,
          hash: tx.hash,
          // el símbolo es lo que separa 0,5 ORIGEN de 0,5 ONDK en la lista
          symbol: tx.symbol || null,
          addressContract: tx.addressContract || null,
          esToken: Boolean(tx.addressContract),
          type: sale ? "send" : "recive",
          direction: sale ? "out" : "in",
        });
      }
      const priceData = "2.10";
      const { api_key: _k1, ...chainPublico } = chain.toObject();
      const chainWithPrice = {
        ...chainPublico,
        price: priceData,
        allTransfers: allTransfers,
      };

      res.json(chainWithPrice);
    } else {
      const response = await axios.get(
        "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest",
        {
          headers: {
            "X-CMC_PRO_API_KEY": "5ed0c580-7aaa-4538-85fb-bc88ebe8682a",
          },
          params: {
            start: 1,
            limit: 20,
            convert: "USD",
          },
        }
      );

      const tokens = response.data.data;

      const symbol = chain.symbol.toLowerCase();
      const filteredToken = tokens.find(
        (token) => token.symbol.toLowerCase() === symbol.toLowerCase()
      );
      const priceData = filteredToken ? filteredToken.quote.USD.price : "0";

      const url3 = `${chain.api_scan}/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${chain.api_key}`;

      const response1 = await axios.get(url3);

      const transactions = response1.data.result;

      const allTransfers = [];

      for (const tx of transactions) {
        if (tx.functionName === "") {
          if (
            tx.from &&
            address &&
            tx.from.toLowerCase() === address.toLowerCase()
          ) {
            const transferSend = {
              value: tx.value,
              timeStamp: tx.timeStamp,
              to: tx.to,
              hash: tx.hash,
              type: "send",
            };
            allTransfers.push(transferSend);
          } else if (
            tx.to &&
            address &&
            tx.to.toLowerCase() === address.toLowerCase()
          ) {
            const transferRecive = {
              value: tx.value,
              timeStamp: tx.timeStamp,
              from: tx.from,
              hash: tx.hash,
              type: "recive",
            };
            allTransfers.push(transferRecive);
          }
        }
      }

      const { api_key: _k1, ...chainPublico } = chain.toObject();
      const chainWithPrice = {
        ...chainPublico,
        price: priceData,
        allTransfers: allTransfers,
      };

      res.json(chainWithPrice);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "error retrieving chain" });
  }
};
