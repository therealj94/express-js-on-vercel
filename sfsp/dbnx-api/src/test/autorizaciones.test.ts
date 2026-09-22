import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ConsumoEnMemoria,
  consumir,
  emitirAutorizacion,
  SCHEMA_VERSION_AUTORIZACION,
  validarAutorizacion,
  type EntradaEmision,
  type PeticionUso,
  type SignedAuthorization,
} from '../autorizaciones.js';
import { digestoCanonico, type PayloadAutorizacionDBNX } from '../firmas.js';
import { crearCaso, transicionar } from '../casos.js';
import { relojFijo } from '../tipos.js';
import {
  aprobar,
  ASSET_ID,
  AUTH_ID,
  CASE_ID,
  CHAIN_ID,
  comite,
  CONTRATO,
  cumplimiento,
  DESTINO,
  firmanteDePrueba,
  ISSUER_ID,
  registroCon,
  reloj,
  solicitante,
  T1,
} from './ayudas.js';

/* Los dos firmantes de la suite: uno humano y uno tecnico, con claves Ed25519
 * generadas en el acto (ver `ayudas.ts`). Nada de esto se escribe en disco. */
const FIRMANTE_COMITE = firmanteDePrueba(comite.actorId, 'COMITE');
const FIRMANTE_CUMPLIMIENTO = firmanteDePrueba(cumplimiento.actorId, 'CUMPLIMIENTO');
const REGISTRO = registroCon(FIRMANTE_COMITE, FIRMANTE_CUMPLIMIENTO);

const FIRMADO_EN = '2030-01-01T00:00:00Z';

/** Campos del payload, sin firmas. El digest se deriva de aqui, igual que lo
 *  hara el verificador: en ningun momento una prueba inventa un digest. */
const camposBase: Omit<EntradaEmision, 'approvals' | 'estadoCaso'> = {
  authorizationId: AUTH_ID,
  actionId: 'MINT',
  chainId: CHAIN_ID,
  genesisHash: null,
  verifyingContract: CONTRATO,
  assetId: ASSET_ID,
  amount: '1000',
  destination: DESTINO,
  policyVersion: 'pol-draft-0.3',
  evidenceRoot: '0xTEST_EVIDENCE_ROOT',
  nonce: 'nonce-sintetico-1',
  notBefore: '2030-01-01T00:00:00Z',
  expiry: '2030-01-10T00:00:00Z',
  caseId: CASE_ID,
};

export function digestoDe(
  parcial: Partial<Omit<EntradaEmision, 'approvals' | 'estadoCaso'>> = {},
): string {
  const p: PayloadAutorizacionDBNX = {
    schemaVersion: SCHEMA_VERSION_AUTORIZACION,
    ...camposBase,
    ...parcial,
  };
  return digestoCanonico(p);
}

/** Entrada de emision con las dos firmas reales sobre el digest de sus campos. */
function entrada(parcial: Partial<EntradaEmision> = {}): EntradaEmision {
  const campos = { ...camposBase, ...parcial };
  const d = digestoDe(campos);
  return {
    ...campos,
    approvals: [
      aprobar(FIRMANTE_COMITE, d, FIRMADO_EN),
      aprobar(FIRMANTE_CUMPLIMIENTO, d, FIRMADO_EN),
    ],
    estadoCaso: 'APPROVED',
    ...parcial,
  };
}

const peticionBase: PeticionUso = {
  actionId: 'MINT',
  chainId: CHAIN_ID,
  assetId: ASSET_ID,
  amount: '1000',
  destination: DESTINO,
  verifyingContract: CONTRATO,
};

export function emitir(parcial: Partial<EntradaEmision> = {}): SignedAuthorization {
  const r = emitirAutorizacion(entrada(parcial), REGISTRO, reloj);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('no deberia fallar');
  return r.valor;
}

test('aprobar un caso NO produce por si solo una autorizacion', () => {
  const creado = crearCaso(CASE_ID, ISSUER_ID, reloj);
  assert.equal(creado.ok, true);
  if (!creado.ok) throw new Error('inesperado');
  const enReview = transicionar(creado.valor, 'REVIEW', solicitante, 'listo', reloj);
  if (!enReview.ok) throw new Error('inesperado');
  const aprobado = transicionar(enReview.valor, 'APPROVED', comite, 'aprobado por comite', reloj);
  if (!aprobado.ok) throw new Error('inesperado');

  // El caso aprobado no lleva ningun campo que habilite emitir.
  assert.equal(aprobado.valor.autorizaEmision, false);
  assert.equal('authorizationId' in aprobado.valor, false);
  assert.equal('amount' in aprobado.valor, false);
});

test('una autorizacion sobre un caso no aprobado se rechaza', () => {
  const r = emitirAutorizacion(entrada({ estadoCaso: 'REVIEW' }), REGISTRO, reloj);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
});

test('una autorizacion vigente y exacta pasa', () => {
  const a = emitir();
  const r = validarAutorizacion(a, peticionBase, reloj, new ConsumoEnMemoria(), REGISTRO);
  assert.equal(r.ok, true);
});

