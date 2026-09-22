/* AU-RA FP · el operador del protocolo (ADR-014, operador/AU-RA-FP.md).
 *
 * Dos registros: el DECLARADO, que es la estructura que dio la dirección con
 * sus huecos (D21 pendiente), y uno RESUELTO, sólo para las pruebas, donde se
 * rellenan los dueños que faltan y hay contratos. Con el declarado, casi todo
 * tiene que salir bloqueado: esa es la mitad de lo que se prueba. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ECOSISTEMA_DECLARADO, POR_CONFIRMAR, AUDITOR_EXTERNO,
  parteDe, sonIndependientes, pendientesDeConfirmar,
  SERVICIOS, autorizarServicio, serviciosPorEmpresa,
  puedeAprobarMonetario, puedeEscribirPasaporte, puedeAdmitir, puedeListar,
  puedeRevisarInforme, validarLiberacion,
  COMPROBACIONES, informeDeCumplimiento,
} from '../index.js';
import type { Ecosistema, Evidencia, Evidencias, EmpresaId, Duena, ProductoId, Producto, ServicioId } from '../index.js';

const D = ECOSISTEMA_DECLARADO;

/** El registro con D21 resuelto de una forma concreta. Sólo para probar las reglas. */
function resuelto(duenaDeAuraFp: Duena = 'INDEPENDIENTE'): Ecosistema {
  const productos = Object.fromEntries(
    Object.entries(D.productos).map(([k, p]) => [k, { ...p, duena: p.duena === POR_CONFIRMAR ? 'ORDEN_GLOBAL' : p.duena }]),
  ) as Record<ProductoId, Producto>;
  return {
    ...D,
    empresas: { ...D.empresas, AURA_FP: { ...D.empresas.AURA_FP, duena: duenaDeAuraFp } },
    productos,
    contratosVigentes: true,
  };
}
const R = resuelto();

const persona = (empresa: EmpresaId, rol: 'JUNTA' | 'OPERACIONES' = 'JUNTA') => ({ empresa, tipo: 'PERSONA' as const, rol });

/* ───────────────────────────── el registro ───────────────────────────── */

test('AU-RA FP · el registro declarado es lo que dijo la dirección', () => {
  assert.equal(D.productos.VETA_WALLET.duena, 'ORDEN_GLOBAL');
  assert.equal(D.productos.CADENA_5550.duena, 'ORDEN_GLOBAL');
  assert.equal(D.productos.TESORERIA.duena, 'ORDEN_GLOBAL');
  assert.equal(D.productos.ORDENEX.duena, 'AUCORP');
  assert.equal(D.auditor, 'DBNX');
  assert.equal(D.operador, 'AURA_FP');
  assert.equal(D.empresas.AURA_FP.nombre, 'AU-RA FP');
  assert.equal(D.contratosVigentes, false, 'no hay contratos firmados, y el registro no finge que los hay');
});

test('AU-RA FP · lo que nadie dijo figura como pendiente, no adivinado', () => {
  const p = pendientesDeConfirmar(D);
  for (const esperado of ['AU-RA FP', 'Genesis ID', 'MyTokenPay', 'ordenscan.com', 'PULSE2CHAT', 'Cadena 8532', 'contratos']) {
    assert.ok(p.some((x) => x.includes(esperado)), `falta «${esperado}» en ${JSON.stringify(p)}`);
  }
  assert.deepEqual(pendientesDeConfirmar(R).length, 0);
});

test('AU-RA FP · el registro declarado no se puede alterar desde fuera', () => {
  assert.throws(() => { (D.productos.ORDENEX as { duena: string }).duena = 'DBNX'; }, TypeError);
  assert.throws(() => { (D as { contratosVigentes: boolean }).contratosVigentes = true; }, TypeError);
  assert.throws(() => { (D.productos.ORDENEX.contrata as Record<string, string>)['S03'] = 'ESCRITURA'; }, TypeError);
  assert.equal(D.productos.ORDENEX.duena, 'AUCORP');
});

