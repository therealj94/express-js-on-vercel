// ─────────────────────────────────────────────────────────────────────────────
// El recibo.
//
// Un comprobante que el cliente o el comercio puede guardar, compartir por
// WhatsApp o mandar a imprimir. Lleva lo que un recibo tiene que llevar para
// valer como constancia:
//
//   · monto en lempiras Y en ORIGEN, con la tasa que se usó
//   · el hash de la transacción en la cadena 8532, que es la prueba de que el
//     dinero se movió y cualquiera puede verificar en el explorador
//   · fecha, concepto y comercio
//
// Se arma como HTML y se convierte a PDF con el motor del teléfono. Sin
// servidor: un recibo que depende de que una API siga viva dentro de un año no
// es un recibo.
// ─────────────────────────────────────────────────────────────────────────────

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { lempiras, origen } from './pos'

export interface DatosRecibo {
  codigo: string
  concepto: string
  negocio: string
  montoHnl: number
  montoOrigen: number
  tasaHnlPorOrigen: number
  txHash: string | null
  fecha: string
  /** 'pago' lo ve el cliente; 'cobro' lo ve el comercio. Cambia el encabezado. */
  tipo: 'pago' | 'cobro'
}

/** Enlace al comprobante en el explorador público, si hay hash. */
function enlaceExplorador(hash: string): string {
  return `https://ordenscan.com/tx/${hash}`
}

function html(d: DatosRecibo): string {
  const fecha = new Date(d.fecha).toLocaleString('es-HN', {
    dateStyle: 'long',
    timeStyle: 'short',
  })
  const encabezado = d.tipo === 'pago' ? 'Comprobante de pago' : 'Comprobante de cobro'
  const hashFila = d.txHash
    ? `<tr><td>Transacción</td><td class="mono">${d.txHash}</td></tr>
       <tr><td>Verificar en</td><td class="mono">${enlaceExplorador(d.txHash)}</td></tr>`
    : ''

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif; color: #16121F; padding: 40px 34px; }
  .marca { display: flex; align-items: center; gap: 10px; }
  .marca .n { font-weight: 800; font-size: 20px; letter-spacing: -.3px; }
  .marca .n span { color: #7C4DFF; }
  .tipo { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #8C7FA8; margin-top: 26px; }
  .monto { font-size: 44px; font-weight: 800; letter-spacing: -1.5px; margin: 4px 0; }
  .origen { font-size: 14px; color: #7C4DFF; font-weight: 600; }
  .estado { display: inline-block; margin-top: 14px; padding: 5px 13px; border-radius: 20px;
            background: #E7F9F0; color: #128A5A; font-size: 12px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 13.5px; }
  td { padding: 11px 0; border-bottom: 1px solid #EDE9F5; vertical-align: top; }
  td:first-child { color: #8C7FA8; width: 38%; }
  td:last-child { text-align: right; font-weight: 600; }
  .mono { font-family: "Courier New", monospace; font-size: 10.5px; font-weight: 400; word-break: break-all; }
  .pie { margin-top: 34px; padding-top: 18px; border-top: 2px solid #16121F; font-size: 11px; color: #8C7FA8; line-height: 1.7; }
  .pie b { color: #16121F; }
</style></head><body>
  <div class="marca"><div class="n">MyToken<span>Pay</span></div></div>
  <div class="tipo">${encabezado}</div>
  <div class="monto">${lempiras(d.montoHnl)}</div>
  <div class="origen">${origen(d.montoOrigen)}</div>
  <div class="estado">● Pagado</div>
  <table>
    <tr><td>Comercio</td><td>${escapar(d.negocio)}</td></tr>
    ${d.concepto ? `<tr><td>Concepto</td><td>${escapar(d.concepto)}</td></tr>` : ''}
    <tr><td>Código</td><td class="mono">${d.codigo}</td></tr>
    <tr><td>Fecha</td><td>${fecha}</td></tr>
    <tr><td>Tasa aplicada</td><td>1 ORIGEN = ${lempiras(d.tasaHnlPorOrigen)}</td></tr>
    ${hashFila}
  </table>
  <div class="pie">
    <b>ORIGEN</b> es la moneda del ecosistema Orden Global, anclada al oro.<br>
    Este comprobante es válido sin conexión. La transacción, si aparece, se puede
    verificar por cualquiera en el explorador público de la cadena 8532.<br>
    Emitido por MyTokenPay · Sistema Financiero Social.
  </div>
</body></html>`
}

function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

/**
 * Genera el PDF y abre la hoja de compartir.
 *
 * Devuelve un mensaje de error o null si salió bien. No lanza: un recibo que
 * revienta la app en la que acabás de pagar es la peor sorpresa posible.
 */
export async function compartirRecibo(d: DatosRecibo): Promise<string | null> {
  try {
    const { uri } = await Print.printToFileAsync({ html: html(d), base64: false })
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Recibo MyTokenPay',
        UTI: 'com.adobe.pdf',
      })
      return null
    }
    return 'Tu teléfono no permite compartir archivos.'
  } catch {
    return 'No se pudo generar el recibo. Intentá de nuevo.'
  }
}
