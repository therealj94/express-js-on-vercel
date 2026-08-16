/* Una cuenta con oro dentro no se borra. Ni aunque el nodo no conteste.
 *
 *   node pruebas/probar-borrado-admin.mjs
 *
 * El registro de una cuenta guarda la direccion, la llave privada y la seed. El
 * borrado ANONIMIZA: se van los datos personales y se queda el material
 * cifrado, para que los fondos sigan siendo recuperables con la frase. Aun asi,
 * borrar una cuenta con saldo deja a esa persona sin la puerta por la que
 * entraba a su propio dinero. Por eso hay una guardia, y por eso se comprueba.
 *
 * Dos mitades:
 *
 *  1. LA DECISION, entera y sin red. `decidirBorrado` es una funcion pura
 *     justamente para poder recorrer aqui todos los casos, incluido el que de
 *     verdad importa: NO SE PUDO PREGUNTAR. Un nodo caido no es una cuenta
 *     vacia, y sin esa rama la primera averia de red borra una cuenta con oro.
 *
 *  2. LA LECTURA, contra la cadena 5550 de verdad. Que `saldosDe` distinga una
 *     direccion vacia de una que tiene algo, y que ante un nodo inalcanzable
 *     conteste «no se pudo» en vez de un cero de consuelo.
 */
// lib/saldos.js es ES puro y sin dependencias del backend: carga tal cual, sin
// levantar Express ni tocar Mongo. Esa es justamente la idea.
const { decidirBorrado, saldosDe, TOKENS_5550 } = await import('../lib/saldos.js');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

const cuenta = (extra = {}) => ({ _id: 'u1', address: '0x' + '1'.repeat(40), role: 'user', ...extra });
const lleno = { ok: true, vacia: false, saldos: [{ simbolo: 'ORIGEN', cantidad: '3.5' }], error: null };
const vacio = { ok: true, vacia: true, saldos: [], error: null };
const roto = { ok: false, vacia: null, saldos: [], error: 'sin respuesta en 12000ms' };

console.log('\n── la decision, caso por caso ──────────────────────────────────');

{
  const v = decidirBorrado({ user: cuenta(), saldo: lleno });
  comprobar(!v.permitido && v.http === 409 && v.codigo === 'TIENE_FONDOS',
    'con fondos NO se borra', `${v.http} ${v.codigo}`);
}
{
  // El que importa: el nodo no contesta. Nunca puede leerse como «vacia».
  const v = decidirBorrado({ user: cuenta(), saldo: roto });
  comprobar(!v.permitido && v.http === 503 && v.codigo === 'NO_SE_PUDO_COMPROBAR',
    'si no se pudo preguntar a la cadena, TAMPOCO se borra', `${v.http} ${v.codigo}`);
}
{
  const v = decidirBorrado({ user: cuenta(), saldo: null });
  comprobar(!v.permitido && v.http === 503,
    'y sin consulta ninguna, igual: no se borra');
}
{
  const v = decidirBorrado({ user: cuenta(), saldo: { ok: true, vacia: undefined, saldos: [] } });
  comprobar(!v.permitido,
    'una respuesta a medias tampoco vale por vacia');
}
{
  const v = decidirBorrado({ user: cuenta({ role: 'admin' }), saldo: vacio });
  comprobar(!v.permitido && v.codigo === 'IS_ADMIN',
    'una cuenta de administrador no se borra por esta puerta');
}
{
  const v = decidirBorrado({ user: cuenta({ deletedAt: new Date() }), saldo: vacio });
  comprobar(!v.permitido && v.codigo === 'ALREADY_DELETED',
    'una cuenta ya borrada no se vuelve a borrar');
}
{
  const v = decidirBorrado({ user: null, saldo: vacio });
  comprobar(!v.permitido && v.http === 404,
    'una cuenta que no existe da 404, no un borrado silencioso');
}
{
  const v = decidirBorrado({ user: cuenta(), saldo: vacio });
  comprobar(v.permitido && v.http === 200,
    'vacia y comprobada: ESTA se puede borrar');
}
// Ninguna combinacion puede permitir el borrado sin una lectura buena y vacia.
{
  const combinaciones = [lleno, roto, null, undefined, { ok: false }, { ok: true, vacia: false }];
  const coladas = combinaciones.filter((s) => decidirBorrado({ user: cuenta(), saldo: s }).permitido);
  comprobar(coladas.length === 0,
    'no hay ninguna forma de colar un borrado sin lectura buena y vacia',
    coladas.length ? JSON.stringify(coladas) : '');
}