test('AU-RA FP · con un dueño desconocido, la independencia no se supone: se bloquea', () => {
  const r = sonIndependientes(D, 'DBNX', 'AURA_FP');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
  assert.equal(r.decision, 'D21');
  assert.equal(r.valor, null, 'ni true ni false: no se sabe');
});

test('AU-RA FP · dos empresas del mismo dueño cuentan como la misma parte', () => {
  const eco = resuelto('ORDEN_GLOBAL');
  assert.equal(parteDe(eco, 'AURA_FP').valor, 'ORDEN_GLOBAL');
  const r = sonIndependientes(eco, 'AURA_FP', 'ORDEN_GLOBAL');
  assert.equal(r.codigo, 'ALLOW');
  assert.equal(r.valor, false);
});

test('AU-RA FP · una cadena de dueñas que da la vuelta no produce una respuesta', () => {
  const eco: Ecosistema = { ...R, empresas: { ...R.empresas,
    AURA_FP: { ...R.empresas.AURA_FP, duena: 'DBNX' }, DBNX: { ...R.empresas.DBNX, duena: 'AURA_FP' } } };
  assert.equal(parteDe(eco, 'DBNX').codigo, 'BLOCKED_DECISION');
});

/* ───────────────────────────── los servicios ───────────────────────────── */

test('AU-RA FP · todo servicio contratado existe en el catálogo', () => {
  for (const p of Object.values(D.productos)) {
    for (const s of Object.keys(p.contrata)) assert.ok(s in SERVICIOS, `${p.nombre} contrata ${s}, que no existe`);
  }
});

test('AU-RA FP · hoy, sin contratos, nadie recibe credenciales: todo BLOCKED D21', () => {
  const r = autorizarServicio(D, 'VETA_WALLET', 'S01', 'EJECUCION');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
  assert.equal(r.decision, 'D21');
  assert.equal(autorizarServicio(D, 'MYTOKENPAY', 'S01', 'LECTURA').codigo, 'BLOCKED_DECISION');
});

test('AU-RA FP · con contratos, cada producto usa lo suyo y nada más', () => {
  assert.equal(autorizarServicio(R, 'VETA_WALLET', 'S01', 'EJECUCION').codigo, 'ALLOW');
  assert.equal(autorizarServicio(R, 'VETA_WALLET', 'S01', 'LECTURA').codigo, 'ALLOW', 'un alcance mayor incluye los menores');
  assert.equal(autorizarServicio(R, 'VETA_WALLET', 'S04', 'EJECUCION').codigo, 'DENY_AUTHORIZATION', 'Veta no liquida DvP');
  assert.equal(autorizarServicio(R, 'ORDENEX', 'S04', 'EJECUCION').codigo, 'ALLOW');
  assert.equal(autorizarServicio(R, 'ORDENEX', 'S03', 'LECTURA').codigo, 'ALLOW');
  assert.equal(autorizarServicio(R, 'ORDENEX', 'S06', 'LECTURA').codigo, 'DENY_AUTHORIZATION', 'Ordenex no toca la tesorería');
});

test('AU-RA FP · un alcance mayor que el contratado se niega', () => {
  const r = autorizarServicio(R, 'TESORERIA', 'S07', 'ESCRITURA');
  assert.notEqual(r.codigo, 'ALLOW');
});

test('AU-RA FP · sólo DBNX escribe pasaportes, aunque un contrato diga otra cosa', () => {
  assert.equal(autorizarServicio(R, 'DBNX_DATOS', 'S03', 'ESCRITURA').codigo, 'ALLOW');
  const trucado: Ecosistema = { ...R, productos: { ...R.productos,
    ORDENEX: { ...R.productos.ORDENEX, contrata: { ...R.productos.ORDENEX.contrata, S03: 'ESCRITURA' } } } };
  const r = autorizarServicio(trucado, 'ORDENEX', 'S03', 'ESCRITURA');
  assert.equal(r.codigo, 'DENY_POLICY', 'el contrato decide qué se compra; la regla, qué existe');
});

