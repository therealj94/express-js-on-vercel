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
/* El motor de VERDAD reescribe `model` con el suyo, así que el fingido también
   dice el suyo en /salud. Se deja distinto del de ULTRON a propósito: es el
   desacuerdo que el 5-sep tuvo a producción una hora pensando con el modelo
   viejo mientras /salud decía el nuevo, y nadie se enteró. */
const MODELO_DEL_MOTOR = 'qwen3.8:27b';
let caido = false;
const sv = createServer((q, r) => {
  let cuerpo = ''; q.on('data', (d) => { cuerpo += d; });
  q.on('end', () => {
    if (caido) { q.socket.destroy(); return; }
    if (q.headers['x-ultron-secreto'] !== secretoBueno) { r.writeHead(401); r.end('{"error":"no"}'); return; }
    /* Los vectores van por su propia puerta y NO consumen el guion: son una
       llamada más del turno, no un paso de la conversación. Se descubrió
       porque al enchufar la búsqueda por significado, cada turno se comía un
       paso y las pruebas del bucle empezaron a fallar sin que nada del bucle
       hubiera cambiado. */
    if (q.url === '/api/embed') {
      r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ model: 'embeddinggemma:300m', embeddings: [Array.from({ length: 768 }, (_, i) => (i % 11 - 5) / 50)] }));
      return;
    }
    if (q.url === '/salud') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, modelo: MODELO_DEL_MOTOR, ctx: 12288 })); return; }
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
const herramientas = require('../lib/herramientas.js');
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
  /* El nombre del modelo se comprueba contra la constante, no escrito a mano:
     el 5-sep esta prueba clavaba «qwen2.5:14b» y siguió en verde mientras
     producción cambiaba de modelo. Una prueba que no se entera de un cambio de
     cerebro no está cuidando nada. Lo que importa es que se pida EL MISMO que
     el módulo dice usar, y en streaming. */
  decir(p.model === nodo.MODELO && p.stream === true, `pide el modelo que dice usar (${nodo.MODELO}), en streaming`, p.model);
  /* El system arranca con LA CABECERA DE LA CASA —el mismo texto con el que
     arranca AU-RA, byte a byte— y la identidad de ULTRON va detrás. El orden
     importa: es lo que hace que las dos compartan prefijo en la única ranura
     del motor. */
  decir(p.messages[0].role === 'system' && /^LA CASA\n/.test(p.messages[0].content), 'el system ARRANCA con la cabecera de la casa');
  decir(/Sos ULTRON FP/.test(p.messages[0].content) && /Nunca se dice «respaldados»/.test(p.messages[0].content), 'y lleva la identidad y las reglas');
  // El 5-sep el modelo cerró una respuesta con «¿Podrías proporcionar más
  // detalles?». A un miembro de la junta se le habla de usted, y para un modelo
  // chico la regla tiene que venir con las formas puestas, no en abstracto.
  const sys = p.messages[0].content;
  decir(/Y SIEMPRE DE USTED/.test(sys) && /¿Qué necesita\?/.test(sys) && /«¿podrías\?»/.test(sys), 'y el trato de usted con las formas que sí y las que no');
  // Y el resto del prompt —quitando el párrafo de la regla, que nombra el
  // tuteo para prohibirlo— no puede traer un ejemplo que tutee: un modelo chico
  // copia el ejemplo antes que la regla.
  const sinLaRegla = sys.replace(/Y SIEMPRE DE USTED[\s\S]*?\n\n/, '');
  const tuteo = sinLaRegla.match(/«[^»]*(?:podrías|tenés|tienes|necesitás|te dej[oé]|tu cuenta)[^»]*»/i);
  decir(!tuteo, 'sin un solo ejemplo de respuesta que tutee', tuteo ? tuteo[0] : '');
  /* ── LAS DOCE, Y NO LAS SESENTA Y CUATRO ────────────────────────────────
     Antes viajaban las 64 en cada turno: 6 622 fichas de un presupuesto de
     8 188, o sea el 81 % del encabezado gastado en herramientas que la
     pregunta no iba a usar. Ahora van las doce de todos los días y una puerta
     para pedir el resto. Se comprueban las tres cosas que importan: que van
     pocas, que están las de siempre, y que la puerta viaja SIEMPRE — sin ella
     el modelo se quedaría sin manera de llegar a las otras cincuenta. */
  const nombres = (p.tools || []).map((t) => t.function.name);
  decir(Array.isArray(p.tools) && nombres.includes('buscar_web') && nombres.includes('estado_vivo'),
    'las herramientas van en formato de Ollama, con las de todos los días', nombres.join(','));
  decir(nombres.length <= 14, `y van pocas, no las 64: ${nombres.length} en el turno`);
  decir(nombres.includes('mas_herramientas'), 'con la puerta para pedir las demás, que viaja siempre');
  decir(!nombres.includes('terminal') && !nombres.includes('desplegarse'),
    'y lo peligroso no viaja hasta que hace falta: la terminal no está a la vista');
  decir(!p.tools.some((t) => t.function?.name === 'web_search'), 'sin la búsqueda de Anthropic, que aquí no existe');
  decir(r.uso.entrada > 0 && r.uso.dolares === 0, 'el uso se cuenta y el costo es cero: la tarjeta ya está pagada', JSON.stringify(r.uso));
  decir(r.modelo === 'nodo:' + nodo.MODELO, `y el turno dice de dónde salió (nodo:${nodo.MODELO})`, r.modelo);
}

/* ── LA PUERTA A LAS DEMÁS HERRAMIENTAS ──────────────────────────────────────
   Lo que de verdad hay que comprobar del recorte a doce no es que sean doce:
   es que NO SE PIERDE NADA. El modelo pide la caja, y en la vuelta siguiente
   las herramientas de esa caja tienen que viajar de verdad. Si no llegaran, el
   modelo pediría la caja, se la darían, y seguiría sin verla — y contestaría
   «no puedo» de algo que sí puede, que es justo el fallo que este diseño
   existe para evitar. */