console.log('\n── la lectura, contra la cadena 5550 de verdad ─────────────────');

comprobar(TOKENS_5550.length === 14,
  `conoce los ${TOKENS_5550.length} tokens del ecosistema, no solo el nativo`);

// LA TABLA NO PUEDE DERIVAR. Si alguien anade un token en la billetera y no
// aqui, una cuenta con ese token pasaria por vacia y se borraria. Asi que se
// compara contra la fuente de verdad, que es la que ve la persona.
{
  const { readFileSync } = await import('node:fs');
  const cadena = readFileSync(
    new URL('../../../apps-web/veta-wallet/cadena.js', import.meta.url), 'utf8');
  const enLaBilletera = new Map(
    [...cadena.matchAll(/\{\s*s:\s*'([A-Z]+)'\s*,\s*contrato:\s*'(0x[a-fA-F0-9]{40})'/g)]
      .map((m) => [m[1], m[2].toLowerCase()]));
  const aqui = new Map(TOKENS_5550.map((t) => [t.simbolo, t.contrato.toLowerCase()]));

  const faltan = [...enLaBilletera.keys()].filter((k) => !aqui.has(k));
  const sobran = [...aqui.keys()].filter((k) => !enLaBilletera.has(k));
  const distintos = [...aqui].filter(([k, v]) => enLaBilletera.has(k) && enLaBilletera.get(k) !== v);

  comprobar(faltan.length === 0,
    'no falta ningun token que la billetera si conoce',
    faltan.length ? 'faltan: ' + faltan.join(', ') : '');
  comprobar(sobran.length === 0, 'ni sobra ninguno',
    sobran.length ? 'sobran: ' + sobran.join(', ') : '');
  comprobar(distintos.length === 0, 'y ninguna direccion esta mal copiada',
    distintos.map(([k, v]) => `${k}: aqui ${v} · billetera ${enLaBilletera.get(k)}`).join('\n           '));
}

// Y que ninguna direccion este mal escrita: una sola con la suma de control
// mala hace fallar la lectura ENTERA, y entonces el borrado se niega siempre
// —seguro, pero roto—. Paso de verdad al escribir esto.
{
  const { getAddress } = await import('ethers');
  const malas = TOKENS_5550.filter((t) => { try { getAddress(t.contrato); return false; } catch { return true; } });
  comprobar(malas.length === 0, 'todas las direcciones son validas',
    malas.map((m) => m.simbolo).join(', '));
}

{
  // La direccion cero no tiene nada y siempre existe: sirve de «vacia» estable.
  const r = await saldosDe('0x0000000000000000000000000000000000000000');
  comprobar(r.ok === true, 'la consulta a la cadena responde', r.error || '');
  comprobar(r.vacia === true, 'y una direccion sin nada sale como vacia',
    r.vacia ? '' : JSON.stringify(r.saldos));
}
{
  // Un validador sí tiene ORIGEN: sirve de «no vacia» estable.
  const r = await saldosDe('0x48ccec9a54b9357623458f26afadcd7412a6a833');
  comprobar(r.ok === true, 'la consulta de una direccion con fondos responde', r.error || '');
  comprobar(r.vacia === false, 'y NO sale como vacia',
    r.saldos.map((s) => `${s.cantidad} ${s.simbolo}`).join(' · ') || '(no encontro nada)');
}
{
  // Con el nodo apuntando a ninguna parte: «no se pudo», jamas un cero.
  const antes = process.env.OG_CHAIN_PROVIDER;
  process.env.OG_CHAIN_PROVIDER = 'http://127.0.0.1:1';
  const mod = await import('../lib/saldos.js?caido=' + Date.now());
  const r = await mod.saldosDe('0x0000000000000000000000000000000000000000');
  if (antes === undefined) delete process.env.OG_CHAIN_PROVIDER;
  else process.env.OG_CHAIN_PROVIDER = antes;

  comprobar(r.ok === false, 'con el nodo inalcanzable, la respuesta es «no se pudo»');
  comprobar(r.vacia === null, 'y NUNCA «vacia»: ese cero costaria el dinero de alguien',
    `vacia=${r.vacia}`);
  comprobar(decidirBorrado({ user: cuenta(), saldo: r }).permitido === false,
    'y la decision, con esa respuesta, se niega a borrar');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
