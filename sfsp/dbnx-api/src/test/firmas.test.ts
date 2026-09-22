// Pruebas del hallazgo H03 y del punto P06.
//
// Cada prueba lleva el identificador del hallazgo en el nombre, y cada regla
// tiene caso positivo y caso negativo: una prueba que solo demuestra que algo
// se rechaza no demuestra que lo legitimo siga pasando, y una compuerta que
// rechaza todo es tan inutil como una que acepta todo.
//
// Las dos pruebas de concepto que reprodujo el auditor estan aqui como pruebas
// permanentes, con su nombre: si alguna volviera a devolver `ok: true`, la suite
// se pone roja.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ConsumoEnMemoria,
  emitirAutorizacion,
  SCHEMA_VERSION_AUTORIZACION,
  validarAutorizacion,
  type EntradaEmision,
  type PeticionUso,
} from '../autorizaciones.js';
import {
  digestoCanonico,
  FirmantesEnMemoria,
  verificarAprobacion,
  verificarQuorum,
  type PayloadAutorizacionDBNX,
} from '../firmas.js';
import { relojFijo } from '../tipos.js';
import {
  aprobar,
  ASSET_ID,
  AUTH_ID,
  CASE_ID,
  CHAIN_ID,
  CONTRATO,
  DESTINO,
  firmanteDePrueba,
  registroCon,
} from './ayudas.js';

const AHORA = '2030-01-02T00:00:00Z';
const FIRMADO_EN = '2030-01-01T00:00:00Z';
const reloj = relojFijo(AHORA);

const campos: Omit<EntradaEmision, 'approvals' | 'estadoCaso'> = {
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
  nonce: 'nonce-firmas-1',
  notBefore: '2030-01-01T00:00:00Z',
  expiry: '2030-01-10T00:00:00Z',
  caseId: CASE_ID,
};

function payload(
  parcial: Partial<Omit<EntradaEmision, 'approvals' | 'estadoCaso'>> = {},
): PayloadAutorizacionDBNX {
  return { schemaVersion: SCHEMA_VERSION_AUTORIZACION, ...campos, ...parcial };
}

const peticion: PeticionUso = {
  actionId: 'MINT',
  chainId: CHAIN_ID,
  assetId: ASSET_ID,
  amount: campos.amount,
  destination: DESTINO,
  verifyingContract: CONTRATO,
};

/* ------------------------------------------------------------------ H03 */

test('H03 · positivo: una firma Ed25519 valida sobre el digest canonico pasa', () => {
  const f = firmanteDePrueba('act_h03_ok', 'COMITE');
  const d = digestoCanonico(payload());
  const r = verificarAprobacion(d, aprobar(f, d, FIRMADO_EN), registroCon(f), AHORA);
  assert.equal(r.ok, true);
});

test('H03 · negativo: una firma de otro payload no pasa', () => {
  const f = firmanteDePrueba('act_h03_otro', 'COMITE');
  // Firma real y bien hecha, pero sobre un monto distinto del que se presenta.
  const firmaDeOtro = aprobar(f, digestoCanonico(payload({ amount: '999999' })), FIRMADO_EN);
  const r = verificarAprobacion(
    digestoCanonico(payload()),
    firmaDeOtro,
    registroCon(f),
    AHORA,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  assert.match(r.motivo, /firma invalida/);
});

test('H03 · negativo: una firma correcta de un firmante no registrado no pasa', () => {
  const f = firmanteDePrueba('act_h03_desconocido', 'COMITE');
  const d = digestoCanonico(payload());
  // El registro esta vacio: la matematica de la firma cuadra y aun asi no vale,
  // porque nadie dijo nunca que esa clave pudiera aprobar nada.
  const r = verificarAprobacion(d, aprobar(f, d, FIRMADO_EN), new FirmantesEnMemoria(), AHORA);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /no registrado/);
});