test('AU-RA FP · una regla del protocolo se dice como regla, no como «falta un papel»', () => {
  /* Con el registro declarado, D21 bloquea todo. Pero Ordenex escribiendo un
     pasaporte no está «pendiente de contrato»: está prohibido. */
  assert.equal(autorizarServicio(D, 'ORDENEX', 'S03', 'ESCRITURA').codigo, 'DENY_POLICY');
});

test('AU-RA FP · el asistente y el copiloto nunca escriben, ni para el propio operador', () => {
  for (const s of ['S13', 'S14'] as ServicioId[]) {
    const eco: Ecosistema = { ...R, productos: { ...R.productos,
      ASISTENTE_AURA: { ...R.productos.ASISTENTE_AURA, contrata: { [s]: 'ESCRITURA' } } } };
    assert.equal(autorizarServicio(eco, 'ASISTENTE_AURA', s, 'ESCRITURA').codigo, 'DENY_POLICY', s);
  }
});

test('AU-RA FP · lo que no existe se niega sin excepción', () => {
  assert.equal(autorizarServicio(R, 'NO_EXISTE' as ProductoId, 'S01', 'LECTURA').codigo, 'DENY_AUTHORIZATION');
  assert.equal(autorizarServicio(R, 'VETA_WALLET', 'S99' as ServicioId, 'LECTURA').codigo, 'DENY_AUTHORIZATION');
  assert.equal(autorizarServicio(R, 'VETA_WALLET', 'S01', 'TODO' as 'LECTURA').codigo, 'DENY_AUTHORIZATION');
});

test('AU-RA FP · el mapa de servicios por empresa sale del registro', () => {
  const m = serviciosPorEmpresa(D);
  assert.ok(m['ORDEN_GLOBAL']?.includes('S06'), 'Orden Global usa tesorería');
  assert.ok(m['AUCORP']?.includes('S04'), 'AuCorp liquida en Ordenex');
  assert.ok(m['DBNX']?.includes('S03'), 'DBNX escribe pasaportes');
  assert.ok(Object.keys(m).some((k) => k.startsWith(POR_CONFIRMAR)), 'los productos sin dueño aparecen como tales');
});

/* ─────────────────────────── separación de funciones ─────────────────────────── */

test('R1 · un asistente no aprueba nada monetario, aunque sea de la dueña', () => {
  const r = puedeAprobarMonetario(R, { empresa: 'ORDEN_GLOBAL', tipo: 'ASISTENTE', rol: 'JUNTA' }, 'ORDEN_GLOBAL');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
});

test('R1 · el operador no aprueba, ni siquiera una persona de su junta', () => {
  assert.equal(puedeAprobarMonetario(R, persona('AURA_FP'), 'AURA_FP').codigo, 'DENY_POLICY');
});

test('R1 · aprueba la Junta de la dueña, y sólo ella', () => {
  assert.equal(puedeAprobarMonetario(R, persona('ORDEN_GLOBAL'), 'ORDEN_GLOBAL').codigo, 'ALLOW');
  assert.equal(puedeAprobarMonetario(R, persona('ORDEN_GLOBAL', 'OPERACIONES'), 'ORDEN_GLOBAL').codigo, 'DENY_AUTHORIZATION');
  assert.equal(puedeAprobarMonetario(R, persona('AUCORP'), 'ORDEN_GLOBAL').codigo, 'DENY_AUTHORIZATION');
});

test('R2 · sólo el auditor escribe pasaportes', () => {
  assert.equal(puedeEscribirPasaporte(R, 'DBNX').codigo, 'ALLOW');
  for (const e of ['ORDEN_GLOBAL', 'AUCORP', 'AURA_FP'] as EmpresaId[]) {
    assert.equal(puedeEscribirPasaporte(R, e).codigo, 'DENY_POLICY', e);
  }
});

test('R3 · DBNX admite activos ajenos, no propios', () => {
  assert.equal(puedeAdmitir(R, 'DBNX', 'AUCORP').codigo, 'ALLOW');
  assert.equal(puedeAdmitir(R, 'DBNX', 'DBNX').codigo, 'DENY_POLICY');
  assert.equal(puedeAdmitir(R, 'AUCORP', 'ORDEN_GLOBAL').codigo, 'DENY_POLICY', 'sólo admite el auditor');
});

