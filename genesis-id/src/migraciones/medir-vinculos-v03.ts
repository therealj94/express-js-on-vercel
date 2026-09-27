/* Medición previa a subir genesis-id con las reglas del v0.3 (N1 y A2 de la
 * auditoría de salida a vivo del 27-sep-2026). SOLO LEE y SOLO CUENTA: no
 * imprime nombres, correos, GID ni direcciones.
 *
 *   GENESIS_MONGO_URL=… npx tsx src/migraciones/medir-vinculos-v03.ts
 *
 * Devuelve una línea JSON:
 *   - direccionesEnVariasIdentidades: direcciones atadas a más de una
 *     identidad. Con la regla «una dirección, una identidad» (N1), una de esas
 *     personas puede quedar en bucle 403/409 al entrar a Ordenex. Si es > 0,
 *     avisar a esas personas antes o abrir GENESIS_VINCULO_DIRECCION_AJENA=permitir.
 *   - vetaSinDireccion: vínculos de veta-wallet sin dirección. Con la dirección
 *     obligatoria (A2), esas personas reciben 403 VINCULO_SIN_DIRECCION en
 *     Ordenex hasta que vuelvan a abrir Veta Wallet y se revincule.
 */
import { iniciarSoloLectura, store } from '../store.js';

await iniciarSoloLectura();
const ids = store.todo().identidades;
const porDireccion = new Map<string, Set<string>>();
let vinculos = 0;
let vinculosVeta = 0;
let vetaSinDireccion = 0;
for (const i of ids) {
  for (const v of i.vinculos ?? []) {
    vinculos++;
    if (v.app === 'veta-wallet') vinculosVeta++;
    if (!v.direccion) {
      if (v.app === 'veta-wallet') vetaSinDireccion++;
      continue;
    }
    const d = String(v.direccion).toLowerCase();
    if (!porDireccion.has(d)) porDireccion.set(d, new Set());
    porDireccion.get(d)!.add(i.id);
  }
}
console.log(JSON.stringify({
  identidades: ids.length,
  vinculos,
  vinculosVeta,
  vetaSinDireccion,
  direccionesDistintas: porDireccion.size,
  direccionesEnVariasIdentidades: [...porDireccion.values()].filter((s) => s.size > 1).length,
}));
process.exit(0);
