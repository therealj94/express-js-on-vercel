// Le dice al panel de analítica de Genesis ID cuánta gente hay registrada aquí.
//
// La telemetría solo ve a quien abre la app DESPUÉS de encenderla. Veta Wallet
// tiene usuarios desde hace meses: sin esto, el panel los cuenta como si no
// existieran y el negocio parece más chico de lo que es. Una cifra que
// subestima se ve igual de convincente que una correcta, y por eso es peor que
// no tener ninguna.
//
// Se manda al arrancar y cada seis horas. Si Genesis ID no responde, se
// reintenta en el próximo ciclo y no se registra nada: es una métrica, no una
// venta, y no puede ensuciar el registro del servidor.

import Users from "../models/Users";

const BASE = (process.env.GENESIS_URL || "https://genesis-id.onrender.com").replace(/\/$/, "");
const CLAVE = (process.env.GENESIS_TELEMETRIA_KEY || process.env.GENESIS_API_KEY || "").trim();

export async function declararPadron() {
  if (!CLAVE) return;
  try {
    const registrados = await Users.countDocuments({});
    const hace30 = new Date(Date.now() - 30 * 86400000);
    // `updatedAt` es lo más cercano a «se le vio» que hay en este modelo. Si el
    // esquema no lo tiene, la consulta devuelve 0 y se manda sin ese dato en vez
    // de inventarlo.
    const activos30 = await Users.countDocuments({ updatedAt: { $gte: hace30 } }).catch(() => 0);

    await fetch(`${BASE}/api/v1/telemetria/censo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": CLAVE },
      body: JSON.stringify({
        registrados,
        activos30: activos30 || undefined,
      }),
    });
  } catch (e) {
    // A propósito en silencio.
  }
}

/**
 * Sincroniza el directorio de usuarios con Genesis ID.
 *
 * La proyección de Mongo es una LISTA BLANCA, no un descarte. En esta misma
 * colección viven `privateKey`, `seed` y `password`: si se pidiera «todo menos
 * eso», el día que alguien agregue otro campo sensible al modelo se copiaría
 * solo a una segunda base de datos sin que nadie lo decidiera. Así, un campo
 * nuevo NO sale de aquí hasta que se agregue a mano a esta lista.
 */
export async function sincronizarDirectorio() {
  if (!CLAVE) return;
  try {
    const LOTE = 500;
    let saltar = 0;
    for (;;) {
      const usuarios = await Users.find({}, {
        _id: 1, email: 1, name: 1, username: 1, address: 1, phone: 1,
        country: 1, city: 1, role: 1, isVerified: 1, kycStatus: 1,
        tokens: 1, nfts: 1, deletedAt: 1, createdAt: 1, updatedAt: 1,
      }).skip(saltar).limit(LOTE).lean();
      if (!usuarios.length) break;

      await fetch(`${BASE}/api/v1/directorio/sincronizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": CLAVE },
        body: JSON.stringify({
          usuarios: usuarios.map((u) => ({
            idExterno: String(u._id),
            email: u.email,
            nombre: u.name,
            usuario: u.username,
            telefono: u.phone,
            pais: u.country,
            ciudad: u.city,
            direccionWallet: u.address,
            rol: u.role,
            verificado: Boolean(u.isVerified),
            kyc: u.kycStatus,
            estado: u.deletedAt ? "borrada" : "activa",
            creadoEn: u.createdAt,
            // `updatedAt` es lo más cercano a «se le vio» que tiene el modelo.
            ultimoAcceso: u.updatedAt,
            extra: {
              tokens: Array.isArray(u.tokens) ? u.tokens.length : 0,
              nfts: Array.isArray(u.nfts) ? u.nfts.length : 0,
            },
          })),
        }),
      });

      if (usuarios.length < LOTE) break;
      saltar += LOTE;
    }
  } catch (e) {
    // En silencio, igual que el censo.
  }
}

export function arrancarCenso() {
  setTimeout(sincronizarDirectorio, 20000).unref?.();
  setInterval(sincronizarDirectorio, 6 * 3600 * 1000).unref?.();
  setTimeout(declararPadron, 10000).unref?.();
  setInterval(declararPadron, 6 * 3600 * 1000).unref?.();
}
