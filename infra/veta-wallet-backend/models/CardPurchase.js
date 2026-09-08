import { Schema, model } from "mongoose";

// ============================================================
// LA COMPRA DE UNA TARJETA.
//
// Existe por lo mismo que CardFunding: son dos cosas que pasan en sitios
// distintos —el usuario paga ORIGEN en la cadena 5550, y el emisor crea la
// tarjeta en su sistema— y entre una y otra puede morirse el dyno, caerse la
// red o contestar 500 el emisor.
//
// Sin memoria, cada uno de esos cortes deja el peor de los dos finales: o se
// cobró y no hay tarjeta, o hay tarjeta y no se cobró. Con memoria hay un solo
// camino y se puede retomar.
//
// ESTADOS
//   pendiente  el pago salió (hash emitido) y todavía no está confirmado
//   pagada     el ORIGEN ya es de la casa; falta que el emisor cree la tarjeta
//   emitida    tarjeta creada; operación completa
//   devuelta   el pago no entró o se deshizo; no se cobró nada
//
// El estado «pagada» es el que salva el caso feo: si el emisor falla después
// de cobrar, la compra se queda ahí y el siguiente intento NO vuelve a cobrar
// — reintenta la emisión. Se paga una vez.
// ============================================================

const CardPurchase = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true, index: true },

    // El precio, congelado en el momento de cobrar. Los tres, porque los tres
    // hacen falta para explicar un cobro seis meses después: cuántos dólares
    // costaba, cuántos ORIGEN se cobraron y a qué precio estaba el ORIGEN.
    precioUsd: { type: Number, required: true },
    origenAmount: { type: Number, required: true },
    origenPriceUsd: { type: Number, required: true },

    // De dónde salió el ORIGEN.
    //   interno   del saldo comprado con depósitos de USDT (decremento atómico)
    //   cadena    el usuario firma una transferencia en la 5550
    fuente: { type: String, enum: ["cadena", "interno"], default: "cadena" },

    // A dónde fue. Se guarda aunque sea siempre la misma: el día que cambie,
    // los cobros viejos tienen que seguir diciendo a dónde fueron ELLOS.
    destino: { type: String, required: true },

    ogTxHash: { type: String, index: true },
    pagadaEn: { type: Date },

    // La tarjeta que salió de esta compra.
    cryptomateCardId: { type: String },
    emitidaEn: { type: Date },

    estado: {
      type: String,
      enum: ["pendiente", "pagada", "emitida", "devuelta"],
      default: "pendiente",
      index: true,
    },
    error: { type: String },
  },
  { timestamps: true }
);

// Una compra sin terminar por persona. Es el candado contra dos peticiones a
// la vez: la segunda choca con el índice en vez de cobrar dos veces.
CardPurchase.index(
  { userId: 1, estado: 1 },
  { unique: true, partialFilterExpression: { estado: { $in: ["pendiente", "pagada"] } } }
);

export default model("CardPurchase", CardPurchase);
