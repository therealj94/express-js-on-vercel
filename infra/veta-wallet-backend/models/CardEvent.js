import { Schema, model } from "mongoose";

// Almacena eventos de tarjeta relevantes para notificar al usuario en la app
const CardEvent = new Schema(
  {
    userId:     { type: Schema.Types.ObjectId, ref: "Users", required: true },
    cardId:     { type: String, required: true },      // cryptomateCardId
    type:       { type: String, required: true },      // "DECLINED", "BLOCKED", etc.
    amount:     { type: Number },
    currency:   { type: String, default: "USD" },
    merchant:   { type: String },
    message:    { type: String },
    readAt:     { type: Date, default: null },          // null = no leído
  },
  { timestamps: true }
);

export default model("CardEvent", CardEvent);
