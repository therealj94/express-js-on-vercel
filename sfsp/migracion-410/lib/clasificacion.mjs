// Clasificación común: cuentas internas / de Orden Global / contratos y
// direcciones citadas en archivos de prueba. Todo sale de los DATOS de entrada;
// ninguna dirección está escrita en el código.
import { norm } from "./comun.mjs";

export const RE_PRUEBA = /(prueba|probar|test|spec|fixture|demo|ejemplo)/i;

export function clasificar(tenedores, censo, hojas) {
  const internas = new Map(); // addr -> [motivos]
  const marcar = (a, m) => { if (!a || !a.startsWith("0x")) return; const k = norm(a); if (!internas.has(k)) internas.set(k, []); if (!internas.get(k).includes(m)) internas.get(k).push(m); };
  const mencionesPrueba = new Map(); // addr -> [archivo]
  const contratos = {};
  for (const act of tenedores.activos) {
    if (act.contrato) { contratos[act.asset] = norm(act.contrato); marcar(act.contrato, `contrato del token ${act.asset}`); }
    for (const h of act.holders) {
      if (h.clase === "OPERACION_INTERNA") marcar(h.address, `OPERACION_INTERNA en ${act.asset}: ${h.rol || ""}`.trim());
      if (h.clase === "CONTRATO_POOL") marcar(h.address, `contrato/pool (${act.asset})`);
      if (h.clase === "DESCONOCIDO_GRANDE") marcar(h.address, `DESCONOCIDO_GRANDE en ${act.asset} (se elimina)`);
      const archivos = [...(h.menciones || []).map((m) => m.archivo), ...String(h.evidencia || "").split(/[;·,]\s*/).filter((s) => /\.\w+(:\d+)?$/.test(s.trim()))];
      for (const archivo of archivos) {
        const m = { archivo: archivo.trim() };
        if (RE_PRUEBA.test(m.archivo)) {
          const k = norm(h.address);
          if (!mencionesPrueba.has(k)) mencionesPrueba.set(k, []);
          if (!mencionesPrueba.get(k).includes(m.archivo)) mencionesPrueba.get(k).push(m.archivo);
        }
      }
    }
  }
  for (const t of censo.tenedores) {
    if (t.clase === "INTERNA-OrdenGlobal") marcar(t.address, `censo ONDK: ${t.nota}`);
    if (t.clase === "CONTRATO") marcar(t.address, "censo ONDK: contrato");
    if (/scripts\/pruebas|prueba|test/i.test(t.nota || "")) {
      const k = norm(t.address);
      if (!mencionesPrueba.has(k)) mencionesPrueba.set(k, []);
      mencionesPrueba.get(k).push("censo: " + t.nota);
    }
  }
  const seElimina = new Set();
  for (const f of (hojas["Se elimina"] || []).slice(1)) if (f[0] && f[1]) { seElimina.add(`${f[0]}|${norm(f[1])}`); marcar(f[1], `hoja «Se elimina» (${f[0]})`); }
  return { internas, mencionesPrueba, contratos, seElimina };
}
