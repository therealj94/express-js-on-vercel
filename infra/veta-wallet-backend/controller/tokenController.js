import axios from "axios";
import ChainId from "../models/ChainId";
import jwt from "jsonwebtoken";
import { Contract } from "ethers/contract";
import { JsonRpcProvider } from "ethers/providers";
import abi from "../ABI/abi.json";
import { formatEther } from "ethers/utils";

// esta tambien
export const allTokens = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;
    const { chain_id } = req.params;
    console.log(chain_id)

    const chain = await ChainId.findOne({ chain_id: chain_id });
    if (!chain) {
      return res.status(404).json({ message: "chain not found" });
    }

    if (chain.chain_id === 8532) {
      res.json([]);
    } else {
      const apiUrl = `${chain.api_scan}/api?module=account&action=tokentx&address=${address}&apikey=${chain.api_key}`;

      const response = await axios.get(apiUrl);
      const transactions = response.data.result;

      if (Array.isArray(transactions)) {
        const tokenContracts = transactions.reduce((contracts, tx) => {
          if (
            tx.contractAddress &&
            !contracts.find((c) => c.address === tx.contractAddress)
          ) {
            contracts.push({
              address: tx.contractAddress,
              tokenName: tx.tokenName,
              tokenSymbol: tx.tokenSymbol,
            });
          }
          return contracts;
        }, []);
        const tokenDataPromises = tokenContracts.map(async (contract) => {
          const provider = new JsonRpcProvider(chain.provider);
          const contract1 = new Contract(contract.address, abi, provider);
          const balance = await contract1.balanceOf(address);
          const balanceEther = formatEther(balance.toString());

          return {
            addressToken: contract.address,
            tokenName: contract.tokenName,
            tokenSymbol: contract.tokenSymbol,
            balance: balanceEther,
          };
        });

        const tokenData = await Promise.all(tokenDataPromises);
        res.json(tokenData);
      } else {
        res.json([]);
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const allNFT = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;
    const { chain_id } = req.params;

    const chain = await ChainId.findOne({ chain_id: chain_id });
    if (!chain) {
      return res.status(404).json({ message: "chain not found" });
    }

    const apiUrl = `${chain.api_scan}/api?module=account&action=tokennfttx&address=${address}&apikey=${chain.api_key}`;

    const response = await axios.get(apiUrl);
    const transactions = response.data.result;
    const tokenContracts = transactions.reduce((contracts, tx) => {
      if (tx.contractAddress && !contracts.includes(tx.contractAddress)) {
        contracts.push(tx.contractAddress);
      }
      return contracts;
    }, []);

    const tokenDataPromises = tokenContracts.map(async (contractAddress) => {
      const url2 = `${chain.api_scan}/api?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&tag=latest&apikey=${chain.api_key}`;
      const response2 = await axios.get(url2);
      const balance = response2.data.result;

      return { addressToken: contractAddress, balance };
    });

    const tokenData = await Promise.all(tokenDataPromises);

    res.json(tokenData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// esta tambien
export const tokenAddre2 = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      {
        algorithm: "HS256",
      }
    );
    const address = decodedToken.address;
    const { chain_id, addr } = req.params;

    const chain = await ChainId.findOne({ chain_id: chain_id });
    if (!chain) {
      return res.status(404).json({ message: "chain not found" });
    }

    if (chain.chain_id === 8532) {
      const response = await axios.get(
        `https://orden-global-scan-c4abe71e8024.herokuapp.com/address/${address}`
      );

      const txOndk = response.data.transactions;

      const tokenDataPromises = [];

      for (const tx of txOndk) {
        if (
          tx.addressContract &&
          tx.addressContract.toLowerCase() === addr.toLowerCase()
        ) {
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
            tokenDataPromises.push(transferSend);
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
            tokenDataPromises.push(transferRecive);
          }
        }
      }

      res.json(tokenDataPromises);
    } else {
      const tokenDataPromises = [];

      const url3 = `${chain.api_scan}/api?module=account&action=tokentx&contractaddress=${addr}&address=${address}&apikey=${chain.api_key}`;
      const responseTx = await axios.get(url3);
      const txData = responseTx.data.result;

      await Promise.all(
        txData.map(async (tx) => {
          if (
            tx.from &&
            address &&
            tx.from.toLowerCase() === address.toLowerCase()
          ) {
            const sentTransaction = {
              hash: tx.hash,
              value: tx.value,
              to: tx.to,
              type: "send",
              timeStamp: tx.timeStamp,
            };
            tokenDataPromises.push(sentTransaction);
          } else if (
            tx.to &&
            address &&
            tx.to.toLowerCase() === address.toLowerCase()
          ) {
            const receivedTransaction = {
              hash: tx.hash,
              value: tx.value,
              from: tx.from,
              type: "receive",
              timeStamp: tx.timeStamp,
            };
            tokenDataPromises.push(receivedTransaction);
          }
        })
      );

      res.json(tokenDataPromises);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getTokenData = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;
    const { chain_id, addr } = req.params;

    const chain = await ChainId.findOne({ chain_id: chain_id });
    if (!chain) {
      return res.status(404).json({ message: "chain not found" });
    }

    const provider = new JsonRpcProvider(chain.provider);
    const contract = new Contract(addr, abi, provider);
    const balance = await contract.balanceOf(address);
    const balanceEther = formatEther(balance.toString());
    const tokenName = await contract.name();
    const tokenSymbol = await contract.symbol();

    const tokenInfo = {
      addressToken: addr,
      tokenName: tokenName,
      tokenSymbol: tokenSymbol,
      balance: balanceEther,
    };

    res.json(tokenInfo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// // export const tokenAddre = async (req, res) => {
// //   try {
// //     const token = req.headers.authorization;
// //     const decodedToken = jwt.verify(
// //       token.split(" ")[1],
// //       process.env.PASS_TOKEN,
// //       { algorithm: "HS256" }
// //     );
// //     const address = decodedToken.address;
// //     const { chain_id, addr } = req.params;

// //     const chain = await ChainId.findOne({ chain_id: chain_id });
// //     if (!chain) {
// //       return res.status(404).json({ message: "chain not found" });
// //     }

// //     const apiUrl = `${chain.api_scan}/api?module=account&action=tokentx&contractaddress=${addr}&address=${address}&apikey=${chain.api_key}`;

// //     const response = await axios.get(apiUrl);
// //     const txData = response.data.result;

// //     const tokenDataPromises = [];

// //     for (const tx of txData) {
// //       if (
// //         tx.contractAddress &&
// //         tx.contractAddress.toLowerCase() === addr.toLowerCase()
// //       ) {
// //         const provider = new JsonRpcProvider(chain.provider);
// //         const contract = new Contract(tx.contractAddress, abi, provider);
// //         const balance = await contract.balanceOf(address);
// //         const balanceEther = formatEther(balance.toString());

// //         const tokenInfo = {
// //           addressToken: tx.contractAddress,
// //           tokenName: tx.tokenName,
// //           tokenSymbol: tx.tokenSymbol,
// //           balance: balanceEther,
// //           transactions: [],
// //         };

// //         if (tx.from && tx.from.toLowerCase() === address.toLowerCase()) {
// //           const transaction = {
// //             hash: tx.hash,
// //             value: tx.value,
// //             to: tx.to,
// //             type: "send",
// //             timeStamp: tx.timeStamp,
// //           };

// //           tokenInfo.transactions.push(transaction);
// //         }

// //         if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
// //           const transaction = {
// //             hash: tx.hash,
// //             value: tx.value,
// //             from: tx.from,
// //             type: "receive",
// //             timeStamp: tx.timeStamp,
// //           };

// //           tokenInfo.transactions.push(transaction);
// //         }

// //         tokenDataPromises.push(tokenInfo);
// //       }
// //     }

// //     res.json(tokenDataPromises);
// //   } catch (error) {
// //     console.error(error);
// //     res.status(500).json({ message: "Server error" });
// //   }
// // };
