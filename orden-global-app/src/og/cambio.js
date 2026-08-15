// cambio.js — el tipo de cambio lempira/dólar, en vivo y una vez al día.
//
// José lo pidió así: "en mytokenpay hacer la conversión de lempiras a ORIGEN y
// cobrar en ORIGEN con conversión a lempiras; agarrar el precio de cambio
// lempiras a dólares en vivo todos los días".
//
// El puente tiene DOS tramos y cada uno tiene su dueño:
//   lempiras ──(este módulo)──> dólares ──(precio del ORIGEN, api.js)──> ORIGEN
// Aquí NO se calcula cuánto vale un ORIGEN: eso ya lo hace la app
// (api.js:livePrices → prices.ORIGEN = onza de oro / 31.1035 / 55) y llega a
// las pantallas dentro de `account.balances[].priceUsd`. Reusarlo en vez de
// inventar una segunda fuente evita lo peor que le puede pasar a una caja:
// que el saldo de la billetera y el monto del cobro salgan de precios
// distintos y no cuadren entre sí.
//
// ── por qué UNA vez al día ────────────────────────────────────────────────
// El lempira es de cambio administrado: se mueve centavos al mes, no por
// minuto. Pedirlo en cada tecla sería castigar el dato del comercio (muchos
// cobran con el teléfono en la calle) para nada. Se guarda {valor, cuando,
// fuente} y mientras la fecha guardada sea la de hoy no se vuelve a pedir.
//
// ── la regla que no se rompe ──────────────────────────────────────────────
// Si las dos fuentes fallan se usa lo último guardado DICIENDO de cuándo es
// (por eso el pie "cambio del …, fuente …" viaja pegado a toda cifra). Si no
// hay nada guardado, la pantalla dice que no puede convertir. Nunca, en
// ningún camino, sale un número inventado ni un respaldo estático: un cambio
// congelado se lee igual que uno vivo, y con él un comercio cobra mal sin
// enterarse. (Es la misma regla del precio ausente en data.js/api.js.)
import { useEffect, useState } from 'react';

// ── almacén: SecureStore, y si no responde, AsyncStorage ──────────────────
// Los dos están en package.json, así que en el binario actual existen. Aun
// así se cargan con require defensivo dentro de try/catch —igual que
// Nucleo.js con react-native-webview— porque este archivo viaja POR AIRE a
// teléfonos que ya tienen su APK: si mañana el binario se arma sin uno de
// los dos, el cambio se queda en memoria durante la sesión en vez de tumbar
// MyTokenPay al abrir.
let Seguro = null;
try { Seguro = require('expo-secure-store'); } catch (e) { Seguro = null; }
let Async = null;
try { Async = require('@react-native-async-storage/async-storage').default; } catch (e) { Async = null; }

const LLAVE = 'og.cambio.hnl';

async function leerCrudo() {
  try {
    if (Seguro?.getItemAsync) {
      const v = await Seguro.getItemAsync(LLAVE);
      if (v) return v;
    }
  } catch (e) {}
  try {
    if (Async?.getItem) return await Async.getItem(LLAVE);
  } catch (e) {}
  return null;
}

async function guardarCrudo(txt) {
  try {
    if (Seguro?.setItemAsync) { await Seguro.setItemAsync(LLAVE, txt); return; }
  } catch (e) {}
  try {
    if (Async?.setItem) await Async.setItem(LLAVE, txt);
  } catch (e) {}
}