titulo('pedir una caja: y en la vuelta siguiente las herramientas están');
{
  const antes = pedidos.length;
  guion = [
    { llamadas: [{ name: 'mas_herramientas', arguments: { caja: 'taller' } }] },
    { texto: 'Ya puedo mirar el repositorio.' },
  ];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'mirá el código del vigía' });
  const vueltas = pedidos.slice(antes);
  const enLaPrimera = (vueltas[0].tools || []).map((t) => t.function.name);
  const enLaSegunda = (vueltas[1]?.tools || []).map((t) => t.function.name);
  decir(!enLaPrimera.includes('repo_leer') && enLaPrimera.includes('mas_herramientas'),
    'en la primera vuelta el taller no viaja, pero sí la puerta', `${enLaPrimera.length} herramientas`);
  decir(enLaSegunda.includes('repo_leer') && enLaSegunda.includes('terminal'),
    'y en la segunda, con la caja pedida, el taller YA viaja', `${enLaSegunda.length} herramientas`);
  decir(enLaSegunda.includes('estado_vivo'), 'sin perder las de todos los días');
  decir(r.texto === 'Ya puedo mirar el repositorio.', 'y el turno termina normal', r.texto);
  /* La caja se cierra al terminar el turno: la pregunta siguiente vuelve a
     salir ligera, que es de lo que se trataba. */
  const despues = pedidos.length;
  guion = [{ texto: 'Hola.' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'hola' });
  const nueva = (pedidos.slice(despues)[0].tools || []).map((t) => t.function.name);
  decir(!nueva.includes('repo_leer'), 'y en la pregunta siguiente el taller ya no viaja: la caja se cerró sola',
    `${nueva.length} herramientas`);
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

titulo('la misma consulta no se corre dos veces en un turno');
{
  // Un modelo chico a veces vuelve a pedir lo que ya tiene. Cada vuelta son
  // segundos de la junta esperando y una lectura mas a la casa: se le
  // devuelve el resultado que ya obtuvo, y se le dice.
  guion = [
    { texto: '', llamadas: [{ name: 'calcular', arguments: { expresion: '2+2' } }] },
    { texto: '', llamadas: [{ name: 'calcular', arguments: { expresion: '2+2' } }] },
    { texto: 'Son cuatro.' },
  ];
  const eventos = [];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'cuanto es dos mas dos', emitir: (e, d) => eventos.push([e, d]) });
  decir(r.herramientas.length === 1, 'la segunda llamada identica no vuelve a correr: cuenta una sola', String(r.herramientas.length));
  const tools = pedidos.at(-1).messages.filter((m) => m.role === 'tool');
  decir(tools.length === 2 && /ya consultado en este turno/.test(tools[1].content) && /= 4/.test(tools[1].content), 'y al modelo se le devuelve el mismo resultado, diciendo que ya lo tenia', tools[1]?.content);
  decir(eventos.filter(([e, d]) => e === 'herramienta-lista' && /= 4/.test(d.salida || '')).length === 2, 'la consola ve la salida en los dos eventos');
  decir(/Son cuatro/.test(r.texto), 'y la respuesta llega igual', r.texto);
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

titulo('hablando, el prompt es OTRO: menos fichas antes de la primera palabra');
{
  /* ── POR QUÉ ─────────────────────────────────────────────────────────────
     Escribiendo, la espera se llena leyendo lo que ya salió. Hablando no:
     entre la pregunta y la primera palabra hay SILENCIO, y el silencio se
     mide en fichas de prompt —el modelo evalúa el prompt entero antes de
     decir «buenos». Hasta hoy `modo:'voz'` solo acortaba la RESPUESTA
     (num_predict); el prompt seguía siendo el mismo ladrillo de 8 188 fichas,
     así que el «se pone lento cuando le hablo» seguía intacto. */
  const conv = await memoria.abrirConversacion(JOSE.correo, { titulo: 'hablado' });
  for (let i = 0; i < 20; i++) {
    await memoria.anotarTurno(conv._id, JOSE.correo, { rol: 'miembro', texto: `pregunta ${i} ` + 'x'.repeat(1200) });
    await memoria.anotarTurno(conv._id, JOSE.correo, { rol: 'ultron', texto: `respuesta ${i} ` + 'y'.repeat(1200) });
  }
  guion = [{ texto: 'ok' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'cómo va la cadena', conversacionId: String(conv._id) });
  const escrito = pedidos.at(-1);
  guion = [{ texto: 'ok' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'cómo va la cadena', conversacionId: String(conv._id), modo: 'voz' });
  const hablado = pedidos.at(-1);
  const fichasDe = (p) => p.messages.reduce((a, m) => a + nodo._adentro.fichas(m.content || ''), 0);
  const fe = fichasDe(escrito), fh = fichasDe(hablado);
  decir(fh < fe * 0.65, 'el prompt hablado pesa bastante menos que el escrito', `${fh} fichas hablando · ${fe} escribiendo`);
  const hiloH = hablado.messages.filter((m) => m.role !== 'system');
  const hiloE = escrito.messages.filter((m) => m.role !== 'system');
  decir(hiloH.length < hiloE.length, 'hablando se lleva menos hilo: lo de hace seis turnos no lo tiene nadie en la cabeza', `${hiloH.length} vs ${hiloE.length} mensajes`);
  decir(hiloH.at(-1).content === 'cómo va la cadena', 'y la pregunta sigue siendo la última, entera');
  decir(hablado.options.num_predict < escrito.options.num_predict, 'y la respuesta también viene acotada', `${hablado.options.num_predict} vs ${escrito.options.num_predict}`);
  decir(/MODO VOZ/.test(hablado.messages[0].content) && !/MODO VOZ/.test(escrito.messages[0].content),
    'con la orden de hablar como se habla: sin markdown, sin listas, dos a cuatro frases');

  /* LO QUE NO SE RECORTA NUNCA. Acortar el prompt es una mejora de velocidad;
     dejar caer una regla de cumplimiento por el camino sería un problema de
     los que llegan a un acta. Estas son las que protegen a la casa y tienen
     que estar EXACTAS también cuando ULTRON habla. */
  const sv = hablado.messages[0].content;
  decir(/REFERENCIADOS/.test(sv) && /Nunca se dice «respaldados»/.test(sv),
    'hablando también dice «referenciados» y nunca «respaldados»');
  decir(/no está «regulada» ni «registrada»/.test(sv) && /AuCorp NO ES UN BANCO/.test(sv),
    'ni «regulada» ni «registrada», y AuCorp no es un banco');
  decir(/NO SE MUEVE DINERO/.test(sv) && /no se tocan llaves\s+privadas ni frases de respaldo/.test(sv.replace(/\s+/g,' ')),
    'no mueve dinero ni toca llaves');
  decir(/5550/.test(sv) && /8532/.test(sv), 'y la cadena viva sigue siendo la 5550');
  decir(/mas_herramientas/.test(sv), 'y sabe que tiene cajas que pedir antes de decir «no puedo»');
}

