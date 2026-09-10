import { Schema, model } from "mongoose";

// ============================================================
// Un deposito de USDT convertido a ORIGEN.
//
// Es el historial que le explica al usuario de donde salio cada ORIGEN de su
// saldo interno: cuanto USDT entro, a que precio de ORIGEN se convirtio y
// cuando. Sin esto el saldo es un numero sin procedencia, y ante un reclamo
// no hay nada que mirar.
//
// Se escribe una fila por cada acreditacion, no por cada transferencia
// on-chain: si alguien manda tres veces antes de que revisemos, la deteccion
// ve un solo delta y acredita una vez. El monto es correcto; lo que se pierde
// es el desglose, y eso es aceptable frente a la alternativa de leer el
// historial completo de Polygon en cada consulta.
// ============================================================

const Deposit = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true, index: true },
    address: { type: String, required: true },

    network: { type: String, default: "POLYGON" },
    token: { type: String, default: "USDT" },

    // Lo que entro, en unidades minimas y en decimal para leerlo
    usdtWei: { type: String, required: true },
    usdtAmount: { type: Number, required: true },

    // Lo que se acredito
    origenAmount: { type: Number, required: true },
    origenPriceUsd: { type: Number, required: true },

    // Marca de agua del saldo antes y despues: deja auditable que la suma
    // de los depositos coincide con creditedUsdtWei.
    fromWei: { type: String, required: true },
    toWei: { type: String, required: true },
  },
  { timestamps: true }
);

export default model("Deposit", Deposit);
