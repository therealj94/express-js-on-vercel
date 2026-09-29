// Suma al directorio lo que encontró la búsqueda de correos.
//
//   node integrar.mjs <carpeta>
//
// En <carpeta>:
//  · resultado-sin-correo-*.csv (n, correo, a_quien, fuente, nota): el correo oficial de
//    contactos del directorio que no lo tenían;
//  · nuevos-*.csv (persona, cargo, org, pais, sector, correo, idioma, prior, a_quien, fuente):
//    contactos nuevos, que entran con número desde el 286.
//
// Parte de contactos-original.csv (el directorio del PDF) y escribe contactos.csv; después
// se corre depurar.mjs. Descarta correos mal escritos, repetidos o de listas públicas, y deja
// la fuente de cada correo nuevo en la columna «fuente».

import fs from 'node:fs';
import { escribirCsv, leerCsv } from './depurar.mjs';

const aqui = new URL('.', import.meta.url).pathname;
const carpeta = process.argv[2];
if (!carpeta) throw new Error('Uso: node integrar.mjs <carpeta con los resultados>');

const SECTORES = new Set(['GOBIERNO', 'REGULADOR', 'BANCO', 'FINTECH', 'GREMIO', 'MINERÍA/ORO', 'INVERSION', 'MULTILATERAL', 'MEDIO', 'TECNOLOGIA', 'INFLUENCIA', 'ACADEMIA']);
const valido = (e) => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(e) && !/no-?reply|listserv|lists?\./i.test(e);

const original = aqui + 'contactos-original.csv';
if (!fs.existsSync(original)) fs.copyFileSync(aqui + 'contactos.csv', original);
const filas = leerCsv(original).map((r) => ({ ...r, fuente: r.fuente || 'Directorio 25-09-2026' }));
const vistos = new Set(filas.map((r) => r.correo.trim().toLowerCase()).filter(Boolean));
const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith('.csv'));
const cuenta = { completados: 0, nuevos: 0, descartados: [] };

for (const f of archivos.filter((f) => f.startsWith('resultado-sin-correo'))) {
  for (const r of leerCsv(`${carpeta}/${f}`)) {
    const e = r.correo.trim().toLowerCase();
    if (!e) continue;
    const fila = filas.find((x) => x.n === r.n.padStart(3, '0'));
    if (!fila || fila.correo) continue;
    if (!valido(e) || vistos.has(e)) { cuenta.descartados.push(`#${r.n} ${e}`); continue; }
    fila.correo = e;
    fila.fuente = r.fuente;
    vistos.add(e);
    cuenta.completados++;
  }
}

let n = Math.max(...filas.map((r) => Number(r.n)));
for (const f of archivos.filter((f) => f.startsWith('nuevos-')).sort()) {
  const region = f.replace(/^nuevos-|\.csv$/g, '');
  for (const r of leerCsv(`${carpeta}/${f}`)) {
    const e = r.correo.trim().toLowerCase();
    if (!valido(e) || vistos.has(e) || !SECTORES.has(r.sector)) { cuenta.descartados.push(`${r.org} ${e}`); continue; }
    vistos.add(e);
    filas.push({
      n: String(++n).padStart(3, '0'),
      seccion: `Nuevos · ${region}`,
      persona: r.persona, org: r.org, correo: e, canales: '',
      idioma: r.idioma === 'ES' ? 'ES' : 'EN',
      prior: ['A', 'B', 'C'].includes(r.prior) ? r.prior : 'B',
      cargo: r.cargo, pais: r.pais, sector: r.sector, fuente: r.fuente,
    });
    cuenta.nuevos++;
  }
}

escribirCsv(aqui + 'contactos.csv', filas, ['n', 'seccion', 'persona', 'org', 'correo', 'canales', 'idioma', 'prior', 'cargo', 'pais', 'sector', 'fuente']);
console.log(`${filas.length} contactos · ${cuenta.completados} correos completados · ${cuenta.nuevos} nuevos · ${cuenta.descartados.length} descartados`);
for (const d of cuenta.descartados) console.log('  descartado:', d);
