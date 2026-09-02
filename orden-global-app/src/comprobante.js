// ============================================================
// El comprobante de un envío: lo que se lee de la cadena y lo que se
// comparte.
//
// Sin imports a propósito, igual que intencion.js: así la prueba
// (pruebas/probar-comprobante.cjs) lo lee y lo ejecuta tal cual, con la
// misma aritmética que corre en el teléfono. Lo que sí necesita red —pedir el
// recibo al RPC— vive en api.js y llama a `leerRecibo` de aquí.
//
// POR QUÉ HACE FALTA
//
// El comprobante decía «Enviado» en cuanto el backend devolvía el hash, y el
// backend devuelve el hash SIN esperar el bloque (ver transactionController:
// esperar el minado pasaba el corte de 30 s de Heroku). O sea que la pantalla
// verde salía con la transacción todavía en el aire. Un banco no te da el
// recibo hasta que el movimiento está asentado; acá el asiento es el recibo
// de la cadena: `eth_getTransactionReceipt` con número de bloque y estado.
// ============================================================

// A dónde lleva «Ver en OrdenScan». Es la misma ruta /tx/<hash> que enlazan
// la web, el chat y la ficha de cada moneda; app.json puede cambiarla por
// `extra.exploradorTx` sin recompilar.
export const EXPLORADOR_TX_POR_OMISION = 'https://ordenscan.com/tx/';

const HASH = /^0x[a-fA-F0-9]{64}$/;

export const esHash = (h) => HASH.test(String(h || ''));

export function enlaceExplorador(hash, base = EXPLORADOR_TX_POR_OMISION) {
  if (!esHash(hash)) return null;
  return String(base || EXPLORADOR_TX_POR_OMISION).replace(/\/?$/, '/') + hash;
}

// De hex a número sin BigInt: el bloque y el gas caben de sobra en un double,
// y Number.parseInt con base 16 corre en cualquier motor.
const deHex = (h) => {
  if (h == null) return null;
  const n = typeof h === 'number' ? h : Number.parseInt(String(h), 16);
  return Number.isFinite(n) ? n : null;
};

/**
 * Traduce lo que devuelve `eth_getTransactionReceipt` a algo que una pantalla
 * pueda mostrar sin saber de hexadecimales.
 *
 *   null        → la red todavía no la incluyó en ningún bloque (o el RPC
 *                 devolvió vacío). Hay que volver a preguntar.
 *   { confirmada: true, exito, bloque, gasUsado, hash }
 *                 `exito` es false cuando la cadena la incluyó y la RECHAZÓ
 *                 (status 0): el monto no se movió, el gas sí. Es null en
 *                 nodos viejos que no informan estado.
 */
export function leerRecibo(crudo) {
  if (!crudo || typeof crudo !== 'object') return null;
  const bloque = deHex(crudo.blockNumber);
  // Sin bloque no hay recibo: algunos nodos devuelven el objeto con los
  // campos en null mientras la transacción sigue pendiente.
  if (bloque == null) return null;
  const estado = crudo.status == null ? null : deHex(crudo.status);
  return {
    confirmada: true,
    exito: estado == null ? null : estado === 1,
    bloque,
    gasUsado: deHex(crudo.gasUsed),
    hash: crudo.transactionHash || null,
  };
}

/**
 * El texto que se comparte. Los rótulos llegan de fuera (`r`) para que salga
 * en el idioma de la app sin que este archivo sepa de i18n.
 *
 *   r = { titulo, enviado, para, fecha, red, bloque, estado, confirmada,
 *         pendiente, comprobante }
 */
export function textoComprobante(d, r) {
  const lineas = [r.titulo];
  const usd = d.usd ? ` (≈ ${d.usd})` : '';
  lineas.push(`${r.enviado}: ${d.monto} ${d.simbolo}${usd}`);
  lineas.push(`${r.para}: ${d.paraNombre ? `${d.paraNombre} · ` : ''}${d.para}`);
  lineas.push(`${r.fecha}: ${d.fecha}`);
  lineas.push(`${r.red}: ${d.red}`);
  if (d.bloque != null) lineas.push(`${r.bloque}: #${d.bloque}`);
  lineas.push(`${r.estado}: ${d.confirmada ? r.confirmada : r.pendiente}`);
  if (d.enlace) lineas.push(`${r.comprobante}: ${d.enlace}`);
  return lineas.join('\n');
}
