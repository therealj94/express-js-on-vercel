import { Schema, model } from "mongoose";

const Block = new Schema({
  number: String,
  nonce: String,
  hash: { type: String, unique: true },
  miner: String,
  difficulty: String,
  totalDifficulty: String,
  extraData: String,
  size: String,
  gasLimit: String,
  gasUsed: String,
  timestamp: String,
  transactions: [String],
});

export default model("Block", Block);