test('H03 · negativo: una firma correcta pero vencida no pasa', () => {
  const f = firmanteDePrueba('act_h03_vencido', 'COMITE', {
    desde: '2029-01-01T00:00:00Z',
    hasta: '2029-06-01T00:00:00Z',
  });
  const d = digestoCanonico(payload());

  // Positivo de control: dentro de la vigencia del firmante, la misma firma vale.
  const dentro = verificarAprobacion(
    d,
    aprobar(f, d, '2029-03-01T00:00:00Z'),
    registroCon(f),
    '2029-03-02T00:00:00Z',
  );
  assert.equal(dentro.ok, true);

  // Negativo: firmada fuera de la vigencia.
  const fuera = verificarAprobacion(d, aprobar(f, d, FIRMADO_EN), registroCon(f), AHORA);
  assert.equal(fuera.ok, false);
  if (fuera.ok) throw new Error('inesperado');
  assert.match(fuera.motivo, /fuera de la vigencia/);

  // Negativo: firmada en vigencia, pero presentada cuando ya habia caducado.
  const tarde = verificarAprobacion(
    d,
    aprobar(f, d, '2029-03-01T00:00:00Z'),
    registroCon(f),
    AHORA,
  );
  assert.equal(tarde.ok, false);
  if (tarde.ok) throw new Error('inesperado');
  assert.match(tarde.motivo, /vencida/);
});

test('H03 · negativo: dos firmas del mismo actor no suman quorum', () => {
  const comiteF = firmanteDePrueba('act_h03_doble', 'COMITE');
  const sistemaF = firmanteDePrueba('act_h03_doble', 'SISTEMA');
  const d = digestoCanonico(payload());
  const r = verificarQuorum(
    d,
    [aprobar(comiteF, d, FIRMADO_EN), aprobar(sistemaF, d, FIRMADO_EN)],
    registroCon(comiteF, sistemaF),
    AHORA,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /dos veces/);
});

test('H03 · positivo: dos actores distintos, humano y tecnico, si suman quorum', () => {
  const humano = firmanteDePrueba('act_h03_humano', 'COMITE');
  const tecnico = firmanteDePrueba('act_h03_tecnico', 'SISTEMA');
  const d = digestoCanonico(payload());
  const r = verificarQuorum(
    d,
    [aprobar(humano, d, FIRMADO_EN), aprobar(tecnico, d, FIRMADO_EN)],
    registroCon(humano, tecnico),
    AHORA,
  );
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('inesperado');
  assert.equal(r.valor.humano, 'act_h03_humano');
  assert.equal(r.valor.tecnico, 'act_h03_tecnico');
});

test('H03 · negativo: dos firmas tecnicas de actores distintos no cubren el rol humano', () => {
  const a = firmanteDePrueba('act_h03_t1', 'SISTEMA');
  const b = firmanteDePrueba('act_h03_t2', 'CUMPLIMIENTO');
  const d = digestoCanonico(payload());
  const r = verificarQuorum(
    d,
    [aprobar(a, d, FIRMADO_EN), aprobar(b, d, FIRMADO_EN)],
    registroCon(a, b),
    AHORA,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'REVIEW_REQUIRED');
});

test('H03 · el digest suministrado por el firmante se ignora', () => {
  const humano = firmanteDePrueba('act_h03_ign_h', 'COMITE');
  const tecnico = firmanteDePrueba('act_h03_ign_t', 'CUMPLIMIENTO');
  const d = digestoCanonico(payload());

  // Positivo: el campo `payloadDigest` trae basura y la firma sigue siendo
  // valida, porque el verificador nunca lo lee.
  const conBasura = verificarQuorum(
    d,
    [
      aprobar(humano, d, FIRMADO_EN, { payloadDigest: 'no-es-el-hash' }),
      aprobar(tecnico, d, FIRMADO_EN, { payloadDigest: 'tampoco' }),
    ],
    registroCon(humano, tecnico),
    AHORA,
  );
  assert.equal(conBasura.ok, true);

  // Negativo: el campo `payloadDigest` trae el digest CORRECTO, pero las firmas
  // se hicieron sobre otro payload. Anunciar el digest bueno no salva la firma.
  const otro = digestoCanonico(payload({ amount: '7' }));
  const mintiendo = verificarQuorum(
    d,
    [
      aprobar(humano, otro, FIRMADO_EN, { payloadDigest: d }),
      aprobar(tecnico, otro, FIRMADO_EN, { payloadDigest: d }),
    ],
    registroCon(humano, tecnico),
    AHORA,
  );
  assert.equal(mintiendo.ok, false);
});