titulo('calentar la caché mientras la persona habla');
{
  /* ── LA MEDIDA QUE MANDA ──────────────────────────────────────────────────
     Contra producción, 6-sep, la misma pregunta cuatro veces seguidas: la
     primera 6,5 s hasta la primera palabra; las tres siguientes 1,0 s. La
     diferencia entera es la caché de prefijo del motor.
     Así que cuando se abre el micrófono se manda a evaluar el prompt YA, con
     `num_predict: 1`, mientras la persona todavía está diciendo su pregunta.
     Todo esto se sostiene sobre UNA condición, y es la que se prueba aquí:
     lo que se manda a calentar tiene que ser un PREFIJO EXACTO del prompt real.
     Un byte de diferencia y no se calienta nada; se gasta el motor y encima se
     ocupa la única ranura. */
  const antes = pedidos.length;
  const r = await cerebro.precalentar({ miembro: JOSE, junta: JUNTA, modo: 'voz' });
  const calentado = pedidos.at(-1);
  decir(r?.ok === true && pedidos.length === antes + 1, 'calentar manda UN pedido al motor', JSON.stringify(r));
  decir(calentado.options?.num_predict === 1, 'y le pide UN token: no se quiere la respuesta, se quiere la caché', String(calentado.options?.num_predict));
  /* El sistema y una pregunta mínima detrás: un /api/chat con SOLO el sistema
     lo rechaza el motor, y esa fue la razón de que la primera versión no
     calentara nada en producción. La pregunta va después del sistema, o sea
     fuera del prefijo compartido: no lo acorta. */
  decir(calentado.messages.length === 2 && calentado.messages[0].role === 'system' && calentado.messages[1].content.length <= 2,
    'el prompt y una pregunta mínima detrás, que es lo que el motor acepta', JSON.stringify(calentado.messages.map((m) => m.role)));

  guion = [{ texto: 'ok' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'cómo va la cadena', modo: 'voz' });
  const real = pedidos.at(-1);
  const sc = calentado.messages[0].content, sr = real.messages[0].content;
  decir(sr.startsWith(sc), 'LO CALENTADO ES UN PREFIJO EXACTO DEL PROMPT REAL, byte a byte',
    sr.startsWith(sc) ? `${sc.length} de ${sr.length} letras` : `se separan en la letra ${[...sc].findIndex((c, i) => sr[i] !== c)}`);
  decir(sc.length > 400 && sc.length < sr.length, 'y es la mayor parte, no un saludo', `${sc.length} de ${sr.length}`);
  decir(JSON.stringify(calentado.tools) === JSON.stringify(real.tools),
    'con las MISMAS herramientas: también viajan en la plantilla y también cuentan');
  decir(!/EL SABER DE LA CASA/.test(sc) && /EL SABER DE LA CASA/.test(sr),
    'lo que cambia con la pregunta —el saber— queda fuera de lo calentado: por eso es prefijo');
  decir(!/Hoy es/.test(sc) && /Hoy es/.test(sr), 'y la hora también, que cambia sola cada minuto');
  decir(/LO QUE LA JUNTA TE HA DICHO/.test(sc) && /LO QUE ESTÁ PENDIENTE/.test(sc),
    'lo que dura la sesión —memoria, pendientes— sí va dentro: es lo que se ahorra');
}

titulo('la guarda de lo prometido: no se dice que dejó un PDF que no existe');
{
  /* ── LO QUE PASÓ DE VERDAD, 7-sep ─────────────────────────────────────────
     José: «me puedes armar un PDF de esta idea». ULTRON abrió DOS cajas
     —crear_documento vivía en una y exportar_pdf en OTRA—, se quedó sin
     vueltas, y contestó «Listo, le dejo el PDF en el chat». No había creado
     nada. Tres veces seguidas, hasta que José escribió «para descargar, no me
     lo cuentes». Decir que hizo algo que no hizo es el peor fallo que puede
     tener, y era el único que no estaba vigilado. */
  const conv = await memoria.abrirConversacion(JOSE.correo, { titulo: 'pdf' });
  guion = [{ texto: 'Listo, le dejo el PDF en el chat con todo lo que conversamos.' },
           { texto: '', llamadas: [{ name: 'crear_documento', arguments: { titulo: 'La idea P2P', texto: '# La idea\n\nUn agente local vende ORIGEN a su gente.' } }] },
           { texto: 'Lo escribí y quedó en la biblioteca.' }];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'armame un PDF de esta idea', conversacionId: String(conv._id) });
  decir(r.herramientas.some((h) => h.nombre === 'crear_documento'),
    'si prometió un documento sin crearlo, se le devuelve y ESTA VEZ lo crea', r.herramientas.map((h) => h.nombre).join(','));
  decir(!/le dejo el PDF/i.test(r.texto), 'y la promesa falsa ya no queda en pantalla', r.texto.slice(0, 90));

  /* Y si ni al segundo intento lo hace, se dice la verdad en su lugar: un
     «no pude» es mejor que mandar a alguien a buscar un archivo que no está. */
  guion = [{ texto: 'Listo, le dejo el PDF en el chat.' },
           { texto: 'Ya se lo dejé, el documento está listo.' },
           { texto: 'De verdad se lo dejé, el PDF queda listo.' }];
  const r2 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'el PDF por favor', conversacionId: String(conv._id) });
  decir(!/le dejo|se lo dej|queda listo/i.test(r2.texto) && /no pude/i.test(r2.texto),
    'y si insiste en prometer sin hacerlo, el texto se corrige a «no pude»', r2.texto.slice(0, 90));

  /* ── Y SI PIDIERON UN PDF, NO BASTA CON EL DOCUMENTO ────────────────────
     Probado contra producción con la primera versión de esta guarda: ULTRON
     llamó a `crear_documento` —y la guarda se dio por satisfecha— pero nunca
     llamó a `exportar_pdf`. Resultado: «le dejo el PDF a un toque» con
     `acciones: []`. El documento existía en la biblioteca, el PDF no, y no
     había ni un botón que tocar. Quien pide un PDF quiere un archivo. */
  /* El id tiene que ser el de un documento DE VERDAD: `exportar_pdf` busca el
     documento en la biblioteca y si no lo encuentra no deja botón — que fue
     exactamente lo que enseñó esta prueba la primera vez que se escribió. */
  const doc = await memoria.guardarDocumento({ titulo: 'Los tres pendientes', texto: '# Tres pendientes\n\nUno, dos y tres.', autor: JOSE.correo });
  guion = [{ texto: '', llamadas: [{ name: 'crear_documento', arguments: { titulo: 'Los tres pendientes', texto: '# Tres pendientes\n\nUno, dos y tres.' } }] },
           { texto: 'Listo, le dejo el PDF a un toque.' },
           { texto: '', llamadas: [{ name: 'exportar_pdf', arguments: { id: String(doc._id) } }] },
           { texto: 'Ahí lo tiene para bajar.' }];
  const r4 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'armame un PDF con los tres pendientes', conversacionId: String(conv._id) });
  decir(r4.herramientas.some((h) => h.nombre === 'exportar_pdf'),
    'crear el documento NO alcanza si pidieron PDF: se le devuelve hasta que lo exporte',
    r4.herramientas.map((h) => h.nombre).join(','));
  decir((r4.acciones || []).some((a) => /formato=pdf/.test(a.url || '')),
    'y queda el botón para bajarlo, que es lo que la persona pidió',
    JSON.stringify((r4.acciones || []).map((a) => a.nombre)));

  /* Si el documento quedó escrito pero el PDF no salió, se dice ESO y no un
     «no pude» que tira a la basura el trabajo que sí se hizo. */
  guion = [{ texto: '', llamadas: [{ name: 'crear_documento', arguments: { titulo: 'Otro', texto: '# Otro\n\nTexto.' } }] },
           { texto: 'Listo, le dejo el PDF.' },
           { texto: 'De verdad, el PDF queda listo.' },
           { texto: 'Ya se lo dejé, el documento está listo.' }];
  const r5 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'quiero el PDF para descargar', conversacionId: String(conv._id) });
  decir(/qued[oó] en la biblioteca/i.test(r5.texto) && /no logré dejarlo en PDF/i.test(r5.texto),
    'y si el PDF no sale, se dice que el documento SÍ quedó escrito, no un «no pude» a secas', r5.texto.slice(0, 110));

  /* Lo que NO tiene que disparar: ofrecer, preguntar, o dejar un botón de
     abrir —que sí es verdad—. Una guarda que salta de más molesta más de lo
     que arregla. */
  guion = [{ texto: 'Le dejo Ordenex a un toque. ¿Quiere que le arme un memo con esto?' }];
  const r3 = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'abrime ordenex', conversacionId: String(conv._id) });
  decir(/Le dejo Ordenex/.test(r3.texto), 'ofrecer un documento o dejar un botón NO cuenta como prometerlo', r3.texto.slice(0, 80));
}

