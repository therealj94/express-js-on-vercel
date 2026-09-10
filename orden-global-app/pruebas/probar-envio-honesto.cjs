/* ¿DICE LA VERDAD SOBRE SI EL MENSAJE FUE CIFRADO?
 *
 *   node pruebas/probar-envio-honesto.cjs
 *
 * ══ QUÉ VIGILA ════════════════════════════════════════════════════════════
 *
 * Que la app cifre no garantiza que el mensaje SALGA cifrado. `cerrarPara`
 * devolvía `null` ante cinco situaciones muy distintas y `enviar` mandaba en
 * claro para las cinco, enseñando siempre el mismo texto: «esa persona todavía
 * no abrió el chat en ningún aparato».
 *
 * Sólo UNA de las cinco era esa. Las otras eran fallos de red, la lista de
 * miembros de un grupo que no se pudo traer, o este teléfono sin sus propias
 * llaves. En producción, de 54 mensajes en claro entre personas, 42 fueron a
 * gente que SÍ tenía aparato publicado: o sea que el aviso mentía en la
 * mayoría de los casos, y el último mensaje de toda la base es uno de ésos.
 *
 * Degradar a texto plano porque se cayó una petición es lo único que no se
 * puede hacer callado: la persona cree que va cifrado, y va cifrado casi
 * siempre. Así que ahora un fallo de red LEVANTA el error y la pantalla
 * enseña la burbuja roja de «No se envió · Reintentar», que es la verdad.
 *
 * Para probarlo hace falta romper SÓLO `/llaves/de` y dejar el resto vivo —si
 * se cae el relevo entero, `/enviar` también falla y no se distingue una cosa
 * de la otra. De ahí el intermediario de abajo: es lo que hace que esta
 * prueba pruebe lo que dice.
 */
const http = require('node:http');
const { cargarCliente, candadoNuevo, levantarRelevo, marcador, puertoLibre } = require('./banco.cjs');

const ANA = 'ana@ordenglobal.org';
const BETO = 'beto@ordenglobal.org';
const SINLLAVE = 'sinllave@ordenglobal.org';

/* Un intermediario delante del relevo. Reenvía todo tal cual, salvo lo que se
   le mande tirar: así se rompe una sola ruta y se ve qué hace el cliente. */
async function intermediario(destino) {
  const puerto = await puertoLibre();
  const roto = new Set();
  const srv = http.createServer((q, r) => {
    if (roto.has(q.url)) { r.writeHead(500); r.end('{"error":"caido"}'); return; }
    const cuerpo = [];
    q.on('data', (c) => cuerpo.push(c));
    q.on('end', () => {
      const p = http.request(destino + q.url, { method: q.method, headers: q.headers }, (res) => {
        r.writeHead(res.statusCode, res.headers);
        res.pipe(r);
      });
      p.on('error', () => { r.writeHead(502); r.end('{}'); });
      p.end(Buffer.concat(cuerpo));
    });
  });
  await new Promise((ok) => srv.listen(puerto, ok));
  return { base: `http://127.0.0.1:${puerto}`, roto, cerrar: () => srv.close() };
}

(async () => {
  const { comprobar, fin } = marcador();
  const sesiones = { 'jwt-ana': ANA, 'jwt-beto': BETO, 'jwt-sin': SINLLAVE };
  const relevo = await levantarRelevo(sesiones);
  const medio = await intermediario(relevo.base);

  try {
    const ana = cargarCliente(medio.base, 'jwt-ana', {}, await candadoNuevo());
    const beto = cargarCliente(relevo.base, 'jwt-beto', {}, await candadoNuevo());
    /* Éste se da de alta SIN candado: es alguien que abrió la cuenta y nunca
       llegó a publicar la llave de ningún aparato. En producción son 18 de
       34 fichas, o sea la mitad — no es un caso raro. */
    const sinLlave = cargarCliente(relevo.base, 'jwt-sin', {}, null);

    await ana.alta({ email: ANA, name: 'Ana' });
    await beto.alta({ email: BETO, name: 'Beto' });
    await sinLlave.alta({ email: SINLLAVE, name: 'Sin llave' }).catch(() => {});
    await ana.pedirAmistad(BETO); await beto.responderAmistad(ANA, true);
    await ana.pedirAmistad(SINLLAVE);
    await sinLlave.responderAmistad(ANA, true);

    console.log('\n── a quien no tiene aparato: en claro, y SE DICE ────────────');
    const r1 = await ana.enviar(SINLLAVE, 'hola');
    comprobar(r1 && r1.e2e === false,
      'sale en claro y lo devuelve marcado — es la única causa honesta',
      `e2e=${r1?.e2e}`);

    console.log('\n── la marca SOBREVIVE: el hilo la sigue diciendo mañana ─────');
    const hilo = await ana.bandeja(SINLLAVE);
    const ultimo = (hilo.mensajes || []).at(-1);
    comprobar(ultimo && ultimo.e2e === false,
      'el mensaje vuelve del relevo marcado, no sólo con un aviso que se fue',
      `e2e=${ultimo?.e2e}`);
    const hiloDelOtro = await sinLlave.bandeja(ANA);
    const suyo = (hiloDelOtro.mensajes || []).at(-1);
    comprobar(suyo && suyo.e2e === false,
      'y QUIEN LO RECIBE también lo ve — antes no se enteraba nunca',
      `e2e=${suyo?.e2e}`);

    console.log('\n── si se cae la red, NO se degrada a texto plano ────────────');
    medio.roto.add('/llaves/de');
    let err = null;
    try { await ana.enviar(BETO, 'esto NO puede salir en claro'); } catch (e) { err = e; }
    comprobar(!!err && err.motivo === 'sin-red',
      'levanta el error en vez de mandar en claro sin avisar',
      err ? `motivo=${err.motivo}` : 'LO MANDÓ IGUAL');

    const hiloB = await beto.bandeja(ANA);
    const llego = (hiloB.mensajes || []).some((m) => m.texto === 'esto NO puede salir en claro');
    comprobar(!llego,
      'y no queda ni rastro de ese texto en el relevo',
      llego ? 'EL TEXTO ESTÁ GUARDADO EN CLARO' : '');

    medio.roto.delete('/llaves/de');
    const r2 = await ana.enviar(BETO, 'y con la red de vuelta, cifrado');
    comprobar(r2 && r2.e2e !== false, 'recuperada la red, vuelve a cifrar');

    const f = fin();
    console.log(f ? `\n${f} comprobación(es) fallaron` : '\nTodo en verde');
    process.exit(f ? 1 : 0);
  } finally {
    medio.cerrar();
    relevo.cerrar();
  }
})();
