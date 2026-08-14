// ═══ EL MAPA ═══════════════════════════════════════════════════════════
// Todo lo que GENESIS puede alcanzar, con su dirección estable. La regla que
// sostiene el diseño entero: SI NO ESTÁ AQUÍ, EL ASISTENTE NO LO PUEDE HACER.
// Un asistente que solo llama a una lista cerrada no puede inventarse una
// acción — y eso es exactamente lo que hace falta cuando hay dinero en medio.
//
// Cada entrada:
//   v      → la vista interna del contenedor que la sirve
//   gid    → true si exige Genesis ID completo antes de abrirse
//   firma  → true si toca dinero: GENESIS la deja PREPARADA y se detiene;
//            la persona firma con su dedo, siempre.
//
// Este mismo mapa sirve para el esquema og:// (enlaces profundos) y para las
// notificaciones: se escribe una vez, se usa en tres sitios.
//
// Sin imports a propósito: este fichero lo carga también la prueba de node.

export const MAPA = {
  'wallet/abrir':   { v: 'veta' },
  'wallet/enviar':  { v: 'veta', firma: true },   // params: to, monto, nombre
  'pay/abrir':      { v: 'pay', gid: true },
  'pay/cobrar':     { v: 'pay', gid: true },      // params: monto
  'id/abrir':       { v: 'gid' },
  'scan/abrir':     { v: 'scan' },                // params: hash
  'cerebro/abrir':  { v: 'cerebro' },
  'chat/abrir':     { v: 'chat' },                // params: con (correo)
  'asistente/abrir':{ v: 'asistente' },
  'inicio':         { v: 'home' },
};

export function aUri(ruta, params) {
  const q = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => k + '=' + encodeURIComponent(v))
        .join('&')
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
