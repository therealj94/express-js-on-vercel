/**
 * LA TARJETA DE QUIEN ESTÁ VENDIENDO.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * Que al vender ORIGEN por USDT, el destino salga PUESTO: la dirección de
 * recarga de la tarjeta de esa misma persona. Vender ORIGEN y que el dinero
 * caiga en su tarjeta es, con otras palabras, recargar la tarjeta desde
 * Ordenex — que es lo que José pidió.
 *
 * Pegar una dirección de Polygon a mano es de las cosas que más se rompen:
 * cuarenta y dos caracteres, una sola letra cambiada, y el USDT se va a una
 * dirección que no existe para nadie. Si la casa ya sabe cuál es, la pone.
 *
 * ── POR QUÉ SE LE PREGUNTA A LA WALLET Y NO A CRYPTOMATE ────────────────────
 * Porque la llave de CryptoMate vive en la wallet, y ahí se queda. Copiarla
 * aquí era lo rápido: una credencial de dinero en dos casas se rota el doble
 * de veces, se filtra por el doble de sitios, y el día que haya que cortarla
 * hay que acordarse de las dos. Ordenex pregunta; la wallet contesta.
 *
 * ── LO QUE NUNCA SE PIDE ────────────────────────────────────────────────────
 * La dirección se pide SIEMPRE con la `direccionWallet` de la SESIÓN, jamás
 * con una que venga en la petición. Si el cliente pudiera decir de quién
 * quiere la tarjeta, cualquiera con una cuenta podría ir descubriendo dónde
 * se recarga la tarjeta de los demás. Se ve la propia y ninguna más.
 *
 * ── SI LA WALLET NO CONTESTA ────────────────────────────────────────────────
 * No se inventa una dirección ni se deja el campo con la de otro: se dice que
 * no se pudo saber y la persona la escribe. Una venta con el destino en blanco
 * es un inconveniente; una venta con el destino equivocado es dinero perdido.
 */

/* Función y no constante, igual que `donde()` y `clave()`. Leída una sola vez
   al cargar el módulo, cambiar la variable después no servía de nada — y eso
   no es solo un problema de las pruebas: en producción el módulo se carga al
   arrancar, así que tocar la variable en Heroku sin reiniciar no habría hecho
   nada y nadie habría entendido por qué. */
const plazoMs = () => Number(process.env.WALLET_PLAZO_MS || 12_000);

const donde = () => String(process.env.WALLET_URL || '').trim().replace(/\/+$/, '');
const clave = () => String(process.env.CASA_CLAVE || '').trim();

const hay = () => !!(donde() && clave());

/**
 * ¿Dónde se recarga la tarjeta de esta dirección custodiada?
 *
 * Nunca lanza. Devuelve siempre un objeto que la pantalla puede pintar:
 * `{ tiene: false, porQue }` es una respuesta buena, no un error — mucha
 * gente todavía no tiene tarjeta y eso no es un fallo de nadie.
 */
async function recargaDe(direccionWallet) {
  const d = String(direccionWallet || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(d)) {
    return { tiene: false, porQue: 'esta cuenta no tiene una dirección custodiada válida' };
  }
  if (!hay()) {
    return { tiene: false, porQue: 'Ordenex no está enlazado con la wallet (faltan WALLET_URL o CASA_CLAVE)' };
  }
  try {
    const r = await fetch(`${donde()}/cards/interno/recarga?address=${encodeURIComponent(d)}`, {
      headers: { 'X-Casa-Clave': clave() },
      signal: AbortSignal.timeout(plazoMs()),
    });
    if (r.status === 403) return { tiene: false, porQue: 'la wallet no reconoció la clave entre casas' };
    const j = await r.json().catch(() => null);
    if (!r.ok) return { tiene: false, porQue: j?.message || `la wallet contestó ${r.status}` };
    if (!j?.tiene) return { tiene: false, porQue: j?.porQue || 'sin tarjeta', last4: j?.last4 ?? null };

    /* Se comprueba lo que llega. La wallet es de la casa, pero una dirección
       mal formada que se pinte por defecto es exactamente el fallo que esto
       venía a evitar — y confiar sin mirar es cómo un error de allá se
       convierte en dinero perdido acá. */
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(j.direccion || ''))) {
      return { tiene: false, porQue: 'la wallet devolvió una dirección de recarga con forma rara' };
    }
    return {
      tiene: true,
      last4: j.last4 ?? null,
      titular: j.titular ?? null,
      red: j.red || 'POLYGON',
      direccion: j.direccion,
      monedas: Array.isArray(j.monedas) ? j.monedas : [],
    };
  } catch (e) {
    return {
      tiene: false,
      porQue: e?.name === 'TimeoutError'
        ? `la wallet tardó más de ${Math.round(plazoMs() / 1000)} s en contestar`
        : `no se pudo hablar con la wallet: ${String(e?.message || e).slice(0, 90)}`,
    };
  }
}

module.exports = { hay, recargaDe, donde };
