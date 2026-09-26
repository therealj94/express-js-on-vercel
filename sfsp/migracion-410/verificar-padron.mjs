#!/usr/bin/env node
// Verificación independiente de un padrón ya construido (sin red):
//   · recalcula cada hoja desde (migrationId, dirección, oldUnits);
//   · recalcula la raíz desde las hojas y la compara con la publicada;
//   · comprueba cada prueba con la réplica de `_verifyProof`;
//   · comprueba S0 = suma de oldUnits y que no hay direcciones repetidas;
//   · recalcula la raíz de la reserva de reclamo.
// Uso:  node verificar-padron.mjs [padron-ONDK.json …]   (por defecto, todos en RUTAS.salida)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RUTAS, hojaMigracion, hojaReserva, arbol, verificarPrueba, keccak256, toUtf8Bytes } from "./lib/comun.mjs";

const archivos = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(RUTAS.salida).filter((n) => /^padron-[A-Z]+\.json$/.test(n)).map((n) => join(RUTAS.salida, n));
let fallos = 0;
const mal = (m) => { fallos++; console.error("  ✗ " + m); };

for (const ruta of archivos) {
  const p = JSON.parse(readFileSync(ruta, "utf8"));
  console.log(`${p.activo}: ${p.beneficiarios.length} beneficiarios · raíz ${p.raizMerkle}`);
  if (keccak256(toUtf8Bytes(p.migrationId.texto)) !== p.migrationId.bytes32) mal("migrationId bytes32 ≠ keccak256(texto)");
  const vistos = new Set();
  let s0 = 0n;
  const hojas = [];
  for (const b of p.beneficiarios) {
    const h = hojaMigracion(p.migrationId.bytes32, b.address, b.oldUnits);
    if (h !== b.hoja) mal(`hoja distinta para el índice ${b.indice}`);
    if (!verificarPrueba(b.prueba, p.raizMerkle, h)) mal(`prueba inválida en el índice ${b.indice}`);
    if (vistos.has(b.address)) mal(`dirección repetida en el índice ${b.indice}`);
    if (BigInt(b.oldUnits) <= 0n) mal(`unidades no positivas en el índice ${b.indice}`);
    vistos.add(b.address);
    s0 += BigInt(b.oldUnits);
    hojas[b.indice] = h;
  }
  if (hojas.length) {
    const ordenadas = hojas.every((h, i) => i === 0 || BigInt(hojas[i - 1]) <= BigInt(h));
    if (!ordenadas) mal("hojas fuera del orden canónico");
    if (arbol(hojas).raiz !== p.raizMerkle) mal("la raíz recalculada no coincide");
  }
  if (s0.toString() !== p.s0Unidades) mal(`S0 ${s0} ≠ ${p.s0Unidades}`);
  const res = p.reservaDeReclamo;
  if (res.entradas.length) {
    const hr = res.entradas.map((r) => hojaReserva(p.migrationId.bytes32, r.clave, r.oldUnits));
    hr.forEach((h, i) => { if (h !== res.entradas[i].hoja) mal(`hoja de reserva distinta (${i})`); });
    if (arbol(hr).raiz !== res.raiz) mal("la raíz de reserva no coincide");
    for (const r of res.entradas) if (!verificarPrueba(r.prueba, res.raiz, r.hoja)) mal(`prueba de reserva inválida (${r.indice})`);
  }
}
console.log(fallos ? `${fallos} fallos` : "todo verificado");
process.exit(fallos ? 1 : 0);