test('H03 · el digest lo calcula el verificador: cambiar un campo rompe las firmas', () => {
  const humano = firmanteDePrueba('act_h03_calc_h', 'COMITE');
  const tecnico = firmanteDePrueba('act_h03_calc_t', 'CUMPLIMIENTO');
  const emitida = emitirAutorizacion(
    {
      ...campos,
      approvals: (() => {
        const d = digestoCanonico(payload());
        return [aprobar(humano, d, FIRMADO_EN), aprobar(tecnico, d, FIRMADO_EN)];
      })(),
      estadoCaso: 'APPROVED',
    },
    registroCon(humano, tecnico),
    reloj,
  );
  assert.equal(emitida.ok, true);
  if (!emitida.ok) throw new Error('inesperado');

  // Positivo: tal cual salio, valida.
  const registro = registroCon(humano, tecnico);
  assert.equal(
    validarAutorizacion(emitida.valor, peticion, reloj, new ConsumoEnMemoria(), registro).ok,
    true,
  );

  // Positivo: sustituir el digest DERIVADO por basura no cambia el veredicto.
  const conDigestFalso = { ...emitida.valor, payloadDigest: 'no-es-el-hash' };
  assert.equal(
    validarAutorizacion(conDigestFalso, peticion, reloj, new ConsumoEnMemoria(), registro).ok,
    true,
  );

  // Negativo: cambiar el evidenceRoot manteniendo firmas y digest anunciado.
  const manipulada = {
    ...emitida.valor,
    evidenceRoot: '0xTEST_OTRA_EVIDENCIA',
  };
  const r = validarAutorizacion(manipulada, peticion, reloj, new ConsumoEnMemoria(), registro);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /firma invalida/);
});

test('H03 · el digest canonico distingue null de cadena vacia y no colapsa campos', () => {
  // POR QUE: sin prefijo de longitud, mover el limite entre dos campos produce
  // el mismo digest desde payloads distintos, y una aprobacion serviria para
  // otra cosa. Aqui se comprueba que no ocurre.
  const a = digestoCanonico(payload({ genesisHash: null }));
  const b = digestoCanonico(payload({ genesisHash: '' }));
  assert.notEqual(a, b);

  const c = digestoCanonico(payload({ assetId: 'AB', nonce: 'CD' }));
  const e = digestoCanonico(payload({ assetId: 'A', nonce: 'BCD' }));
  assert.notEqual(c, e);

  // Determinista: el mismo payload da siempre el mismo digest.
  assert.equal(digestoCanonico(payload()), digestoCanonico(payload()));
});

/* ------------------------------ pruebas de concepto del auditor, permanentes */

test('H03 · PoC del auditor: `approvals: [{}]` ya NO devuelve ok', () => {
  const humano = firmanteDePrueba('act_poc_h', 'COMITE');
  const tecnico = firmanteDePrueba('act_poc_t', 'CUMPLIMIENTO');
  const registro = registroCon(humano, tecnico);

  const alEmitir = emitirAutorizacion(
    { ...campos, approvals: [{}] as never, estadoCaso: 'APPROVED' },
    registro,
    reloj,
  );
  assert.equal(alEmitir.ok, false);
  if (alEmitir.ok) throw new Error('el PoC del auditor volvio a pasar');
  assert.equal(alEmitir.codigo, 'DENY_AUTHORIZATION');

  // Y por el camino de validacion, que es el que usa un ejecutor.
  const d = digestoCanonico(payload());
  const conFirmas = emitirAutorizacion(
    {
      ...campos,
      approvals: [aprobar(humano, d, FIRMADO_EN), aprobar(tecnico, d, FIRMADO_EN)],
      estadoCaso: 'APPROVED',
    },
    registro,
    reloj,
  );
  if (!conFirmas.ok) throw new Error('inesperado');
  const alValidar = validarAutorizacion(
    { ...conFirmas.valor, approvals: [{}] },
    peticion,
    reloj,
    new ConsumoEnMemoria(),
    registro,
  );
  assert.equal(alValidar.ok, false);
  if (alValidar.ok) throw new Error('el PoC del auditor volvio a pasar');
});

