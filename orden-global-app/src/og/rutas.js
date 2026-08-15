// ═══ EL MAPA DE ORDEN GLOBAL ═══════════════════════════════════════════
// La fusión navega por aquí: cada dirección og:// resuelve a una PANTALLA
// NATIVA de la app (el router de siempre, go/back). Si no está en el mapa,
// el asistente no lo puede hacer. Lo que toca dinero (firma:true) se abre
// PREPARADO y se detiene: la persona firma, siempre.
export const MAPA = {
  'inicio':          { p: 'ecosistema' },
  'pay/pagar':       { p: 'pay-pagar' },
  'pay/explorar':    { p: 'pay-explorar' },
  'pay/negocio':     { p: 'pay-negocio' },
  'wallet/abrir':    { p: 'home' },
  'wallet/enviar':   { p: 'send', firma: true },   // to, amount
  'wallet/recibir':  { p: 'receive' },
  'wallet/tarjeta':  { p: 'card' },
  'wallet/swap':     { p: 'swap', firma: true },
  'wallet/actividad':{ p: 'activity' },
  'wallet/reporte':  { p: 'reporte' },             // el resumen hablado de la wallet
  'pay/abrir':       { p: 'pay-inicio' },
  'pay/cobrar':      { p: 'pay-cobro' },
  'id/abrir':        { p: 'passport' },
  'chat/abrir':      { p: 'chat', gid: true },     // con=correo
  'asistente/abrir': { p: 'ecosistema' },
  // Ajustes es uno de los cinco mundos del Núcleo: si el tablero lo enseña,
  // el asistente tiene que poder abrirlo — «abre los ajustes» no puede
  // contestar «eso no lo puedo hacer».
  'ajustes':         { p: 'settings' },
};

export function aUri(ruta, params) {
  const q = params
    ? Object.entries(params).filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&')
    : '';
  return 'og://' + ruta + (q ? '?' + q : '');
}

export function deUri(uri) {
  const m = String(uri || '').match(/^og:\/\/([^?]+)(?:\?(.*))?$/);
  if (!m || !MAPA[m[1]]) return null;
  const params = {};
  if (m[2]) for (const par of m[2].split('&')) {
    const i = par.indexOf('=');
    if (i > 0) params[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1));
  }
  return { ruta: m[1], entrada: MAPA[m[1]], params };
}

// abrir(uri, nav): la ÚNICA puerta entre el asistente/QR/enlaces y el router
// del teléfono. Traduce params del mapa a los que la pantalla ya espera
// (send lee to/amount desde siempre — no se tocó Trade.js para esto).
export function abrir(uri, nav) {
  const r = deUri(uri);
  if (!r) return false;
  const p = { ...r.params };
  if (r.ruta === 'wallet/enviar') { p.to = p.to; p.amount = p.amount || p.monto; }
  nav.go(r.entrada.p, p);
  return true;
}