titulo('conversación larga: lo que sale de la ventana se resume, no se tira');
{
  /* ── LO QUE PASÓ DE VERDAD, 7-sep ─────────────────────────────────────────
     Medido contra producción. Turno 1: «al agente de Choluteca lo llamamos
     Mario Velásquez, cupo 3.500 lempiras». Diez turnos de relleno. Turno 14:
     «¿cómo se llama el agente de Choluteca?». No se acordaba — y no era el
     modelo: al prompt solo van los últimos ocho turnos y lo de más atrás SE
     TIRABA.

     Ocho son los que caben; meter más es hacer que el modelo evalúe fichas de
     hace media hora antes de decir la primera palabra. Así que la respuesta no
     es una ventana más grande: es no perder lo que sale de ella. */
  const turnoN = (i) => ({ rol: i % 2 ? 'ultron' : 'miembro', texto: `turno número ${i} de esta conversación, con su relleno` });
  const previa = { turnos: Array.from({ length: 12 }, (_, i) => turnoN(i)), resumen: '', resumidos: 0 };

  guion = [{ texto: 'Agente de Choluteca: Mario Velásquez, cupo 3.500 lempiras diarios. Junta: martes 22, 4 de la tarde, Roatán.' }];
  const antes = pedidos.length;
  const r = await cerebro.resumirHilo({ previa });
  decir(pedidos.length === antes + 1, 'resumir cuesta UNA llamada, y va después de contestar', `${pedidos.length - antes}`);
  decir(r?.resumidos === 4, 'se resume lo que YA salió de la ventana: 12 turnos menos los 8 que viajan enteros', String(r?.resumidos));
  decir(/Mario Vel/.test(r?.resumen || ''), 'y el resumen guarda el NOMBRE, que es lo que hacía falta', r?.resumen?.slice(0, 80));

  /* Que no se pida sin herramientas y en una sola llamada es lo que hace que
     esto no se note: si el resumidor llamara herramientas, cada turno costaría
     otro turno entero. */
  const p = pedidos.at(-1);
  decir(!p.tools?.length, 'el resumidor va SIN herramientas: es leer y escribir, no averiguar');
  decir(p.stream === false && p.options?.temperature <= 0.3, 'y en frío, que un resumen no es sitio para inventar', JSON.stringify(p.options));
  decir(/NOMBRES|cifras|fechas/i.test(p.messages.at(-1).content), 'se le pide lo contrario de un resumen bonito: nombres, cifras, fechas y decisiones');

  /* ── NI UN HUECO NI UNA REPETICIÓN ───────────────────────────────────────
     Lo que está en el resumen NO puede estar además en la ventana, o el modelo
     lo lee dos veces; y lo que sale de la ventana tiene que estar en el
     resumen, o hay un hueco. Los dos números salen de la misma constante. */
  const conResumen = { ...previa, resumen: r.resumen, resumidos: r.resumidos };
  const m = nodo._adentro.armarMensajes({ system: 'SISTEMA', previa: conResumen, texto: '¿cómo se llama el agente?' });
  decir(/Mario Vel/.test(m[1]?.content || ''), 'el resumen entra en el prompt, justo antes del hilo', (m[1]?.content || '').slice(0, 70));
  decir(m[0].role === 'system' && !/Mario Vel/.test(m[0].content),
    'y NO entra en el system: ahí está lo que el motor tiene en caché, y meterle algo que cambia lo tiraría entero');
  const delHilo = m.slice(2, -1).map((x) => x.content).join(' ');
  decir(!/turno número 3\b/.test(delHilo) && /turno número 11/.test(delHilo),
    'el hilo lleva los últimos ocho y ni uno de los ya resumidos: sin repetir y sin hueco',
    `${m.length - 3} turnos del hilo`);

  /* Segunda vuelta: el resumen se resume sobre sí mismo y NO crece. Es lo que
     hace que una conversación de doscientos turnos cueste lo mismo que una de
     veinte. */
  const seguida = { ...conResumen, turnos: [...previa.turnos, turnoN(12), turnoN(13)] };
  guion = [{ texto: 'Agente de Choluteca: Mario Velásquez, cupo 3.500. Junta: martes 22. Tope del piloto: 12 al día.' }];
  const r2 = await cerebro.resumirHilo({ previa: seguida });
  decir(r2?.resumidos === 6, 'la vuelta siguiente sigue donde quedó la anterior', String(r2?.resumidos));
  decir(/Lo que ya venía anotado/.test(pedidos.at(-1).messages.at(-1).content),
    'y se le da el resumen viejo para que lo funda con lo nuevo, no para escribir otro aparte');
  decir(/Mario Vel/.test(r2?.resumen || '') && /12 al día|piloto/.test(r2?.resumen || ''),
    'lo viejo sobrevive y lo nuevo entra', r2?.resumen?.slice(0, 100));

  /* Si no hay nada que guardar, se apunta hasta dónde se llegó igual: si no,
     se volvería a resumir el mismo pedazo en cada turno, para siempre. */
  guion = [{ texto: 'NADA' }];
  const r3 = await cerebro.resumirHilo({ previa: { turnos: Array.from({ length: 14 }, (_, i) => turnoN(i)), resumen: 'lo de antes', resumidos: 4 } });
  decir(r3?.vacio === true && r3?.resumidos === 6 && r3?.resumen === 'lo de antes',
    'un pedazo sin nada que guardar se marca igual, o se resumiría lo mismo para siempre', JSON.stringify(r3));

  /* ── LA RANURA ES DE QUIEN PREGUNTA ────────────────────────────────────
     La tarjeta tiene UNA ranura y el resumen la ocupa. Primera versión, medida
     en producción: los turnos pasaron de 13 s a 33 s porque cada pregunta
     esperaba a que se terminara de resumir la anterior. El resumen arreglaba
     la memoria y rompía la fluidez — que era justo lo que había que arreglar.
     Así que el resumen es lo primero que cede, siempre. */
  const corte = cerebro.nuevoCorteDeResumen();
  guion = [{ texto: 'un resumen larguísimo que no va a llegar a terminarse nunca porque llegó una pregunta' }];
  const t0corte = Date.now();
  const lento = cerebro.resumirHilo({ previa, senalCorte: corte });
  cerebro.dejarLaRanura();
  const cortado = await lento;
  const msCorte = Date.now() - t0corte;
  decir(cortado === null, 'una pregunta nueva corta el resumen y le devuelve la ranura', String(cortado));
  decir(msCorte < 60, 'y lo corta EN EL ACTO, sin esperar a que termine de escribir', `${msCorte} ms`);

  /* Y cortarlo no pierde nada: `resumidos` no se movió, así que el turno
     siguiente lo vuelve a hacer desde el mismo sitio. */
  guion = [{ texto: 'Agente de Choluteca: Mario Velásquez.' }];
  const reintento = await cerebro.resumirHilo({ previa });
  decir(reintento?.resumidos === 4, 'y el turno siguiente lo retoma desde donde estaba: no se perdió un turno', String(reintento?.resumidos));

  /* Una pasada nunca es larga: si salieron veinte turnos de golpe se hacen
     ocho ahora y el resto después. Un resumen de veinte segundos es un turno
     de veinte segundos para el que pregunte justo después. */
  guion = [{ texto: 'resumen' }];
  const muchos = await cerebro.resumirHilo({ previa: { turnos: Array.from({ length: 40 }, (_, i) => turnoN(i)), resumen: '', resumidos: 0 } });
  decir(muchos?.resumidos === 8, 'con cuarenta turnos atrasados se resumen OCHO por vuelta, no los treinta y dos', String(muchos?.resumidos));
  decir(nodo._adentro.TOPE_RESUMEN <= 1000 && pedidos.at(-1).options.num_predict <= 250,
    'y se le piden pocas fichas de salida: es lo que hacía que tardara veinte segundos',
    `tope ${nodo._adentro.TOPE_RESUMEN} letras · ${pedidos.at(-1).options.num_predict} fichas`);

  /* Y si el motor falla, la conversación sigue con su ventana de ocho, que es
     lo que había antes de todo esto. Nada se rompe por un resumen. */
  caido = true;
  const r4 = await cerebro.resumirHilo({ previa });
  caido = false;
  decir(r4 === null, 'si el motor no contesta, el resumen se salta y no rompe el turno', String(r4));
  const m4 = nodo._adentro.armarMensajes({ system: 'SISTEMA', previa, texto: 'hola' });
  decir(m4.length === 10 && m4[0].role === 'system',
    'sin resumen, el prompt es el de siempre: system, ocho turnos y la pregunta', `${m4.length} mensajes`);
}

