// LOS MÓDULOS QUE ORBITAN: las casas de Orden Global, con datos VIVOS.
//
// El brief traía nombres de productos que esta casa no tiene todavía y cifras
// «mock». No van: un orbe con un número inventado al lado de un orbe con el
// bloque real de la cadena enseña a no creerle a ninguno. Orbitan las casas
// que existen y contestan hoy, cada una con lo suyo leído de su API. Cuando
// nazca una casa nueva, se agrega aquí con su lectura, no con un ticker.
import type { EstadoVivo, Pendiente } from './api';
import type { ModuleId } from './os-store';

export interface Modulo {
  id: ModuleId;
  nombre: string;
  ring: 'mid' | 'outer';
  angulo: number;             // posición inicial en el anillo, radianes
  alto: number;               // desplazamiento vertical, para que no sea un cinturón
  pesado?: boolean;           // el oro cae más lento, pesa más
  chispas?: boolean;          // la cadena tiene nodos que chispean
  movil: boolean;             // se ve en el teléfono
  leer: (v: EstadoVivo | null, pendientes: Pendiente[]) => Lectura;
}
export interface Lectura {
  valor: string;              // lo grande
  sub?: string;               // lo chico debajo
  estado: 'ok' | 'mal' | 'aviso' | 'oro' | 'neutro';
  filas?: [string, string][]; // lo que se despliega al tocar
}

const usd = (n: number, dec = 2) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const casa = (c: { vivo: boolean; http?: number | null } | undefined): Pick<Lectura, 'valor' | 'estado'> =>
  !c ? { valor: '—', estado: 'neutro' } : c.vivo ? { valor: 'viva', estado: 'ok' } : { valor: c.http ? `HTTP ${c.http}` : 'no contesta', estado: 'mal' };
const hora = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—');

export const MODULOS: Modulo[] = [
  {
    id: 'gold', nombre: 'ORIGEN · ORO', ring: 'mid', angulo: 0.3, alto: 0.25, pesado: true, movil: true,
    leer: (v) => v?.origen
      ? { valor: usd(v.origen.origenUsd, 4), sub: `onza ${v.origen.oroOnzaUsd ? usd(v.origen.oroOnzaUsd) : '—'}`, estado: 'oro',
          filas: [['1 ORIGEN', usd(v.origen.origenUsd, 6)], ['onza de oro', v.origen.oroOnzaUsd ? usd(v.origen.oroOnzaUsd) : '—'], ['fuente', v.origen.fuente || '—'], ['fórmula', 'onza ÷ 31,1035 ÷ 55'], ['leído', hora(v.leidoEn)]] }
      : { valor: 'sin precio', sub: 'referencia no leída', estado: 'aviso' },
  },
  {
    id: 'wallet', nombre: 'VETA WALLET', ring: 'mid', angulo: 2.4, alto: -0.15, movil: true,
    leer: (v) => ({ ...casa(v?.wallet), sub: 'billetera', filas: [['backend', v?.wallet?.vivo ? 'vivo' : 'no contesta'], ['leído', hora(v?.leidoEn)]] }),
  },
  {
    id: 'ordenex', nombre: 'ORDENEX', ring: 'mid', angulo: 4.4, alto: 0.05, movil: false,
    leer: (v) => ({ ...casa(v?.ordenex), sub: v?.ordenex?.compraUsdt ? `compra USDT ${v.ordenex.compraUsdt}` : 'casa de cambio',
      estado: !v?.ordenex ? 'neutro' : !v.ordenex.vivo ? 'mal' : v.ordenex.compraUsdt === 'abierta' ? 'ok' : 'aviso',
      filas: [['bloque 5550', String(v?.ordenex?.bloque5550 ?? '—')], ['compra con USDT', v?.ordenex?.compraUsdt || '—'], ['mercados', String(v?.ordenex?.mercados?.length ?? '—')], ['leído', hora(v?.leidoEn)]] }),
  },
  {
    id: 'chain', nombre: 'CADENA 5550', ring: 'outer', angulo: 1.1, alto: 0.45, chispas: true, movil: false,
    leer: (v) => ({ valor: v?.ordenex?.bloque5550 ? `#${v.ordenex.bloque5550.toLocaleString('en-US')}` : '—', sub: v?.ordenscan?.bloque8532 ? `8532 · #${v.ordenscan.bloque8532.toLocaleString('en-US')}` : 'OrdenScan', estado: v?.ordenex?.vivo ? 'ok' : 'neutro',
      filas: [['bloque 5550', String(v?.ordenex?.bloque5550 ?? '—')], ['bloque 8532', String(v?.ordenscan?.bloque8532 ?? '—')], ['OrdenScan', v?.ordenscan?.vivo ? 'vivo' : 'no contesta'], ['leído', hora(v?.leidoEn)]] }),
  },
  {
    id: 'aucorp', nombre: 'AUCORP', ring: 'outer', angulo: 2.7, alto: -0.35, movil: false,
    leer: (v) => ({ ...casa(v?.aucorp), sub: v?.aucorp?.tasas ? `tasas ${v.aucorp.tasasCuando ? new Date(v.aucorp.tasasCuando).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' }) : 'al día'}` : 'la banca fiat',
      filas: [['tasas', v?.aucorp?.tasas ? 'al día' : 'sin tasas'], ['monedas', String(v?.aucorp?.monedas?.length ?? '—')], ['es', 'FinTech · no es un banco'], ['leído', hora(v?.leidoEn)]] }),
  },
  {
    id: 'genesis', nombre: 'GENESIS ID', ring: 'outer', angulo: 4.2, alto: 0.2, movil: false,
    leer: (v) => ({ ...casa(v?.genesis), sub: 'identidad', filas: [['estado', v?.genesis?.vivo ? 'vivo' : `no contesta${v?.genesis?.http ? ' · HTTP ' + v.genesis.http : ''}`], ['leído', hora(v?.leidoEn)]] }),
  },
  {
    id: 'pendientes', nombre: 'PENDIENTES', ring: 'outer', angulo: 5.6, alto: -0.1, movil: false,
    leer: (_v, p) => { const abiertos = p.filter((x) => x.estado !== 'hecho'); return { valor: String(abiertos.length), sub: abiertos.length === 1 ? 'abierto' : 'abiertos', estado: abiertos.length ? 'aviso' : 'ok',
      filas: abiertos.slice(0, 6).map((x) => [x.tema ? x.tema.toUpperCase() : '·', x.texto.length > 64 ? x.texto.slice(0, 62) + '…' : x.texto] as [string, string]) }; },
  },
];

export const RADIO = { mid: 1.6, outer: 2.4 } as const;
export const VUELTA_S = { mid: 40, outer: 70 } as const;    // segundos por vuelta; el exterior gira al revés
export const modulosPara = (movil: boolean) => (movil ? MODULOS.filter((m) => m.movil) : MODULOS);