// ── las dos fuentes ───────────────────────────────────────────────────────
// Las dos son gratis, sin llave y sin registro; se probaron con curl antes de
// escribir esto y las dos devolvieron el lempira con menos de un centavo de
// diferencia entre ellas (26.817 vs 26.811), lo que confirma que sirven de
// respaldo mutuo. La principal es open.er-api.com —la misma casa que ya usa
// src/fx.js para el simulador de remesas, así que la app no estrena
// proveedor— y la segunda es el espejo en jsDelivr de currency-api.
//
// Las MONEDAS son las del retiro de MyTokenPay (NegocioPanel): las dos
// fuentes devuelven TODAS las tasas en la misma respuesta, así que traer las
// hermanas del lempira no cuesta ni una petición más — y con ellas el retiro
// de Guatemala o México deja de convertir con la tabla congelada del original.
const MONEDAS = ['HNL', 'GTQ', 'NIO', 'CRC', 'MXN'];
const FUENTES = [
  {
    nombre: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    // { result:"success", time_last_update_utc:"…", rates:{ HNL: 26.817151, … } }
    saca: (d, m) => (d?.result === 'success' ? Number(d?.rates?.[m]) : NaN),
  },
  {
    nombre: 'currency-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    // { date:"2026-08-14", usd:{ hnl: 26.81128701, … } }
    saca: (d, m) => Number(d?.usd?.[m.toLowerCase()]),
  },
];

// Un lempira por dólar creíble está entre 5 y 200. No es adivinar el valor:
// es rechazar una respuesta rota (un HTML de error, un 0, un null que
// Number() vuelve 0) antes de que se convierta en el cambio del día y el
// comercio cobre con él. Si no pasa el filtro, se prueba la otra fuente.
const creible = (n) => Number.isFinite(n) && n > 5 && n < 200;
// Para las demás monedas basta con «finito y positivo»: el colón ronda 500 y
// el quetzal 7.7, así que el rango del lempira no les sirve de filtro.
const sanaTasa = (n) => (Number.isFinite(n) && n > 0 ? n : null);

async function pedir(fuente) {
  // Sin corte, un teléfono con red mala deja la promesa colgada y la caja
  // esperando; ocho segundos y se pasa al respaldo.
  let corte = null;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) corte = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 8000);
    const r = await fetch(fuente.url, ctrl ? { signal: ctrl.signal } : undefined);
    const d = await r.json();
    // La validez de la respuesta la decide el HNL (la moneda de la casa, la
    // única con rango conocido); las demás entran si son finitas y positivas.
    if (!creible(fuente.saca(d, 'HNL'))) return null;
    const tasas = {};
    for (const m of MONEDAS) {
      const n = sanaTasa(fuente.saca(d, m));
      if (n != null) tasas[m] = n;
    }
    return tasas;
  } catch (e) {
    return null;
  } finally {
    if (corte) clearTimeout(corte);
  }
}

// ── el dato vivo, en memoria ──────────────────────────────────────────────
// { valor, cuando (ISO), fuente, dia }. `dia` es la fecha LOCAL del teléfono,
// no UTC: "una vez al día" tiene que ser el día del comercio, no el de
// Greenwich, o en Honduras (UTC-6) el cambio se renovaría a las 6 de la tarde.
let CAMBIO = null;
let cargando = null;   // promesa en vuelo: dos pantallas abriendo a la vez piden UNA vez

const diaDe = (d) => {
  const f = d instanceof Date ? d : new Date(d);
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const dd = String(f.getDate()).padStart(2, '0');
  return `${f.getFullYear()}-${mm}-${dd}`;
};

function sano(o) {
  if (!o || !creible(Number(o.valor))) return null;
  const cuando = o.cuando ? new Date(o.cuando) : null;
  if (!cuando || Number.isNaN(cuando.getTime())) return null;
  // `tasas` puede faltar en lo guardado por versiones viejas de este módulo:
  // en ese caso solo se conoce el HNL y las demás monedas quedan sin dato
  // (la pantalla lo dice en vez de convertir con una tabla congelada).
  const tasas = {};
  if (o.tasas && typeof o.tasas === 'object') {
    for (const m of MONEDAS) {
      const n = sanaTasa(Number(o.tasas[m]));
      if (n != null) tasas[m] = n;
    }
  }
  if (tasas.HNL == null) tasas.HNL = Number(o.valor);
  return {
    valor: Number(o.valor),
    tasas,
    cuando: cuando.toISOString(),
    fuente: String(o.fuente || '—'),
    dia: o.dia || diaDe(cuando),
  };
}

