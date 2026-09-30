// ================= AU-RA FP · LAS REGLAS DEL VIAJE DE VUELTA =================
//
// Lo que tiene que cumplir esta app con AU-RA, en un solo sitio y sin imports
// (pruebas/probar-aura-sso.cjs lo lee y lo evalúa tal cual, sin transpilar):
//
//   · AU-RA abre `vetawallet://sso?destino=aura&reto=…&estado=…&vuelta=…`.
//   · `vuelta` es de una LISTA CERRADA: `ultronfp://sso` (también si no viene:
//     las APK viejas de AU-RA no la mandan) y `https://aura-fp.onrender.com/sso`.
//     Se compara ENTERA; cualquier otra se ignora y se vuelve a `ultronfp://sso`.
//     Con un pase en la mano, seguir una dirección que escribe quien arma el
//     enlace sería regalárselo.
//   · A la vuelta va `pase=…&estado=…` o `error=<código>&estado=…`, con:
//     cancelado, sin-gid, gid-pendiente, no-vinculada, correo-sin-confirmar,
//     limite, red, fallo. Antes todo 403 era «sin-gid», y a quien tenía el
//     trámite en revisión AU-RA le decía que no tenía Genesis ID.
//   · Quien llega sin Genesis ID puede sacarlo en ese momento: el pedido se
//     guarda por media hora (`AURA_VIVE_MS`) y, al terminar el trámite, vuelve
//     con `gid-pendiente` (en revisión) o sigue al permiso (verificado).

export const VUELTAS_AURA = ['ultronfp://sso', 'https://aura-fp.onrender.com/sso'];
export const AURA_VIVE_MS = 30 * 60 * 1000;
const RETO = /^[A-Za-z0-9_-]{43}$/;
const ESTADO = /^[A-Za-z0-9_-]{8,64}$/;

/** La vuelta pedida si está en la lista; si no (o no vino), la de siempre. */
export const vueltaDe = (v) => (VUELTAS_AURA.includes(v) ? v : VUELTAS_AURA[0]);

/** ¿El pedido que llegó por el enlace tiene la forma que manda AU-RA? */
export const pedidoValido = (p) => RETO.test(String(p?.reto || '')) && ESTADO.test(String(p?.estado || ''));

/** El enlace de vuelta a AU-RA. Solo parámetros que AU-RA espera. */
export function enlaceDeVuelta({ pase, error, estado, vuelta }) {
  const q = [];
  if (pase) q.push('pase=' + encodeURIComponent(pase));
  if (error) q.push('error=' + encodeURIComponent(error));
  q.push('estado=' + encodeURIComponent(estado || ''));
  return `${vueltaDe(vuelta)}?${q.join('&')}`;
}

/* Los códigos del puente de la wallet (infra/veta-wallet-backend,
   CODIGOS_SSO) traducidos a los de AU-RA. */
const POR_CODIGO = {
  CORREO_NO_VERIFICADO: 'correo-sin-confirmar',
  GID_SIN_IDENTIDAD: 'sin-gid',
  GID_PENDIENTE: 'gid-pendiente',
  CUENTA_NO_VINCULADA: 'no-vinculada',
  LIMITE: 'limite',
  GENESIS_RED: 'red',
};

/**
 * De lo que devolvió el pedido del pase (`genesis.paseConDestino`), el código
 * que entiende AU-RA. `gid` es lo que la app sabe del trámite de esta persona
 * ({ estado, verificada }), y solo se usa con un backend de antes de los
 * códigos, que contestaba 403 con una frase.
 */
export function codigoAura(r, gid) {
  if (POR_CODIGO[r?.codigo]) return POR_CODIGO[r.codigo];
  if (r?.code === 'red' || r?.code === 'timeout') return 'red';
  if (r?.estado === 429) return 'limite';
  if (r?.estado >= 500 || r?.code === 'servidor' || r?.code === 'sin-clave') return 'red';
  if (r?.estado === 403 && !r?.codigo) {
    if (/no está atada/i.test(String(r.error || ''))) return 'no-vinculada';
    if (!gidEmpezado(gid)) return 'sin-gid';
    if (!gid.verificada) return 'gid-pendiente';
  }
  return 'fallo';
}

/* ¿Empezó esta persona su Genesis ID? `iniciada` no cuenta: es la identidad
   vacía que el puente crea con solo preguntar por el estado. */
export const gidEmpezado = (gid) => Boolean(gid && !gid.error && gid.estado && gid.estado !== 'iniciada');

/**
 * Qué hacer con un «sin Genesis ID» según el trámite: 'volver' con ese código,
 * o 'alta' para ofrecer sacarlo (o terminarlo) sin perder el pedido.
 */
export function trasSinGid(gid, error) {
  if (gid?.verificada) return { hacer: 'volver', error };
  if (gid?.paso === 'revision') return { hacer: 'volver', error: 'gid-pendiente' };
  if (gid?.paso === 'rechazada' || gid?.paso === 'suspendida') return { hacer: 'volver', error: 'fallo' };
  return { hacer: 'alta', error, aMedias: error === 'gid-pendiente' || gidEmpezado(gid) };
}

/** El pedido tal como se guarda: lo justo, con su plazo. */
export function pedidoParaGuardar(p, ahora = Date.now()) {
  return {
    reto: p.reto, estado: p.estado, vuelta: vueltaDe(p.vuelta),
    fase: p.fase || null, hasta: p.hasta || ahora + AURA_VIVE_MS,
  };
}

/** El pedido guardado, si sigue vivo y tiene forma; si no, null. */
export function pedidoGuardadoVivo(p, ahora = Date.now()) {
  if (!p || !(p.hasta > ahora) || !pedidoValido(p)) return null;
  return { reto: p.reto, estado: p.estado, vuelta: vueltaDe(p.vuelta), fase: p.fase || null, hasta: p.hasta };
}

/**
 * Al terminar (o retomar) el trámite con un pedido de AU-RA en fase de alta:
 * verificado → al permiso; en revisión → de vuelta con `gid-pendiente`; con
 * algo por hacer todavía → nada, se sigue en el trámite.
 */
export function alTerminarAlta(paso) {
  if (paso === 'listo') return 'permiso';
  if (paso === 'revision') return 'volver';
  return null;
}
