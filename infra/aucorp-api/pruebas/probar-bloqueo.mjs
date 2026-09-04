/* El bloqueo del ecosistema, del lado de AuCorp.
 *
 *   node pruebas/probar-bloqueo.mjs
 *
 * LO QUE ESTO TAPA. Genesis ID puede bloquear a alguien en todo el ecosistema,
 * pero AuCorp no vive de ese pase: lo usa UNA vez, en /auth/sso, y después
 * emite su propia sesión. Así que un bloqueo en Genesis no tocaba nada de acá:
 * el token seguía valiendo sus 40 minutos y el refresh se canjeaba TREINTA
 * DÍAS sin volver a preguntarle nada a Genesis.
 *
 * Treinta días de acceso después de apretar «bloquear» no es un bloqueo.
 *
 * Se prueba con un Genesis fingido por HTTP, igual que el tamiz: por el mismo
 * camino que en producción y no por un atajo.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');

let bien = 0;
const malos = [];
function comprobar(cond, que, detalle) {
  if (cond) { bien += 1; console.log(`  ok    ${que}`); return; }
  malos.push(que);
  console.log(`  FALLA ${que}${detalle !== undefined ? ` → ${detalle}` : ''}`);
}
const decir = (q) => console.log(`\n· ${q}`);

// ── El Genesis fingido ──────────────────────────────────────────────────────
const estado = { bloqueados: new Set(), caido: false, llamadas: 0 };
const servidor = createServer((req, res) => {
  estado.llamadas += 1;
  if (estado.caido) { res.statusCode = 503; return res.end('{}'); }
  const m = /^\/api\/v1\/gid\/(.+)$/.exec(req.url || '');
  res.setHeader('content-type', 'application/json');
  if (!m) { res.statusCode = 404; return res.end('{}'); }
  const g = decodeURIComponent(m[1]);
  res.end(JSON.stringify({
    tipo: 'personal', gid: g,
    verificada: !estado.bloqueados.has(g),
    bloqueada: estado.bloqueados.has(g),
  }));
});
await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
process.env.GENESIS_URL = `http://127.0.0.1:${servidor.address().port}`;
process.env.GENESIS_API_KEY = 'clave-de-prueba';

const bloqueo = require('../lib/bloqueo.js');
const GID = 'GEN-AAAA-BBBB-1';

decir('lo normal');
{
  bloqueo._adentro.olvidar();
  const r = await bloqueo.puedeOperar(GID);
  comprobar(r.puede === true, 'quien no está bloqueado opera');
}

decir('bloqueado en Genesis, fuera de AuCorp');
{
  estado.bloqueados.add(GID);
  bloqueo._adentro.olvidar();
  const r = await bloqueo.puedeOperar(GID);
  comprobar(r.puede === false, 'no opera');
  comprobar(r.respuesta.codigo === 'ACCESO_BLOQUEADO', 'con su propio código', r.respuesta.codigo);
  // El mensaje es para una persona, no para un sistema: dice qué pasa y qué
  // hacer. Un «403» pelado manda a alguien a reinstalar la app.
  comprobar(/bloqueado/i.test(r.respuesta.error) && /escribinos|error/i.test(r.respuesta.error),
    'y un mensaje que una persona entiende', r.respuesta.error);
}

decir('la memoria corta');
{
  bloqueo._adentro.olvidar();
  estado.bloqueados.delete(GID);
  const antes = estado.llamadas;
  await bloqueo.puedeOperar(GID);
  await bloqueo.puedeOperar(GID);
  await bloqueo.puedeOperar(GID);
  comprobar(estado.llamadas - antes === 1,
    'tres peticiones seguidas son UNA llamada a Genesis', estado.llamadas - antes);

  // Sin memoria, cada llamada de cada persona sería una llamada a Genesis:
  // AuCorp se caería cada vez que Genesis tosa y Genesis recibiría el
  // tráfico de AuCorp entero.
  const t = Date.now() + bloqueo._adentro.MEMORIA_MS + 1000;
  const antes2 = estado.llamadas;
  await bloqueo.puedeOperar(GID, { ahora: t });
  comprobar(estado.llamadas - antes2 === 1, 'y pasado el minuto se vuelve a preguntar');
  comprobar(bloqueo._adentro.MEMORIA_MS <= 120_000,
    'la memoria es de un minuto o dos, no de horas', bloqueo._adentro.MEMORIA_MS);
}

decir('el refresh pregunta SIEMPRE');
{
  // Es lo que convierte treinta días en cuarenta minutos.
  bloqueo._adentro.olvidar();
  await bloqueo.puedeOperar(GID);          // deja algo en memoria
  estado.bloqueados.add(GID);              // se bloquea justo ahora
  const conMemoria = await bloqueo.puedeOperar(GID);
  comprobar(conMemoria.puede === true, 'con memoria fresca todavía pasa (es el precio del minuto)');
  const sinMemoria = await bloqueo.puedeOperarAhora(GID);
  comprobar(sinMemoria.puede === false, 'pero al canjear el refresh se entera en el acto');
  estado.bloqueados.delete(GID);
}

decir('si Genesis no contesta');
{
  // Ni fail-open a secas ni fail-closed a secas: las dos están mal.
  bloqueo._adentro.olvidar();
  await bloqueo.puedeOperar(GID);   // una respuesta buena guardada
  estado.caido = true;

  const pocoDespues = await bloqueo.puedeOperar(GID, { ahora: Date.now() + 61_000 });
  comprobar(pocoDespues.puede === true,
    'un tropiezo corto de Genesis NO tumba AuCorp: se usa lo último que dijo');

  const muchoDespues = await bloqueo.puedeOperar(GID, {
    ahora: Date.now() + bloqueo._adentro.VENTANA_CIEGA_MS + 1000,
  });
  comprobar(muchoDespues.puede === false,
    'pero pasada la ventana ciega se deja de operar: no se entra a ciegas para siempre');
  comprobar(muchoDespues.respuesta.codigo === 'NO_SE_PUDO_COMPROBAR',
    'y se dice que es «no se pudo comprobar», no «estás bloqueado»',
    muchoDespues.respuesta.codigo);

  // Lo último que dijo se respeta EN LOS DOS SENTIDOS: si dijo que estaba
  // bloqueado, sigue bloqueado aunque Genesis se caiga después.
  estado.caido = false;
  bloqueo._adentro.olvidar();
  estado.bloqueados.add(GID);
  await bloqueo.puedeOperar(GID);
  estado.caido = true;
  const sigue = await bloqueo.puedeOperar(GID, { ahora: Date.now() + 61_000 });
  comprobar(sigue.puede === false,
    'un bloqueado no se desbloquea porque Genesis se caiga');
  estado.caido = false;
  estado.bloqueados.delete(GID);

  // Y de quien nunca se supo nada: se deja pasar, porque para tener sesión
  // tuvo que entrar por /auth/sso hace poco y ese camino sí pasó por Genesis.
  bloqueo._adentro.olvidar();
  estado.caido = true;
  const desconocido = await bloqueo.puedeOperar('GEN-ZZZZ-ZZZZ-9');
  comprobar(desconocido.puede === true,
    'de quien nunca se supo, se deja pasar esta vez y se canta en el log');
  estado.caido = false;
}

decir('un Genesis viejo, sin el campo nuevo');
{
  // Si Genesis todavía no tiene `bloqueada`, se cae a `verificada`: para esta
  // casa, alguien que dejó de estar verificado no opera igual. De más y no de
  // menos.
  const viejo = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ tipo: 'personal', verificada: false }));
  });
  await new Promise((l) => viejo.listen(0, '127.0.0.1', l));
  const antes = process.env.GENESIS_URL;
  process.env.GENESIS_URL = `http://127.0.0.1:${viejo.address().port}`;
  bloqueo._adentro.olvidar();
  const r = await bloqueo.puedeOperar(GID);
  comprobar(r.puede === false, 'sin `bloqueada`, un `verificada:false` también cierra');
  process.env.GENESIS_URL = antes;
  viejo.close();
}

decir('está cableado donde tiene que estar');
{
  const ses = readFileSync(new URL('../middleware/sesion.js', import.meta.url), 'utf8');
  comprobar(/bloqueo\.puedeOperar\(/.test(ses), 'el middleware de sesión lo consulta');
  // DESPUÉS de comprobar la sesión: no se le pregunta a Genesis por un token
  // que ya es inválido. Y ANTES de dejar entrar.
  const iTv = ses.indexOf('usuario.tokenVersion');
  const iBloq = ses.indexOf('bloqueo.puedeOperar(');
  const iNext = ses.lastIndexOf('next()');
  comprobar(iTv > 0 && iBloq > iTv, 'después de validar la sesión, no antes');
  comprobar(iBloq < iNext, 'y antes de dejar entrar');

  const auth = readFileSync(new URL('../controllers/authController.js', import.meta.url), 'utf8');
  comprobar(/bloqueo\.puedeOperarAhora\(/.test(auth),
    'y el canje del refresh usa la versión SIN memoria');
  comprobar(!/bloqueo\.puedeOperar\(/.test(auth),
    'no la de memoria: acá es donde se alargan 30 días y hay que preguntar de verdad');
}

console.log(`\n${malos.length ? `FALLARON ${malos.length} de ${bien + malos.length}` : 'Todo en verde'}`);
servidor.close();
process.exit(malos.length ? 1 : 0);
