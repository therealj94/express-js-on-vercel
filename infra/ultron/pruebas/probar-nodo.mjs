/* EL CEREBRO DEL NODO, contra un motor de mentira.
 *
 *   node infra/ultron/pruebas/probar-nodo.mjs
 *
 * El motor de verdad está en la tarjeta de AU-RA y no se toca desde una
 * prueba. Aquí se levanta uno que habla el mismo NDJSON de Ollama, y se
 * comprueba lo que un modelo de 14 mil millones hace distinto a Claude y esta
 * casa tiene que aguantar: que el texto salga en vivo, que las herramientas
 * lleguen como tool_calls Y como texto, que argumentos rotos no tumben el
 * turno, que el prompt tenga presupuesto y que un motor caído o con secreto
 * malo se diga con su nombre.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).replace(/\s+/g, ' ').slice(0, 220) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

// ── el motor de mentira ─────────────────────────────────────────────────────
let guion = [];              // cada entrada: { texto, llamadas:[{name,arguments}], enTexto:bool }
const pedidos = [];
let secretoBueno = 'secreto-de-prueba-largo-24';
let caido = false;
const sv = createServer((q, r) => {
  let cuerpo = ''; q.on('data', (d) => { cuerpo += d; });
  q.on('end', () => {
    if (caido) { q.socket.destroy(); return; }
    if (q.headers['x-ultron-secreto'] !== secretoBueno) { r.writeHead(401); r.end('{"error":"no"}'); return; }
    if (q.url === '/salud') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, modelo: 'qwen2.5:14b', ctx: 12288 })); return; }
    const pedido = JSON.parse(cuerpo || '{}'); pedidos.push(pedido);
    const paso = guion.shift() || { texto: 'Fin.' };
    r.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const trozos = (paso.texto || '').match(/.{1,9}/g) || [];
    let i = 0;
    const tic = setInterval(() => {
      if (i < trozos.length) { r.write(JSON.stringify({ message: { role: 'assistant', content: trozos[i++] }, done: false }) + '\n'); return; }
      clearInterval(tic);
      if (paso.llamadas?.length && !paso.enTexto) {
        r.write(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: paso.llamadas.map((l) => ({ function: l })) }, done: false }) + '\n');
      }
      r.write(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 900 + JSON.stringify(pedido).length / 10 | 0, eval_count: 120 }) + '\n');
      r.end();
    }, 3);
  });
});
await new Promise((ok) => sv.listen(0, '127.0.0.1', ok));

process.env.ULTRON_NODO_URL = `http://127.0.0.1:${sv.address().port}`;
process.env.ULTRON_NODO_SECRETO = secretoBueno;
process.env.ULTRON_CEREBRO = 'nodo';
delete process.env.MONGODB_URI;
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (String(u).startsWith('http://127.0.0.1')) return fetchReal(u, o); throw new Error('sin red'); };

const memoria = require('../lib/memoria.js');
const cerebro = require('../lib/cerebro.js');
const nodo = require('../lib/cerebros/nodo.js');
const JOSE = { nombre: 'José', correo: 'jose@ordenglobal.org', rol: 'presidente', whatsapp: '+50499990000' };
const JUNTA = [JOSE, { nombre: 'Mayra', correo: 'mayra@ordenglobal.org', rol: 'directora', whatsapp: null }];

titulo('el enrutador elige el nodo');
decir(cerebro.cual() === 'nodo', 'con ULTRON_CEREBRO=nodo piensa con el nodo', cerebro.cual());
decir(cerebro.encendido(), 'y está encendido con URL y secreto');
decir(/^nodo:/.test(cerebro.modelo()), 'y el modelo se presenta como del nodo', cerebro.modelo());
decir((await nodo.salud()).vivo === true, '/salud del motor contesta');

titulo('un turno simple: el texto sale en vivo y el prompt lleva lo suyo');
{
  guion = [{ texto: 'La casa está bien, José.' }];
  const eventos = [];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: '¿cómo está la casa?', emitir: (e, d) => eventos.push([e, d]) });
  decir(r.texto === 'La casa está bien, José.', 'el texto llega entero', r.texto);
  decir(eventos.filter(([e]) => e === 'texto').length >= 3, 'y se emitió por trozos, en vivo', String(eventos.filter(([e]) => e === 'texto').length));
  const p = pedidos.at(-1);
  decir(p.model === 'qwen2.5:14b' && p.stream === true, 'pide el modelo de AU-RA, en streaming');
  decir(p.messages[0].role === 'system' && /Sos ULTRON FP/.test(p.messages[0].content) && /NUNCA «respaldados»/.test(p.messages[0].content), 'el system lleva la identidad y las reglas');
  decir(Array.isArray(p.tools) && p.tools.some((t) => t.function?.name === 'buscar_web') && p.tools.some((t) => t.function?.name === 'abrir'), 'y las herramientas en formato de Ollama, con buscar_web y abrir', p.tools.map((t) => t.function.name).join(','));
  decir(!p.tools.some((t) => t.function?.name === 'web_search'), 'sin la búsqueda de Anthropic, que aquí no existe');
  decir(r.uso.entrada > 0 && r.uso.dolares === 0, 'el uso se cuenta y el costo es cero: la tarjeta ya está pagada', JSON.stringify(r.uso));
  decir(r.modelo === 'nodo:qwen2.5:14b', 'y el turno dice de dónde salió', r.modelo);
}

titulo('herramientas como tool_calls: se corren y el modelo sigue');
{
  guion = [
    { texto: 'Voy a mirar.', llamadas: [{ name: 'anotar_pendiente', arguments: { texto: 'Fondear la caliente', quien: 'José', tema: 'ordenex' } }, { name: 'abrir', arguments: { que: 'ordenex', porQue: 'para ver el libro' } }] },
    { texto: 'Anotado, y te dejé Ordenex a un toque.' },
  ];
  const eventos = [];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'anotá que hay que fondear la caliente y abrime ordenex', emitir: (e, d) => eventos.push([e, d]) });
  decir(r.herramientas.map((h) => h.nombre).join(',') === 'anotar_pendiente,abrir', 'corrió las dos, en orden', r.herramientas.map((h) => h.nombre).join(','));
  decir(r.pendientes.length === 1 && /Fondear/.test(r.pendientes[0].texto), 'el pendiente quedó anotado');
  decir(r.acciones.length === 1 && r.acciones[0].url === 'https://ordenexchange.link/' && r.acciones[0].nombre === 'Ordenex', 'y «abrir» devolvió la acción con la URL de la casa, no una inventada', JSON.stringify(r.acciones[0]));
  decir(/Voy a mirar\./.test(r.texto) && /Anotado/.test(r.texto), 'lo dicho antes y después de las herramientas se conserva', r.texto);
  const segundo = pedidos.at(-1);
  const tools = segundo.messages.filter((m) => m.role === 'tool');
  decir(tools.length === 2 && /Anotado como pendiente/.test(tools[0].content) && tools[0].tool_name === 'anotar_pendiente', 'los resultados vuelven como mensajes «tool», con su nombre', tools[0]?.content);
  decir(segundo.messages.some((m) => m.role === 'assistant' && m.tool_calls?.length === 2), 'y la llamada del modelo queda en el hilo, como pide Ollama');
  decir(eventos.some(([e, d]) => e === 'herramienta' && d.nombre === 'abrir') && eventos.some(([e]) => e === 'herramienta-lista'), 'el panel se entera de cada herramienta');
}

titulo('herramientas escritas como TEXTO: un modelo chico a veces lo hace');
{
  guion = [
    { texto: 'Miro el estado.\n<tool_call>{"name":"estado_vivo","arguments":{}}</tool_call>', enTexto: true },
    { texto: 'Nada contesta (sin red en la prueba).' },
  ];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'estado' });
  decir(r.herramientas.length === 1 && r.herramientas[0].nombre === 'estado_vivo', 'se lee igual que una llamada de verdad', r.herramientas.map((h) => h.nombre).join(','));
  decir(!/tool_call/.test(r.texto) && /Miro el estado/.test(r.texto), 'y la etiqueta NO se le enseña a la persona', r.texto);
}

titulo('argumentos rotos y herramientas que no existen: texto, no excepción');
{
  guion = [
    { texto: '', llamadas: [{ name: 'cerrar_pendiente', arguments: {} }, { name: 'volar', arguments: { a: 1 } }, { name: 'abrir', arguments: { que: 'google.com' } }] },
    { texto: 'Corregido.' },
  ];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'x' });
  const salidas = r.herramientas.map((h) => h.salida);
  decir(r.texto === 'Corregido.', 'el turno termina bien');
  decir(/No existe un pendiente/.test(salidas[0]), 'cerrar sin id dice que no existe', salidas[0]);
  decir(/No existe la herramienta volar/.test(salidas[1]) && /buscar_web/.test(salidas[1]), 'una herramienta inventada se contesta con la lista de las que hay', salidas[1]);
  decir(/No puedo abrir/.test(salidas[2]) && r.acciones.length === 0, 'y «abrir» fuera de la casa se niega: nada de llevar a la gente a google', salidas[2]);
}

titulo('el presupuesto: 12 288 fichas no son infinitas');
{
  const conv = await memoria.abrirConversacion(JOSE.correo, { titulo: 'largo' });
  for (let i = 0; i < 30; i++) {
    await memoria.anotarTurno(conv._id, JOSE.correo, { rol: 'miembro', texto: `pregunta ${i} ` + 'x'.repeat(1500) });
    await memoria.anotarTurno(conv._id, JOSE.correo, { rol: 'ultron', texto: `respuesta ${i} ` + 'y'.repeat(1500) });
  }
  guion = [{ texto: 'ok' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'sigo', conversacionId: String(conv._id) });
  const p = pedidos.at(-1);
  const largo = p.messages.reduce((a, m) => a + String(m.content || '').length, 0);
  decir(largo <= nodo._adentro.PRESUPUESTO, `el pedido entero cabe en el presupuesto (${nodo._adentro.PRESUPUESTO} letras)`, `${largo} letras · ${p.messages.length} mensajes`);
  const hilo = p.messages.filter((m) => m.role !== 'system');
  decir(hilo.at(-1).content === 'sigo' && hilo.length >= 2 && hilo.length <= 9, 'se quedó con lo último del hilo y la pregunta, no con lo primero', `${hilo.length} mensajes, el último: ${hilo.at(-1).content}`);
  decir(hilo.some((m) => /respuesta 29/.test(m.content)) && !hilo.some((m) => /pregunta 0 /.test(m.content)), 'lo más reciente está; lo más viejo se soltó');
  decir(/recortado/.test(hilo[0].content), 'y cada turno viejo va recortado, no entero', hilo[0].content.slice(-30));
}

titulo('la guarda de las citas: no se cita una herramienta que no corrió');
{
  /* 5-sep, primera prueba real: «El oro cerró hoy a US$ 4,435 (según
     buscar_web)» y buscar_web no se había llamado. El dato venía del estado
     vivo y la fuente era inventada. La guarda mira, devuelve UNA vez, y si
     reincide lo marca en el texto. */
  guion = [
    { texto: 'El oro cerró hoy a US$ 4,435 la onza (según buscar_web).' },              // la cita falsa
    { texto: '', llamadas: [{ name: 'buscar_web', arguments: { consulta: 'precio del oro hoy' } }] }, // corrige: la llama
    { texto: 'Según buscar_web, el oro cerró a US$ 4,410 la onza.' },
  ];
  const eventos = [];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: '¿a cuánto cerró el oro hoy?', emitir: (e, d) => eventos.push([e, d]) });
  decir(r.herramientas.some((h) => h.nombre === 'buscar_web'), 'al citar buscar_web sin usarla, se le devuelve y la llama', r.herramientas.map((h) => h.nombre).join(','));
  decir(/4,410/.test(r.texto) && !/4,435/.test(r.texto), 'y la respuesta final es la que salió DESPUÉS de buscar, no la inventada', r.texto);
  decir(eventos.some(([e]) => e === 'reemplazo'), 'el panel recibe el reemplazo del texto');
  const nudge = pedidos.at(-2).messages.at(-1);
  decir(nudge.role === 'user' && /\[sistema\]/.test(nudge.content) && /buscar_web/.test(nudge.content), 'la devolución nombra la herramienta citada', nudge.content.slice(0, 90));

  // Reincide: se marca, no se esconde. Y con acentos graves, que es como el
  // modelo suele escribir el nombre.
  guion = [
    { texto: 'Cerró a 4,400 (según `leer_pagina`).' },
    { texto: 'Insisto: 4,400 (según `leer_pagina`).' },
  ];
  const r2 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'y hoy?' });
  decir(/tomá ese dato con cuidado/.test(r2.texto) && /leer_pagina/.test(r2.texto), 'si insiste sin llamarla, la cita queda marcada para la persona', r2.texto.slice(-90));

  // Y una cita LEGÍTIMA no se toca.
  guion = [
    { texto: '', llamadas: [{ name: 'buscar_web', arguments: { consulta: 'oro' } }] },
    { texto: 'Cerró a 4,410 (según buscar_web).' },
  ];
  let antes = pedidos.length;
  const r3 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'oro' });
  decir(pedidos.length - antes === 2 && /según buscar_web/.test(r3.texto), 'una cita de una herramienta que SÍ corrió pasa sin devolución', `${pedidos.length - antes} pedidos`);
  // El estado vivo y el saber VAN en el prompt: citarlos sin llamarlos es correcto.
  guion = [{ texto: 'Ordenex no contesta (según `estado_vivo`).' }];
  antes = pedidos.length;
  const r4 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'estado' });
  decir(pedidos.length - antes === 1 && /estado_vivo/.test(r4.texto) && !/cuidado/.test(r4.texto), 'citar el estado vivo sin llamarlo es legítimo: va en el prompt', `${pedidos.length - antes} pedido`);
  // Lo repetido palabra por palabra se quita; lo parecido se deja.
  decir(nodo._adentro.sinRepetidos('Hola.\n\nEl oro cerró a 4,410.\n\nEl oro cerró a 4,410.\n\nEl oro cerró a 4,410 según Investing.') === 'Hola.\n\nEl oro cerró a 4,410.\n\nEl oro cerró a 4,410 según Investing.',
    'un párrafo repetido igual se quita una vez; uno parecido se deja');
}

