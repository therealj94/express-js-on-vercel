#!/usr/bin/env node
/**
 * EL OJO: QUE MIRE DE VERDAD, Y QUE NO MIRE HACIA ADENTRO.
 *
 * Dos clases de prueba, y la segunda importa más que la primera.
 *
 * QUE MIRE. Se levanta una casa de mentira que se dibuja con JavaScript —el
 * HTML llega vacío y el texto aparece después— porque ése es exactamente el
 * caso por el que existe el ojo: `fetch` ve la cáscara y el navegador ve la
 * pantalla. Si la prueba usara una página de HTML plano, pasaría en verde con
 * el ojo apagado y no estaría probando nada.
 *
 * QUE NO MIRE HACIA ADENTRO. Un navegador dentro de un servidor puede pedir lo
 * que solo el servidor alcanza: la red privada y, sobre todo,
 * 169.254.169.254, que es donde la nube guarda las credenciales de la máquina.
 * Eso no es una prueba de estilo: es la diferencia entre un ojo y una puerta
 * abierta a la casa. Se comprueban las dos cerraduras — la de la dirección que
 * entra por el API y la que vive dentro del navegador, que es la que atrapa
 * una redirección.
 *
 *     node pruebas/probar-ojo.mjs
 */
import { createServer } from 'node:http';
import { once } from 'node:events';

/* La clave ANTES de importar. `app.js` la lee al cargarse —a propósito: un ojo
   sin clave no puede existir ni un instante— así que ponerla después no sirve
   de nada. Esto costó una tanda entera en rojo. */
process.env.OJO_CLAVE = 'clave-de-prueba-que-no-vale-nada';
const { app, direccionValida, VERBOS, PROHIBIDO } = await import('../app.js').then((m) => m.default || m);

let fallos = 0;
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);
const decir = (ok, q, d) => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${q}${d ? `\n           ${d}` : ''}`); if (!ok) fallos++; };

// ── La casa de mentira: HTML vacío que se llena con JavaScript ───────────────
const CASA_JS = `<!doctype html><title>Cargando…</title><body><div id="lienzo"></div>
<script>
  setTimeout(() => {
    document.title = 'Mercado de mentira';
    document.getElementById('lienzo').innerHTML =
      '<h1>ORIGEN</h1><p>Precio 24,85 HNL</p>' +
      '<input id="clave" type="password" placeholder="Su clave">' +
      '<button id="entrar">ENTRAR</button>' +
      '<div id="adentro" style="display:none">Ya está adentro, Jos&eacute;.</div>';
    document.getElementById('entrar').onclick = () => {
      document.getElementById('adentro').style.display = 'block';
    };
  }, 120);
</script></body>`;

/* CON `charset=utf-8` Y NO SOLO `text/html`. Sin el charset el navegador
   decide solo, y decide latin-1: «Ya está adentro» llegaba como «Ya estÃ¡
   adentro» y la prueba se ponía roja culpando al ojo, que estaba bien. Es el
   mismo bicho que rompe una pantalla de verdad, así que la prueba lo arregla
   como se arregla en producción. */
const casa = createServer((req, res) => {
  if (req.url === '/lento') { setTimeout(() => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(CASA_JS); }, 300); return; }
  if (req.url === '/a-la-nube') { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); return; }
  if (req.url === '/roba') {
    /* Una página que parece normal y por dentro pide la dirección de la nube.
       Es el ataque de verdad: la primera cerradura no lo ve, porque la
       dirección que se pidió era ésta y era legítima. */
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>Normal</title><body><h1>Nada raro</h1>
      <script>fetch('http://169.254.169.254/latest/meta-data/').then(r=>r.text())
        .then(t=>{document.body.innerHTML+='<div id="robado">'+t+'</div>'})
        .catch(e=>{document.body.innerHTML+='<div id="bloqueado">bloqueado</div>'})</script></body>`);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(CASA_JS);
});
casa.listen(0, '127.0.0.1');
await once(casa, 'listening');
const PUERTO_CASA = casa.address().port;
const CASA = `http://127.0.0.1:${PUERTO_CASA}`;