/**
 * Deja listo el cambio del día. Se puede llamar en cada pantalla que abre:
 * si el guardado ya es de hoy no toca la red, y si dos pantallas la llaman a
 * la vez comparten la misma petición.
 *
 * @param {boolean} forzar - pide aunque el guardado sea de hoy (tirar a refrescar).
 * @returns {Promise<{valor:number, cuando:string, fuente:string, dia:string}|null>}
 */
export async function cargarCambio(forzar = false) {
  if (!forzar && CAMBIO && CAMBIO.dia === diaDe(new Date())) return CAMBIO;
  if (cargando) return cargando;

  cargando = (async () => {
    const hoy = diaDe(new Date());

    // 1) lo guardado en el teléfono: si es de hoy, no se molesta a la red.
    if (!CAMBIO) {
      const crudo = await leerCrudo();
      if (crudo) {
        try { CAMBIO = sano(JSON.parse(crudo)); } catch (e) { CAMBIO = null; }
      }
    }
    if (!forzar && CAMBIO && CAMBIO.dia === hoy) return CAMBIO;

    // 2) las fuentes, en orden. La primera que conteste algo creíble manda.
    for (const f of FUENTES) {
      const tasas = await pedir(f);
      if (tasas != null) {
        const ahora = new Date();
        CAMBIO = { valor: tasas.HNL, tasas, cuando: ahora.toISOString(), fuente: f.nombre, dia: diaDe(ahora) };
        await guardarCrudo(JSON.stringify(CAMBIO));
        return CAMBIO;
      }
    }

    // 3) las dos cayeron: se devuelve lo último guardado TAL CUAL, con su
    // fecha vieja intacta. No se le pone la de hoy — la fecha es justamente
    // lo que le avisa al comercio que ese cambio ya tiene días.
    return CAMBIO;
  })();

  try { return await cargando; } finally { cargando = null; }
}

/** Lempiras por dólar, o null si todavía no hay dato. Nunca un valor de relleno. */
export function hnlPorUsd() {
  return CAMBIO ? CAMBIO.valor : null;
}

/**
 * Unidades de `moneda` por dólar, del MISMO día y la MISMA fuente que el
 * lempira — o null si no se tiene (moneda fuera de la lista, o guardado de
 * una versión vieja sin `tasas`). USD siempre es 1: no necesita fuente.
 * Con esto el retiro de NegocioPanel convierte GTQ/NIO/CRC/MXN en vivo en
 * vez de con la tabla congelada del original.
 */
export function tasaPorUsd(moneda) {
  const m = String(moneda || '').toUpperCase();
  if (m === 'USD') return 1;
  const n = CAMBIO?.tasas?.[m];
  return sanaTasa(Number(n));
}

/** ¿De cuándo es el cambio que se está usando? null si no hay ninguno. */
export function cuandoSeActualizo() {
  if (!CAMBIO) return null;
  return {
    valor: CAMBIO.valor,
    cuando: CAMBIO.cuando,
    fuente: CAMBIO.fuente,
    dia: CAMBIO.dia,
    hoy: CAMBIO.dia === diaDe(new Date()),
  };
}

// ── las conversiones ──────────────────────────────────────────────────────
// Todas devuelven null si les falta cualquiera de los dos tramos (el cambio
// del día o el precio del ORIGEN). Devolver 0 sería peor que devolver nada:
// un 0 se pinta como una cifra y se lee como "sale gratis".