titulo('el turno tiene techo: lo obligatorio siempre corre, lo opcional solo si queda tiempo');
{
  /* ── LO QUE PASÓ DE VERDAD, 7-sep ─────────────────────────────────────────
     Del registro de producción, un turno escrito:

       [pensar] texto · contexto 8006ms · primera 95061ms · total 97120ms
                · vueltas 3 · fichas 33128

     Noventa y siete segundos, y ninguna pieza estaba «rota»: el vector
     agotando sus ocho segundos, tres vueltas de herramientas, y las guardas
     volviendo a preguntarle al modelo DOS veces cada una con las 64
     herramientas dentro. Cada una se añadió con un buen motivo y ninguna
     miraba el reloj. Ese era el fallo de fondo — el turno no tenía techo, así
     que su duración era la suma de todo lo que a alguien le pareció buena
     idea.

     Lo que se prueba acá es el techo: con el presupuesto agotado, lo
     OBLIGATORIO —pensar y contestar— corre igual, y lo OPCIONAL —las vueltas
     de más, las guardas que vuelven a preguntar— se salta. */
  const conv = await memoria.abrirConversacion(JOSE.correo, { titulo: 'reloj' });
  const antesDe = process.env.ULTRON_PRESUPUESTO_MS;

  /* Con presupuesto normal, la guarda de lo prometido cuesta sus llamadas. */
  guion = [{ texto: 'Listo, le dejo el PDF en el chat.' },
           { texto: 'Ya se lo dejé, el documento está listo.' },
           { texto: 'De verdad se lo dejé, el PDF queda listo.' }];
  let n = pedidos.length;
  const conTiempo = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'el PDF por favor', conversacionId: String(conv._id) });
  const gastoConTiempo = pedidos.length - n;

  /* Y con el presupuesto en cero, la misma conversación no vuelve a preguntar. */
  process.env.ULTRON_PRESUPUESTO_MS = '0';
  guion = [{ texto: 'Listo, le dejo el PDF en el chat.' },
           { texto: 'Ya se lo dejé, el documento está listo.' },
           { texto: 'De verdad se lo dejé, el PDF queda listo.' }];
  n = pedidos.length;
  const sinTiempo = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'el PDF por favor', conversacionId: String(conv._id) });
  const gastoSinTiempo = pedidos.length - n;
  process.env.ULTRON_PRESUPUESTO_MS = antesDe === undefined ? '' : antesDe;
  if (antesDe === undefined) delete process.env.ULTRON_PRESUPUESTO_MS;

  decir(gastoSinTiempo < gastoConTiempo,
    'sin tiempo, la guarda NO vuelve a preguntarle al modelo',
    `${gastoConTiempo} llamadas con presupuesto · ${gastoSinTiempo} sin él`);
  decir(gastoSinTiempo >= 1, 'pero contestar sí se hace siempre: lo obligatorio no se salta', `${gastoSinTiempo} llamada(s)`);

  /* ── Y ESTO ES LO QUE NO SE NEGOCIA ──────────────────────────────────────
     Que no haya tiempo de ARREGLAR la promesa falsa no es excusa para
     PUBLICARLA. Corregir el texto no cuesta ni una llamada al modelo, así que
     corre igual. Antes esta corrección vivía DENTRO de la guarda: si la guarda
     no corría, «le dejo el PDF» salía a pantalla tal cual. */
  decir(!/le dejo el PDF/i.test(sinTiempo.texto) && /no pude/i.test(sinTiempo.texto),
    'y la promesa falsa NO se publica aunque no haya habido tiempo de rehacerla',
    sinTiempo.texto.slice(0, 90));
  decir(!/le dejo el PDF/i.test(conTiempo.texto), 'con tiempo, lo mismo por el camino largo', conTiempo.texto.slice(0, 60));

  /* ── EL CASO QUE DE VERDAD SE VIO: TRES VUELTAS Y NI UNA PALABRA ─────────
     El techo entre vueltas exigía que YA hubiera dicho algo para cortar, y el
     turno de 97 segundos no había dicho nada: eran tres llamadas de
     herramientas encadenadas. Cortar ahí dejaría la pantalla en blanco, así
     que no se corta — se le quitan las HERRAMIENTAS y se le pide la respuesta
     con lo que ya tiene. Sin herramientas no puede pedir otra vuelta: el bucle
     termina por fuerza y la llamada es la más barata del turno. */
  process.env.ULTRON_PRESUPUESTO_MS = '0';
  guion = [{ texto: '', llamadas: [{ name: 'ver_estado_vivo', arguments: {} }] },
           { texto: 'El ORIGEN está a dos dólares con cincuenta y nueve.' },
           { texto: 'esta no se llega a pedir' }];
  n = pedidos.length;
  const mudo = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'cómo va el ORIGEN', conversacionId: String(conv._id) });
  const delTurno = pedidos.slice(n);

  decir(delTurno.length === 2, 'sin tiempo y sin nada dicho, se da UNA vuelta más y no tres', `${delTurno.length} llamadas`);
  decir((delTurno[0].tools || []).length > 0 && !(delTurno[1].tools || []).length,
    'y esa última va SIN herramientas: no puede pedir otra vuelta aunque quiera',
    `${(delTurno[0].tools || []).length} herramientas la primera · ${(delTurno[1].tools || []).length} la última`);
  decir(/dos d[oó]lares/.test(mudo.texto), 'y la persona igual recibe una respuesta, que es lo único que no se negocia', mudo.texto.slice(0, 70));

  /* Y si el modelo se pone terco y escribe una llamada aunque no le dieron
     herramientas, tampoco se corre: la vuelta sin tiempo es la última pase lo
     que pase. Sin esto el bucle podía seguir hasta el tope de vueltas ya
     pasado el techo, que es justo lo que el techo existe para impedir. */
  guion = [{ texto: '', llamadas: [{ name: 'ver_estado_vivo', arguments: {} }] },
           { texto: '', llamadas: [{ name: 'ver_estado_vivo', arguments: {} }] },
           { texto: '', llamadas: [{ name: 'ver_estado_vivo', arguments: {} }] }];
  n = pedidos.length;
  const terco = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'cómo va el ORIGEN', conversacionId: String(conv._id) });
  decir(pedidos.length - n === 2, 'y el turno termina igual, aunque el modelo insista en pedir herramientas', `${pedidos.length - n} llamadas`);
  decir(terco.texto.trim().length > 0, 'con una frase que se puede leer, nunca en blanco', terco.texto.slice(0, 70));

  process.env.ULTRON_PRESUPUESTO_MS = antesDe === undefined ? '' : antesDe;
  if (antesDe === undefined) delete process.env.ULTRON_PRESUPUESTO_MS;
}

