/* REACCIONES, CITAS, DOBLE CHECK Y PÁGINAS — con el relevo de verdad.
 *
 *   node pruebas/probar-reacciones-cita.cjs
 *
 * ══ QUÉ VIGILA ════════════════════════════════════════════════════════════
 *
 * Que lo que se agregó al chat NO abra una rendija en el candado:
 *
 *   · una reacción viaja en sobre —el mismo bulto que un mensaje— y en el
 *     disco del relevo no queda el emoji; el otro teléfono la abre y la ve;
 *     quitarla la quita; y un teléfono que no tiene sobre ve un candado, no
 *     un hueco;
 *   · la cita («respondiendo a…») va DENTRO del sobre: en el disco no hay
 *     campo `cita`, y el otro lado la lee igual;
 *   · el doble check sale de `leidoHasta`: una fecha, sin contenido, que
 *     avanza cuando el otro marca leído y no antes;
 *   · y la bandeja se pagina hacia atrás con `antes`, sin repetir ni perder.
 *
 * Todo con dos candados de verdad (dos aparatos) y el servidor.py que corre
 * en el nodo: si el sobre de una reacción no abriera del otro lado, esto se
 * pone rojo, no la producción.
 */
const { readFileSync } = require('node:fs');
const { cargarCliente, candadoNuevo, levantarRelevo, marcador } = require('./banco.cjs');

const ANA = 'ana@ordenglobal.org';
const BETO = 'beto@ordenglobal.org';

