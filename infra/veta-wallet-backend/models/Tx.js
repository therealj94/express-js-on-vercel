import { Schema, model } from "mongoose";

const Tx = new Schema({
  amount: {
    type: Number,
    required: true
  },
  recipient: {
    type: String,
    required: true
  },
  hash: {
    type: String,
    required: true
  },
  chain_id: {
    type: String,
    required: true
  },
  coin: {
    type: String,
    required: true
  }
});

export default model("Tx",Tx )