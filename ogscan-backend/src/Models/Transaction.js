import { Schema, model } from "mongoose";

// Define el esquema para las transacciones
const Transaction = new Schema({
  addressContract: String,
  nonce: String,
  hash: { type: String, unique: true },
  blockHash: String,
  blockNumber: String,
  transactionIndex: String,
  from: String,
  to: String,
  value: String,
  gas: String,
  gasPrice: String,
  input: String,
  timestamp: String,
  symbol: String,
});

export default model("Transaction", Transaction);