titulo('el presupuesto en FICHAS: el saber recibe lo que sobra, y nunca se pasa');
{
  // Una junta con muchas memorias largas: la base crece y el saber tiene que
  // achicarse solo. Antes el tope del saber era fijo y la suma se pasaba del
  // contexto, y Ollama recortaba por el principio: la identidad y las reglas.
  for (let i = 0; i < 40; i++) await memoria.recordar({ texto: `Memoria larga número ${i}: ` + 'dato '.repeat(90), alcance: 'junta', miembro: JOSE.correo, dichoPor: 'José' });
  guion = [{ texto: 'ok' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: '¿qué es el gramin?' });
  const p = pedidos.at(-1);
  const total = p.messages.reduce((a, m) => a + nodo._adentro.fichas(m.content || ''), 0);
  decir(total <= nodo._adentro.PRESUPUESTO_FICHAS, `el pedido entero cabe en ${nodo._adentro.PRESUPUESTO_FICHAS} fichas (estimadas a 2,4 letras)`, `${total} fichas`);
  decir(/Sos ULTRON FP/.test(p.messages[0].content) && /NUNCA «respaldados»/.test(p.messages[0].content), 'y la identidad y las reglas siguen al principio, enteras');
  decir(nodo._adentro.PRESUPUESTO_FICHAS + 1500 < nodo._adentro.CTX, 'con sitio para la respuesta debajo del contexto de AU-RA', `${nodo._adentro.PRESUPUESTO_FICHAS} + 1500 < ${nodo._adentro.CTX}`);
}

