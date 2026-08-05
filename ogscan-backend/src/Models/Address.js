import { Schema, model } from "mongoose";

const Address = new Schema({
  address: {
    type: String,
    unique: true,
  },
  transacciones: {
    type: [],
    ref: "Transaction",
  },
});

export default model("Address", Address);
