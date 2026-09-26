// precioVivo.js — el precio del ORIGEN para las pantallas de Pay, fresco.
//
// El precio llega dentro de la cuenta (`balances[].priceUsd`, con su hora en
// `priceAt`), pero la cuenta solo se refresca al entrar a Inicio, al tirar
// hacia abajo o cuando entra dinero. Un comercio que se queda en Cobrar toda
// la mañana convertía lempiras con el oro de las nueve. Así que aquí, mientras
// la pantalla está montada, se relee el oro cada minuto con la MISMA función
// que llena la cuenta (api.js:livePrices) —no es una segunda fuente— y se usa
// el más fresco de los dos, siempre que tenga menos de 10 minutos (C5).
//
// Las lecturas se comparten entre pantallas y se guardan 30 s: la misma
// caché del oráculo único, para no preguntar a CoinGecko dos veces seguidas.
import { useEffect, useState } from 'react';
import { livePrices } from '../api';
import { precioOrigenVigente } from './cambio';

const FRESCO_MS = 30_000;
const CADA_MS = 60_000;
// Cuánto se espera la primera lectura antes de dar el precio por ausente.
const PLAZO_MS = 6_000;

let ultima = null;        // { usd, en } de la última lectura buena
let pedidoEn = 0;
let enCurso = null;

function leerPrecioOrigen() {
  if (enCurso) return enCurso;
  if (Date.now() - pedidoEn < FRESCO_MS) return Promise.resolve(ultima);
  pedidoEn = Date.now();
  enCurso = livePrices()
    .then(({ prices }) => {
      const usd = Number(prices?.ORIGEN);
      if (Number.isFinite(usd) && usd > 0) ultima = { usd, en: Date.now() };
      return ultima;
    })
    .catch(() => ultima)
    .finally(() => { enCurso = null; });
  return enCurso;
}

/**
 * `{ precio, leyendo }`: el precio vigente del ORIGEN (o null) y si todavía se
 * espera la primera lectura sin tener ningún precio con el que convertir.
 */
export function usePrecioOrigen(account) {
  const [vivo, setVivo] = useState(() => ultima);
  const [ahora, setAhora] = useState(() => Date.now());
  const [esperando, setEsperando] = useState(true);
  useEffect(() => {
    let activo = true;
    const plazo = setTimeout(() => { if (activo) setEsperando(false); }, PLAZO_MS);
    const vuelta = () => {
      setAhora(Date.now());
      leerPrecioOrigen().then((u) => {
        if (!activo) return;
        setVivo(u);
        setAhora(Date.now());
        setEsperando(false);
      });
    };
    vuelta();
    const id = setInterval(vuelta, CADA_MS);
    return () => { activo = false; clearInterval(id); clearTimeout(plazo); };
  }, []);
  const precio = precioOrigenVigente(account, vivo, ahora);
  return { precio, leyendo: esperando && precio == null };
}