test('H03 · PoC del auditor: el mismo actor como COMITE y SISTEMA con `no-es-el-hash` ya NO emite', () => {
  const comiteF = firmanteDePrueba('act_dos_sombreros', 'COMITE');
  const sistemaF = firmanteDePrueba('act_dos_sombreros', 'SISTEMA');
  const registro = registroCon(comiteF, sistemaF);

  // (a) Literal como lo reprodujo el auditor: sin firma real, con el digest
  //     literal `no-es-el-hash`. Muere en la forma, antes de la criptografia.
  const literal = emitirAutorizacion(
    {
      ...campos,
      approvals: [
        { actorId: 'act_dos_sombreros', rol: 'COMITE', payloadDigest: 'no-es-el-hash', firmadoEnUTC: FIRMADO_EN },
        { actorId: 'act_dos_sombreros', rol: 'SISTEMA', payloadDigest: 'no-es-el-hash', firmadoEnUTC: FIRMADO_EN },
      ] as never,
      estadoCaso: 'APPROVED',
    },
    registro,
    reloj,
  );
  assert.equal(literal.ok, false);
  if (literal.ok) throw new Error('el PoC del auditor volvio a pasar');
  assert.match(literal.motivo, /firma legible/);

  // (b) La version dura del mismo ataque: firmas REALES y validas de las dos
  //     claves del mismo actor. Tampoco pasa, porque el problema no era la
  //     firma sino que una persona cubriera las dos patas del control.
  const d = digestoCanonico(payload());
  const conFirmasReales = emitirAutorizacion(
    {
      ...campos,
      approvals: [aprobar(comiteF, d, FIRMADO_EN), aprobar(sistemaF, d, FIRMADO_EN)],
      estadoCaso: 'APPROVED',
    },
    registro,
    reloj,
  );
  assert.equal(conFirmasReales.ok, false);
  if (conFirmasReales.ok) throw new Error('el mismo actor cubrio los dos roles');
  assert.match(conFirmasReales.motivo, /dos veces/);
});

/* ------------------------------------------------------------------ P06 */

test('P06 · una firma hecha antes de la revocacion pero presentada despues NO vale', () => {
  const f = firmanteDePrueba('act_p06_revocado', 'COMITE');
  const d = digestoCanonico(payload());
  const aprobacion = aprobar(f, d, '2030-01-01T00:00:00Z');

  // Positivo: antes de que exista la revocacion, la firma vale.
  const antes = verificarAprobacion(d, aprobacion, registroCon(f), '2030-01-02T00:00:00Z');
  assert.equal(antes.ok, true);

  // La autoridad revoca el 3 de enero. La firma es del 1 y no cambia.
  const registro = registroCon(f);
  registro.revocar(f.actorId, f.rol, '2030-01-03T00:00:00Z');

  // Negativo: presentada el 4, no vale. POR QUE: revocar existe justamente para
  // que lo firmado antes deje de surtir efecto despues.
  const despues = verificarAprobacion(d, aprobacion, registro, '2030-01-04T00:00:00Z');
  assert.equal(despues.ok, false);
  if (despues.ok) throw new Error('inesperado');
  assert.match(despues.motivo, /revocado/);
});