titulo('la deriva a otro idioma se ataja en vivo');
{
  /* «…cambiar rápid嫂，总结一下FilterWhere助手…» en el panel de José. Al
     primer carácter de otro alfabeto se corta el stream, se guarda lo escrito
     hasta ahí, y se le pide UNA vez que siga en español. */
  guion = [
    { texto: 'El entorno regulatorio puede cambiar rápid嫂，总结一下FilterWhere助手的主要功能和使用方法。' },
    { texto: 'amente, y conviene revisarlo cada trimestre.' },
  ];
  const eventos = [];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'amenazas', emitir: (e, d) => eventos.push([e, d]) });
  decir(!/[\u4e00-\u9fff]/.test(r.texto), 'ni un carácter chino llega a la respuesta', r.texto);
  decir(/cambiar rápidamente, y conviene revisarlo cada trimestre/.test(r.texto), 'se conserva lo escrito y se sigue en español desde ahí, sin espacio de más', r.texto);
  const emitido = eventos.filter(([e]) => e === 'texto').map(([, d]) => d.t).join('');
  decir(!/[\u4e00-\u9fff]/.test(emitido), 'y al panel tampoco le llegó ni un instante', emitido);
  const nudge = pedidos.at(-1).messages.at(-1);
  decir(/otro idioma/.test(nudge.content) && /ESPAÑOL/.test(nudge.content), 'la devolución dice qué pasó y qué hacer', nudge.content.slice(0, 80));
  decir(pedidos.at(-1).options.repeat_penalty <= 1.05, 'y la penalización por repetir está baja, que es donde deja de pasar tanto', String(pedidos.at(-1).options.repeat_penalty));
  // Si reincide, se queda con lo que hay: no se entra en bucle.
  guion = [{ texto: 'Hola 你好 mundo' }, { texto: '再见' }];
  const r2 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'x' });
  decir(r2.texto === 'Hola' && !/[\u4e00-\u9fff]/.test(r2.texto), 'si reincide, se queda lo que había en español y no se insiste', r2.texto);
}

