import { Schema, model } from "mongoose";

// ============================================================
// Saldo ORIGEN interno de un usuario.
//
// Es el ORIGEN que compró depositando USDT, y NO es el ORIGEN nativo de la
// chain 8532 que ya tiene en su wallet. Son dos cosas distintas a proposito:
// este saldo lo llevamos nosotros en la base, el otro vive en la cadena. Mas
// adelante se conectan —este saldo se emite on-chain y desaparece de aqui—
// pero hasta entonces no se mezclan, porque el ORIGEN on-chain se puede
// firmar y enviar y este no.
//
// El respaldo del saldo es el USDT que el usuario deposito y que sigue en su
// propia direccion de Polygon. No se mueve: mover requiere gas en POL que el
// usuario no tiene, y dejandolo quieto cada deposito queda atribuido a quien
// lo hizo.
//
// ---- Como se detecta un deposito ----
//
// No hay watcher ni webhook: se compara el saldo USDT on-chain contra lo ya
// acreditado. Si la cadena dice 50 y creditedUsdtWei dice 30, entraron 20
// nuevos. Es idempotente por construccion —releer da el mismo delta— y no
// depende de haber estado escuchando en el momento exacto del deposito.
//
// Por eso creditedUsdtWei es String y no Number: son unidades minimas de
// USDT (6 decimales) y se comparan como BigInt. Un Number pierde precision
// y un centavo mal contado aqui es un centavo regalado o cobrado de mas.
// ============================================================

const OrigenBalance = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      unique: true,
      index: true,
    },

    // Saldo disponible, en ORIGEN. Number alcanza: la conversion parte de un
    // precio de oro que ya es aproximado, asi que no hay exactitud que
    // preservar mas alla de lo que un double representa de sobra.
    origen: { type: Number, required: true, default: 0 },

    // Total de USDT ya convertido, en unidades minimas (6 decimales).
    // Es la marca de agua que hace idempotente la deteccion.
    creditedUsdtWei: { type: String, required: true, default: "0" },

    lastCheckedAt: { type: Date },
  },
  { timestamps: true }
);

export default model("OrigenBalance", OrigenBalance);
