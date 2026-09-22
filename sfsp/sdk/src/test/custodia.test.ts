/* T65, T66 — qué se le puede prometer a alguien que perdió el acceso. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { capacidadDeRecuperacion, SUPUESTO_CUSTODIA_MANAGED } from '../custodia.js';
import type { AssetPassport, ImplementationProfile } from '../tipos.js';

function pasaporte(
  perfil: ImplementationProfile,
  alcance: Partial<AssetPassport['enforcementScope']> = {},
): AssetPassport {
  return {
    assetId: 'SFSP:LEGACY:OG:000001',
    issuerId: 'iss_00000000000000000000000000000000',
    legalInstrumentId: null,
    economicType: 'UNDEFINED',
    legalClass: null,
    jurisdiction: null,
    implementationProfile: perfil,
    enforcementScope: {
      transferRestrictions: false,
      freeze: false,
      forcedTransfer: false,
      pause: false,
      directTransferBypass: perfil === 'LEGACY_REGISTERED',
      notes: 'fixture sintético',
      ...alcance,
    },
    assetKind: 'CONTRACT',
    settlementLocation: { chainId: 5550, address: null, codehash: null },
    unit: 'unidad',
    decimals: null,
    capabilities: [],
    rightsTemplate: null,
    documentRoot: null,
    reportStatus: 'NONE',
    riskStatus: { level: 'SIN_EVALUAR', methodologyVersion: null, evaluatedAt: null },
    transferPolicyId: null,
    redemptionPolicyId: null,
    listingPolicyId: null,
    supplySource: 'UNKNOWN',
    aliases: [],
    status: {
      legal: 'UNCLASSIFIED',
      admission: 'DRAFT',
      trading: 'NOT_LISTED',
      transferability: 'FREE',
      redemption: 'NONE',
      visibility: 'VISIBLE_TO_HOLDER',
    },
  };
}

test('T65 · cuenta personal con la semilla perdida y activo legacy: no hay recuperación y se dice', () => {
  const d = capacidadDeRecuperacion({
    perfil: 'PERSONAL',
    pasaporte: pasaporte('LEGACY_REGISTERED'),
    llavePerdida: true,
    poderAdministrativoDocumentado: false,
    politicaD19Aprobada: true,
  });

  assert.equal(d.capacidad, 'NONE');
  assert.equal(d.ejecutable, false);
  /* Lo importante no es el enum: es que el texto que ve la persona no promete. */
  assert.ok(!/podemos recuperar|recuperaremos|devolveremos tus fondos/i.test(d.mensajeParaTitular));
  assert.match(d.mensajeParaTitular, /No existe una vía técnica/);
});

test('T65 · un poder administrativo que no existe no se inventa', () => {
  const conPoderPeroSinAutoridad = capacidadDeRecuperacion({
    perfil: 'PERSONAL',
    pasaporte: pasaporte('SFSP_ENFORCED', { forcedTransfer: true }),
    llavePerdida: true,
    poderAdministrativoDocumentado: false,
    politicaD19Aprobada: true,
  });
  assert.equal(conPoderPeroSinAutoridad.capacidad, 'NONE');

  const conAutoridad = capacidadDeRecuperacion({
    perfil: 'PERSONAL',
    pasaporte: pasaporte('SFSP_ENFORCED', { forcedTransfer: true }),
    llavePerdida: true,
    poderAdministrativoDocumentado: true,
    politicaD19Aprobada: true,
  });
  assert.equal(conAutoridad.capacidad, 'CONTRACT_RECOVERY');
  assert.equal(conAutoridad.ejecutable, true);
});

test('T66 · recuperar acceso en una cuenta gestionada no exporta la semilla', () => {
  const soloAcceso = capacidadDeRecuperacion({
    perfil: 'MANAGED',
    pasaporte: pasaporte('CUSTODIAL_ACCOUNTING'),
    llavePerdida: false,
    poderAdministrativoDocumentado: true,
    politicaD19Aprobada: true,
  });

  assert.equal(soloAcceso.capacidad, 'ACCESS_ONLY');
  assert.ok(!/semilla|frase|llave privada/i.test(soloAcceso.mensajeParaTitular));
  assert.match(soloAcceso.mensajeParaTitular, /Tus posiciones no se mueven/);

  /* Y el dictamen no expone material criptográfico por ningún campo. */
  const serializado = JSON.stringify(soloAcceso);
  assert.ok(!/0x[0-9a-f]{64}/i.test(serializado));
});

test('sin la política D19 aprobada, nada se ofrece como ejecutable', () => {
  const d = capacidadDeRecuperacion({
    perfil: 'MANAGED',
    pasaporte: pasaporte('SFSP_ENFORCED'),
    llavePerdida: true,
    poderAdministrativoDocumentado: true,
    politicaD19Aprobada: false,
  });
  assert.equal(d.capacidad, 'CUSTODIAL_KEY_RECOVERY');
  assert.equal(d.ejecutable, false);
  assert.equal(d.decision, 'D19');
  assert.match(d.mensajeParaTitular, /en aprobación/);
});

test('institucional sin quórum no tiene ruta', () => {
  const sinQuorum = capacidadDeRecuperacion({
    perfil: 'INSTITUTIONAL',
    pasaporte: pasaporte('SFSP_ENFORCED'),
    llavePerdida: true,
    poderAdministrativoDocumentado: true,
    quorumDisponible: false,
    politicaD19Aprobada: true,
  });
  assert.equal(sinQuorum.capacidad, 'NONE');
  assert.equal(sinQuorum.ejecutable, false);

  const conQuorum = capacidadDeRecuperacion({
    perfil: 'INSTITUTIONAL',
    pasaporte: pasaporte('SFSP_ENFORCED'),
    llavePerdida: true,
    poderAdministrativoDocumentado: true,
    quorumDisponible: true,
    politicaD19Aprobada: true,
  });
  assert.equal(conQuorum.ejecutable, true);
});

test('P05 · el supuesto sobre la custodia gestionada está declarado, no dado por bueno', () => {
  /* El auditor lo dejó como sospecha sin confirmar y tenía razón: este árbol no
     puede acreditar que la custodia externa sea efectiva. Lo que sí puede hacer
     es decirlo en vez de suponerlo en silencio. */
  assert.equal(SUPUESTO_CUSTODIA_MANAGED.evidencia, 'NO_VERIFICADO');
  assert.equal(SUPUESTO_CUSTODIA_MANAGED.decisionQueLoCierra, 'D18');
  assert.match(SUPUESTO_CUSTODIA_MANAGED.consecuenciaSiEsFalso, /NONE/);
});
