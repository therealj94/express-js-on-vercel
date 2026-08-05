import { Schema, model } from "mongoose";

const Token = new Schema({
  address: {
    type: String,
    unique: true,
  },
  transacciones: {
    type: [],
    ref: "Transaction",
  },
});

export default model("Token", Token);
