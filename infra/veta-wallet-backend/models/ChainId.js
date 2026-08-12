import { Schema, model } from "mongoose";


const ChainId = new Schema({
    name: {
      type: String,
      required: true,
      unique: true
    },
    chain_id: {
      type: Number,
      required: true,
      unique: true
    },
    symbol: {
      type: String,
      required: true,
      unique: false
    },
    image:{
      type: String
    },
    provider: {
      type: String,
      required: true,
      
    },
    scan: {
      type: String,
      required: true
    },
    api_scan:{
      type: String
    },
    api_key:{
      type: String
    }
  })

  export default model("ChainId",ChainId )