titulo('las guardas no abren las 64 herramientas');
{
  /* La guarda de la negativa pedía `cajas: CAJAS_UTILES` — el catálogo
     entero— en cada una de sus DOS llamadas. Son 10 058 fichas de
     herramientas por llamada, y es de donde salían los turnos de 33 000
     fichas del registro. Se abren las cuatro que sirven para responder una
     negativa y nada más; si hiciera falta otra, para eso está
     `mas_herramientas`, que va en el núcleo. */
  const todas = herramientas.paraOllama({ cajas: herramientas.CAJAS_UTILES });
  const deLaGuarda = herramientas.paraOllama({ cajas: ['internet', 'cadenas', 'cuentas', 'documentos'].filter((c) => herramientas.CAJAS_UTILES.includes(c)) });
  const fichasDe = (d) => nodo._adentro.fichas(JSON.stringify(d));
  decir(fichasDe(deLaGuarda) < fichasDe(todas) / 1.6,
    'la guarda abre bastante menos de la mitad del catálogo',
    `${fichasDe(deLaGuarda)} fichas contra ${fichasDe(todas)}`);
  decir(deLaGuarda.some((d) => (d.function?.name || d.name) === 'mas_herramientas'),
    'y sigue pudiendo pedir la que le falte, que es lo que hace que recortar sea seguro');
}