test('R3 · Ordenex lista lo que DBNX aprobó, aunque el emisor sea su propia dueña', () => {
  const ok = { escritoPor: 'DBNX' as EmpresaId, emisor: 'AUCORP' as EmpresaId, admission: 'APPROVED', trading: 'LISTED', transferability: 'FREE' };
  assert.equal(puedeListar(R, 'AUCORP', ok).codigo, 'ALLOW');
  assert.equal(puedeListar(R, 'AUCORP', { ...ok, escritoPor: 'AUCORP' }).codigo, 'DENY_POLICY', 'la dueña del mercado no se escribe el pasaporte');
  assert.equal(puedeListar(R, 'AUCORP', { ...ok, transferability: 'FROZEN' }).codigo, 'DENY_ASSET_STATE');
  assert.equal(puedeListar(R, 'AUCORP', { ...ok, trading: 'DELISTED' }).codigo, 'DENY_ASSET_STATE');
  assert.equal(puedeListar(R, 'AUCORP', { ...ok, admission: 'REVIEW' }).codigo, 'DENY_ASSET_STATE');
  assert.equal(puedeListar(R, 'AUCORP', { ...ok, emisor: 'DBNX' }).codigo, 'DENY_POLICY', 'el auditor no lista activos propios');
});

test('R4 · quien opera no se audita, y nadie revisa su propio informe', () => {
  assert.equal(puedeRevisarInforme(R, 'AURA_FP', 'ORDEN_GLOBAL').codigo, 'DENY_POLICY');
  assert.equal(puedeRevisarInforme(R, 'AURA_FP', 'AURA_FP').codigo, 'DENY_POLICY');
  assert.equal(puedeRevisarInforme(R, 'DBNX', 'ORDEN_GLOBAL').codigo, 'ALLOW');
  assert.equal(puedeRevisarInforme(R, 'DBNX', 'AURA_FP').codigo, 'ALLOW');
  assert.equal(puedeRevisarInforme(R, 'DBNX', 'DBNX').codigo, 'DENY_POLICY');
  assert.equal(puedeRevisarInforme(R, AUDITOR_EXTERNO, 'DBNX').codigo, 'ALLOW', 'al auditor lo revisa alguien de fuera');
  assert.equal(puedeRevisarInforme(R, 'AUCORP', 'ORDEN_GLOBAL').codigo, 'DENY_AUTHORIZATION');
});

test('R4 · si DBNX y AU-RA FP fueran del mismo dueño, DBNX no podría revisar a AU-RA FP', () => {
  const eco = resuelto('DBNX');
  assert.equal(puedeRevisarInforme(eco, 'DBNX', 'ORDEN_GLOBAL').codigo, 'DENY_POLICY');
});

test('R4 · con el registro de hoy, revisar a AU-RA FP queda bloqueado hasta D21', () => {
  const r = puedeRevisarInforme(D, 'DBNX', 'ORDEN_GLOBAL');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
  assert.equal(r.decision, 'D21');
});

test('R5 · la tesorería necesita tres partes distintas', () => {
  const buena = { duena: 'ORDEN_GLOBAL' as EmpresaId, aprueba: persona('ORDEN_GLOBAL'), ejecuta: 'AURA_FP' as EmpresaId, atestiguaReservas: 'DBNX' as const };
  assert.equal(validarLiberacion(R, buena).codigo, 'ALLOW');
  assert.equal(validarLiberacion(R, { ...buena, atestiguaReservas: 'ORDEN_GLOBAL' }).codigo, 'DENY_POLICY', 'la dueña no certifica sus reservas');
  assert.equal(validarLiberacion(R, { ...buena, atestiguaReservas: 'AURA_FP' }).codigo, 'DENY_POLICY', 'quien calcula no certifica');
  assert.equal(validarLiberacion(R, { ...buena, ejecuta: 'ORDEN_GLOBAL' }).codigo, 'DENY_POLICY', 'la dueña no ejecuta sola');
  assert.equal(validarLiberacion(R, { ...buena, aprueba: { empresa: 'ORDEN_GLOBAL', tipo: 'ASISTENTE', rol: 'JUNTA' } }).codigo, 'DENY_AUTHORIZATION');
  assert.equal(validarLiberacion(R, { ...buena, atestiguaReservas: AUDITOR_EXTERNO }).codigo, 'ALLOW', 'un custodio externo también vale');
});

