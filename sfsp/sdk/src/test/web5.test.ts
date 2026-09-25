/* SFSP-160 · la capa Web5, de punta a punta y con los ataques que importan. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import {
  aBase58, deBase58, jsonCanonico, b32Texto, aBase64url,
  nuevasLlaves, didKeyDe, publicaDeDidKey, documentoDidKey, didWeb, urlDeDidWeb, documentoEmisor, resolverDid, cuentaEnCadena,
  x25519PublicaDesdeEd25519, x25519PrivadaDesdeEd25519,
  firmarJws, leerJws, firmaValida,
  emitirCredencial, raizDeClaims, pruebaDeClaim, verificarPrueba, nuevaSal,
  ListaDeEstado, firmarLista,
  presentar, verificarPresentacion,
  compromisoDeProposito, proyectarCredencial, digestDeAtestacion,
  concederPermiso, verificarPermiso, revocarPermiso, aplicarRevocacion,
  cifrarPara, descifrar,
  EmisorGenesis, type AlmacenEmisor, type RegistroEmision, type Emisor,
} from '../index.js';

const AHORA = new Date('2026-10-01T12:00:00Z');
const DENTRO_DE_UN_ANO = new Date('2027-10-01T12:00:00Z');

function escenario() {
  const llavesEmisor = nuevasLlaves();
  const did = didWeb('genesis.ordenglobal.link', ['emisores', 'kyc']);
  const emisor: Emisor = { did, kid: '#firma-1', llaves: llavesEmisor };
  const doc = documentoEmisor({ did, publica: llavesEmisor.publica, cuenta: { chainId: 5550, direccion: '0x00000000000000000000000000000000000000aa' } });
  const listaUrl = 'https://genesis.ordenglobal.link/estado/kyc/1';
  const lista = new ListaDeEstado();
  let listaJwt = firmarLista({ emisor, url: listaUrl, lista, ahora: AHORA });
  const web: Record<string, unknown> = { [urlDeDidWeb(did)]: doc };
  const obtener = async (url: string) => {
    if (!(url in web)) throw new Error('404');
    return web[url];
  };
  const persona = nuevasLlaves();
  const didPersona = didKeyDe(persona.publica);
  return {
    emisor, doc, listaUrl, lista, persona, didPersona, obtener,
    get listaJwt() { return listaJwt; },
    set listaJwt(v: string) { listaJwt = v; },
  };
}

test('base58, JSON canónico y bytes32', () => {
  const b = new Uint8Array([0, 0, 1, 2, 250, 255]);
  assert.deepEqual(deBase58(aBase58(b)), b);
  assert.equal(jsonCanonico({ b: 1, a: [true, null, 'x'], c: { z: 1, y: 2 } }), '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
  assert.throws(() => jsonCanonico({ x: 1.5 }));
  assert.equal(b32Texto('KYC'), '0x4b59430000000000000000000000000000000000000000000000000000000000');
});

test('did:key: ida y vuelta, y la llave de cifrado derivada es la correcta', () => {
  const p = nuevasLlaves();
  const did = didKeyDe(p.publica);
  assert.match(did, /^did:key:z6Mk/);
  assert.deepEqual(publicaDeDidKey(did), p.publica);
  const doc = documentoDidKey(did);
  assert.equal(doc.id, did);
  assert.equal(doc.keyAgreement?.length, 1);
  // La X25519 derivada de la privada, calculada por OpenSSL, tiene que coincidir con la convertida desde la pública.
  const xPriv = x25519PrivadaDesdeEd25519(p.privada);
  const k = createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', d: aBase64url(xPriv), x: aBase64url(x25519PublicaDesdeEd25519(p.publica)) }, format: 'jwk' });
  const xPubOpenssl = (createPublicKey(k).export({ format: 'jwk' }) as { x: string }).x;
  assert.equal(xPubOpenssl, aBase64url(x25519PublicaDesdeEd25519(p.publica)));
});

test('did:web: ruta del documento, resolución y documento que no es de ese DID', async () => {
  const s = escenario();
  assert.equal(urlDeDidWeb(s.emisor.did), 'https://genesis.ordenglobal.link/emisores/kyc/did.json');
  assert.equal(urlDeDidWeb('did:web:ordenglobal.link'), 'https://ordenglobal.link/.well-known/did.json');
  const doc = await resolverDid(s.emisor.did, s.obtener);
  assert.equal(cuentaEnCadena(doc, 5550), '0x00000000000000000000000000000000000000aa');
  assert.equal(cuentaEnCadena(doc, 1), null);
  await assert.rejects(resolverDid(s.emisor.did, async () => ({ ...s.doc, id: 'did:web:otro.com' })), /no es de ese DID/);
  await assert.rejects(resolverDid(s.emisor.did, async () => { throw new Error('caído'); }), /UNKNOWN_SOURCE/);
});

test('JWS: firma, y cualquier byte cambiado la invalida', () => {
  const p = nuevasLlaves();
  const jws = firmarJws({ hola: 'mundo' }, { typ: 'x', kid: 'k' }, p);
  assert.ok(firmaValida(leerJws(jws), p.publica));
  const [h, pl, f] = jws.split('.');
  const alterado = `${h}.${Buffer.from(JSON.stringify({ hola: 'mundo!' })).toString('base64url')}.${f}`;
  assert.equal(firmaValida(leerJws(alterado), p.publica), false);
  assert.equal(firmaValida(leerJws(jws), nuevasLlaves().publica), false);
  assert.ok(pl);
});

test('Merkle: toda hoja prueba su pertenencia, con cualquier cantidad de claims', () => {
  for (let n = 1; n <= 9; n++) {
    const d = Array.from({ length: n }, (_, i) => ({ sal: nuevaSal(), nombre: `c${i}`, valor: i % 2 ? `v${i}` : i }));
    const raiz = raizDeClaims(d);
    for (const x of d) assert.ok(verificarPrueba(x, pruebaDeClaim(d, x.nombre), raiz), `n=${n} ${x.nombre}`);
    // Mismo nombre y valor con otra sal no pertenece.
    assert.equal(verificarPrueba({ ...d[0]!, sal: nuevaSal() }, pruebaDeClaim(d, 'c0'), raiz), false);
  }
});

async function flujo(opciones: { revelar?: string[]; exigir?: string[]; aud?: string; nonceVerificador?: string } = {}) {
  const s = escenario();
  const e = emitirCredencial({
    emisor: s.emisor, sujeto: s.didPersona, proposito: 'KYC',
    claims: { nivel: 2, mayorDeEdad: true, pais: 'HN', nombre: 'Persona Sintética' },
    politica: 'kyc-hn-v1', validoDesde: AHORA, validoHasta: DENTRO_DE_UN_ANO,
    estado: { lista: s.listaUrl, indice: 4321 },
  });
  const vp = presentar({
    credencialJwt: e.jwt, divulgaciones: e.divulgaciones, revelar: opciones.revelar ?? ['mayorDeEdad', 'nivel'],
    titular: s.persona, audiencia: opciones.aud ?? 'did:web:vetawallet.ordenglobal.link', nonce: 'reto-123', ahora: AHORA,
  });
  const usados = new Set<string>();
  const verificar = (vpJwt = vp) => verificarPresentacion(vpJwt, {
    audiencia: 'did:web:vetawallet.ordenglobal.link', nonce: opciones.nonceVerificador ?? 'reto-123',
    consumirNonce: (n) => (usados.has(n) ? false : (usados.add(n), true)),
    emisoresConfiables: { KYC: [s.emisor.did] }, proposito: 'KYC', exigir: opciones.exigir ?? ['mayorDeEdad'],
    obtener: s.obtener, obtenerLista: async () => s.listaJwt, ahora: AHORA,
  });
  return { s, e, vp, verificar };
}

test('presentación: la persona revela solo lo que elige, y basta', async () => {
  const { e, verificar } = await flujo();
  const r = await verificar();
  assert.equal(r.codigo, 'ALLOW', r.detalle);
  assert.deepEqual(r.valor?.claims, { mayorDeEdad: true, nivel: 2 });
  assert.equal('pais' in (r.valor?.claims ?? {}), false, 'no reveló el país');
  assert.equal('nombre' in (r.valor?.claims ?? {}), false, 'no reveló el nombre');
  assert.equal(r.valor?.claimsRoot, e.credencial.credentialSubject.claimsRoot);
  assert.equal(JSON.stringify(e.credencial).includes('Persona Sintética'), false, 'la credencial no lleva datos personales');
});

test('presentación: el mismo reto no sirve dos veces', async () => {
  const { verificar } = await flujo();
  assert.equal((await verificar()).codigo, 'ALLOW');
  assert.equal((await verificar()).codigo, 'DENY_AUTHORIZATION');
});

test('presentación: para otra audiencia, con otro reto o sin lo exigido, no pasa', async () => {
  assert.equal((await (await flujo({ aud: 'did:web:otro.com' })).verificar()).codigo, 'DENY_AUTHORIZATION');
  assert.equal((await (await flujo({ nonceVerificador: 'otro' })).verificar()).codigo, 'DENY_AUTHORIZATION');
  assert.equal((await (await flujo({ revelar: ['nivel'] })).verificar()).codigo, 'DENY_ELIGIBILITY');
});

test('presentación: un claim cambiado no cuadra con la raíz firmada', async () => {
  const { s, e } = await flujo();
  const falsas = e.divulgaciones.map((d) => (d.nombre === 'nivel' ? { ...d, valor: 3 } : d));
  const vp = presentar({ credencialJwt: e.jwt, divulgaciones: falsas, revelar: ['nivel', 'mayorDeEdad'], titular: s.persona, audiencia: 'did:web:vetawallet.ordenglobal.link', nonce: 'reto-123', ahora: AHORA });
  const r = await verificarPresentacion(vp, {
    audiencia: 'did:web:vetawallet.ordenglobal.link', nonce: 'reto-123', emisoresConfiables: { KYC: [s.emisor.did] },
    proposito: 'KYC', obtener: s.obtener, obtenerLista: async () => s.listaJwt, ahora: AHORA,
  });
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
});

test('presentación: nadie presenta la credencial de otro', async () => {
  const { e, s } = await flujo();
  const ladron = nuevasLlaves();
  assert.throws(() => presentar({ credencialJwt: e.jwt, divulgaciones: e.divulgaciones, revelar: [], titular: ladron, audiencia: 'x', nonce: 'n' }), /otra|titular/);
  // Aunque arme la presentación a mano con su propia firma, el titular no coincide.
  const vp = firmarJws({ '@context': [], type: ['VerifiablePresentation'], holder: didKeyDe(ladron.publica), verifiableCredential: [e.jwt], divulgaciones: [], aud: 'did:web:vetawallet.ordenglobal.link', nonce: 'reto-123', iat: Math.floor(AHORA.getTime() / 1000), exp: Math.floor(AHORA.getTime() / 1000) + 60 }, { typ: 'vp+jwt', kid: 'x' }, ladron);
  const r = await verificarPresentacion(vp, { audiencia: 'did:web:vetawallet.ordenglobal.link', nonce: 'reto-123', emisoresConfiables: { KYC: [s.emisor.did] }, proposito: 'KYC', obtener: s.obtener, obtenerLista: async () => s.listaJwt, ahora: AHORA });
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
});

test('presentación: emisor no aceptado para ese propósito', async () => {
  const { s, vp } = await flujo();
  const r = await verificarPresentacion(vp, { audiencia: 'did:web:vetawallet.ordenglobal.link', nonce: 'reto-123', emisoresConfiables: { KYC: [] , ACCREDITED: [s.emisor.did] }, proposito: 'KYC', obtener: s.obtener, obtenerLista: async () => s.listaJwt, ahora: AHORA });
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
});

test('revocación: el bit en la lista la tumba; lista ilegible es UNKNOWN_SOURCE, nunca ALLOW', async () => {
  const { s, vp } = await flujo();
  s.lista.marcar(4321, true);
  s.listaJwt = firmarLista({ emisor: s.emisor, url: s.listaUrl, lista: s.lista, ahora: AHORA });
  const base = { audiencia: 'did:web:vetawallet.ordenglobal.link', nonce: 'reto-123', emisoresConfiables: { KYC: [s.emisor.did] }, proposito: 'KYC', obtener: s.obtener, ahora: AHORA };
  assert.equal((await verificarPresentacion(vp, { ...base, obtenerLista: async () => s.listaJwt })).codigo, 'DENY_ELIGIBILITY');
  assert.equal((await verificarPresentacion(vp, { ...base, obtenerLista: async () => { throw new Error('emisor caído'); } })).codigo, 'UNKNOWN_SOURCE');
  // Una lista firmada por otro no vale.
  const otro = { did: s.emisor.did, kid: '#firma-1', llaves: nuevasLlaves() };
  const falsa = firmarLista({ emisor: otro, url: s.listaUrl, lista: new ListaDeEstado(), ahora: AHORA });
  assert.notEqual((await verificarPresentacion(vp, { ...base, obtenerLista: async () => falsa })).codigo, 'ALLOW');
});

test('lista de estado: codifica, decodifica y respeta el orden de bits', () => {
  const l = new ListaDeEstado();
  l.marcar(0, true); l.marcar(9, true); l.marcar(131071, true);
  assert.equal(l.bits[0], 0b10000000);
  assert.equal(l.bits[1], 0b01000000);
  const r = ListaDeEstado.decodificar(l.codificar());
  assert.ok(r.leer(0) && r.leer(9) && r.leer(131071) && !r.leer(1));
  assert.throws(() => new ListaDeEstado(1000));
});

test('proyección: compromiso por propósito y digest estables; la credencial fija la atestación', async () => {
  const { e } = await flujo();
  const ref = '0x' + '11'.repeat(32);
  const sal = '0x' + '22'.repeat(32);
  const a = proyectarCredencial(e.credencial, ref, sal);
  assert.equal(a.purpose, b32Texto('KYC'));
  assert.equal(a.claimsRoot, e.credencial.credentialSubject.claimsRoot);
  assert.equal(a.subjectCommitment, compromisoDeProposito(ref, b32Texto('KYC'), sal));
  assert.notEqual(compromisoDeProposito(ref, b32Texto('KYB'), sal), a.subjectCommitment, 'otro propósito, otro compromiso');
  const d1 = digestDeAtestacion(a, 5550, '0x' + '33'.repeat(20));
  assert.match(d1, /^0x[0-9a-f]{64}$/);
  assert.notEqual(d1, digestDeAtestacion(a, 5534, '0x' + '33'.repeat(20)), 'el digest ata la red');
});

test('permisos: la persona da, la app usa dentro de lo dado, y la persona revoca', () => {
  const p = nuevasLlaves();
  const app = 'did:web:electrum.ordenglobal.link';
  const prot = 'https://ordenglobal.link/protocolos/expediente-minero/v1';
  const jws = concederPermiso({ titular: p, app, protocolo: prot, acciones: ['leer'], proposito: 'consulta-catastro', vence: DENTRO_DE_UN_ANO, ahora: AHORA });
  const base = { app, protocolo: prot, accion: 'leer' as const, proposito: 'consulta-catastro', revocados: new Set<string>(), ahora: AHORA };
  const ok = verificarPermiso(jws, base);
  assert.equal(ok.codigo, 'ALLOW');
  assert.equal(verificarPermiso(jws, { ...base, accion: 'escribir' }).codigo, 'DENY_AUTHORIZATION');
  assert.equal(verificarPermiso(jws, { ...base, app: 'did:web:otra.app' }).codigo, 'DENY_AUTHORIZATION');
  assert.equal(verificarPermiso(jws, { ...base, ahora: new Date('2028-01-01') }).codigo, 'DENY_POLICY');
  const rev = revocarPermiso(p, ok.valor!.jti, AHORA);
  const jti = aplicarRevocacion(rev, jws);
  assert.equal(verificarPermiso(jws, { ...base, revocados: new Set([jti]) }).codigo, 'DENY_AUTHORIZATION');
  assert.throws(() => aplicarRevocacion(revocarPermiso(nuevasLlaves(), ok.valor!.jti), jws), /titular|revocación/);
});

test('cifrado: solo la persona abre sus datos, y un byte cambiado se detecta', () => {
  const p = nuevasLlaves();
  const did = didKeyDe(p.publica);
  const sobre = cifrarPara(did, 'expediente: concesión sintética 001', 'protocolo=expediente-minero');
  assert.equal(Buffer.from(descifrar(sobre, p)).toString(), 'expediente: concesión sintética 001');
  assert.throws(() => descifrar(sobre, nuevasLlaves()), /DENY_AUTHORIZATION/);
  assert.throws(() => descifrar({ ...sobre, aad: 'protocolo=otro' }, p), /DENY_AUTHORIZATION/);
  const ct = Buffer.from(sobre.ct, 'base64url'); ct[0]! ^= 1;
  assert.throws(() => descifrar({ ...sobre, ct: ct.toString('base64url') }, p), /DENY_AUTHORIZATION/);
});

function almacenEnMemoria() {
  const listas = new Map<string, ListaDeEstado>();
  const emisiones = new Map<string, RegistroEmision>();
  const usados = new Set<string>();
  const a: AlmacenEmisor & { emisiones: typeof emisiones; listaJwt: string } = {
    emisiones, listaJwt: '',
    async leerLista(u) { return listas.get(u) ?? null; },
    async guardarLista(u, l, jwt) { listas.set(u, l); a.listaJwt = jwt; },
    async indiceUsado(u, i) { return usados.has(`${u}#${i}`); },
    async registrarEmision(r) { usados.add(`${r.lista}#${r.indice}`); emisiones.set(r.credencialId, r); },
    async leerEmision(id) { return emisiones.get(id) ?? null; },
    async marcarRevocada(id) { const r = emisiones.get(id); if (r) r.revocada = true; },
  };
  return a;
}

test('emisor de Genesis: sin aprobación humana no emite; emite, proyecta, y revoca en lista y cadena', async () => {
  const s = escenario();
  const almacen = almacenEnMemoria();
  const llamadas: string[] = [];
  const cadena = {
    chainId: 5550, adaptador: '0x' + '44'.repeat(20),
    firmar: async (d: string) => { llamadas.push(`firmar ${d.slice(0, 10)}`); return '0xfirma'; },
    registrar: async () => { llamadas.push('registrar'); return '0xtx1'; },
    revocar: async () => { llamadas.push('revocar'); return '0xtx2'; },
  };
  const g = new EmisorGenesis(s.emisor, almacen, cadena, s.listaUrl, true);
  const pedido = {
    sujeto: s.didPersona, proposito: 'KYC', claims: { nivel: 2, mayorDeEdad: true }, politica: 'kyc-hn-v1',
    validoDesde: AHORA, validoHasta: DENTRO_DE_UN_ANO, subjectRef: '0x' + '11'.repeat(32), salt: '0x' + '22'.repeat(32),
  };
  await assert.rejects(g.emitir({ ...pedido, aprobacion: { aprobadaPor: '', expediente: '' } }), /aprobación humana/);
  const r = await g.emitir({ ...pedido, aprobacion: { aprobadaPor: 'op_revisora_1', expediente: 'exp_000123' } });
  assert.equal(r.tx, '0xtx1');
  assert.equal(r.digest, digestDeAtestacion(r.atestacion, 5550, cadena.adaptador));
  const registro = almacen.emisiones.get(r.emision.credencial.id)!;
  assert.equal(JSON.stringify(registro).includes('mayorDeEdad'), false, 'el emisor no guarda los claims');

  // La persona presenta: pasa. Genesis revoca: deja de pasar.
  const vp = (nonce: string) => presentar({ credencialJwt: r.emision.jwt, divulgaciones: r.emision.divulgaciones, revelar: ['mayorDeEdad'], titular: s.persona, audiencia: 'did:web:dbnx.ordenglobal.link', nonce, ahora: AHORA });
  const verif = (jwt: string, nonce: string) => verificarPresentacion(jwt, { audiencia: 'did:web:dbnx.ordenglobal.link', nonce, emisoresConfiables: { KYC: [s.emisor.did] }, proposito: 'KYC', obtener: s.obtener, obtenerLista: async () => almacen.listaJwt || firmarLista({ emisor: s.emisor, url: s.listaUrl, lista: new ListaDeEstado(), ahora: AHORA }), ahora: AHORA });
  assert.equal((await verif(vp('a'), 'a')).codigo, 'ALLOW');
  const rev = await g.revocar(r.emision.credencial.id, 'KYC_VENCIDO_FRAUDE');
  assert.equal(rev.tx, '0xtx2');
  assert.equal((await verif(vp('b'), 'b')).codigo, 'DENY_ELIGIBILITY');
  assert.deepEqual(llamadas.map((x) => x.split(' ')[0]), ['firmar', 'registrar', 'revocar']);
  assert.equal(almacen.emisiones.get(r.emision.credencial.id)!.revocada, true);

  // Apagado: firma y registra en su almacén, pero no toca la cadena.
  const apagado = new EmisorGenesis(s.emisor, almacenEnMemoria(), cadena, s.listaUrl, false);
  const r2 = await apagado.emitir({ ...pedido, aprobacion: { aprobadaPor: 'op_revisora_1', expediente: 'exp_000124' } });
  assert.equal(r2.tx, null);
});
