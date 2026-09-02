/* «ESTÁ ESCRIBIENDO…» Y LA PRESENCIA — con el relevo de verdad.
 *
 *   node pruebas/probar-escribiendo-presencia.cjs
 *
 * ══ QUÉ VIGILA ════════════════════════════════════════════════════════════
 *
 * Que la app oiga el buzón de señales como la web, y que la presencia diga la
 * verdad:
 *
 *   · Ana teclea → Beto, escuchando el buzón, recibe la señal `escribe` con
 *     el hilo donde pasa; y llega SIN una letra de lo que teclea;
 *   · el aviso no inunda: dos teclas seguidas son UNA petición;
 *   · quien escucha el buzón aparece en línea para el otro (`enLinea`), y
 *     quien nunca abrió el chat, no;
 *   · y el fallo de presencia que sí existía: el timbre de una llamada a
 *     alguien que SOLO sondea la bandeja —la app— se empuja al teléfono. Se
 *     ahorraba por «presente» y nunca sonaba (ver `escuchando` en servidor.py).
 */
const { cargarCliente, candadoNuevo, levantarRelevo, marcador, espera } = require('./banco.cjs');

const ANA = 'ana@ordenglobal.org';
const BETO = 'beto@ordenglobal.org';
const CARLA = 'carla@ordenglobal.org';

(async () => {
  const { comprobar, fin } = marcador();
  const relevo = await levantarRelevo({ 'jwt-ana': ANA, 'jwt-beto': BETO, 'jwt-carla': CARLA });

  try {
    const ana = cargarCliente(relevo.base, 'jwt-ana', {}, await candadoNuevo());
    const beto = cargarCliente(relevo.base, 'jwt-beto', {}, await candadoNuevo());
    const carla = cargarCliente(relevo.base, 'jwt-carla', {}, await candadoNuevo());
    await ana.alta({ email: ANA, name: 'Ana' });
    await beto.alta({ email: BETO, name: 'Beto' });
    await carla.alta({ email: CARLA, name: 'Carla' });
    await ana.pedirAmistad(BETO); await beto.responderAmistad(ANA, true);

    console.log('\n── el «escribiendo» llega por el buzón ───────────────────');
    const llegadas = [];
    beto.escuchar((s) => llegadas.push(s));
    await espera(400);
    ana.escribiendo(BETO);
    ana.escribiendo(BETO);            // la segunda tecla no manda nada: se junta
    await espera(1200);
    comprobar(llegadas.length === 1, 'Beto recibe UNA señal por dos teclas seguidas', `${llegadas.length}`);
    const s = llegadas[0] || {};
    comprobar(s.tipo === 'escribe' && s.de === ANA, 'de tipo `escribe` y dice quién', JSON.stringify(s));
    comprobar(s.datos && s.datos.donde === ANA, 'y en qué hilo (el de Ana)', JSON.stringify(s.datos));
    comprobar(!JSON.stringify(s).includes('texto'), 'sin una letra de lo que teclea');

    console.log('\n── la presencia ──────────────────────────────────────────');
    const b = await ana.bandeja(BETO);
    comprobar(b.enLinea === true, 'Beto, que escucha el buzón, está en línea para Ana');
    const c = await ana.bandeja(CARLA);
    comprobar(c.enLinea === false, 'Carla, que nunca abrió el chat, no');
    beto.dejarDeEscuchar();

    console.log('\n── sondear la bandeja enciende el punto verde, nada más ──');
    /* El punto verde sí se enciende con el sondeo de la bandeja —es lo que
       hace la app con el hilo abierto—, pero eso NO es poder recibir una
       llamada: el timbre se empuja igual al teléfono. Que el relevo empuje de
       verdad lo comprueba infra/mensajes/pruebas/probar-reacciones-paginas.py
       con una Expo de mentira; aquí se mira lo que ve la app: la señal queda
       esperando en el buzón hasta que alguien lo escuche. */
    await ana.pedirAmistad(CARLA); await carla.responderAmistad(ANA, true);
    await carla.bandeja(ANA);                       // Carla mira el hilo: PULSO fresco
    const antes = await ana.bandeja(CARLA);
    comprobar(antes.enLinea === true, 'Carla aparece en línea por sondear (punto verde)');
    await ana.senalar(CARLA, 'llamo', { video: false });
    const oidas = [];
    carla.escuchar((x) => oidas.push(x));
    await espera(800);
    carla.dejarDeEscuchar();
    comprobar(oidas.some((x) => x.tipo === 'llamo'), 'la llamada está esperándola en el buzón');

    const f = fin();
    console.log(f ? `\n${f} comprobación(es) fallaron` : '\nTodo en verde');
    process.exit(f ? 1 : 0);
  } finally {
    relevo.cerrar();
  }
})();
