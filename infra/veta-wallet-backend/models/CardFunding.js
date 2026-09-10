import { Schema, model } from "mongoose";

// ============================================================
// Registro de un fondeo de tarjeta.
//
// Existe por una razon concreta: el fondeo son DOS transferencias en cadenas
// distintas —el usuario paga ORIGEN en la chain de Orden Global, y el treasury
// libera USDT en Polygon— y entre una y otra puede pasar cualquier cosa.
//
// Sin este registro, la implementacion anterior emitia el debito y liberaba el
// USDT sin esperar a que el debito se minara. Si esa transaccion no entraba al
// bloque, el treasury ya habia pagado. Y sin memoria de lo ya pagado, dos
// peticiones simultaneas liberaban USDT dos veces contra un solo debito.
//
// Estados:
//   pending   se emitio el debito de ORIGEN, todavia sin confirmar
//   debited   el debito esta minado y confirmado; falta liberar el USDT
//   funded    el USDT salio; operacion completa
//   failed    el debito se revirtio o no entro; no se libero nada
// ============================================================

const CardFunding = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true, index: true },
    cardId: { type: String, required: true },

    // Lo que el usuario pidio, en ORIGEN, y su equivalente al precio del momento
    origenAmount: { type: Number, required: true },
    usdValue: { type: Number, required: true },
    origenPriceUsd: { type: Number, required: true },
    // En unidades minimas, como texto: un Number perderia precision
    usdtAmountWei: { type: String, required: true },

    // De donde salio el ORIGEN.
    //   onchain   el usuario firma una transferencia en la chain 5550
    //   internal  se descuenta del saldo comprado con depositos de USDT
    // El interno no tiene transaccion que esperar, asi que nace ya confirmado.
    source: { type: String, enum: ["onchain", "internal"], default: "onchain" },

    // Paso 1 — el usuario paga ORIGEN al treasury
    ogTxHash: { type: String, index: true },
    ogConfirmedAt: { type: Date },

    // Paso 2 — el treasury libera USDT a la wallet de la tarjeta
    depositAddress: { type: String },
    usdtTxHash: { type: String },
    // Sella el pago. Mientras esto sea null, no se pago; una vez sellado,
    // ningun reintento vuelve a liberar fondos.
    usdtReleasedAt: { type: Date },

    status: {
      type: String,
      enum: ["pending", "debited", "funded", "failed"],
      default: "pending",
      index: true,
    },
    error: { type: String },
  },
  { timestamps: true }
);

// Un usuario no puede tener dos fondeos sin terminar a la vez. Es el candado
// que evita que dos peticiones en paralelo lean el mismo nonce y se pisen.
CardFunding.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "debited"] } } }
);

export default model("CardFunding", CardFunding);
