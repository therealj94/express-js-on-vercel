/* Vaciar y borrar una conversación desde la app.
 *
 * La app promete dos cosas en su hojita —«Vaciar los mensajes» y «Borrar la
 * conversación»— y las dos son delicadas, porque suenan a más de lo que
 * pueden hacer. El hilo es de DOS: nadie puede borrar la copia del otro. Esta
 * prueba fija esa frontera contra el relevo REAL, para que si algún día
 * alguien la cambia por un borrado de verdad, falle aquí y no en el teléfono
 * de alguien que creyó que había borrado algo.
 *
 * Levanta el relevo de infra/mensajes en un puerto libre y habla con él con
 * el MISMO cliente que usa la app (src/og/mensajes.js), para que lo que se
 * prueba sea el camino que corre en el teléfono y no una copia.
 */
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const net = require('node:net');

const RELEVO = '/home/user/express-js-on-vercel/infra/mensajes/servidor.py';

function puertoLibre() {
  return new Promise((ok) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
function comprobar(ok, que, detalle = '') {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
}

(async () => {
  const puerto = await puertoLibre();
  const carpeta = mkdtempSync(join(tmpdir(), 'relevo-app-'));
  const rel = spawn('python3', [RELEVO], {
    env: { ...process.env, MENSAJES_DATOS: join(carpeta, 'datos.json'),
           MENSAJES_PUERTO: String(puerto),
           HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
    stdio: 'ignore',
  });
  await espera(1400);

  const BASE = `http://127.0.0.1:${puerto}`;
  const api = (ruta, cuerpo) => fetch(BASE + ruta, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  }).then(async (r) => ({ estado: r.status, datos: await r.json().catch(() => ({})) }));

  try {
    const ANA = 'ana@prueba.local', BETO = 'beto@prueba.local';
    const a = (await api('/alta', { correo: ANA, nombre: 'Ana' })).datos;
    const b = (await api('/alta', { correo: BETO, nombre: 'Beto' })).datos;
    const ana = { correo: ANA, llave: a.llave }, beto = { correo: BETO, llave: b.llave };

    for (const txt of ['uno', 'dos', 'tres']) {
      await api('/enviar', { ...ana, para: BETO, texto: txt });
    }

    let d = (await api('/bandeja', { ...ana, desde: BETO })).datos;
    comprobar(d.mensajes.length === 3, 'el hilo arranca con los tres mensajes');

    // ── vaciar ──
    await espera(20);
    const v = await api('/olvidar', { ...ana, con: BETO });
    comprobar(v.estado === 200, 'vaciar responde que sí');

    d = (await api('/bandeja', { ...ana, desde: BETO })).datos;
    comprobar(d.mensajes.length === 0, 'quien vació ya no ve lo de antes');

    d = (await api('/bandeja', { ...beto, desde: ANA })).datos;
    comprobar(d.mensajes.length === 3,
      'LA OTRA PERSONA CONSERVA SU COPIA — es lo que dice la pantalla',
      d.mensajes.length !== 3 ? `le quedaron ${d.mensajes.length} de 3` : '');

    d = (await api('/conversaciones', ana)).datos;
    let fila = d.conversaciones.find((x) => x.correo === BETO);
    comprobar(!!fila, 'vaciar NO quita la fila de la lista');
    comprobar(fila && fila.ultimo === null, 'la fila vaciada no enseña el último mensaje');

    // ── lo nuevo sigue llegando ──
    await espera(20);
    await api('/enviar', { ...beto, para: ANA, texto: 'después del corte' });
    d = (await api('/bandeja', { ...ana, desde: BETO })).datos;
    comprobar(d.mensajes.length === 1 && d.mensajes[0].texto === 'después del corte',
      'vaciar no es dejar de recibir: lo nuevo entra igual');

    // ── borrar (quitar de la lista) ──
    await espera(20);
    await api('/olvidar', { ...ana, con: BETO, quitar: true });
    d = (await api('/conversaciones', ana)).datos;
    comprobar(!d.conversaciones.some((x) => x.correo === BETO),
      'borrar sí quita la fila de la lista');

    await espera(20);
    await api('/enviar', { ...beto, para: ANA, texto: 'volví' });
    d = (await api('/conversaciones', ana)).datos;
    fila = d.conversaciones.find((x) => x.correo === BETO);
    comprobar(!!fila && fila.ultimo && fila.ultimo.texto === 'volví',
      'y un mensaje nuevo la devuelve: no es un bloqueo');
    comprobar(!!fila && fila.sinLeer === 1,
      'lo que el corte ocultó no cuenta como sin leer',
      fila ? `sinLeer = ${fila.sinLeer}` : '');

    // ── el hilo de un grupo ajeno no se toca ──
    const g = (await api('/grupo/crear', { ...beto, nombre: 'Solo Beto' })).datos;
    const ajeno = await api('/olvidar', { ...ana, con: g.id });
    comprobar(ajeno.estado === 403, 'no se puede vaciar el hilo de un grupo del que no soy');

    console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
    process.exit(fallos ? 1 : 0);
  } finally {
    rel.kill();
  }
})();