titulo('el modo voz: corto, sin markdown, hecho para escucharse');
{
  guion = [{ texto: 'El ORIGEN está a dos dólares con cincuenta y nueve. La compra sigue cerrada.' }];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: '¿cómo está?', modo: 'voz' });
  const p = pedidos.at(-1);
  decir(p.options.num_predict <= 400, 'en voz se piden pocas fichas de salida: menos segundos hasta la primera frase', String(p.options.num_predict));
  decir(/MODO VOZ/.test(p.messages[0].content) && /Sin markdown/.test(p.messages[0].content), 'y el prompt dice que lo que diga se va a ESCUCHAR');
  decir(r.texto.length < 200, 'la respuesta es corta', r.texto);
  guion = [{ texto: 'ok' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'x' });
  decir(!/MODO VOZ/.test(pedidos.at(-1).messages[0].content) && pedidos.at(-1).options.num_predict > 1000, 'y en texto, lo de siempre');
  /* El orden del prompt: lo quieto primero, la hora al final. Ollama reusa la
     caché del prefijo que coincide; la fecha adelante la rompía cada minuto. */
  const sys = pedidos.at(-1).messages[0].content;
  const i = (t) => sys.indexOf(t);
  decir(i('LO QUE LA JUNTA TE HA DICHO') < i('EL SABER DE LA CASA') && i('EL SABER DE LA CASA') < i('EL ESTADO VIVO') && i('EL ESTADO VIVO') < i('Hoy es'),
    'memoria → saber → estado vivo → hora: de lo más quieto a lo más movido, para la caché del nodo');
}