const precioSano = (p) => {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Cuántos ORIGEN vale UN lempira (el factor suelto, por si una pantalla
 * quiere enseñar la tasa en vez de convertir un monto).
 */
export function origenPorHnl(precioOrigenUsd) {
  const hnl = hnlPorUsd();
  const p = precioSano(precioOrigenUsd);
  if (hnl == null || p == null) return null;
  return 1 / hnl / p;   // 1 L → 1/hnl dólares → ÷ precio → ORIGEN
}

/** Cuántas lempiras vale UN ORIGEN. La lectura al derecho de la de arriba. */
export function hnlPorOrigen(precioOrigenUsd) {
  const hnl = hnlPorUsd();
  const p = precioSano(precioOrigenUsd);
  if (hnl == null || p == null) return null;
  return p * hnl;
}

/** Lempiras → ORIGEN. */
export function aOrigen(lempiras, precioOrigenUsd) {
  const l = Number(lempiras);
  const f = origenPorHnl(precioOrigenUsd);
  if (!Number.isFinite(l) || f == null) return null;
  return l * f;
}

/** ORIGEN → lempiras. */
export function aLempiras(origen, precioOrigenUsd) {
  const o = Number(origen);
  const f = hnlPorOrigen(precioOrigenUsd);
  if (!Number.isFinite(o) || f == null) return null;
  return o * f;
}

// ── redondeo ──────────────────────────────────────────────────────────────
// El ORIGEN que va al QR se maneja como TEXTO con 2 decimales, y el redondeo
// se hace UNA sola vez, al pasar a texto. Redondear floats a la brava y
// seguir sumándolos es lo que hace que tres partes de una cuenta dividida no
// den el total; aquí se cuantiza a centésimas (`aPaso`) y se compara sobre
// enteros, así lo que firma el cliente es exactamente lo que dice el papel.
export const PASO = 100;                                    // 2 decimales
export const aPaso = (n) => Math.round((Number(n) || 0) * PASO) / PASO;

/** El monto que viaja en el QR: texto canónico con punto y 2 decimales. */
export const origenTexto = (n) => (Math.round((Number(n) || 0) * PASO) / PASO).toFixed(2);

/** ORIGEN en pantalla: 2 decimales, con separador de miles. */
export const origenFmt = (n) =>
  (Math.round((Number(n) || 0) * PASO) / PASO)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lempiras en pantalla: "L 500.00". Se usa en-US porque Honduras escribe el
 * dinero igual (miles con coma, decimales con punto) y porque es el mismo
 * formato de money() en data.js — dos formatos distintos en la misma tarjeta
 * se leen como dos cifras distintas.
 */
export const lempirasFmt = (n) =>
  'L ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── el pie honesto ────────────────────────────────────────────────────────

/**
 * "cambio del 15 ago 2026, fuente open.er-api.com". Va debajo de toda cifra
 * en lempiras: si el dato es de hace tres días, el comercio tiene derecho a
 * verlo sin abrir ajustes. Devuelve null si no hay cambio (ahí la pantalla
 * dice que no puede convertir, no pinta un pie vacío).
 */
export function pieCambio(lang = 'es') {
  const c = cuandoSeActualizo();
  if (!c) return null;
  const loc = lang === 'en' ? 'en-US' : 'es-HN';
  const fecha = new Date(c.cuando).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  return lang === 'en'
    ? `rate of ${fecha}, source ${c.fuente}`
    : `cambio del ${fecha}, fuente ${c.fuente}`;
}

// ── atajo para las pantallas ──────────────────────────────────────────────

/**
 * El precio del ORIGEN tal como ya lo trae la cuenta. Existe para que las
 * cuatro pantallas de MyTokenPay lo lean IGUAL: si cada una repite el find y
 * una se olvida del `> 0`, esa pantalla convierte con un precio 0 y enseña
 * cifras absurdas. Devuelve null cuando el feed no trajo precio.
 */
export function precioOrigenDe(account) {
  const b = (account?.balances || []).find((x) => String(x?.symbol || '').toUpperCase() === 'ORIGEN');
  return precioSano(b?.priceUsd);
}

/**
 * Hook: pide el cambio al montar y re-renderiza cuando llega. Devuelve
 * `listo` (ya hay un valor con el que convertir), `hnl`, `info` y el `pie`.
 * Guardar el valor en el estado —y no solo un contador— hace que el render
 * dependa del dato de verdad.
 */
export function useCambio(lang = 'es') {
  const [dato, setDato] = useState(() => cuandoSeActualizo());
  useEffect(() => {
    let vivo = true;
    cargarCambio()
      .then(() => { if (vivo) setDato(cuandoSeActualizo()); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  return {
    listo: !!dato,
    hnl: dato ? dato.valor : null,
    info: dato,
    pie: dato ? pieCambio(lang) : null,
  };
}