test('una autorizacion vencida se rechaza', () => {
  const a = emitir();
  const r = validarAutorizacion(
    a,
    peticionBase,
    relojFijo('2030-02-01T00:00:00Z'),
    new ConsumoEnMemoria(),
    REGISTRO,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  assert.match(r.motivo, /vencida/);
});

test('una autorizacion todavia no vigente se rechaza', () => {
  const a = emitir();
  const r = validarAutorizacion(
    a,
    peticionBase,
    relojFijo('2029-12-01T00:00:00Z'),
    new ConsumoEnMemoria(),
    REGISTRO,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /todavia no es vigente/);
});

test('una autorizacion reusada se rechaza: el consumo es unico', () => {
  const a = emitir();
  const consumo = new ConsumoEnMemoria();
  const primera = consumir(a, peticionBase, reloj, consumo, REGISTRO);
  assert.equal(primera.ok, true);
  const segunda = consumir(a, peticionBase, reloj, consumo, REGISTRO);
  assert.equal(segunda.ok, false);
  if (segunda.ok) throw new Error('inesperado');
  assert.equal(segunda.codigo, 'DENY_AUTHORIZATION');
  assert.match(segunda.motivo, /nonce ya fue consumido/);
});

test('un monto distinto al aprobado se rechaza, sea mayor o menor', () => {
  const a = emitir();
  const mayor = validarAutorizacion(
    a,
    { ...peticionBase, amount: '1001' },
    reloj,
    new ConsumoEnMemoria(),
    REGISTRO,
  );
  assert.equal(mayor.ok, false);
  if (mayor.ok) throw new Error('inesperado');
  assert.equal(mayor.codigo, 'DENY_LIMIT');

  const menor = validarAutorizacion(
    a,
    { ...peticionBase, amount: '999' },
    reloj,
    new ConsumoEnMemoria(),
    REGISTRO,
  );
  assert.equal(menor.ok, false);
  if (menor.ok) throw new Error('inesperado');
  assert.equal(menor.codigo, 'DENY_AUTHORIZATION');
});

test('un destino distinto al autorizado se rechaza', () => {
  const a = emitir();
  const r = validarAutorizacion(
    a,
    { ...peticionBase, destination: 'SF-9999-9999-9999-3' },
    reloj,
    new ConsumoEnMemoria(),
    REGISTRO,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  assert.match(r.motivo, /destino/);
});

test('una accion, cadena, activo o contrato distintos se rechazan', () => {
  const a = emitir();
  const consumo = new ConsumoEnMemoria();
  const casos: ReadonlyArray<Partial<PeticionUso>> = [
    { actionId: 'RELEASE' },
    { chainId: 1 },
    { assetId: 'SFSP:MON:iss_otro:S1' },
    { verifyingContract: '0xTEST_OTRO' },
  ];
  for (const parche of casos) {
    const r = validarAutorizacion(a, { ...peticionBase, ...parche }, reloj, consumo, REGISTRO);
    assert.equal(r.ok, false, JSON.stringify(parche));
    if (r.ok) throw new Error('inesperado');
    assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  }
});

test('un JSON con approved:true NO pasa la validacion', () => {
  const falso = {
    approved: true,
    caseId: CASE_ID,
    assetId: ASSET_ID,
    amount: '1000',
    score: 0.99,
  };
  const r = validarAutorizacion(falso, peticionBase, reloj, new ConsumoEnMemoria(), REGISTRO);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  assert.match(r.motivo, /approved/);
});

test('un objeto con la forma casi completa pero sin firmas tampoco pasa', () => {
  const a = emitir();
  const sinFirmas = { ...a, approvals: [] };
  const r = validarAutorizacion(sinFirmas, peticionBase, reloj, new ConsumoEnMemoria(), REGISTRO);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /firmas/);
});

test('emitir sin firma humana o sin firma tecnica se rechaza', () => {
  const base = entrada();
  const soloTecnica = emitirAutorizacion(
    { ...base, approvals: [base.approvals[1]!] },
    REGISTRO,
    reloj,
  );
  assert.equal(soloTecnica.ok, false);
  if (soloTecnica.ok) throw new Error('inesperado');
  assert.equal(soloTecnica.codigo, 'REVIEW_REQUIRED');

  const soloHumana = emitirAutorizacion(
    { ...base, approvals: [base.approvals[0]!] },
    REGISTRO,
    reloj,
  );
  assert.equal(soloHumana.ok, false);
});

test('firmas sobre payloads distintos se rechazan', () => {
  // Bajo el modelo nuevo esto ya no se comprueba comparando dos digests que
  // aportan los firmantes —el verificador calcula el suyo—, sino verificando
  // las dos firmas contra ese digest. Una firma hecha sobre OTRO payload
  // (otro monto) no cierra contra el payload presentado.
  const base = entrada();
  const otroDigesto = digestoDe({ amount: '999999' });
  const r = emitirAutorizacion(
    {
      ...base,
      approvals: [base.approvals[0]!, aprobar(FIRMANTE_CUMPLIMIENTO, otroDigesto, FIRMADO_EN)],
    },
    REGISTRO,
    reloj,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  assert.match(r.motivo, /firma invalida/);
});

test('un monto con coma flotante o cero no se acepta al emitir', () => {
  for (const amount of ['10.5', '0', '-1', '1e3']) {
    const r = emitirAutorizacion(entrada({ amount }), REGISTRO, reloj);
    assert.equal(r.ok, false, amount);
  }
});

test('sin policyVersion se devuelve BLOCKED_DECISION, no un valor por defecto', () => {
  const r = emitirAutorizacion(entrada({ policyVersion: '' }), REGISTRO, reloj);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
});

test('validar en seco no consume el nonce', () => {
  const a = emitir();
  const consumo = new ConsumoEnMemoria();
  assert.equal(validarAutorizacion(a, peticionBase, reloj, consumo, REGISTRO).ok, true);
  assert.equal(consumo.yaConsumido(CHAIN_ID, a.nonce), false);
  assert.equal(consumir(a, peticionBase, reloj, consumo, REGISTRO).ok, true);
  assert.equal(consumo.yaConsumido(CHAIN_ID, a.nonce), true);
  assert.equal(T1, T1);
});