titulo('el título, sin herramientas y corto');
{
  guion = [{ texto: '"Fondeo de la caliente"\n' }];
  const t = await cerebro.titular('hay que fondear la caliente con ORIGEN');
  decir(t === 'Fondeo de la caliente', 'sale limpio, sin comillas', t);
  decir(!pedidos.at(-1).tools && pedidos.at(-1).stream === false, 'y el pedido fue sin herramientas y sin streaming');
}

titulo('cuando el nodo dice que no, se dice por qué');
{
  process.env.ULTRON_NODO_SECRETO = 'otro-secreto-que-no-cuadra';
  const n2 = (() => { delete require.cache[require.resolve('../lib/cerebros/nodo.js')]; delete require.cache[require.resolve('../lib/cerebro.js')]; return require('../lib/cerebro.js'); })();
  let e = null; try { await n2.pensar({ miembro: JOSE, junta: JUNTA, texto: 'x' }); } catch (x) { e = x; }
  decir(e?.codigo === 'NODO_NO' && /secreto/i.test(n2.motivo(e).mensaje), 'secreto malo → NODO_NO, y el mensaje nombra la variable', n2.motivo(e).mensaje);
  process.env.ULTRON_NODO_SECRETO = secretoBueno;
  caido = true;
  const n3 = (() => { delete require.cache[require.resolve('../lib/cerebros/nodo.js')]; delete require.cache[require.resolve('../lib/cerebro.js')]; return require('../lib/cerebro.js'); })();
  e = null; try { await n3.pensar({ miembro: JOSE, junta: JUNTA, texto: 'x' }); } catch (x) { e = x; }
  decir(e?.codigo === 'NODO_MUDO' && /ultron-motor/.test(n3.motivo(e).mensaje), 'nodo caído → NODO_MUDO, y el mensaje dice dónde mirar', n3.motivo(e).mensaje);
  caido = false;
  decir((await n3.nodo.salud()).vivo === true, 'y en cuanto vuelve, /salud lo ve');
}

titulo('sin nodo configurado, el enrutador cae a Claude y lo dice');
{
  delete process.env.ULTRON_NODO_URL; delete process.env.ULTRON_NODO_SECRETO; delete process.env.ULTRON_CEREBRO; delete process.env.ANTHROPIC_API_KEY;
  delete require.cache[require.resolve('../lib/cerebros/nodo.js')]; delete require.cache[require.resolve('../lib/cerebro.js')];
  const c = require('../lib/cerebro.js');
  decir(c.cual() === 'claude' && !c.encendido(), 'sin URL del nodo ni llave de Anthropic: claude, apagado', `${c.cual()} · ${c.encendido()}`);
}

sv.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
