#!/usr/bin/env node
// SFSP-410 / SFSP-700 · Padrón de migración a los tokens SFSP (equipo B).
//
// Construye, por activo a migrar, el padrón de beneficiarios y su árbol de
// Merkle EXACTAMENTE en el formato de SFSPMigrationRegistry:
//   hoja  = keccak256(abi.encode(bytes32 migrationId, address beneficiary, uint256 oldUnits))
//   nodo  = keccak256(abi.encodePacked(min(a,b), max(a,b)))   (pares ordenados)
//
// Beneficiarios = filas «Usuarios (se conservan)» + filas «En revisión» marcadas SÍ
// en la hoja de aceptación, MENOS toda dirección interna / de Orden Global /
// contrato. Las filas en blanco quedan como PENDIENTES (no entran en el árbol).
// Las ranuras sin dirección van a una RESERVA DE RECLAMO con su propia raíz
// (compromiso público), reclamable en una segunda raíz cuando el dueño pruebe su
// dirección (ver LEEME.md).
//
// Sólo lectura en cadena (lista blanca de métodos en lib/comun.mjs). No firma
// nada. Escribe los DATOS fuera del repositorio (RUTAS.salida).
//
// Uso:  NODE_USE_ENV_PROXY=1 node construir-padron.mjs [--sin-red]
//   BLOQUE_CORTE=<n>   bloque de la instantánea (por defecto, el último)
//   MIG_ID_<ACTIVO>=mig_<32hex>  fija el migrationId (si no, se deriva)
import {
  RUTAS, CHAIN_ID, rpc, bloqueFijo, balanceOf, leerRanura, enParalelo, leerXlsx, escribir, csv, norm,
  aUnidades, aTexto, construirArbol, arbol, prueba, verificarPrueba, hojaMigracion, hojaReserva, idMigracion, ETIQUETA_RESERVA, separarInternas,
} from "./lib/comun.mjs";
import { readFileSync } from "node:fs";
import { clasificar } from "./lib/clasificacion.mjs";

const ACTIVOS = (process.env.ACTIVOS || "ONDK,AUKA,IBS,HARV").split(",");
const SIN_RED = process.argv.includes("--sin-red");

const tenedores = JSON.parse(readFileSync(RUTAS.tenedores, "utf8"));
const censo = JSON.parse(readFileSync(RUTAS.censoOndk, "utf8"));
const hojas = leerXlsx(RUTAS.aceptacion);

// ------------------------------------------------------------ 1. cuentas internas
// Una dirección es «no beneficiaria» si CUALQUIER fuente la marca así, en
// cualquier activo (lib/clasificacion.mjs).
const { internas, mencionesPrueba, contratos, seElimina } = clasificar(tenedores, censo, hojas);

