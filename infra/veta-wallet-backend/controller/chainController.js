import ChainId from "../models/ChainId";
import axios from "axios";
import jwt from "jsonwebtoken";

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
      if (chain.chain_id === 8532) {
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

    if (chain.chain_id === 8532) {
      console.log(address)
      const response = await axios.get(
        `https://orden-global-scan-c4abe71e8024.herokuapp.com/address/${address}`
      );

      const txOndk = response.data.transactions;

      const allTransfers = [];

      for (const tx of txOndk) {
        if (tx.addressContract === null) {
          if (
            tx.from &&
            address &&
            tx.from.toLowerCase() === address.toLowerCase()
          ) {
            const transferSend = {
              value: tx.value,
              timeStamp: tx.timestamp,
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
              timeStamp: tx.timestamp,
              from: tx.from,
              hash: tx.hash,
              type: "recive",
            };
            allTransfers.push(transferRecive);
          }
        }
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