test('R5 · si AU-RA FP fuera de Orden Global, Orden Global estaría ejecutando su propia liberación', () => {
  const eco = resuelto('ORDEN_GLOBAL');
  const l = { duena: 'ORDEN_GLOBAL' as EmpresaId, aprueba: persona('ORDEN_GLOBAL'), ejecuta: 'AURA_FP' as EmpresaId, atestiguaReservas: 'DBNX' as const };
  assert.equal(validarLiberacion(eco, l).codigo, 'DENY_POLICY');
});

test('R5 · con el registro de hoy, ninguna liberación pasa: falta D21', () => {
  const l = { duena: 'ORDEN_GLOBAL' as EmpresaId, aprueba: persona('ORDEN_GLOBAL'), ejecuta: 'AURA_FP' as EmpresaId, atestiguaReservas: 'DBNX' as const };
  assert.equal(validarLiberacion(D, l).codigo, 'BLOCKED_DECISION');
});

/* ───────────────────────────── cumplimiento ───────────────────────────── */

const AHORA = '2026-09-22T12:00:00.000Z';
const ev = (valor: Evidencia['valor'], extra: Partial<Evidencia> = {}): Evidencia => ({
  valor, obtenidaEn: '2026-09-22T10:00:00.000Z', vigenteHasta: '2026-09-23T00:00:00.000Z', fuente: 'prueba', ...extra,
});
/** Evidencia completa y buena para todas las comprobaciones. */
function todoEnOrden(): Record<string, Evidencia> {
  const e: Record<string, Evidencia> = {};
  for (const c of COMPROBACIONES) {
    e[c.evidencia] = c.regla.tipo === 'VERDADERO' ? ev(true) : ev(0);
    if (c.regla.tipo === 'NO_SUPERA_MINIMO') for (const l of c.regla.limites) e[l] = ev(100);
  }
  return e;
}
const EMPRESAS: EmpresaId[] = ['ORDEN_GLOBAL', 'AUCORP', 'DBNX', 'AURA_FP'];

test('Cumplimiento · cada comprobación es de un producto de su propia empresa', () => {
  for (const c of COMPROBACIONES) {
    assert.equal(D.productos[c.producto].duena, c.empresa, `${c.id}: ${c.producto} no es de ${c.empresa}`);
  }
  assert.equal(new Set(COMPROBACIONES.map((c) => c.id)).size, COMPROBACIONES.length, 'ids repetidos');
});

test('Cumplimiento · sin evidencia, todo sale NO_VERIFICABLE, nunca CUMPLE', () => {
  for (const e of EMPRESAS) {
    const i = informeDeCumplimiento(e, {}, AHORA);
    assert.equal(i.estado, 'NO_VERIFICABLE', e);
    assert.equal(i.cumplen, 0, e);
    assert.ok(i.resultados.length > 0, `${e} no tiene comprobaciones`);
  }
});

test('Cumplimiento · con toda la evidencia buena, cumple', () => {
  for (const e of EMPRESAS) assert.equal(informeDeCumplimiento(e, todoEnOrden(), AHORA).estado, 'CUMPLE', e);
});

test('Cumplimiento · un solo incumplimiento manda sobre lo que falte', () => {
  const i = informeDeCumplimiento('AUCORP', { 'ordenex.operacionesSinEntregaContraPago': ev(3) }, AHORA);
  assert.equal(i.estado, 'INCUMPLE');
  assert.equal(i.incumplen, 1);
  assert.ok(i.noVerificables > 0);
});