titulo('un PDF es UNA llamada, no cuatro vueltas y dos cajas');
{
  /* ── EL CAMINO QUE HABÍA ──────────────────────────────────────────────────
     `crear_documento` vivía en una caja y `exportar_pdf` en otra, así que un
     PDF pedía cuatro vueltas: abrir caja, crear, abrir otra caja, exportar.
     Medido contra producción tres veces el 7-sep: el modelo gastaba las
     vueltas abriendo cajas, se perdía, y contestaba «Listo, le dejo el PDF»
     sin haber escrito nada. No se arregla pidiéndole que se concentre: se
     arregla haciendo que el pedido quepa en una llamada. */
  const nucleo = herramientas.paraOllama({ cajas: [] }).map((d) => d.function?.name || d.name);
  decir(nucleo.includes('crear_documento'),
    'escribir un documento está SIEMPRE a la vista, sin abrir ninguna caja', `${nucleo.length} herramientas de fábrica`);

  const def = herramientas.DEFINICIONES.find((d) => d.name === 'crear_documento');
  decir(!!def.input_schema.properties.pdf,
    'y lleva `pdf` en la misma llamada: escribirlo y dejarlo para bajar son un solo gesto');

  /* Y que de verdad deje el botón, que es lo único que la persona ve. */
  const ctx = { miembro: { correo: JOSE.correo }, documentos: [], acciones: [], junta: JUNTA, fuentes: [], memorias: [], envios: [], pendientes: [] };
  const salida = await herramientas.correr('crear_documento',
    { titulo: 'Los tres pendientes', markdown: '# Tres\n\nUno, dos y tres.', pdf: true }, ctx);
  decir(ctx.acciones.some((a) => /formato=pdf/.test(a.url || '')),
    'una sola llamada deja el documento Y el botón para bajarlo en PDF',
    JSON.stringify(ctx.acciones.map((a) => a.nombre)));
  decir(/PDF/.test(salida), 'y se lo dice al modelo, para que no lo intente otra vez', String(salida).slice(0, 90));

  /* `exportar_pdf` sigue existiendo, y no sobra: es para sacarle el PDF a un
     documento VIEJO, que es otra cosa que crear uno. Vive con los documentos,
     no en la caja de acciones donde estaba. */
  const conCaja = herramientas.paraOllama({ cajas: ['documentos'] }).map((d) => d.function?.name || d.name);
  decir(conCaja.includes('exportar_pdf'),
    'y exportar_pdf queda en la caja de documentos, para los que ya estaban escritos');
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
  decir(/tome ese dato con cuidado/.test(r2.texto) && /leer_pagina/.test(r2.texto), 'si insiste sin llamarla, la cita queda marcada para la persona, de usted', r2.texto.slice(-90));

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
  // El 5-sep, contestando sobre Orden Global, arrancó con «_icallculator_»:
  // el resto de una herramienta que quiso llamar y no le salió.
  const b = nodo._adentro.sinElRestoDeUnaHerramienta;
  decir(b('_icallculator_\n\nSegún la búsqueda, esto es lo que hay.') === 'Según la búsqueda, esto es lo que hay.', 'el resto de una herramienta al inicio se quita');
  decir(b('<|buscar_web|> La casa está en orden.') === 'La casa está en orden.', 'y también si viene entre ángulos');
  decir(b('_Nota:_ el oro subió.') === '_Nota:_ el oro subió.', 'pero una cursiva de verdad no se toca', b('_Nota:_ el oro subió.'));
  decir(b('_muy importante_ y además esto') === '_muy importante_ y además esto', 'ni una cursiva de varias palabras');
  decir(b('_solo_') === '_solo_', 'y si no queda nada abajo, no se quita nada', b('_solo_'));

  /* Y el otro resto, el que sobrevivió a los parámetros del fabricante. Con
     ellos puestos la repetición sin fin se apagó —de cientos de líneas quedó
     UNA— pero el modelo sigue escupiendo a veces un pedazo de código pegado
     ARRIBA de la respuesta buena, en el mismo turno en que llama una
     herramienta. Se limpia por una firma estrechísima: el mismo identificador
     a los dos lados de los dos puntos, que en español no pasa nunca. */
  const cc = nodo._adentro.sinCodigoPegadoArriba;
  decir(cc('sourceMapping: sourceMapping\n\nEl ORIGEN está a 2,59 dólares.') === 'El ORIGEN está a 2,59 dólares.',
    'el «sourceMapping: sourceMapping» de la cabecera se quita', JSON.stringify(cc('sourceMapping: sourceMapping\n\nEl ORIGEN está a 2,59 dólares.')));
  decir(cc('sourceMapping: sourceMapping,\ntargetMapping: targetMapping;\n\nHay 10 pendientes.') === 'Hay 10 pendientes.',
    'y varias líneas seguidas también, con su coma o su punto y coma');
  decir(cc('ORIGEN: 2,59\nOrdenex: VIVA\n\nTodo en orden.') === 'ORIGEN: 2,59\nOrdenex: VIVA\n\nTodo en orden.',
    'PERO un dato de verdad no se toca: los dos lados son distintos');
  decir(cc('Nota: Nota es un nombre propio y esto sigue.') === 'Nota: Nota es un nombre propio y esto sigue.',
    'ni una frase que empiece igual a los dos lados pero SIGA hablando');
  decir(cc('sourceMapping: sourceMapping') === 'sourceMapping: sourceMapping',
    'y si debajo no queda nada, no se borra: mejor basura que tragarse la respuesta');
  decir(cc('El ORIGEN está a 2,59.') === 'El ORIGEN está a 2,59.', 'una respuesta limpia pasa intacta');

  /* La segunda cara, y la que destapó qué era todo esto: «pregunta» es el
     parámetro de buscar_saber y los «}}>» son la cola de una etiqueta de
     llamada que no cerró. Nunca fue prosa repetida: es una herramienta escrita
     mal, igual que el «_icallculator_». */
  decir(cc("sourceMapping: {pregunta: 'a cuánto está el ORIGEN'}}>\nEl ORIGEN está a $2.59.") === 'El ORIGEN está a $2.59.',
    'una llamada malformada en la cabecera se quita entera, con su cola de cierres',
    JSON.stringify(cc("sourceMapping: {pregunta: 'a cuánto está el ORIGEN'}}>\nEl ORIGEN está a $2.59.")));
  decir(cc('herramienta: [1, 2, 3]\n\nHay tres casas vivas.') === 'Hay tres casas vivas.',
    'y también si el valor viene entre corchetes');
  decir(cc('La junta acordó: {revisar el gas, cerrar el trato} y seguir.') === 'La junta acordó: {revisar el gas, cerrar el trato} y seguir.',
    'PERO una frase que sigue hablando después de la llave no se toca');
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
  decir(/^LA CASA\n/.test(p.messages[0].content) && /Sos ULTRON FP/.test(p.messages[0].content) && /Nunca se dice «respaldados»/.test(p.messages[0].content),
    'y la cabecera y la identidad siguen al principio, enteras');
  decir(nodo._adentro.PRESUPUESTO_FICHAS + 1500 < nodo._adentro.CTX, 'con sitio para la respuesta debajo del contexto de AU-RA', `${nodo._adentro.PRESUPUESTO_FICHAS} + 1500 < ${nodo._adentro.CTX}`);
}