// ------------------------------------------------------------ 2. aceptación
const siNo = (v) => {
  const s = String(v || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s === "SI" ? "SI" : s === "NO" ? "NO" : "PENDIENTE";
};
const usuariosHoja = (hojas["Usuarios (se conservan)"] || []).slice(1).filter((f) => f[0]);
const revisionHoja = (hojas["En revisión"] || []).slice(1).filter((f) => f[0]);

const bloque = SIN_RED ? { numero: tenedores.bloque, hash: null, timestamp: null, tag: null } : await bloqueFijo(process.env.BLOQUE_CORTE);
console.log(`bloque de corte ${bloque.numero}${SIN_RED ? " (sin red: saldos de las entradas)" : ""}`);

const saldoEntrada = (asset, addr) => {
  if (asset === "ONDK") { const t = censo.tenedores.find((x) => norm(x.address) === norm(addr)); if (t) return BigInt(t.ondkRaw); }
  const act = tenedores.activos.find((a) => a.asset === asset);
  const h = act && act.holders.find((x) => norm(x.address) === norm(addr));
  return h ? BigInt(h.balanceRaw) : null;
};

const permisosOndk = new Set((censo.resumen.permisos || []).map((p) => norm(p.clave)));
const resumen = { generado: new Date().toISOString(), chainId: CHAIN_ID, bloque, soloLectura: true, activos: {} };

for (const asset of ACTIVOS) {
  const contrato = contratos[asset];
  if (!contrato) throw new Error(`sin contrato para ${asset}`);
  const mig = idMigracion(asset, contrato, bloque.numero);

  const candidatos = [];
  const pendientes = [];
  const descartados = [];
  const reservaFilas = [];
  for (const f of usuariosHoja.filter((f) => f[0] === asset)) candidatos.push({ address: norm(f[1]), origen: "USUARIO", nota: f[3] || "" });
  for (const f of revisionHoja.filter((f) => f[0] === asset)) {
    const d = siNo(f[4]);
    const fila = { clave: norm(f[1]), saldoHoja: f[2], motivo: f[3] || "", decision: d };
    if (d === "SI" && f[1].startsWith("0x")) candidatos.push({ address: norm(f[1]), origen: "REVISION_SI", nota: f[3] || "" });
    else if (d === "NO") descartados.push(fila);
    else if (f[1].startsWith("0x")) pendientes.push(fila);
    else reservaFilas.push(fila); // ranura sin dirección (con SÍ también: sin dirección no se puede listar)
  }

  // Conflictos: el censo de ONDK (más reciente) clasifica USUARIO a direcciones
  // que la hoja no tiene como usuario.
  const conflictos = [];
  if (asset === "ONDK") {
    const enHoja = new Set([...candidatos.map((c) => c.address), ...pendientes.map((p) => p.clave)]);
    for (const t of censo.tenedores.filter((t) => t.clase === "USUARIO")) {
      const k = norm(t.address);
      if (!enHoja.has(k)) conflictos.push({ address: k, ondk: t.ondk, censo: "USUARIO", hoja: seElimina.has(`ONDK|${k}`) ? "Se elimina" : "ausente", nota: t.nota });
    }
  }

  // Exclusión de internas.
  const { beneficiarios, excluidos } = separarInternas(candidatos, internas);

  // Saldos en el bloque de corte.
  const tag = bloque.tag;
  await enParalelo(beneficiarios, async (b) => {
    b.oldUnitsEntrada = saldoEntrada(asset, b.address);
    b.oldUnits = SIN_RED ? b.oldUnitsEntrada : await balanceOf(contrato, b.address, tag);
    b.difiereDeEntrada = b.oldUnitsEntrada !== null && b.oldUnitsEntrada !== b.oldUnits;
    b.marcaPrueba = mencionesPrueba.get(b.address) || null;
  });
  const sinSaldo = beneficiarios.filter((b) => b.oldUnits === 0n);
  const conSaldo = beneficiarios.filter((b) => b.oldUnits > 0n);
  for (const b of sinSaldo) excluidos.push({ ...b, motivos: ["saldo cero en el bloque de corte"] });
  await enParalelo(pendientes, async (p) => {
    p.oldUnits = SIN_RED ? saldoEntrada(asset, p.clave) : await balanceOf(contrato, p.clave, tag);
    p.marcaPrueba = mencionesPrueba.get(p.clave) || null;
    p.interna = internas.get(p.clave) || null;
  });

  // Reserva de reclamo por ranura. ONDK: las 89 hojas SIN-RESOLVER del censo
  // (inventario completo del almacenamiento); resto de activos: ranuras de la hoja.
  let reserva;
  if (asset === "ONDK") {
    reserva = censo.tenedores.filter((t) => t.clase === "SIN-RESOLVER").map((t) => ({ clave: t.address, oldUnitsEntrada: BigInt(t.ondkRaw), fuente: t.fuente }));
    const enCenso = new Set(reserva.map((r) => r.clave));
    for (const r of reservaFilas) if (!enCenso.has(r.clave)) descartados.push({ ...r, decision: permisosOndk.has(r.clave.slice(7)) ? "PERMISO (allowance), no saldo — censo ONDK" : "no está en el censo ONDK" });
  } else {
    reserva = reservaFilas.map((r) => ({ clave: r.clave, oldUnitsEntrada: saldoEntrada(asset, r.clave), fuente: "hoja de aceptación" }));
  }
  await enParalelo(reserva, async (r) => {
    // Una «ranura» se relee en vivo; una «huella» (keccak de la ranura) no se puede
    // leer sin la ranura y conserva el valor del censo.
    r.oldUnits = !SIN_RED && r.clave.startsWith("ranura:") ? await leerRanura(contrato, r.clave.slice(7), tag) : r.oldUnitsEntrada;
    r.difiereDeEntrada = r.oldUnitsEntrada !== null && r.oldUnits !== r.oldUnitsEntrada;
  });
  const reservaViva = reserva.filter((r) => r.oldUnits > 0n);

  // Árbol de beneficiarios (el que se publica en openMigration).
  const t = conSaldo.length ? construirArbol(conSaldo, mig.bytes32) : null;
  // Autoverificación: cada prueba con la réplica de `_verifyProof`.
  if (t) for (const e of t.entradas) if (!verificarPrueba(e.prueba, t.raiz, hojaMigracion(mig.bytes32, e.address, e.oldUnits))) throw new Error(`prueba inválida ${asset}`);
  // Raíz de reserva (compromiso público; NO se usa en openMigration).
  let raizReserva = null, reservaOrdenada = [];
  if (reservaViva.length) {
    reservaOrdenada = reservaViva.map((r) => ({ ...r, hoja: hojaReserva(mig.bytes32, r.clave, r.oldUnits) }))
      .sort((a, b) => (BigInt(a.hoja) < BigInt(b.hoja) ? -1 : 1));
    const tr = arbol(reservaOrdenada.map((r) => r.hoja));
    raizReserva = tr.raiz;
    reservaOrdenada.forEach((r, i) => { r.indice = i; r.prueba = prueba(tr, i); });
  }

  const s0 = conSaldo.reduce((s, b) => s + b.oldUnits, 0n);
  const totalReserva = reservaViva.reduce((s, r) => s + r.oldUnits, 0n);
  const totalPend = pendientes.reduce((s, p) => s + (p.oldUnits || 0n), 0n);
  const ser = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString() : v)));

  const padron = {
    formato: "sfsp-padron-migracion/v1",
    advertencia: "DATOS PERSONALES (direcciones y saldos). No se versiona en el repositorio público.",
    activo: asset,
    contratoOrigen: contrato,
    chainId: CHAIN_ID,
    bloqueCorte: bloque,
    migrationId: mig,
    codificacionHoja: "keccak256(abi.encode(bytes32 migrationId, address beneficiary, uint256 oldUnits)) · pares ordenados keccak256(abi.encodePacked(min,max)) · orden de hojas ascendente por valor",
    raizMerkle: t ? t.raiz : null,
    s0Unidades: s0.toString(),
    s0: aTexto(s0),
    beneficiarios: t ? t.entradas.map((e) => ser({
      indice: e.indice, address: e.address, oldUnits: e.oldUnits, cantidad: aTexto(e.oldUnits), origen: e.origen,
      hoja: e.hoja, prueba: e.prueba, difiereDeEntrada: e.difiereDeEntrada, oldUnitsEntrada: e.oldUnitsEntrada,
      marcaArchivoDePrueba: e.marcaPrueba,
    })) : [],
    pendientesJose: ser(pendientes.map((p) => ({ address: p.clave, oldUnits: p.oldUnits, cantidad: p.oldUnits != null ? aTexto(p.oldUnits) : null, motivo: p.motivo, marcaArchivoDePrueba: p.marcaPrueba, interna: p.interna }))),
    descartados: ser(descartados),
    excluidosInternos: ser(excluidos.map((e) => ({ address: e.address, origen: e.origen, motivos: e.motivos }))),
    conflictosCensoVsHoja: conflictos,
    reservaDeReclamo: {
      regla: "Una clave «ranura:R» la reclama la dirección A si keccak256(abi.encode(A, uint256(0))) == R; una «huella:H» si keccak256(keccak256(abi.encode(A, 0))) == H. Además A debe firmar (control) y pasar identidad. Se incorpora en una SEGUNDA raíz (migración nueva sobre el mismo origen) — ver LEEME.md.",
      etiqueta: ETIQUETA_RESERVA,
      codificacionHoja: "keccak256(abi.encode(bytes32 ETIQUETA, bytes32 migrationId, uint8 tipo(0=ranura,1=huella), bytes32 clave, uint256 oldUnits))",
      raiz: raizReserva,
      totalUnidades: totalReserva.toString(),
      total: aTexto(totalReserva),
      entradas: ser(reservaOrdenada.map((r) => ({ indice: r.indice, clave: r.clave, oldUnits: r.oldUnits, cantidad: aTexto(r.oldUnits), hoja: r.hoja, prueba: r.prueba, fuente: r.fuente, difiereDeEntrada: r.difiereDeEntrada }))),
      sinSaldoAhora: ser(reserva.filter((r) => r.oldUnits === 0n).map((r) => ({ clave: r.clave, oldUnitsEntrada: r.oldUnitsEntrada }))),
    },
  };
  escribir(`padron-${asset}.json`, padron);
  escribir(`padron-${asset}.csv`, csv([
    ["estado", "direccion_o_clave", "cantidad", "unidades_wei", "hoja", "notas"],
    ...padron.beneficiarios.map((b) => ["BENEFICIARIO", b.address, b.cantidad, b.oldUnits, b.hoja, [b.origen, b.marcaArchivoDePrueba ? "CITADA EN ARCHIVO DE PRUEBA: " + b.marcaArchivoDePrueba.join(" | ") : "", b.difiereDeEntrada ? "saldo distinto de la foto" : ""].filter(Boolean).join("; ")]),
    ...padron.pendientesJose.map((p) => ["PENDIENTE_JOSE", p.address, p.cantidad, p.oldUnits, "", [p.motivo, p.marcaArchivoDePrueba ? "citada en archivo de prueba" : "", p.interna ? "INTERNA: " + p.interna.join(" | ") : ""].filter(Boolean).join("; ")]),
    ...padron.reservaDeReclamo.entradas.map((r) => ["RESERVA_RANURA", r.clave, r.cantidad, r.oldUnits, r.hoja, r.fuente]),
    ...padron.excluidosInternos.map((e) => ["EXCLUIDO_INTERNO", e.address, "", "", "", e.motivos.join(" | ")]),
    ...padron.conflictosCensoVsHoja.map((c) => ["CONFLICTO_CENSO_HOJA", c.address, c.ondk, "", "", `censo=${c.censo} hoja=${c.hoja}; ${c.nota}`]),
    ...padron.descartados.map((d) => ["DESCARTADO", d.clave, d.saldoHoja, "", "", d.decision]),
  ]));

  resumen.activos[asset] = {
    contrato, migrationId: mig.texto, migrationIdBytes32: mig.bytes32, raizMerkle: padron.raizMerkle, s0: padron.s0, s0Unidades: padron.s0Unidades,
    beneficiarios: padron.beneficiarios.length,
    beneficiariosCitadosEnPruebas: padron.beneficiarios.filter((b) => b.marcaArchivoDePrueba).length,
    saldosDistintosDeLaFoto: padron.beneficiarios.filter((b) => b.difiereDeEntrada).length,
    pendientesConDireccion: pendientes.length, pendientesTotal: aTexto(totalPend),
    reserva: { claves: reservaViva.length, total: aTexto(totalReserva), raiz: raizReserva },
    excluidosInternos: excluidos.length, conflictos: conflictos.length, descartados: descartados.length,
  };
  console.log(`${asset}: ${padron.beneficiarios.length} beneficiarios · S0 ${padron.s0} · raíz ${padron.raizMerkle} · pendientes ${pendientes.length} · reserva ${reservaViva.length} (${aTexto(totalReserva)}) · excluidos ${excluidos.length} · conflictos ${conflictos.length}`);
}
escribir("raices-merkle.json", resumen);