test('Cumplimiento · evidencia vencida, sin fuente, con fecha rota o del futuro: NO_VERIFICABLE', () => {
  const clave = 'veta.enviosSinResolucionVigente';
  const casos: [string, Evidencia][] = [
    ['vencida', ev(0, { vigenteHasta: '2026-09-22T11:59:59.000Z' })],
    ['sin fuente', ev(0, { fuente: '  ' })],
    ['fecha rota', ev(0, { obtenidaEn: 'ayer' })],
    ['del futuro', ev(0, { obtenidaEn: '2026-09-22T13:00:00.000Z' })],
    ['sin valor', ev(null)],
  ];
  for (const [nombre, e] of casos) {
    const r = informeDeCumplimiento('ORDEN_GLOBAL', { ...todoEnOrden(), [clave]: e }, AHORA);
    const fila = r.resultados.find((x) => x.id === 'VW-01');
    assert.equal(fila?.estado, 'NO_VERIFICABLE', nombre);
    assert.equal(r.estado, 'NO_VERIFICABLE', nombre);
  }
});

test('Cumplimiento · un recuento que no es un número válido no pasa por cero', () => {
  const clave = 'aucorp.asientosDuplicados';
  for (const valor of ['0' as unknown as number, -1, Number.NaN, true as unknown as number]) {
    const r = informeDeCumplimiento('AUCORP', { ...todoEnOrden(), [clave]: ev(valor) }, AHORA);
    assert.equal(r.resultados.find((x) => x.id === 'AC-02')?.estado, 'NO_VERIFICABLE', String(valor));
  }
});

test('Cumplimiento · un límite de tesorería que falta no es «sin límite»', () => {
  const base = todoEnOrden();
  delete base['tesoreria.techoAprobado'];
  const r = informeDeCumplimiento('ORDEN_GLOBAL', base, AHORA);
  assert.equal(r.resultados.find((x) => x.id === 'TS-01')?.estado, 'NO_VERIFICABLE');
});

test('Cumplimiento · la tesorería se compara contra el MENOR de sus dos límites', () => {
  const base = { ...todoEnOrden(),
    'tesoreria.techoAprobado': ev(100), 'tesoreria.capacidadPorReservas': ev(40) };
  const dentro = informeDeCumplimiento('ORDEN_GLOBAL', { ...base, 'tesoreria.liberado': ev(40) }, AHORA);
  assert.equal(dentro.resultados.find((x) => x.id === 'TS-01')?.estado, 'CUMPLE');
  const fuera = informeDeCumplimiento('ORDEN_GLOBAL', { ...base, 'tesoreria.liberado': ev(41) }, AHORA);
  assert.equal(fuera.resultados.find((x) => x.id === 'TS-01')?.estado, 'INCUMPLE', 'el techo es 100, pero las reservas sólo cubren 40');
});

test('Cumplimiento · AU-RA FP también se vigila a sí mismo, y un «no» es un incumplimiento', () => {
  const r = informeDeCumplimiento('AURA_FP', { ...todoEnOrden(), 'fp.verificacionCompletaConArbolLimpio': ev(false) }, AHORA);
  assert.equal(r.estado, 'INCUMPLE');
  const r2 = informeDeCumplimiento('AURA_FP', { ...todoEnOrden(), 'fp.aprobacionesMonetariasPropias': ev(1) }, AHORA);
  assert.equal(r2.estado, 'INCUMPLE');
});

test('Cumplimiento · un informe con fecha ilegible no cumple nada', () => {
  const r = informeDeCumplimiento('DBNX', todoEnOrden(), 'no-es-fecha');
  assert.equal(r.estado, 'NO_VERIFICABLE');
  assert.equal(r.cumplen, 0);
});

test('Cumplimiento · una empresa sin comprobaciones no «cumple todo»', () => {
  const r = informeDeCumplimiento('DBNX', todoEnOrden(), AHORA, []);
  assert.equal(r.estado, 'NO_VERIFICABLE');
});

test('Cumplimiento · una evidencia heredada del prototipo no cuenta', () => {
  const evs = Object.create({ 'dbnx.pasaportesSinDobleFirma': ev(0) }) as Evidencias;
  const r = informeDeCumplimiento('DBNX', evs, AHORA);
  assert.equal(r.resultados.find((x) => x.id === 'DB-01')?.estado, 'NO_VERIFICABLE');
});