// ── El ojo ──────────────────────────────────────────────────────────────────
const ojo = app.listen(0, '127.0.0.1');
await once(ojo, 'listening');
const OJO = `http://127.0.0.1:${ojo.address().port}`;

const pedir = (ruta, cuerpo, clave = process.env.OJO_CLAVE) => fetch(`${OJO}${ruta}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Ojo-Clave': clave },
  body: JSON.stringify(cuerpo),
}).then(async (r) => ({ estado: r.status, json: await r.json().catch(() => null) }));

/* La casa de mentira vive en 127.0.0.1, que es justo lo que el ojo bloquea, y
   con razón. Para poder probarlo se le abre la mano SOLO a este puerto, del
   mismo modo que una prueba de cerradura necesita una llave. Todo lo demás de
   adentro sigue cerrado, y eso es lo que se comprueba abajo. */
let abrirLoopback = () => {
  const l = PROHIBIDO.filter((p) => p.test('127.0.0.1'));
  for (const p of l) PROHIBIDO.splice(PROHIBIDO.indexOf(p), 1);
};

// ── 1 · la puerta ───────────────────────────────────────────────────────────
titulo('la puerta del ojo');
{
  const sin = await fetch(`${OJO}/mirar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  decir(sin.status === 403, 'sin la clave no se mira nada', `contestó ${sin.status}`);
  const mala = await pedir('/mirar', { url: CASA }, 'otra-clave-cualquiera-distinta');
  decir(mala.estado === 403, 'y con una clave equivocada tampoco');
  const salud = await fetch(`${OJO}/salud`).then((r) => r.json());
  decir(salud.ok === true && salud.conClave === true, '/salud contesta sin clave: es lo que mira el vigía', `memoria ${salud.memoriaMb} MB`);
}

// ── 2 · que no mire hacia adentro ───────────────────────────────────────────
titulo('ni una dirección de adentro');
{
  for (const mala of ['http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://metadata.google.internal/']) {
    const v = direccionValida(mala);
    decir(!v.ok, `bloqueada: ${mala.slice(0, 42)}`);
  }
  decir(!direccionValida('file:///etc/passwd').ok, 'y file:// tampoco: solo http y https');
  const r = await pedir('/mirar', { url: 'http://169.254.169.254/latest/meta-data/' });
  decir(r.estado === 400, 'el API la rechaza antes de abrir el navegador', `contestó ${r.estado}`);
}

// A partir de aquí la casa de mentira vive en 127.0.0.1 y hay que poder
// alcanzarla. Se abre la mano SOLO al loopback, y ya después de haber
// comprobado arriba que el bloqueo funciona.
abrirLoopback();

// ── 3 · mirar una casa que se dibuja con JavaScript ─────────────────────────
titulo('mirar una página que se arma en el navegador');
{
  const crudo = await fetch(CASA).then((r) => r.text());
  const sinJs = crudo.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  decir(sinJs.length < 30, 'por fetch esa página no dice NADA: es el caso por el que existe el ojo', `${sinJs.length} caracteres`);

  const r = await pedir('/mirar', { url: CASA, esperar: '#entrar' });
  decir(r.estado === 200 && r.json?.ok, 'el ojo la abre', r.json?.error || '');
  decir(/ORIGEN/.test(r.json?.texto || ''), 'y SÍ ve lo que el JavaScript dibujó', (r.json?.texto || '').slice(0, 60));
  decir(r.json?.titulo === 'Mercado de mentira', 'con el título que puso el JavaScript, no el del HTML', r.json?.titulo);
  decir((r.json?.titulares || []).includes('ORIGEN'), 'saca los titulares');
  decir((r.json?.botones || []).some((b) => /ENTRAR/i.test(b.rotulo)), 'y lo que se puede TOCAR, con su selector — sin eso no se puede escribir el paso siguiente');
  decir((r.json?.campos || []).some((c) => c.tipo === 'password'), 'y los campos, el de la clave incluido');
}

