import { Schema, model } from "mongoose";

// ============================================================
// SFSP-410 · una entrega de ORIGEN EN CADENA por un deposito de USDT.
//
// Solo existe con SFSP410_EMISION=1. Con el interruptor apagado, un deposito
// sigue acreditando el saldo interno (OrigenBalance) y esta coleccion ni se
// toca.
//
// Con el interruptor encendido, un deposito ya NO sube el saldo interno: el
// ORIGEN sale de la boveda (SFSPNativeVault.releaseOnDemand) directo a la
// direccion del usuario. Esta fila es la memoria de esa entrega — la que dice
// si ya salio, si esta esperando a gobierno o si hay que mirarla — y se
// escribe ANTES de firmar nada: si el proceso muere a mitad, la fila queda
// 'pendiente' y la proxima revision la retoma.
//
// La referencia de pago (paymentRef) es la del deposito y no se repite nunca:
//   SFSP410/v1|veta|deposito-usdt|<_id del Deposit>
// Por eso reintentar es seguro: si la entrega ya habia salido, la cadena
// contesta OperationReplay y se lee la primera (lib/sfsp410.js).
// ============================================================

const EntregaOrigen = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true, index: true },
    // El Deposit que la origina. Una entrega por deposito, garantizado.
    depositId: { type: Schema.Types.ObjectId, required: true, unique: true },
    destino: { type: String, required: true },

    // Wei de ORIGEN (18 decimales), como texto: se compara con BigInt.
    origenWei: { type: String, required: true },

    canonica: { type: String, required: true, unique: true },
    paymentRef: { type: String, required: true, unique: true },
    evidenceRoot: { type: String, required: true },

    estado: {
      type: String,
      enum: ["pendiente", "entregada", "cola-gobierno", "esperar", "en-duda", "rechazada", "revisar"],
      required: true,
      default: "pendiente",
    },
    codigo: { type: String, default: null },
    mensaje: { type: String, default: null },
    hash: { type: String, default: null },
    intentos: { type: Number, default: 0 },
    ultimoIntento: { type: Date, default: null },
    entregadaEn: { type: Date, default: null },
  },
  { timestamps: true, collection: "sfsp410Entregas" }
);

EntregaOrigen.index({ estado: 1, ultimoIntento: 1 });

export default model("EntregaOrigen", EntregaOrigen);
