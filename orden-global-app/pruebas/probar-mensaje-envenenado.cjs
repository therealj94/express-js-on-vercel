/* UN MENSAJE ENVENENADO NO DEJA A NADIE SIN CHAT — con el relevo de verdad.
 *
 *   node pruebas/probar-mensaje-envenenado.cjs
 *
 * El relevo solo mira que el bulto tenga `ct` y una lista `s`; lo de dentro
 * es opaco para él, y tiene que serlo. Así que cualquiera con una cuenta
 * puede dejar en un hilo un bulto con la forma justa para pasar el relevo y
 * reventar al cliente: un sobre `null`, un `k` numérico, un `a` que es una
 * lista. Antes eso lanzaba DENTRO de `abrir`, tumbaba el `Promise.all` de la
 * bandeja y la conversación ENTERA se quedaba vacía — lo que un atacante
 * querría. Ahora el malo sale como candado cerrado y los demás se leen.
 *
 * Todo con el cliente real de la app (`src/og/mensajes.js`), dos candados de
 * verdad y el servidor.py del nodo.
 */
const { cargarCliente, candadoNuevo, levantarRelevo, cajon, marcador } = require('./banco.cjs');

const ANA = 'ana@ordenglobal.org';
const BETO = 'beto@ordenglobal.org';

(async () => {
  const { comprobar, fin } = marcador();
  const relevo = await levantarRelevo({ 'jwt-ana': ANA, 'jwt-beto': BETO });
  try {
    const almacenAna = {};
    const ana = cargarCliente(relevo.base, 'jwt-ana', almacenAna, await candadoNuevo());
    const beto = cargarCliente(relevo.base, 'jwt-beto', {}, await candadoNuevo());
    await ana.alta({ email: ANA, name: 'Ana' });
    await beto.alta({ email: BETO, name: 'Beto' });
    await ana.pedirAmistad(BETO); await beto.responderAmistad(ANA, true);

    await ana.enviar(BETO, 'antes del veneno');

    /* Los venenos van directo al relevo, con la llave de Ana: es lo que haría
       alguien que no usa nuestra app para escribir. */
    const llave = almacenAna[cajon(ANA)];
    comprobar(!!llave, 'Ana tiene su llave del relevo');
    const venenos = [
      { v: 2, de: 'x', iv: 'x', ct: 'x', s: [null] },
      { v: 2, de: 'x', iv: 'x', ct: 'x', s: [{ a: ['lista'], iv: 1, k: 7 }] },
      { v: 2, de: {}, iv: 'x', ct: 'x', s: [] },
      { v: 2, de: 'x', iv: 'x', ct: 'x', s: ['texto suelto'] },
    ];
    let aceptados = 0;
    for (const cif of venenos) {
      const r = await fetch(relevo.base + '/enviar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ correo: ANA, llave, para: BETO, cif }),
      });
      if (r.ok) aceptados++;
    }
    comprobar(aceptados === venenos.length, 'el relevo los deja pasar (para él son opacos)',
      `${aceptados} de ${venenos.length}`);

    await ana.enviar(BETO, 'después del veneno');

    let hilo = null;
    let error = '';
    try { hilo = await beto.bandeja(ANA); } catch (e) { error = e.message; }
    comprobar(!!hilo, 'la bandeja de Beto NO lanza', error);
    const textos = (hilo?.mensajes || []).map((m) => m.texto);
    comprobar(textos.includes('antes del veneno') && textos.includes('después del veneno'),
      'y se leen los mensajes buenos de antes y de después', JSON.stringify(textos));
    const cerrados = (hilo?.mensajes || []).filter((m) => m.cerrado);
    comprobar(cerrados.length === venenos.length,
      'cada envenenado queda como candado cerrado, sin texto', `${cerrados.length} cerrados`);
    comprobar(cerrados.every((m) => m.texto === ''), 'ninguno pinta basura');

    /* Y la bandeja de Ana —que también relee lo suyo— tampoco se cae. */
    let hiloA = null;
    try { hiloA = await ana.bandeja(BETO); } catch {}
    comprobar(!!hiloA && hiloA.mensajes.some((m) => m.texto === 'después del veneno'),
      'Ana tampoco pierde el hilo');
  } finally {
    relevo.cerrar();
  }
  const f = fin();
  console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
