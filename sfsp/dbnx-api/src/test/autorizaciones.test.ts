import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ConsumoEnMemoria,
  consumir,
  emitirAutorizacion,
  validarAutorizacion,
  type EntradaEmision,
  type PeticionUso,
  type SignedAuthorization,
} from '../autorizaciones.js';
import { crearCaso, transicionar } from '../casos.js';
import { relojFijo } from '../tipos.js';
import {
  ASSET_ID,
  AUTH_ID,
  CASE_ID,
  CHAIN_ID,
  comite,
  CONTRATO,
  cumplimiento,
  DESTINO,
  ISSUER_ID,
  reloj,
  solicitante,
  T1,
} from './ayudas.js';

const DIGEST = '0xTEST_DIGEST_DEL_PAYLOAD';

const entradaBase: EntradaEmision = {
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
  approvals: [
    { actorId: comite.actorId, rol: 'COMITE', payloadDigest: DIGEST, firmadoEnUTC: '2030-01-01T00:00:00Z' },
    { actorId: cumplimiento.actorId, rol: 'CUMPLIMIENTO', payloadDigest: DIGEST, firmadoEnUTC: '2030-01-01T00:00:00Z' },
  ],
  caseId: CASE_ID,
  estadoCaso: 'APPROVED',
};

const peticionBase: PeticionUso = {
  actionId: 'MINT',
  chainId: CHAIN_ID,
  assetId: ASSET_ID,
  amount: '1000',
  destination: DESTINO,
  verifyingContract: CONTRATO,
};

function emitir(parcial: Partial<EntradaEmision> = {}): SignedAuthorization {
  const r = emitirAutorizacion({ ...entradaBase, ...parcial });
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
  const r = emitirAutorizacion({ ...entradaBase, estadoCaso: 'REVIEW' });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
});

test('una autorizacion vigente y exacta pasa', () => {
  const a = emitir();
  const r = validarAutorizacion(a, peticionBase, reloj, new ConsumoEnMemoria());
  assert.equal(r.ok, true);
});

test('una autorizacion vencida se rechaza', () => {
  const a = emitir();
  const r = validarAutorizacion(
    a,
    peticionBase,
    relojFijo('2030-02-01T00:00:00Z'),
    new ConsumoEnMemoria(),
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
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /todavia no es vigente/);
});

test('una autorizacion reusada se rechaza: el consumo es unico', () => {
  const a = emitir();
  const consumo = new ConsumoEnMemoria();
  const primera = consumir(a, peticionBase, reloj, consumo);
  assert.equal(primera.ok, true);
  const segunda = consumir(a, peticionBase, reloj, consumo);
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
  );
  assert.equal(mayor.ok, false);
  if (mayor.ok) throw new Error('inesperado');
  assert.equal(mayor.codigo, 'DENY_LIMIT');

  const menor = validarAutorizacion(
    a,
    { ...peticionBase, amount: '999' },
    reloj,
    new ConsumoEnMemoria(),
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
    const r = validarAutorizacion(a, { ...peticionBase, ...parche }, reloj, consumo);
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
  const r = validarAutorizacion(falso, peticionBase, reloj, new ConsumoEnMemoria());
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  assert.match(r.motivo, /approved/);
});

test('un objeto con la forma casi completa pero sin firmas tampoco pasa', () => {
  const a = emitir();
  const sinFirmas = { ...a, approvals: [] };
  const r = validarAutorizacion(sinFirmas, peticionBase, reloj, new ConsumoEnMemoria());
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /firmas/);
});

test('emitir sin firma humana o sin firma tecnica se rechaza', () => {
  const soloTecnica = emitirAutorizacion({
    ...entradaBase,
    approvals: [entradaBase.approvals[1]!],
  });
  assert.equal(soloTecnica.ok, false);
  if (soloTecnica.ok) throw new Error('inesperado');
  assert.equal(soloTecnica.codigo, 'REVIEW_REQUIRED');

  const soloHumana = emitirAutorizacion({
    ...entradaBase,
    approvals: [entradaBase.approvals[0]!],
  });
  assert.equal(soloHumana.ok, false);
});

test('firmas sobre payloads distintos se rechazan', () => {
  const r = emitirAutorizacion({
    ...entradaBase,
    approvals: [
      entradaBase.approvals[0]!,
      { ...entradaBase.approvals[1]!, payloadDigest: '0xTEST_OTRO_DIGEST' },
    ],
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /payloads distintos/);
});

test('un monto con coma flotante o cero no se acepta al emitir', () => {
  for (const amount of ['10.5', '0', '-1', '1e3']) {
    const r = emitirAutorizacion({ ...entradaBase, amount });
    assert.equal(r.ok, false, amount);
  }
});

test('sin policyVersion se devuelve BLOCKED_DECISION, no un valor por defecto', () => {
  const r = emitirAutorizacion({ ...entradaBase, policyVersion: '' });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
});

test('validar en seco no consume el nonce', () => {
  const a = emitir();
  const consumo = new ConsumoEnMemoria();
  assert.equal(validarAutorizacion(a, peticionBase, reloj, consumo).ok, true);
  assert.equal(consumo.yaConsumido(CHAIN_ID, a.nonce), false);
  assert.equal(consumir(a, peticionBase, reloj, consumo).ok, true);
  assert.equal(consumo.yaConsumido(CHAIN_ID, a.nonce), true);
  assert.equal(T1, T1);
});