// ── 4 · la segunda cerradura: la que atrapa la redirección ──────────────────
titulo('la cerradura de adentro del navegador');
{
  const r = await pedir('/mirar', { url: `${CASA}/a-la-nube` });
  const texto = JSON.stringify(r.json || {});
  decir(!/ami-id|instance-id|security-credentials/.test(texto),
    'una página que REDIRIGE a la dirección de la nube no se llega a abrir',
    'la primera cerradura no la ve: la dirección pedida era legítima');
  const r2 = await pedir('/mirar', { url: `${CASA}/roba`, esperar: 'body' });
  decir(r2.estado === 200, 'una página que por dentro PIDE la dirección de la nube sí se abre…');
  decir(!/robado/.test(r2.json?.texto || ''), '…pero esa petición suya se corta', (r2.json?.texto || '').slice(0, 60));
}

// ── 5 · el guion: entrar de verdad ──────────────────────────────────────────
titulo('el guion — escribir, tocar, leer');
{
  const r = await pedir('/guion', { pasos: [
    { tipo: 'ir', url: CASA, esperar: '#entrar' },
    { tipo: 'escribir', selector: '#clave', secreto: 'ESTA-CLAVE-NO-DEBE-SALIR-NUNCA' },
    { tipo: 'tocar', selector: '#entrar' },
    { tipo: 'esperar', ms: 200 },
    { tipo: 'leer' },
  ] });
  decir(r.estado === 200 && r.json?.ok, 'el guion corre entero', JSON.stringify(r.json?.diario?.filter((d) => !d.ok) || []).slice(0, 160));
  decir(/Ya está adentro/.test(r.json?.texto || ''), 'y el tocar cambió la pantalla de verdad');

  /* LA PRUEBA QUE MÁS IMPORTA DE TODO EL ARCHIVO. Un guion lleva claves, y una
     clave que se cuela en un diario o en una respuesta ya está filtrada:
     ULTRON la guardaría en la conversación, y la conversación se lee. */
  const todo = JSON.stringify(r.json);
  decir(!todo.includes('ESTA-CLAVE-NO-DEBE-SALIR-NUNCA'), 'y el secreto NO sale por ningún lado de la respuesta');
  decir(/\(un secreto\)/.test(todo), 'en el diario dice «(un secreto)» en su lugar');

  const malo = await pedir('/guion', { pasos: [{ tipo: 'evaluar', codigo: 'process.exit(1)' }] });
  decir(malo.estado === 400, 'un verbo que no existe se rechaza: el ojo no corre código suelto');
  decir(!VERBOS.has('evaluar'), 'y «evaluar» no está en el idioma a propósito', [...VERBOS].join(', '));

  const corta = await pedir('/guion', { pasos: [
    { tipo: 'ir', url: CASA },
    { tipo: 'tocar', selector: '#no-existe-este-boton' },
    { tipo: 'leer' },
  ] });
  decir(corta.json?.ok === false, 'un paso que falla corta el guion');
  decir((corta.json?.diario || []).length === 2, 'y NO sigue tocando a ciegas los pasos de después', `${(corta.json?.diario || []).length} pasos hechos`);
}

// ── 6 · la foto ─────────────────────────────────────────────────────────────
titulo('la foto');
{
  const r = await pedir('/foto', { url: CASA, esperar: '#entrar' });
  decir(r.estado === 200 && r.json?.png, 'saca la foto');
  const png = Buffer.from(r.json?.png || '', 'base64');
  decir(png[0] === 0x89 && png.slice(1, 4).toString() === 'PNG', 'y es un PNG de verdad', `${png.length.toLocaleString('es-HN')} bytes`);
}

ojo.close(); casa.close();
console.log(fallos ? `\n${fallos} en rojo.\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
