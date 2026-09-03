// Los envíos de la billetera, reportados al monitoreo de Genesis ID.
//
// POR QUE NO EXISTIA ESTO
//
// El puente ya tenía la ruta `/genesis/movimientos` y Genesis ID tenía el motor
// de reglas entero —umbrales, ventana de 30 días, velocidad, fraccionamiento,
// cuenta nueva con volumen alto— y abría casos solo. Lo único que faltaba era
// que alguien lo llamara: NADIE lo hacía. La billetera movía dinero todos los
// días y el monitoreo llevaba meses evaluando una lista vacía, así que ninguna
// regla podía saltar nunca. Un motor antilavado sin entrada no es un motor
// apagado: es uno que responde «todo en orden» a una pregunta que nadie le hizo.
//
// TRES DECISIONES QUE CONVIENE NO CAMBIAR
//
// 1. Se reporta DESPUES de que la transacción ya salió, y nunca antes. Un
//    reporte que bloqueara o retrasara un envío convertiría una caída de
//    Genesis en una caída de la billetera. El control PREVENTIVO es otro y va
//    antes: el tamizado de la dirección de destino, en `lib/tamizDestino.js`.
//    Esta línea decía que ese tamizado «ya se hace», y durante meses no se
//    hacía en ningún sitio — ni en la web, ni en la app, ni acá. Un comentario
//    que asegura un control inexistente es peor que no tenerlo: el siguiente
//    que pase lo da por hecho y no lo busca.
//
// 2. No se espera la respuesta ni se reintenta con insistencia. Si el reporte
//    falla queda un `console.error` y sigue la vida: llegar tarde al monitoreo
//    es un problema; tumbar el envío de alguien, uno peor.
//
// 3. Al usuario NUNCA se le dice si su movimiento disparó una alerta. Saberlo
//    le enseña a esquivar la regla, y en la mayoría de jurisdicciones avisarle
//    está expresamente prohibido. Por eso esta función no devuelve nada útil.

const BASE = () => (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '');
const CLAVE = () => (process.env.GENESIS_API_KEY || '').trim();

/**
 * El precio del ORIGEN en dólares.
 *
 * Los umbrales del monitoreo están en dólares, así que hay que convertir. Se usa
 * la MISMA variable que ya usa la tarjeta (`OG_TOKEN_PRICE_USD`) para que no
 * haya dos precios distintos en la casa: si un día se separan, la mitad del
 * sistema cobraría a un precio y la otra mitad reportaría a otro.
 *
 * Sin la variable puesta se devuelve null y el movimiento se reporta con
 * `montoUsd: 0`, que en la práctica lo deja fuera de los umbrales. Es la
 * decisión honesta: antes que inventar un precio, se reporta el hecho y se
 * anota que no se pudo valorar.
 */
function precioOrigenUsd() {
  const p = parseFloat(process.env.OG_TOKEN_PRICE_USD);
  return Number.isFinite(p) && p > 0 ? p : null;
}

async function llamar(ruta, cuerpo) {
  const clave = CLAVE();
  if (!clave) return false;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 8000);
  try {
    const r = await fetch(BASE() + ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': clave },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
    if (!r.ok) {
      console.error('[aml] Genesis rechazó el reporte:', r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[aml] no se pudo reportar el movimiento:', e?.message);
    return false;
  } finally {
    clearTimeout(reloj);
  }
}

/** El GID de quien envía, buscado por su correo. null si no está verificado. */
async function gidDe(email) {
  const clave = CLAVE();
  if (!clave || !email) return null;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 8000);
  try {
    const r = await fetch(`${BASE()}/api/v1/identidades/por-email/${encodeURIComponent(email)}`,
      { headers: { 'X-API-Key': clave }, signal: control.signal });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.identidad?.gid || null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Reporta un envío. No espera a nadie y no lanza nunca.
 *
 * @param {object} m
 * @param {string} m.email      correo del que envía (para resolver su GID)
 * @param {string} m.hash       hash de la transacción — es también su id
 * @param {string} m.destino    dirección de destino
 * @param {number|string} m.monto  cantidad en unidades humanas
 * @param {string} m.activo     ORIGEN, AUKA, el símbolo del token…
 * @param {boolean} [m.esOrigen] si el activo es la moneda base, para valorarlo
 */
export function reportarEnvio(m) {
  // Fuera del camino de la respuesta a propósito: el usuario ya recibió su
  // hash y nada de lo que pase aquí puede hacerle esperar.
  (async () => {
    try {
      const gid = await gidDe(m.email);
      // Sin identidad verificada no hay a quién atribuir el movimiento. No es
      // un fallo: es una persona que todavía no completó su KYC, y el monitoreo
      // es por identidad.
      if (!gid) return;

      const monto = Number(m.monto) || 0;
      const precio = m.esOrigen ? precioOrigenUsd() : null;

      await llamar('/api/v1/movimientos', {
        gid,
        movimientos: [{
          // El hash es el id: si el mismo envío se reporta dos veces —un
          // reintento, un redespliegue— Genesis lo descarta por duplicado en
          // vez de contarlo dos veces contra los umbrales.
          id: m.hash,
          direccion: 'salida',
          contraparte: m.destino,
          monto,
          activo: m.activo,
          montoUsd: precio ? monto * precio : 0,
          fecha: new Date().toISOString(),
          hash: m.hash,
        }],
      });
    } catch (e) {
      console.error('[aml] reporte de envío fallido:', e?.message);
    }
  })();
}

export default { reportarEnvio };