test('P06 · una autorizacion emitida con un firmante que luego se revoca deja de validar', () => {
  const humano = firmanteDePrueba('act_p06_h', 'COMITE');
  const tecnico = firmanteDePrueba('act_p06_t', 'CUMPLIMIENTO');
  const registro = registroCon(humano, tecnico);
  const d = digestoCanonico(payload());
  const emitida = emitirAutorizacion(
    {
      ...campos,
      approvals: [aprobar(humano, d, FIRMADO_EN), aprobar(tecnico, d, FIRMADO_EN)],
      estadoCaso: 'APPROVED',
    },
    registro,
    relojFijo('2030-01-02T00:00:00Z'),
  );
  assert.equal(emitida.ok, true);
  if (!emitida.ok) throw new Error('inesperado');

  // Positivo: valida antes de la revocacion.
  assert.equal(
    validarAutorizacion(
      emitida.valor,
      peticion,
      relojFijo('2030-01-02T00:00:00Z'),
      new ConsumoEnMemoria(),
      registro,
    ).ok,
    true,
  );

  registro.revocar(humano.actorId, 'COMITE', '2030-01-03T00:00:00Z');

  // Negativo: la MISMA autorizacion, presentada despues, ya no vale. Es la
  // razon por la que las firmas se re-verifican en cada presentacion y no solo
  // en la emision.
  const r = validarAutorizacion(
    emitida.valor,
    peticion,
    relojFijo('2030-01-05T00:00:00Z'),
    new ConsumoEnMemoria(),
    registro,
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.match(r.motivo, /revocado/);
});

test('P06 · un firmante que cambio de rol no puede usar una firma hecha con el rol anterior', () => {
  const MISMO = 'act_p06_cambio_rol';
  // Hasta el 1 de junio fue ANALISTA; desde entonces es COMITE, con la MISMA
  // clave, que es el caso incomodo: si el rol no entrara en lo firmado, la
  // firma vieja serviria con el sombrero nuevo.
  const comoAnalista = firmanteDePrueba(MISMO, 'ANALISTA', {
    desde: '2029-01-01T00:00:00Z',
    hasta: '2030-01-05T00:00:00Z',
  });
  const comoComite = {
    ...comoAnalista,
    rol: 'COMITE' as const,
    fila: {
      ...comoAnalista.fila,
      rol: 'COMITE' as const,
      notBefore: '2030-01-05T00:00:00Z',
      expiry: '2031-01-01T00:00:00Z',
    },
  };
  const registro = registroCon(comoAnalista, comoComite);
  const d = digestoCanonico(payload());

  // Positivo: como ANALISTA, mientras lo era, su firma es valida como ANALISTA.
  const firmaAnalista = aprobar(comoAnalista, d, '2030-01-02T00:00:00Z');
  assert.equal(
    verificarAprobacion(d, firmaAnalista, registro, '2030-01-03T00:00:00Z').ok,
    true,
  );

  // Negativo 1: esa misma firma presentada como COMITE no vale. Dos barreras
  // independientes la paran, y basta con que falle la primera: la fila de
  // COMITE no cubre el instante en que firmo, y ademas el rol entra en el
  // mensaje firmado, asi que la firma tampoco cerraria.
  const reetiquetada = { ...firmaAnalista, rol: 'COMITE' as const };
  const r1 = verificarAprobacion(d, reetiquetada, registro, '2030-01-06T00:00:00Z');
  assert.equal(r1.ok, false);
  if (r1.ok) throw new Error('inesperado');
  assert.match(r1.motivo, /fuera de la vigencia|firma invalida/);

  // Negativo 2: la barrera criptografica, aislada. Un actor con DOS roles
  // vigentes a la vez y la MISMA clave —el caso en que la vigencia no protege
  // nada— tampoco puede reetiquetar: el rol va dentro de lo firmado.
  const dosRoles = 'act_p06_dos_roles_vigentes';
  const comoRevisor = firmanteDePrueba(dosRoles, 'REVISOR');
  const comoComiteMismaClave = {
    ...comoRevisor,
    rol: 'COMITE' as const,
    fila: { ...comoRevisor.fila, rol: 'COMITE' as const },
  };
  const registroDos = registroCon(comoRevisor, comoComiteMismaClave);
  const firmaRevisor = aprobar(comoRevisor, d, '2030-01-02T00:00:00Z');
  assert.equal(verificarAprobacion(d, firmaRevisor, registroDos, AHORA).ok, true);
  const r2 = verificarAprobacion(
    d,
    { ...firmaRevisor, rol: 'COMITE' as const },
    registroDos,
    AHORA,
  );
  assert.equal(r2.ok, false);
  if (r2.ok) throw new Error('inesperado');
  assert.match(r2.motivo, /firma invalida/);

  // Positivo de cierre: firmando como COMITE cuando ya lo era, vale.
  const firmaComite = aprobar(comoComite, d, '2030-01-06T00:00:00Z');
  assert.equal(
    verificarAprobacion(d, firmaComite, registro, '2030-01-07T00:00:00Z').ok,
    true,
  );
});

test('P06 · la forma se valida antes que nada: rol desconocido y firma ilegible se rechazan', () => {
  const f = firmanteDePrueba('act_p06_forma', 'COMITE');
  const d = digestoCanonico(payload());
  const buena = aprobar(f, d, FIRMADO_EN);
  const registro = registroCon(f);

  for (const rota of [
    { ...buena, rol: 'PRESIDENTE' },
    { ...buena, firma: '' },
    { ...buena, firma: 'no es base64 !!' },
    { ...buena, firmadoEnUTC: 'ayer' },
    { ...buena, actorId: '' },
    { ...buena, approved: true },
  ]) {
    const r = verificarAprobacion(d, rota, registro, AHORA);
    assert.equal(r.ok, false, JSON.stringify(rota.rol ?? ''));
    if (r.ok) throw new Error('inesperado');
    assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  }

  // Positivo de control: la aprobacion intacta sigue pasando.
  assert.equal(verificarAprobacion(d, buena, registro, AHORA).ok, true);
});