(async () => {
  const { comprobar, fin } = marcador();
  const relevo = await levantarRelevo({ 'jwt-ana': ANA, 'jwt-beto': BETO });
  const disco = () => readFileSync(relevo.datos, 'utf8');

  try {
    const ana = cargarCliente(relevo.base, 'jwt-ana', {}, await candadoNuevo());
    const beto = cargarCliente(relevo.base, 'jwt-beto', {}, await candadoNuevo());
    await ana.alta({ email: ANA, name: 'Ana' });
    await beto.alta({ email: BETO, name: 'Beto' });
    await ana.pedirAmistad(BETO); await beto.responderAmistad(ANA, true);

    console.log('\n── la cita va dentro del sobre ───────────────────────────');
    await ana.enviar(BETO, 'primero');
    const idPrimero = (await beto.bandeja(ANA)).mensajes.at(-1).id;
    const r = await ana.enviar(BETO, 'te respondo', { cita: idPrimero });
    comprobar(r && r.e2e === true, 'la respuesta sale cifrada');
    comprobar(!/"cita"/.test(disco()), 'en el disco del relevo NO hay campo `cita`',
      /"cita"/.test(disco()) ? 'LA CITA ESTÁ EN CLARO' : '');
    const hiloB = await beto.bandeja(ANA);
    const resp = hiloB.mensajes.at(-1);
    comprobar(resp.texto === 'te respondo' && resp.cita === idPrimero,
      'Beto la abre y sabe a qué mensaje responde', JSON.stringify({ texto: resp.texto, cita: resp.cita }));
    const hiloA = await ana.bandeja(BETO);
    comprobar(hiloA.mensajes.at(-1).cita === idPrimero, 'y Ana, al releer, también');

    console.log('\n── la reacción va cerrada ────────────────────────────────');
    await beto.reaccionar(resp.id, '❤️', ANA);
    comprobar(!disco().includes('❤'), 'en el disco del relevo no está el emoji',
      disco().includes('❤') ? 'EL EMOJI ESTÁ EN CLARO' : '');
    const conReac = (await ana.bandeja(BETO)).mensajes.find((m) => m.id === resp.id);
    comprobar(conReac.reacciones && conReac.reacciones[BETO] === '❤️',
      'Ana la abre y ve el corazón de Beto', JSON.stringify(conReac.reacciones));
    const propia = (await beto.bandeja(ANA)).mensajes.find((m) => m.id === resp.id);
    comprobar(propia.reacciones && propia.reacciones[BETO] === '❤️',
      'y Beto ve la suya (el sobre para uno mismo)');
    await beto.reaccionar(resp.id, '😂', ANA);
    const otra = (await ana.bandeja(BETO)).mensajes.find((m) => m.id === resp.id);
    comprobar(otra.reacciones[BETO] === '😂', 'otra reacción reemplaza la anterior');
    await beto.reaccionar(resp.id, null, ANA);
    const sin = (await ana.bandeja(BETO)).mensajes.find((m) => m.id === resp.id);
    comprobar(!sin.reacciones || !sin.reacciones[BETO], 'quitarla la quita');

    console.log('\n── un aparato sin sobre ve un candado, no un hueco ──────');
    await ana.reaccionar(resp.id, '🔥', BETO);
    const carla = cargarCliente(relevo.base, 'jwt-beto', {}, await candadoNuevo());
    await carla.alta({ email: BETO, name: 'Beto en otro teléfono' });
    const ajeno = (await carla.bandeja(ANA)).mensajes.find((m) => m.id === resp.id);
    comprobar(ajeno.reacciones && ajeno.reacciones[ANA] === '🔒',
      'el segundo teléfono de Beto —sin sobre— ve el candado', JSON.stringify(ajeno.reacciones));

    console.log('\n── el doble check ────────────────────────────────────────');
    const dos = cargarCliente(relevo.base, 'jwt-ana', {}, await candadoNuevo());
    await dos.alta({ email: ANA, name: 'Ana' });
    const antes = (await ana.bandeja(BETO));
    const mio = antes.mensajes.filter((m) => m.de === ANA).at(-1);
    comprobar(antes.leidoHasta < mio.cuando, 'antes de que Beto abra el hilo, no está leído',
      `leidoHasta=${antes.leidoHasta} cuando=${mio.cuando}`);
    await beto.leido(ANA);
    const despues = await ana.bandeja(BETO);
    comprobar(despues.leidoHasta >= mio.cuando, 'cuando Beto marca leído, Ana lo ve');
    await ana.enviar(BETO, 'después de leer');
    const luego = await ana.bandeja(BETO);
    comprobar(luego.leidoHasta < luego.mensajes.at(-1).cuando, 'lo mandado después no cuenta como leído');

    console.log('\n── el historial se pagina hacia atrás ────────────────────');
    for (let i = 0; i < 205; i++) {
      // eslint-disable-next-line no-await-in-loop
      await (i % 2 ? ana : beto).enviar(i % 2 ? BETO : ANA, 'm' + i);
    }
    const p1 = await ana.bandeja(BETO);
    comprobar(p1.mensajes.length === 200 && p1.hayMas === true,
      'la primera página son 200 y dice que hay más', `${p1.mensajes.length} hayMas=${p1.hayMas}`);
    comprobar(p1.mensajes.at(-1).texto === 'm204', 'y termina en el último');
    const p2 = await ana.bandeja(BETO, p1.mensajes[0].cuando);
    const ids1 = new Set(p1.mensajes.map((m) => m.id));
    comprobar(p2.mensajes.length > 0 && p2.mensajes.every((m) => !ids1.has(m.id)),
      'la anterior no repite ninguno', `${p2.mensajes.length}`);
    comprobar(p2.mensajes.every((m) => m.cuando < p1.mensajes[0].cuando), 'y toda es anterior');
    comprobar(p2.mensajes.some((m) => m.texto === 'primero') && p2.hayMas === false,
      'llega hasta el primer mensaje del hilo y ahí se acaba');
    comprobar(p2.mensajes.every((m) => m.e2e === true), 'la página vieja también viene abierta');

    const f = fin();
    console.log(f ? `\n${f} comprobación(es) fallaron` : '\nTodo en verde');
    process.exit(f ? 1 : 0);
  } finally {
    relevo.cerrar();
  }
})();
