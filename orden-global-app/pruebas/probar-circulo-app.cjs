/* EL CÍRCULO, DESDE LA APP · ¿se puede conocer a alguien desde el teléfono?
 *
 *   node pruebas/probar-circulo-app.cjs
 *
 * ══ QUÉ VIGILA ════════════════════════════════════════════════════════════
 *
 * Hasta hoy, la app NO TENÍA CÍRCULO. Ni una línea: ni pedir, ni ver, ni
 * aceptar, ni rechazar, ni cancelar. Y eso no era una pantalla que faltaba,
 * era el chat entero roto para conocer gente nueva, porque el relevo exige
 * que te acepten antes de dejarte escribir.
 *
 * Lo que pasaba en el teléfono: buscabas a alguien, tocabas «Agregar» —que
 * sólo escribía en la libreta local—, salía «Guardado en tus contactos», se
 * abría el hilo igual, escribías, y el relevo contestaba 403. La app se comía
 * ese error y dejaba una burbuja roja con «Reintentar» que iba a fallar para
 * siempre. Del otro lado, a quien le llegaba una solicitud no tenía dónde
 * verla: en producción había seis esperando desde hacía diez días.
 *
 * ══ Y POR QUÉ NO SE PARECE A LA PRUEBA DE LA WEB ══════════════════════════
 *
 * `apps-web/veta-wallet/pruebas/probar-p2c-completo.mjs` cubre esto y pasa en
 * verde, pero entra por la puerta de servicio en los tres sitios donde la de
 * calle está rota: manda la solicitud con un POST directo al relevo en vez de
 * tocar el botón, acepta llamando la función por JavaScript, y fuerza la
 * pestaña a mano — que es justo lo que en el uso real nunca se refresca.
 *
 * Aquí se llaman las funciones que la pantalla llama, contra el relevo de
 * verdad, y se comprueba lo que la persona vería. Que es lo único que cuenta.
 */
const { cargarCliente, candadoNuevo, levantarRelevo, marcador } = require('./banco.cjs');

const ANA = 'ana@ordenglobal.org';
const BETO = 'beto@ordenglobal.org';

(async () => {
  const { comprobar, fin } = marcador();
  const sesiones = { 'jwt-ana': ANA, 'jwt-beto': BETO };
  const relevo = await levantarRelevo(sesiones);

  try {
    /* Cada uno con SU candado, como dos teléfonos distintos. Sin esto la
       prueba no cifraría nada y cualquier comprobación sobre el cifrado
       saldría en rojo por culpa del banco, no del código. */
    const ana = cargarCliente(relevo.base, 'jwt-ana', {}, await candadoNuevo());
    const beto = cargarCliente(relevo.base, 'jwt-beto', {}, await candadoNuevo());
    await ana.alta({ email: ANA, name: 'Ana' });
    await beto.alta({ email: BETO, name: 'Beto' });

    console.log('\n── sin círculo no se puede escribir, y eso está bien ────────');
    let err = null;
    try { await ana.enviar(BETO, 'hola'); } catch (e) { err = e; }
    comprobar(err && err.code === 403,
      'el relevo corta el mensaje de un desconocido con 403',
      err ? `devolvió ${err.code}` : 'lo dejó pasar');

    console.log('\n── la app puede PEDIR (antes no existía la función) ─────────');
    comprobar(typeof ana.pedirAmistad === 'function', 'la app tiene `pedirAmistad`');
    comprobar(typeof ana.circulo === 'function', 'la app tiene `circulo`');
    comprobar(typeof ana.responderAmistad === 'function', 'la app tiene `responderAmistad`');
    comprobar(typeof ana.quitarAmigo === 'function', 'la app tiene `quitarAmigo`');
    comprobar(typeof ana.bloquear === 'function' && typeof ana.denunciar === 'function',
      'y también bloquear y denunciar, que la tienda de Apple exige');

    await ana.pedirAmistad(BETO);

    console.log('\n── y BETO LA VE. Éste es el fallo que dejó seis sin contestar ─');
    const cB = await beto.circulo();
    comprobar((cB.recibidas || []).some((x) => x.correo === ANA),
      'a Beto le aparece la solicitud de Ana',
      `recibidas: ${JSON.stringify((cB.recibidas || []).map((x) => x.correo))}`);
    const cA = await ana.circulo();
    comprobar((cA.enviadas || []).some((x) => x.correo === BETO),
      'y Ana ve la suya como enviada, con su salida para cancelarla');

    console.log('\n── el buscador dice la VERDAD del vínculo, no la libreta ────');
    const busca = await ana.buscar('beto');
    const fila = (busca.gente || []).find((x) => x.correo === BETO);
    comprobar(fila && fila.lazo === 'enviada',
      'a Ana el botón le dice «Enviada», no «Agregar» otra vez',
      fila ? `lazo=${fila.lazo}` : 'no lo encontró');
    const buscaB = await beto.buscar('ana');
    const filaB = (buscaB.gente || []).find((x) => x.correo === ANA);
    comprobar(filaB && filaB.lazo === 'recibida',
      'y a Beto le dice «recibida», que es una invitación a responder',
      filaB ? `lazo=${filaB.lazo}` : 'no la encontró');

    console.log('\n── aceptar, y recién ahí se puede hablar ────────────────────');
    await beto.responderAmistad(ANA, true);
    const r = await ana.enviar(BETO, 'hola de verdad');
    comprobar(!!r, 'aceptada la solicitud, el mensaje pasa');

    /* EL AGUJERO DE LOS CINCO MINUTOS. El llavero cachea `/llaves/de` cinco
       minutos, y cachea TAMBIÉN el resultado vacío. Antes de aceptarte, tus
       llaves no se entregan; si quien te escribió lo intentó demasiado pronto
       se quedó con una lista vacía guardada, y el primer mensaje después de
       aceptar SALE EN CLARO. Justo los primeros de una relación que empieza.
       En la web esto se tapó por el lado equivocado —se vacía el llavero
       dentro de `estados()`—; aquí se vacía al aceptar. */
    comprobar(r.e2e !== false,
      'Y VA CIFRADO: aceptar vacía el llavero, no se espera cinco minutos',
      r.e2e === false ? 'salió EN CLARO — el llavero se quedó con el vacío' : '');

    console.log('\n── rechazar no deja rastro, y cancelar se puede ─────────────');
    const caro = cargarCliente(relevo.base, 'jwt-caro', {}, await candadoNuevo());
    sesiones['jwt-caro'] = 'caro@ordenglobal.org';
    await caro.alta({ email: 'caro@ordenglobal.org', name: 'Caro' });
    await caro.pedirAmistad(ANA);
    await ana.responderAmistad('caro@ordenglobal.org', false);
    const cA2 = await ana.circulo();
    comprobar(!(cA2.recibidas || []).some((x) => x.correo === 'caro@ordenglobal.org'),
      'rechazada, la solicitud desaparece de la lista de Ana');
    let err2 = null;
    try { await caro.enviar(ANA, 'y si insisto'); } catch (e) { err2 = e; }
    comprobar(err2 && err2.code === 403, 'y quien fue rechazado sigue sin poder escribir');

    await caro.pedirAmistad(BETO);
    await caro.quitarAmigo(BETO);
    const cC = await caro.circulo();
    comprobar(!(cC.enviadas || []).some((x) => x.correo === BETO),
      'una solicitud mandada por error se puede cancelar');

    const f = fin();
    console.log(f ? `\n${f} comprobación(es) fallaron` : '\nTodo en verde');
    process.exit(f ? 1 : 0);
  } finally {
    relevo.cerrar();
  }
})();
