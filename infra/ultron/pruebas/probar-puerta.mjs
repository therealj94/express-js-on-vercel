/* LA PUERTA Y LAS RUTAS, contra el servidor de verdad en un puerto libre.
 *
 *   node infra/ultron/pruebas/probar-puerta.mjs
 *
 * Lo que se castiga es lo que deja pasar a quien no debe o manda lo que no
 * debe: sin junta no entra NADIE; sin sesión no se lee nada; un envío a
 * alguien de fuera de la junta se rechaza en el servidor aunque el navegador
 * lo pida bien; la entrada de WhatsApp sin el secreto de AU-RA no contesta.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).replace(/\s+/g, ' ').slice(0, 200) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

globalThis.fetchReal = globalThis.fetch;
delete process.env.MONGODB_URI;
delete process.env.ANTHROPIC_API_KEY;
process.env.ULTRON_SECRETO = 'secreto-de-prueba';
process.env.ULTRON_SECRETO_AURA = 'aura-y-ultron';

async function levantar(junta) {
  if (junta === undefined) delete process.env.ULTRON_JUNTA; else process.env.ULTRON_JUNTA = junta;
  delete require.cache[require.resolve('../app.js')];
  const { app } = require('../app.js');
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${sv.address().port}`;
  const pedir = async (ruta, { metodo = 'GET', cuerpo, cookie, cabeceras = {} } = {}) => {
    const r = await globalThis.fetchReal(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...cabeceras }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, redirect: 'manual' });
    const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch {}
    return { http: r.status, json, texto, setCookie: r.headers.get('set-cookie') || '' };
  };
  return { sv, pedir, cerrar: () => new Promise((ok) => sv.close(ok)) };
}

titulo('sin junta no entra nadie');
{
  const s = await levantar(undefined);
  const salud = await s.pedir('/salud');
  decir(salud.http === 200 && salud.json.junta === 0, '/salud dice que la junta es 0', JSON.stringify(salud.json));
  const e = await s.pedir('/entrar', { metodo: 'POST', cuerpo: { correo: 'a@b.c', clave: 'x' } });
  decir(e.http === 503 && e.json.codigo === 'SIN_JUNTA', 'entrar → 503 SIN_JUNTA, no 401: se dice que no hay junta configurada', `${e.http} ${e.json?.codigo}`);
  const yo = await s.pedir('/yo');
  decir(yo.http === 503, '/yo → 503 también');
  await s.cerrar();
}
{
  const s = await levantar('esto no es json');
  const e = await s.pedir('/entrar', { metodo: 'POST', cuerpo: { correo: 'a@b.c', clave: 'x' } });
  decir(e.http === 503, 'con ULTRON_JUNTA mal escrita tampoco entra nadie (no se cae a «sin puerta»)');
  await s.cerrar();
}

const JUNTA = JSON.stringify([
  { nombre: 'José', correo: 'Jose@OrdenGlobal.org', clave: 'clave-jose', rol: 'presidente', whatsapp: '+504 9999-0000' },
  { nombre: 'Mayra', correo: 'mayra@ordenglobal.org', clave: 'clave-mayra' },
]);

titulo('la puerta');
const s = await levantar(JUNTA);
{
  const mal = await s.pedir('/entrar', { metodo: 'POST', cuerpo: { correo: 'jose@ordenglobal.org', clave: 'otra' } });
  decir(mal.http === 401 && !mal.setCookie, 'clave mala → 401 y sin cookie');
  const nadie = await s.pedir('/entrar', { metodo: 'POST', cuerpo: { correo: 'nadie@x.hn', clave: 'clave-jose' } });
  decir(nadie.http === 401 && nadie.json.error === mal.json.error, 'un correo que no existe da EL MISMO mensaje: no se regala la lista');
  const bien = await s.pedir('/entrar', { metodo: 'POST', cuerpo: { correo: 'JOSE@ordenglobal.org ', clave: 'clave-jose' } });
  decir(bien.http === 200 && bien.json.miembro.nombre === 'José', 'con la clave buena entra (el correo sin importar mayúsculas ni espacios)');
  decir(!('clave' in bien.json.miembro), 'y la respuesta NO trae la clave');
  decir(/HttpOnly/i.test(bien.setCookie) && /SameSite=Strict/i.test(bien.setCookie), 'la cookie es HttpOnly y SameSite=Strict', bien.setCookie.slice(0, 80));
  globalThis.cookieJose = bien.setCookie.split(';')[0];
  const yo = await s.pedir('/yo', { cookie: cookieJose });
  decir(yo.http === 200 && yo.json.miembro.correo === 'jose@ordenglobal.org', '/yo con la cookie devuelve al miembro');
  decir(yo.json.junta.every((m) => !('clave' in m)), 'y la lista de la junta va sin claves');
  decir(yo.json.cerebro === false, 'y dice que el cerebro está apagado (sin ANTHROPIC_API_KEY en la prueba)');
}
{
  const sin = await s.pedir('/memorias');
  decir(sin.http === 401, 'sin cookie → 401');
  const rota = await s.pedir('/memorias', { cookie: 'ultron=abc.def' });
  decir(rota.http === 401, 'una cookie inventada → 401');
  // una firmada con OTRO secreto
  const { createHmac } = await import('node:crypto');
  const cuerpo = `jose@ordenglobal.org|${Date.now() + 100000}`;
  const falsa = `${Buffer.from(cuerpo).toString('base64url')}.${createHmac('sha256', 'otro-secreto').update(cuerpo).digest('base64url')}`;
  const f = await s.pedir('/memorias', { cookie: 'ultron=' + falsa });
  decir(f.http === 401, 'una cookie firmada con otro secreto → 401');
  const vencidaC = `jose@ordenglobal.org|${Date.now() - 1000}`;
  const vencida = `${Buffer.from(vencidaC).toString('base64url')}.${createHmac('sha256', 'secreto-de-prueba').update(vencidaC).digest('base64url')}`;
  const v = await s.pedir('/memorias', { cookie: 'ultron=' + vencida });
  decir(v.http === 401, 'una cookie vencida → 401');
}

titulo('pensar sin cerebro');
{
  const p = await s.pedir('/pensar', { metodo: 'POST', cookie: cookieJose, cuerpo: { texto: 'hola' } });
  decir(p.http === 503 && p.json.codigo === 'CEREBRO_APAGADO', 'sin ANTHROPIC_API_KEY → 503 CEREBRO_APAGADO, dicho claro', `${p.http} ${p.json?.error}`);
  const vacio = await s.pedir('/pensar', { metodo: 'POST', cookie: cookieJose, cuerpo: { texto: '   ' } });
  decir(vacio.http === 400, 'texto vacío → 400');
}

titulo('la memoria por el API');
{
  const m = await s.pedir('/memorias', { metodo: 'POST', cookie: cookieJose, cuerpo: { texto: 'La junta se reúne los martes', alcance: 'junta' } });
  decir(m.http === 200 && m.json.alcance === 'junta', 'se guarda una memoria de la junta');
  const mia = await s.pedir('/memorias', { metodo: 'POST', cookie: cookieJose, cuerpo: { texto: 'Prefiero lempiras', alcance: 'miembro' } });
  decir(mia.http === 200 && mia.json.miembro === 'jose@ordenglobal.org', 'y una del miembro');
  // Mayra entra y mira
  const em = await s.pedir('/entrar', { metodo: 'POST', cuerpo: { correo: 'mayra@ordenglobal.org', clave: 'clave-mayra' } });
  const cookieMayra = em.setCookie.split(';')[0];
  const lm = await s.pedir('/memorias', { cookie: cookieMayra });
  decir(lm.json.some((x) => /martes/.test(x.texto)) && !lm.json.some((x) => /lempiras/.test(x.texto)), 'Mayra ve la de la junta y NO la de José');
  const borrar = await s.pedir('/memorias/' + mia.json._id, { metodo: 'DELETE', cookie: cookieMayra });
  decir(borrar.json.ok === false, 'y Mayra no puede olvidar la de José');
  const borrarBien = await s.pedir('/memorias/' + mia.json._id, { metodo: 'DELETE', cookie: cookieJose });
  decir(borrarBien.json.ok === true, 'José sí');
}

titulo('enviar: el servidor vuelve a mirar el destino');
{
  const fuera = await s.pedir('/enviar', { metodo: 'POST', cookie: cookieJose, cuerpo: { envio: { canal: 'correo', a: { correo: 'pepe@fuera.com' }, texto: 'hola' } } });
  decir(fuera.http === 400 && fuera.json.codigo === 'DESTINO_INVALIDO', 'a alguien de fuera de la junta → 400, aunque el navegador lo pida', `${fuera.http} ${fuera.json?.codigo}`);
  const canal = await s.pedir('/enviar', { metodo: 'POST', cookie: cookieJose, cuerpo: { envio: { canal: 'paloma', a: { correo: 'mayra@ordenglobal.org' }, texto: 'hola' } } });
  decir(canal.http === 400, 'un canal inventado → 400');
  const wa = await s.pedir('/enviar', { metodo: 'POST', cookie: cookieJose, cuerpo: { envio: { canal: 'whatsapp', a: { correo: 'jose@ordenglobal.org' }, texto: 'hola' } } });
  decir(wa.http === 503 && wa.json.codigo === 'CANAL_APAGADO', 'WhatsApp sin ZERNIO configurado → 503 CANAL_APAGADO, no un 200 fingido', `${wa.http} ${wa.json?.codigo}`);
}

titulo('la entrada de WhatsApp (lo que AU-RA reenvía)');
{
  const sinSecreto = await s.pedir('/whatsapp/entrada', { metodo: 'POST', cuerpo: { de: '50499990000', texto: 'hola' } });
  decir(sinSecreto.http === 401, 'sin el secreto → 401');
  const malSecreto = await s.pedir('/whatsapp/entrada', { metodo: 'POST', cabeceras: { 'x-ultron-secreto': 'otro' }, cuerpo: { de: '50499990000', texto: 'hola' } });
  decir(malSecreto.http === 401, 'con otro secreto → 401');
  const noJunta = await s.pedir('/whatsapp/entrada', { metodo: 'POST', cabeceras: { 'x-ultron-secreto': 'aura-y-ultron' }, cuerpo: { de: '50411112222', texto: 'hola' } });
  decir(noJunta.http === 403 && noJunta.json.codigo === 'NO_ES_JUNTA', 'un número que no es de la junta → 403: AU-RA lo atiende ella');
  const junta = await s.pedir('/whatsapp/entrada', { metodo: 'POST', cabeceras: { 'x-ultron-secreto': 'aura-y-ultron' }, cuerpo: { de: '+504 9999 0000', texto: 'hola' } });
  decir(junta.http === 503 && junta.json.codigo === 'CEREBRO_APAGADO', 'el número de José pasa (con espacios y +), y se estrella solo en el cerebro apagado', `${junta.http} ${junta.json?.codigo}`);
}

titulo('los documentos');
{
  const memoria = require('../lib/memoria.js');
  const d = await memoria.guardarDocumento({ titulo: 'Acta de prueba · Ñandú', tipo: 'acta', markdown: '# Acta\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>', miembro: 'jose@ordenglobal.org' });
  const l = await s.pedir('/documentos', { cookie: cookieJose });
  decir(l.json.some((x) => x.titulo === 'Acta de prueba · Ñandú'), 'aparece en la biblioteca');
  const md = await s.pedir(`/documentos/${d._id}/descargar?formato=md`, { cookie: cookieJose });
  decir(md.http === 200 && /^# Acta/.test(md.texto), 'se baja como .md');
  const html = await s.pedir(`/documentos/${d._id}/descargar?formato=html`, { cookie: cookieJose });
  decir(html.http === 200 && /<table>/.test(html.texto) && !/<script>alert/.test(html.texto) && /&lt;script&gt;/.test(html.texto),
    'y como .html: la tabla se pinta y el <script> del texto se escapa, no se ejecuta');
  const sin = await s.pedir(`/documentos/${d._id}/descargar`);
  decir(sin.http === 401, 'sin sesión no se baja nada');
}

titulo('el saludo: por su nombre, con la hora y con lo que hay');
{
  const r = await s.pedir('/saludo', { cookie: cookieJose });
  decir(r.http === 200 && /^Buen(os|as) (días|tardes|noches), José\./.test(r.json.texto), 'saluda por el nombre de pila según la hora de Honduras', r.json.texto);
  decir(/pendiente/.test(r.json.texto) && /Quedo a su disposición\.$/.test(r.json.texto), 'dice cuántos pendientes hay y cede la palabra, en registro institucional', r.json.texto);
  decir(/no contesta/.test(r.json.texto), 'y sin red, dice qué casa no contesta en vez de callarlo', r.json.texto);
  const sin = await s.pedir('/saludo');
  decir(sin.http === 401, 'sin sesión no hay saludo');
}

titulo('los instrumentos, a mano: el mismo camino que usa ULTRON');
{
  const cat = await s.pedir('/herramientas', { cookie: cookieJose });
  decir(cat.http === 200 && cat.json.herramientas.length >= 27, `el catálogo trae ${cat.json.herramientas.length} instrumentos con su grupo`, JSON.stringify(cat.json).slice(0, 120));
  decir(cat.json.herramientas.every((h) => h.nombre && h.descripcion && h.grupo && h.entrada), 'y cada uno lleva nombre, descripción, grupo y esquema de entrada');
  decir(cat.json.herramientas.filter((h) => h.escribe).map((h) => h.nombre).sort().join(',') === 'anotar_pendiente,cerrar_pendiente,crear_documento,olvidar,proponer_envio,recordar', 'los que escriben van marcados, y son exactamente esos');
  const c = await s.pedir('/herramientas/calcular', { cookie: cookieJose, metodo: 'POST', cuerpo: { entrada: { expresion: '4467.53 / 31.1035 / 55' } } });
  decir(c.http === 200 && /= 2\.6115/.test(c.json.salida) && typeof c.json.ms === 'number', 'calcular corre a mano y devuelve el gramín con lo que tardó', JSON.stringify(c.json).slice(0, 120));
  const a = await s.pedir('/herramientas/abrir', { cookie: cookieJose, metodo: 'POST', cuerpo: { entrada: { que: 'ordenex' } } });
  decir(a.http === 200 && a.json.acciones?.[0]?.url === 'https://ordenexchange.link/', 'abrir devuelve la acción para que la persona la toque, no abre nada');
  const no = await s.pedir('/herramientas/mover_dinero', { cookie: cookieJose, metodo: 'POST', cuerpo: { entrada: {} } });
  decir(no.http === 404, 'un instrumento que no existe es 404: no se inventa');
  const sin = await s.pedir('/herramientas', {});
  decir(sin.http === 401, 'y sin sesión no hay catálogo');
}

titulo('buscar en internet un nombre de la casa: la consulta se afina sola');
{
  const { afinarConsulta } = (await import('../lib/herramientas.js')).default._adentro;
  const casos = [
    ['Orden Global', 'ordenglobal.org', 'el nombre pelado se busca con el sitio puesto'],
    ['información sobre Orden Global', 'ordenglobal.org', 'y el relleno de la pregunta no cuenta como pregunta'],
    ['ordenex', 'ordenexchange.link', 'lo mismo con Ordenex'],
    ['Veta Wallet', 'Veta Wallet', 'y con Veta Wallet'],
  ];
  for (const [q, esperado, que] of casos) {
    const r = afinarConsulta(q);
    decir(!!r && r.includes(esperado), que, `${q} → ${r}`);
  }
  const propias = ['Orden Global demanda 2026', 'precio del oro hoy', 'ordenex hackeo octubre', 'ley fintech Honduras'];
  for (const q of propias) decir(afinarConsulta(q) === null, `«${q}» se manda tal cual: es una pregunta, no un nombre`, String(afinarConsulta(q)));
}

await s.cerrar();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
