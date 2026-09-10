import { Schema, model } from "mongoose";

// Almacena eventos de tarjeta relevantes para notificar al usuario en la app
const CardEvent = new Schema(
  {
    userId:     { type: Schema.Types.ObjectId, ref: "Users", required: true },
    cardId:     { type: String, required: true },      // cryptomateCardId
    type:       { type: String, required: true },      // "DECLINED", "BLOCKED", etc.
    amount:     { type: Number },
    /* El mismo monto en ORIGEN. Se guarda CONGELADO y no se calcula al leer:
       el precio de ORIGEN se mueve, y un aviso que dice hoy una cifra y mañana
       otra por el mismo pago no es un aviso, es una duda. Va en null si el
       precio no se pudo leer en ese momento. */
    origenAmount: { type: Number, default: null },
    currency:   { type: String, default: "USD" },
    merchant:   { type: String },
    message:    { type: String },
    readAt:     { type: Date, default: null },          // null = no leído
  },
  { timestamps: true }
);

export default model("CardEvent", CardEvent);