titulo('el modelo enganchado se corta donde empezó a repetirse');
{
  /* Pasó de verdad: con una pregunta sobre Orden Global el modelo escribió
     «sourceMappingError:» cientos de veces hasta agotar el cupo. Ni la
     búsqueda ni la lectura de páginas traían esa palabra: fue el modelo. */
  const d = nodo._adentro.dondeEmpiezaElBucle;
  decir(d('El ORIGEN está a 2,59 dólares y la cadena va en el bloque 88.900 de hoy.') === null, 'la prosa normal no es un bucle');
  decir(d('Es muy, muy, muy grande y muy claro para todos los que lo miran de cerca.') === null, 'una repetición legítima tampoco');
  decir(d('| Casa | Estado |\n| --- | --- |\n| a | — |\n| b | — |\n| c | — |\n| d | — |') === null, 'ni una tabla con celdas iguales');
  const enganchado = 'Según el sitio de Orden Global. ' + 'sourceMappingError: '.repeat(40);
  const corte = d(enganchado);
  decir(corte === 32, 'y un enganche se corta en la PRIMERA repetición, no en la tercera', String(corte));
  decir(enganchado.slice(0, corte) === 'Según el sitio de Orden Global. ', 'dejando lo que dijo antes de engancharse');

  // Y en vivo: el stream se corta, se avisa, y la respuesta es la buena.
  guion = [{ texto: 'La casa está en orden. ' + 'sourceMappingError: '.repeat(40) }];
  const eventos = [];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'buscá información de Orden Global', emitir: (e, d2) => eventos.push([e, d2]) });
  decir(!/sourceMappingError: sourceMappingError/.test(r.texto), 'la respuesta que llega no trae el bucle', r.texto.slice(0, 90));
  decir(/La casa está en orden/.test(r.texto), 'y sí trae lo que dijo antes', r.texto.slice(0, 90));
  decir(eventos.some(([e, d2]) => e === 'pensando' && d2.motivo === 'se repetía'), 'la consola se entera de por qué se cortó');
  decir(eventos.some(([e]) => e === 'reemplazo'), 'y se le dice con qué texto quedarse');
}

titulo('engancharse SIN haber dicho nada se reintenta una vez, no se rinde');
{
  /* Visto en vivo el 5-sep contra el nodo de producción, con una pregunta de
     tres líneas: el PRIMER token ya era el bucle, así que la guarda cortó y
     dejó el vacío — y la junta leyó «no me salió una respuesta con palabras».
     El turno entero perdido por un token. El enganche es aleatorio: con otra
     semilla sale. */
  guion = [
    { texto: 'sourceMapping: '.repeat(60) },
    { texto: 'El ORIGEN está a 2,59 dólares y hay diez pendientes abiertos.' },
  ];
  const eventos = [];
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: '¿a cuánto está el ORIGEN?', emitir: (e, d2) => eventos.push([e, d2]) });
  decir(/2,59 dólares/.test(r.texto), 'el reintento contesta de verdad, en vez de rendirse con el vacío', r.texto.slice(0, 100));
  decir(!/sourceMapping/.test(r.texto), 'y sin rastro del bucle');
  decir(eventos.some(([e, d2]) => e === 'pensando' && d2.motivo === 'se reintenta'), 'y se dice que se reintentó, no se hace a escondidas');
}

titulo('pero solo una vez: dos enganches seguidos no queman el nodo');
{
  guion = [
    { texto: 'sourceMapping: '.repeat(60) },
    { texto: 'otraCosaRota: '.repeat(60) },
    { texto: 'Esto ya no se debería pedir nunca.' },
  ];
  let pedidos = 0;
  const antes = guion.length;
  const r = await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'hola', emitir: () => { pedidos++; } });
  decir(!/Esto ya no se debería pedir/.test(r.texto), 'al segundo enganche se cierra el turno: no hay tercer intento', r.texto.slice(0, 90));
  decir(guion.length === antes - 2, 'y se gastaron exactamente dos llamadas al nodo, no tres', `quedan ${guion.length} de ${antes}`);
}

titulo('el título tampoco se va a otro alfabeto');
{
  /* «Consultas ORIGEN y pendientes сегодня不宜继续用西班牙语回答» — visto en
     vivo. La guarda del idioma vigilaba la respuesta y no el título, y el
     título es lo que queda en la lista de conversaciones para siempre. */
  guion = [{ texto: 'Consultas ORIGEN y pendientes сегодня不宜继续用西班牙语回答' }];
  const t1 = await cerebro.titular('¿a cuánto está el ORIGEN?');
  decir(t1 === 'Consultas ORIGEN y pendientes', 'el título se corta donde empieza el otro alfabeto', String(t1));
  guion = [{ texto: '标题' }];
  const t2 = await cerebro.titular('hola');
  decir(t2 === null, 'y si no queda un título en español no se fuerza uno malo: null, y quien llama pone el suyo', String(t2));
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
  /* LOS PARÁMETROS SON LOS DEL FABRICANTE, y esta prueba existe para que nadie
     los vuelva a inventar. Durante dos días el bucle se combatió a mano
     subiendo y bajando repeat_penalty; el fabricante publica cuatro
     parámetros para su modo instruct y decíamos uno. `presence_penalty` es,
     por su propia ficha, el que existe «para reducir la repetición sin fin». */
  /* Se mira el PRIMER pedido del turno y no el último: el último de este bloque
     es la llamada de rescate del idioma, que baja la temperatura a 0,2 a
     propósito para traer al modelo de vuelta al español. Esa excepción es
     deliberada y no debe arrastrar a la regla. */
  const o = pedidos[0].options;
  decir(o.repeat_penalty === 1.0, 'repeat_penalty vuelve a 1.0, que es lo que pide el fabricante', String(o.repeat_penalty));
  decir(o.presence_penalty === 1.0, 'presence_penalty puesto: es la perilla contra la repetición sin fin', String(o.presence_penalty));
  decir(o.presence_penalty < 1.5, 'y por debajo de su 1.5, porque alto mezcla idiomas y acá se habla español', String(o.presence_penalty));
  decir(o.temperature === 0.7 && o.top_p === 0.8 && o.top_k === 20, 'y temperatura, top_p y top_k son los suyos', JSON.stringify({ t: o.temperature, p: o.top_p, k: o.top_k }));
  decir(pedidos.at(-1).options.temperature === 0.2, 'y el rescate del idioma SÍ baja la temperatura, que es su excepción', String(pedidos.at(-1).options.temperature));
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

titulo('el modelo no piensa en voz alta delante de la junta');
{
  /* Qwen3.8 y toda la generación Qwen3 traen el «pensamiento» ENCENDIDO por
     omisión: escriben su borrador antes de contestar. Eso es lo que vería la
     junta, y se paga en fichas y en segundos. Se apaga en `pedir()`, que es por
     donde pasan TODOS los pedidos — y esta prueba existe porque son siete
     llamadas y la que se olvide es la que un día enseña el borrador. */
  guion = [{ texto: 'Listo.' }];
  await cerebro.pensar({ miembro: JOSE, junta: JUNTA, texto: 'hola' });
  decir(pedidos.every((p) => p.think === false), `los ${pedidos.length} pedidos del turno llevan think:false`,
    JSON.stringify(pedidos.map((p) => p.think)));
  guion = [{ texto: 'Un título' }];
  await cerebro.titular('algo');
  decir(pedidos.at(-1).think === false, 'y el del título también');
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
