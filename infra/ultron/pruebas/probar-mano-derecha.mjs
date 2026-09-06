/* LA MANO DERECHA · que ULTRON tenga manos y que el dueño tenga la llave.
 *
 *   node infra/ultron/pruebas/probar-mano-derecha.mjs
 *
 * Lo que se comprueba, sin red, sin Mongo y sin ningún modelo:
 *   1. PERMISOS: leer pasa; escribir pasa a la junta y solo memoria/pendiente a
 *      un bot; lo peligroso NO corre hasta que el dueño aprueba, y una
 *      aprobación vale para ESA huella, una vez, media hora.
 *   2. LA PUERTA EN LAS HERRAMIENTAS: pedir `terminal` sin aprobación crea el
 *      pedido y no ejecuta nada; con la aprobación, corre; un bot no puede.
 *   3. LA BÓVEDA: cifra y descifra; nunca devuelve el valor; aplica en Heroku
 *      sin que el valor pase por el modelo; apagada sin llave.
 *   4. EL TALLER: la terminal corre sin variables de la casa; proponer un
 *      cambio va a una rama ultron/… y nunca a la principal (GitHub falso).
 *   5. APRENDER: lecciones aparte de las memorias; habilidades de fábrica se
 *      leen; una aprendida sustituye a una de fábrica con el mismo nombre.
 *   6. EL EQUIPO: los bots se leen del disco; correr uno con un cerebro falso
 *      deja un parte; el tope diario corta; un bot no ve herramientas ajenas.
 *   7. LAS RUTAS: /autorizaciones las aprueba solo el dueño; /boveda igual.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let malas = 0;
const decir = (ok, que, extra = '') => { if (!ok) malas++; console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`); if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 170)}`); };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 56 - t.length))}`);

delete process.env.MONGODB_URI; delete process.env.ANTHROPIC_API_KEY; delete process.env.ULTRON_NODO_URL;
delete process.env.GITHUB_TOKEN; delete process.env.HEROKU_API_KEY; delete process.env.ULTRON_EQUIPO;
process.env.ULTRON_SECRETO = 'p';
process.env.ULTRON_JUNTA = JSON.stringify([
  { nombre: 'José Enamorado', correo: 'jose@ordenglobal.org', clave: 'clave-jose', rol: 'presidente' },
  { nombre: 'Melany', correo: 'melany@ordenglobal.org', clave: 'clave-melany', rol: 'junta directiva' },
]);
process.env.ULTRON_BOVEDA_LLAVE = 'a'.repeat(64);   // 32 bytes en hex, solo para la prueba
process.env.UN_SECRETO_DE_LA_CASA = 'esto-no-debe-verse-en-la-terminal';

const fetchReal = globalThis.fetch;
const llamadasFuera = [];
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  if (url.startsWith('http://127.0.0.1')) return fetchReal(u, o);
  llamadasFuera.push({ url, metodo: o.method || 'GET', cuerpo: o.body ? String(o.body) : '' });
  // GitHub falso: lo justo para proponer un cambio.
  if (url.includes('api.github.com')) {
    const j = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
    if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return j({ default_branch: 'main' });
    if (url.includes('/git/ref/heads/')) return j({ object: { sha: 'abc123' } });
    if (url.includes('/git/refs')) return j({ ref: 'ok' }, 201);
    if (url.includes('/contents/') && (o.method || 'GET') === 'GET') return j({ message: 'Not Found' }, 404);
    if (url.includes('/contents/') && o.method === 'PUT') return j({ content: { path: 'x' } }, 201);
    if (url.includes('/pulls')) return j({ html_url: 'https://github.com/x/y/pull/7', number: 7 }, 201);
    return j({ message: 'ruta falsa sin respuesta' }, 500);
  }
  if (url.includes('api.heroku.com')) return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  throw new Error('sin red: ' + url);
};

const permisos = require('../lib/permisos.js');
const boveda = require('../lib/boveda.js');
const taller = require('../lib/taller.js');
const aprender = require('../lib/aprender.js');
const equipo = require('../lib/equipo.js');
const herramientas = require('../lib/herramientas.js');
const JUNTA = JSON.parse(process.env.ULTRON_JUNTA);
const jose = JUNTA[0], melany = JUNTA[1];
const bot = { correo: 'bot:centinela', nombre: 'centinela', rol: 'bot', herramientas: ['estado_vivo'] };

// ── 1 · permisos ─────────────────────────────────────────────────────────────
titulo('permisos: quién puede qué');
decir(permisos.dueñoDe(JUNTA) === 'jose@ordenglobal.org', 'el dueño es el presidente cuando no hay ULTRON_DUENO');
decir(permisos.rolDe(jose, JUNTA) === 'dueño' && permisos.rolDe(melany, JUNTA) === 'junta' && permisos.rolDe(bot, JUNTA) === 'bot', 'tres roles: dueño, junta, bot');
decir(permisos.puede(melany, 'estado_vivo', JUNTA).ok, 'la junta lee');
decir(permisos.puede(melany, 'recordar', JUNTA).ok, 'la junta escribe');
decir(!permisos.puede(melany, 'terminal', JUNTA).ok && permisos.puede(melany, 'terminal', JUNTA).autorizable, 'lo peligroso no pasa solo, pero es autorizable');
decir(!permisos.puede(jose, 'terminal', JUNTA).ok, 'NI PARA EL DUEÑO: el clic en el panel es la segunda firma');
decir(permisos.puede(bot, 'anotar_pendiente', JUNTA).ok && !permisos.puede(bot, 'crear_documento', JUNTA).ok && !permisos.puede(bot, 'terminal', JUNTA).autorizable,
  'un bot anota pendientes, no escribe documentos y lo peligroso no es autorizable');
decir(permisos.huellaDe('terminal', { comando: 'ls', a: 1 }) === permisos.huellaDe('terminal', { a: 1, comando: 'ls' }), 'la huella no depende del orden de las claves');
decir(permisos.huellaDe('terminal', { comando: 'ls' }) !== permisos.huellaDe('terminal', { comando: 'rm -rf /' }), 'y aprobar «ls» no aprueba «rm -rf /»');
{
  const p = await permisos.pedir({ actor: jose, herramienta: 'terminal', entrada: { comando: 'echo hola' }, motivo: 'probar' });
  const p2 = await permisos.pedir({ actor: jose, herramienta: 'terminal', entrada: { comando: 'echo hola' } });
  decir(p.estado === 'pendiente' && String(p2._id) === String(p._id) && p2.repetido, 'pedir dos veces lo mismo es UN pedido');
  decir(!(await permisos.consumirAprobacion('terminal', { comando: 'echo hola' })), 'sin aprobar, no hay nada que consumir');
  const r = await permisos.resolver(p._id, { por: jose.correo, decision: 'aprobado' });
  decir(r.estado === 'aprobado' && r.venceEn, 'el dueño aprueba y la aprobación vence');
  const c1 = await permisos.consumirAprobacion('terminal', { comando: 'echo hola' });
  const c2 = await permisos.consumirAprobacion('terminal', { comando: 'echo hola' });
  decir(c1 && c1.estado === 'usado' && !c2, 'una aprobación se usa UNA vez');
  const q = await permisos.pedir({ actor: jose, herramienta: 'terminal', entrada: { comando: 'echo viejo' } });
  await permisos.resolver(q._id, { por: jose.correo, decision: 'aprobado' });
  q.venceEn = new Date(Date.now() - 1000);
  decir(!(await permisos.consumirAprobacion('terminal', { comando: 'echo viejo' })), 'y vencida no vale');
  const n = await permisos.pedir({ actor: melany, herramienta: 'desplegarse', entrada: { rama: 'x' } });
  const neg = await permisos.resolver(n._id, { por: jose.correo, decision: 'negado' });
  decir(neg.estado === 'negado' && !(await permisos.consumirAprobacion('desplegarse', { rama: 'x' })), 'negado es negado');
  let e = null; try { await permisos.resolver(n._id, { por: jose.correo, decision: 'quizás' }); } catch (x) { e = x; }
  decir(e?.codigo === 'DECISION', 'la decisión es aprobado o negado, nada más');
}

// ── 2 · la puerta dentro de las herramientas ─────────────────────────────────
titulo('la puerta en cada herramienta');
{
  const ctx = (m) => ({ miembro: m, junta: JUNTA, fuentes: [], memorias: [], documentos: [], envios: [], pendientes: [], acciones: [] });
  const c1 = ctx(jose);
  const r1 = await herramientas.correr('terminal', { comando: 'echo NO-DEBE-CORRER', motivo: 'ver' }, c1);
  decir(/ESPERANDO AUTORIZACIÓN/.test(r1) && !/NO-DEBE-CORRER\n/.test(r1), 'terminal sin aprobación: crea el pedido y NO ejecuta', r1);
  decir(c1.acciones.some((a) => a.tipo === 'autorizacion'), 'y la acción queda registrada para el panel');
  const pend = await permisos.pendientes();
  const mio = pend.find((p) => p.herramienta === 'terminal' && p.entrada.comando === 'echo NO-DEBE-CORRER');
  decir(!!mio && mio.motivo === 'ver', 'el pedido lleva el motivo que dio ULTRON, sin el motivo dentro de la entrada', JSON.stringify(mio?.entrada));
  await permisos.resolver(mio._id, { por: jose.correo, decision: 'aprobado' });
  const r2 = await herramientas.correr('terminal', { comando: 'echo NO-DEBE-CORRER', motivo: 'ver' }, ctx(jose));
  decir(/NO-DEBE-CORRER/.test(r2) && /salió con 0/.test(r2), 'con la aprobación, corre', r2);
  const r3 = await herramientas.correr('terminal', { comando: 'echo otra' }, ctx(bot));
  decir(/No se puede/.test(r3), 'un bot no puede ni pedirlo', r3);
  const r4 = await herramientas.correr('cadena_altura', {}, ctx(bot));
  decir(/no tiene la herramienta/.test(r4), 'y un bot no ve una herramienta fuera de su encabezado', r4);
  decir(herramientas.definicionesPara(bot).map((d) => d.name).includes('estado_vivo') && !herramientas.definicionesPara(bot).map((d) => d.name).includes('terminal'), 'las definiciones que ve un bot son las suyas');
}

// ── 3 · la bóveda ────────────────────────────────────────────────────────────
titulo('la bóveda');
{
  decir(boveda.encendida(), 'con llave, encendida');
  const c = boveda._adentro.cifrar('hola bóveda');
  decir(boveda._adentro.descifrar(c) === 'hola bóveda' && c.cifrado !== 'hola bóveda', 'cifra y descifra');
  c.cifrado = Buffer.from(Buffer.from(c.cifrado, 'base64').map((b, i) => (i === 0 ? b ^ 1 : b))).toString('base64');
  let e = null; try { boveda._adentro.descifrar(c); } catch (x) { e = x; }
  decir(!!e, 'un byte cambiado se nota (GCM)');
  const s = await boveda.guardar({ nombre: 'mongo password', valor: 'S3cr3t0-largo-de-verdad-32-caracteres', nota: 'la base', por: jose.correo });
  decir(s.nombre === 'MONGO_PASSWORD' && !('valor' in s) && !('cifrado' in s), 'guarda con el nombre limpio y NO devuelve el valor', JSON.stringify(s));
  const l = await boveda.listar();
  decir(l.length === 1 && l[0].largo === 37 && !l[0].corto && JSON.stringify(l).indexOf('S3cr3t0') < 0, 'la lista dice largo y edad, nunca el valor');
  await boveda.guardar({ nombre: 'corto', valor: 'abc', por: jose.correo });
  decir((await boveda.juicio()).cortos.includes('CORTO'), 'y juzga los cortos');
  await boveda.guardar({ nombre: 'HEROKU_API_KEY', valor: 'HRKU-falsa-para-la-prueba-xxxxxxxxxxxx', por: jose.correo });
  llamadasFuera.length = 0;
  const r = await boveda.aplicarEnHeroku({ nombre: 'MONGO_PASSWORD', app: 'ultron-fp' });
  const h = llamadasFuera.find((x) => x.url.includes('api.heroku.com'));
  decir(r.ok && h && h.metodo === 'PATCH' && h.cuerpo.includes('S3cr3t0-largo'), 'aplica en Heroku mandando el valor a Heroku y a nadie más');
  const via = await herramientas.correr('boveda_listar', {}, { miembro: jose, junta: JUNTA, fuentes: [], memorias: [], acciones: [] });
  decir(/MONGO_PASSWORD/.test(via) && !/S3cr3t0/.test(via) && !/HRKU-falsa/.test(via), 'la herramienta del modelo lista nombres y nunca valores', via);
  const llave = process.env.ULTRON_BOVEDA_LLAVE; delete process.env.ULTRON_BOVEDA_LLAVE;
  let e2 = null; try { await boveda.guardar({ nombre: 'x', valor: 'y' }); } catch (x) { e2 = x; }
  decir(e2?.codigo === 'BOVEDA_APAGADA', 'sin llave, apagada: no hay llave por omisión');
  process.env.ULTRON_BOVEDA_LLAVE = llave;
}

// ── 4 · el taller ────────────────────────────────────────────────────────────
titulo('el taller');
{
  const t = await taller.terminal({ comando: 'echo "hola $UN_SECRETO_DE_LA_CASA" && echo listo' });
  decir(/hola \n|hola $/m.test(t) && /listo/.test(t) && !/esto-no-debe-verse/.test(t), 'la terminal corre SIN las variables de la casa', t);
  const t2 = await taller.terminal({ comando: 'exit 3' });
  decir(/salió con 3/.test(t2), 'y dice con qué salió');
  decir(taller._adentro.slug('Arreglar el «bloque 8532» · ¡ya!') === 'arreglar-el-bloque-8532-ya', 'el nombre de rama se limpia');
  let e = null; try { taller._adentro.repoValido('otro/repo'); } catch (x) { e = x; }
  decir(e?.codigo === 'REPO_FUERA', 'solo los repositorios de la casa');
  let e2 = null; try { await taller.leer({ ruta: 'a' }); } catch (x) { e2 = x; }
  decir(e2?.codigo === 'SIN_GITHUB', 'sin llave de GitHub lo dice, con el nombre de la llave');
  await boveda.guardar({ nombre: 'GITHUB_TOKEN', valor: 'ghp_falsa_para_la_prueba_xxxxxxxxxxxxxxxx', por: jose.correo });
  llamadasFuera.length = 0;
  const r = await taller.proponerCambio({ titulo: 'Probar el taller', descripcion: 'nada', archivos: [{ ruta: 'infra/ultron/x.txt', contenido: 'hola' }], por: 'prueba' });
  decir(r.ok && r.rama.startsWith('ultron/') && r.pr.includes('/pull/7'), 'propone en una rama ultron/… y abre el PR', JSON.stringify(r));
  const refs = llamadasFuera.filter((x) => x.url.includes('/git/refs') && x.metodo === 'POST');
  decir(refs.length === 1 && /"ref":"refs\/heads\/ultron\//.test(refs[0].cuerpo), 'la rama nueva se crea desde main y NUNCA se escribe en main');
  const puts = llamadasFuera.filter((x) => x.metodo === 'PUT');
  decir(puts.length === 1 && /"branch":"ultron\//.test(puts[0].cuerpo), 'el archivo va a esa rama');
  decir(!llamadasFuera.some((x) => x.cuerpo.includes('ghp_falsa')), 'la llave viaja en la cabecera, nunca en el cuerpo');
  let e3 = null; try { await taller.proponerCambio({ titulo: 'x', archivos: [{ ruta: '../etc/passwd', contenido: '' }] }); } catch (x) { e3 = x; }
  decir(e3?.codigo === 'RUTA', 'una ruta con .. no pasa');
}

// ── 5 · aprender ─────────────────────────────────────────────────────────────
titulo('aprender: lecciones y habilidades');
{
  const memoria = require('../lib/memoria.js');
  await aprender.aprender({ texto: 'La cadena viva es la 5550; la 8532 está congelada.', dichoPor: 'José', miembro: jose.correo });
  await memoria.recordar({ texto: 'La reunión es los martes.', alcance: 'junta', dichoPor: 'José' });
  const { lecciones, otras } = aprender.partir(await memoria.memoriasDe(jose.correo));
  decir(lecciones.length === 1 && /5550/.test(lecciones[0].texto) && otras.some((m) => /martes/.test(m.texto)), 'las lecciones van aparte de las memorias');
  let e = null; try { await aprender.aprender({ texto: 'sí' }); } catch (x) { e = x; }
  decir(e?.codigo === 'CORTA', 'una lección tiene que decir algo');
  const fab = aprender._adentro.deFabrica();
  decir(fab.length >= 4 && fab.every((h) => h.nombre && h.cuando && h.contenido.length > 100), `las de fábrica se leen del disco (${fab.length})`, fab.map((h) => h.nombre).join(', '));
  const h = await aprender.usar('investigar-a-fondo');
  decir(h.origen === 'repositorio' && /buscar_web/.test(h.contenido), 'y se cargan enteras');
  await aprender.crear({ nombre: 'Investigar a fondo', cuando: 'Cuando haga falta profundizar, versión mejorada.', contenido: 'x'.repeat(50) + ' procedimiento nuevo', por: jose.correo });
  const h2 = await aprender.usar('investigar-a-fondo');
  decir(h2.origen === 'aprendida' && h2.version === 1 && /procedimiento nuevo/.test(h2.contenido), 'una aprendida con el mismo nombre sustituye a la de fábrica');
  const cat = await aprender.catalogoParaElModelo();
  decir(/investigar-a-fondo: Cuando haga falta profundizar/.test(cat) && /\(aprendida\)/.test(cat), 'el catálogo para el modelo dice nombre, cuándo y origen');
  decir(/^---\nnombre: investigar-a-fondo\ncuando: /.test(aprender.comoArchivo(h2)), 'y se puede escribir como archivo del repositorio');
}

// ── 6 · el equipo ────────────────────────────────────────────────────────────
titulo('el equipo');
{
  const bots = equipo.bots();
  decir(bots.length >= 4 && bots.every((b) => b.nombre && b.tarea && b.herramientas.length), `los bots se leen del disco (${bots.map((b) => b.nombre).join(', ')})`);
  decir(equipo.bot('cerrajero')?.cada === 168 && equipo.bot('centinela')?.cada === 6, 'cada uno con su ritmo');
  let visto = null;
  const pensarFalso = async ({ miembro, texto, emitir }) => {
    visto = { miembro, texto };
    emitir('herramienta', { nombre: 'estado_vivo' });
    return { texto: 'Parte de prueba: todo en pie.', uso: { entrada: 100, salida: 20, dolares: 0.002 } };
  };
  const p = await equipo.correr('centinela', { pensar: pensarFalso, junta: JUNTA, pedidoPor: jose.correo });
  decir(p.bot === 'centinela' && /todo en pie/.test(p.texto) && p.herramientas.includes('estado_vivo') && p.dolares === 0.002, 'correr un bot deja un parte con lo que usó y lo que costó');
  decir(visto.miembro.rol === 'bot' && visto.miembro.correo === 'bot:centinela' && Array.isArray(visto.miembro.herramientas) && /CENTINELA/.test(visto.texto), 'el bot piensa como bot, con su tarea y sus herramientas');
  decir((await equipo.partes({ bot: 'centinela' })).length === 1, 'y el parte se puede leer después');
  const roto = await equipo.correr('cronista', { pensar: async () => { throw new Error('sin cerebro'); }, junta: JUNTA, pedidoPor: 'x' });
  decir(roto.fallo && /falló/.test(roto.texto), 'si el cerebro falla, el parte lo dice en vez de perderse');
  process.env.ULTRON_EQUIPO_TOPE = '2';
  let e = null; try { await equipo.correr('contador', { pensar: pensarFalso, junta: JUNTA }); } catch (x) { e = x; }
  decir(e?.codigo === 'TOPE', 'el reloj respeta el tope diario');
  const aMano = await equipo.correr('contador', { pensar: pensarFalso, junta: JUNTA, pedidoPor: jose.correo });
  decir(!!aMano.texto, 'pero a mano se puede correr igual');
  decir(equipo.estado().encendido === false && equipo.arrancar({ pensar: pensarFalso }) === false, 'sin ULTRON_EQUIPO=on el reloj no arranca');
}

// ── 6b · operaciones: Heroku, nodos, bases ──────────────────────────────────
titulo('operaciones: las manos sobre la infraestructura');
{
  const op = require('../lib/operaciones.js');
  const t = op._adentro.tapar('MONGODB_URI=mongodb+srv://jose:S3cr3t0@cluster.x/db y HRKU-AAksB9sThu6fkG4vH1Z y sk_1234567890abcdef y AKIAIOSFODNN7EXAMPLE');
  decir(!/S3cr3t0|AAksB9|1234567890abc|IOSFODNN/.test(t) && /\[tapado\]/.test(t), 'un registro con llaves llega tapado', t);
  const d = op._adentro.taparDoc({ correo: 'a@b.c', password: 'x', perfil: { privateKey: 'y', nombre: 'Ana' }, tokens: [{ token: 't' }] });
  decir(d.password === '[tapado]' && d.perfil.privateKey === '[tapado]' && d.perfil.nombre === 'Ana' && d.tokens === '[tapado]', 'un documento de Mongo llega con los campos sensibles tapados (de más, a propósito) y los demás enteros', JSON.stringify(d));
  const lista = [{ nombre: 'OGB node 3', id: 'i-3', corto: 'node3', region: 'us-east-1', estado: 'running' }, { nombre: 'aura-gpu-a10g', id: 'i-9', corto: null, region: 'us-east-1', estado: 'running' }];
  decir(op._adentro.resolverNodo(lista, 'node3')?.id === 'i-3' && op._adentro.resolverNodo(lista, '3')?.id === 'i-3' && op._adentro.resolverNodo(lista, 'i-9')?.id === 'i-9' && op._adentro.resolverNodo(lista, 'aura-gpu')?.id === 'i-9' && !op._adentro.resolverNodo(lista, 'node8'),
    'los nodos se resuelven por nombre corto, número, id o etiqueta');
  let e = null; try { op._adentro.appValida('Ordenex API'); } catch (x) { e = x; }
  decir(e?.codigo === 'APP', 'un nombre de app raro no pasa');
  // el registro de Heroku, con Heroku falso
  const guardado = globalThis.fetch;
  globalThis.fetch = async (u, o = {}) => {
    const url = String(u);
    if (url.includes('/log-sessions')) return new Response(JSON.stringify({ logplex_url: 'https://logplex.falso/x' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('logplex.falso')) return new Response('2026-09-06 app[web.1]: arrancó\n2026-09-06 app[web.1]: MONGODB_URI=mongodb://u:pw@h/db\n2026-09-06 heroku[router]: at=info');
    return guardado(u, o);
  };
  const reg = await herramientas.correr('heroku_registro', { app: 'ordenex-api', lineas: 50 }, { miembro: jose, junta: JUNTA, fuentes: [], memorias: [], acciones: [] });
  decir(/arrancó/.test(reg) && !/u:pw/.test(reg) && /\[tapado\]/.test(reg), 'el registro de una app llega, y sin llaves', reg);
  globalThis.fetch = guardado;
  decir(permisos.nivelDe('heroku_reiniciar') === 'peligroso' && permisos.nivelDe('nodo_comando') === 'peligroso' && permisos.nivelDe('mongo_consultar') === 'leer', 'reiniciar y mandar comandos piden autorización; leer una base no');
  const r = await herramientas.correr('nodo_comando', { nodo: 'node3', comando: 'df -h', motivo: 'disco' }, { miembro: melany, junta: JUNTA, fuentes: [], memorias: [], acciones: [] });
  decir(/ESPERANDO AUTORIZACIÓN/.test(r) && /node3: df -h/.test(r), 'un comando en un nodo espera al dueño y el pedido dice nodo y comando', r);
  let e2 = null; try { await op.mongoConsultar({ app: 'vetawallet', coleccion: 'users', filtro: '{"$where":"1"}' }); } catch (x) { e2 = x; }
  decir(e2?.codigo === 'FILTRO', '$where no se admite en una consulta');
  let e3 = null; try { await op.mongoConsultar({ app: 'vetawallet', coleccion: 'users' }); } catch (x) { e3 = x; }
  decir(e3?.codigo === 'SIN_URI' && /VETAWALLET__MONGODB_URI/.test(e3.message), 'sin la URI en la bóveda se dice con qué nombre guardarla', e3?.message);
}

// ── 7 · las rutas ────────────────────────────────────────────────────────────
titulo('las rutas: el dueño y nadie más');
{
  const { app } = require('../app.js');
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const B = `http://127.0.0.1:${sv.address().port}`;
  const entrar = async (m) => { const r = await fetch(B + '/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: m.correo, clave: m.clave }) }); return r.headers.get('set-cookie').split(';')[0]; };
  const cj = await entrar(jose), cm = await entrar(melany);
  const yo = await (await fetch(B + '/yo', { headers: { Cookie: cj } })).json();
  decir(yo.permiso === 'dueño' && yo.dueño === jose.correo, '/yo dice quién es el dueño');
  const p = await permisos.pedir({ actor: melany, herramienta: 'desplegarse', entrada: { rama: 'prueba' } });
  const r1 = await fetch(`${B}/autorizaciones/${p._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cm }, body: JSON.stringify({ decision: 'aprobado' }) });
  decir(r1.status === 403, 'la junta NO aprueba', String(r1.status));
  const r2 = await fetch(`${B}/autorizaciones/${p._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cj }, body: JSON.stringify({ decision: 'aprobado' }) });
  decir(r2.status === 200 && (await r2.json()).estado === 'aprobado', 'el dueño sí');
  const l = await (await fetch(B + '/autorizaciones', { headers: { Cookie: cm } })).json();
  decir(Array.isArray(l.pendientes) && l.soyDueño === false, 'la junta ve la lista y sabe que no es el dueño');
  const b1 = await fetch(B + '/boveda', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cm }, body: JSON.stringify({ nombre: 'X', valor: 'y' }) });
  decir(b1.status === 403, 'la bóveda la escribe solo el dueño');
  const b2 = await fetch(B + '/boveda', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cj }, body: JSON.stringify({ nombre: 'ELEVENLABS_API_KEY', valor: 'sk_valor_de_prueba_largo_1234567890', nota: 'voz' }) });
  const g = await b2.json();
  decir(b2.status === 200 && g.nombre === 'ELEVENLABS_API_KEY' && !JSON.stringify(g).includes('sk_valor'), 'y la respuesta no trae el valor');
  const lista = await (await fetch(B + '/boveda', { headers: { Cookie: cm } })).json();
  decir(lista.secretos.some((s) => s.nombre === 'ELEVENLABS_API_KEY') && !JSON.stringify(lista).includes('sk_valor'), 'la junta ve los nombres, nunca los valores');
  const eq = await (await fetch(B + '/equipo', { headers: { Cookie: cj } })).json();
  decir(eq.bots.length >= 4 && Array.isArray(eq.partes), '/equipo lista bots y partes');
  const hab = await (await fetch(B + '/habilidades', { headers: { Cookie: cj } })).json();
  decir(hab.some((h) => h.nombre === 'revisar-seguridad'), '/habilidades lista las que hay');
  const salud = await (await fetch(B + '/salud')).json();
  decir(salud.boveda === true && salud.dueño === true && salud.herramientas >= 48, '/salud dice bóveda, dueño y cuántas herramientas hay', JSON.stringify({ b: salud.boveda, d: salud.dueño, h: salud.herramientas }));

  const prof = await (await fetch(B + '/salud/profunda', { headers: { Cookie: cm } })).json();
  decir(typeof prof.puntaje === 'number' && prof.signos.length >= 8, '/salud/profunda da nota y los nueve signos', `${prof.puntaje}/100 · ${prof.signos.length} signos`);
  decir(prof.signos.some((g) => g.clave === 'cerebro') && prof.signos.some((g) => g.clave === 'bucle'), 'entre ellos el cerebro y el bucle de eventos');
  const sinPuerta = await fetch(B + '/salud/profunda');
  decir(sinPuerta.status === 401 || sinPuerta.status === 403, 'y la salud profunda no se lee sin entrar', String(sinPuerta.status));
  const rep = await (await fetch(B + '/salud/reparar', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cm }, body: '{}' })).json();
  decir(typeof rep.despues === 'number' && Array.isArray(rep.hechos), 'reparar contesta con la nota de antes, la de después y qué hizo', JSON.stringify(rep).slice(0, 120));
  sv.close();
}

// ── LA SALUD PROPIA ─────────────────────────────────────────────────────────
titulo('la salud de ULTRON: se mide y se repara solo');
{
  const salud = require('../lib/salud.js');
  const r = await salud.revisar({ hondo: false });
  decir(r.puntaje >= 0 && r.puntaje <= 100, 'la nota está entre 0 y 100', `${r.puntaje}/100 (${r.estado})`);
  const claves = r.signos.map((s) => s.clave);
  decir(['proceso', 'bucle', 'base', 'cerebro', 'vigia', 'equipo', 'puerta', 'pedidos', 'fallos'].every((k) => claves.includes(k)),
    'están los nueve signos', claves.join(','));
  decir(r.signos.every((s) => ['bien', 'ojo', 'mal'].includes(s.estado)), 'cada signo dice bien, ojo o mal');
  decir(r.resumen.includes('ULTRON') && r.resumen.length < 400, 'y hay un resumen de una línea', r.resumen);

  salud.anotarFallo(new Error('fallo de prueba'), 'la prueba');
  salud.anotarFallo(new Error('fallo de prueba'), 'la prueba');
  const f = salud._adentro.fallosRecientes(60).find((x) => x.donde === 'la prueba');
  decir(f && f.veces === 2, 'dos veces el mismo fallo se cuentan como uno con dos veces', JSON.stringify(f?.veces));

  const rep = await salud.reparar([]);
  decir(typeof rep.antes === 'number' && typeof rep.despues === 'number', 'reparar sin nada que reparar no rompe nada');
  const h = await salud.historial({ limite: 5 });
  decir(Array.isArray(h) && h.length >= 1, 'y la ronda queda en el historial', `${h.length} ronda(s)`);
}

// ── EL RELEVO DEL CEREBRO ───────────────────────────────────────────────────
// El fallo más caro: el nodo apagado dejaba a ULTRON mudo con la llave de
// Anthropic sin usar al lado. Se comprueba que ya no.
titulo('el relevo: si el nodo no contesta, Claude cubre');
{
  const cerebro = require('../lib/cerebro.js');
  const antesLlave = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-de-prueba';
  process.env.ULTRON_CEREBRO = 'nodo';
  cerebro.volverAlNodo();
  decir(cerebro.cual() === 'nodo', 'sin relevo, piensa donde dice la junta');
  decir(cerebro.relevar('el nodo no contesta') === true, 'el relevo se puede pedir cuando hay respaldo');
  decir(cerebro.cual() === 'claude', 'y entonces piensa con Claude aunque la junta haya elegido el nodo');
  decir(cerebro.relevo().activo && /no contesta/.test(cerebro.relevo().motivo), 'el relevo dice desde cuándo y por qué', JSON.stringify(cerebro.relevo().motivo));
  cerebro.volverAlNodo();
  decir(cerebro.cual() === 'nodo' && !cerebro.relevo().activo, 'y cuando el nodo vuelve, se vuelve al nodo solo');
  delete process.env.ANTHROPIC_API_KEY;
  decir(cerebro.relevar('sin respaldo') === false, 'sin llave de Anthropic no hay a quién relevar: no se miente diciendo que sí');
  if (antesLlave) process.env.ANTHROPIC_API_KEY = antesLlave;
  delete process.env.ULTRON_CEREBRO;
}

console.log(malas ? `\n${malas} fallo(s).\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
