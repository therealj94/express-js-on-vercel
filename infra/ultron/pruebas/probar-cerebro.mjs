/* EL CEREBRO, con un Claude fingido: lo que importa son las herramientas.
 *
 *   node infra/ultron/pruebas/probar-cerebro.mjs
 *
 * No se llama a Anthropic: se le mete al cerebro un cliente que devuelve lo
 * que la prueba dice. Lo que se comprueba es TODO LO QUE ESTÁ ALREDEDOR del
 * modelo, que es donde de verdad se rompe:
 *
 *   · que el prompt lleve el saber, la memoria, el estado vivo y las reglas
 *     que no se negocian —«referenciado», nunca «respaldado»; no «regulada»—;
 *   · que cada herramienta haga lo que dice: recordar guarda, crear_documento
 *     guarda, proponer_envio NO MANDA;
 *   · que el bucle de herramientas termine, y que una herramienta rota vuelva
 *     al modelo como texto en vez de tumbar el turno;
 *   · que proponer_envio se niegue con un destinatario que no es de la junta.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).replace(/\s+/g, ' ').slice(0, 220) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

// Sin red: el estado vivo se finge vacío y rápido.
globalThis.fetch = async () => { throw new Error('sin red en la prueba'); };
process.env.ANTHROPIC_API_KEY = 'fingida';
delete process.env.MONGODB_URI;

const memoria = require('../lib/memoria.js');
const cerebro = require('../lib/cerebro.js');

/* El Claude fingido: una lista de respuestas, una por vuelta. Cada una puede
   traer texto y/o herramientas. Devuelve la forma que el SDK devuelve. */
function claudeFingido(guion) {
  const llamadas = [];
  let i = 0;
  return {
    llamadas,
    messages: {
      stream(pedido) {
        llamadas.push(pedido);
        const paso = guion[Math.min(i, guion.length - 1)]; i++;
        const oyentes = {};
        const s = {
          on(ev, fn) { oyentes[ev] = fn; return s; },
          async finalMessage() {
            if (paso.texto && oyentes.text) for (const trozo of paso.texto.match(/.{1,12}/g) || []) oyentes.text(trozo);
            const content = [];
            if (paso.texto) content.push({ type: 'text', text: paso.texto });
            for (const h of paso.herramientas || []) content.push({ type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2), name: h.nombre, input: h.entrada });
            // El API de verdad devuelve SIEMPRE `usage`, y de ahí sale el gasto.
            // Un fingido sin usage haría pasar una prueba de gasto con ceros.
            return { content, stop_reason: (paso.herramientas || []).length ? 'tool_use' : 'end_turn',
              usage: paso.uso || { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
          },
        };
        return s;
      },
      async create() { return { content: [{ type: 'text', text: 'Un título corto' }] }; },
    },
  };
}
const ponerClaude = (c) => { cerebro._adentro.clienteAnthropic = () => c; };
// El cerebro llama a clienteAnthropic() por su nombre interno: se inyecta por el módulo.
const Module = require('node:module');
const cerebroRuta = require.resolve('../lib/cerebro.js');
function conClaude(guion) {
  const c = claudeFingido(guion);
  // Se sustituye el SDK entero en la caché de require: es lo que el cerebro carga.
  const sdkRuta = require.resolve('@anthropic-ai/sdk');
  require.cache[sdkRuta] = { id: sdkRuta, filename: sdkRuta, loaded: true, exports: function Anthropic() { return c; } };
  delete require.cache[cerebroRuta];
  const cer = require('../lib/cerebro.js');
  return { cer, c };
}

const JOSE = { nombre: 'José', correo: 'jose@ordenglobal.org', rol: 'presidente', whatsapp: '+50499990000' };
const JUNTA = [JOSE, { nombre: 'Mayra', correo: 'mayra@ordenglobal.org', rol: 'directora', whatsapp: null }];

titulo('el prompt lleva lo que tiene que llevar');
{
  const { cer } = conClaude([{ texto: 'Hola.' }]);
  const eventos = [];
  await memoria.recordar({ texto: 'La junta se reúne los martes', alcance: 'junta', miembro: JOSE.correo, dichoPor: 'José' });
  await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: '¿qué es el gramin?', emitir: (e, d) => eventos.push([e, d]) });
  const pedido = (await (async () => { const { c } = conClaude([{ texto: 'x' }]); await c.messages.stream({}).finalMessage(); return null; })()) || null;
  // Se vuelve a correr con uno que guarde el pedido para leer el system.
  const { cer: cer2, c: c2 } = conClaude([{ texto: 'El gramin es…' }]);
  await cer2.pensar({ miembro: JOSE, junta: JUNTA, texto: '¿qué es el gramin y a cuánto está el ORIGEN?' });
  /* El system son DOS bloques: el estable (identidad, reglas, voz de la casa)
     con cache_control, y el del momento (fecha, memoria, pendientes, estado
     vivo, saber). Se juntan para leerlos, y aparte se comprueba el corte. */
  const bloques = c2.llamadas[0].system;
  const sys = Array.isArray(bloques) ? bloques.map((b) => b.text).join('\n') : bloques;
  decir(Array.isArray(bloques) && bloques.length === 2 && bloques[0].cache_control?.type === 'ephemeral',
    'el prompt va partido en dos y el bloque estable pide caché', JSON.stringify(bloques?.[0]?.cache_control));
  decir(Array.isArray(bloques) && !/Hoy es/.test(bloques[0].text) && /Hoy es/.test(bloques[1].text),
    'y la fecha va en el bloque del momento: en el estable rompería la caché en cada turno');
  decir(/Sos ULTRON FP/.test(sys), 'se presenta como ULTRON FP');
  decir(/José \(presidente\)/.test(sys), 'sabe con quién habla');
  decir(/La junta se reúne los martes/.test(sys), 'lleva la memoria de la junta');
  decir(/EL SABER DE LA CASA/.test(sys) && /gramin|ORIGEN/i.test(sys.split('EL SABER DE LA CASA')[1]), 'lleva secciones del saber sobre la pregunta');
  decir(/LA VOZ DE LA CASA/.test(sys), 'y la voz de la casa (fichas públicas)');
  decir(/NUNCA «respaldados»/.test(sys) && /no está «regulada»/.test(sys), 'con las reglas que no se negocian: «referenciado», no «respaldado»; no «regulada»');
  decir(/AuCorp NO es un banco/.test(sys), 'y que AuCorp no es un banco');
  decir(/Estado vivo|NO CONTESTA|no leído/i.test(sys), 'y el estado vivo, aunque sea «no contesta» (sin red en la prueba)');
  decir(c2.llamadas[0].tools.some((t) => t.type === 'web_search_20250305'), 'con la búsqueda web de Anthropic entre las herramientas');
  decir(c2.llamadas[0].tools.map((t) => t.name).includes('proponer_envio'), 'y proponer_envio, que prepara y no manda');
  decir(eventos.some(([e]) => e === 'texto'), 'el texto se emite a medida que sale');
}

titulo('las herramientas hacen lo que dicen');
{
  const { cer } = conClaude([
    { texto: 'Voy a guardar eso.', herramientas: [{ nombre: 'recordar', entrada: { texto: 'José prefiere los números en lempiras', alcance: 'miembro', tema: 'preferencia' } }] },
    { texto: 'Listo, lo recordé.' },
  ]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'prefiero los números en lempiras' });
  decir(r.memorias.length === 1 && /lempiras/.test(r.memorias[0].texto), 'recordar guarda la memoria', JSON.stringify(r.memorias[0]?.texto));
  const guardadas = await memoria.memoriasDe(JOSE.correo);
  decir(guardadas.some((m) => /lempiras/.test(m.texto) && m.origen === 'deducido'), 'y queda en la memoria del miembro, marcada como deducida');
  decir(/Voy a guardar eso\.\n\nListo, lo recordé\./.test(r.texto), 'el texto de las dos vueltas se junta', r.texto);
  decir(r.herramientas.length === 1 && r.herramientas[0].nombre === 'recordar', 'y el turno anota qué herramienta corrió');
}
{
  const { cer } = conClaude([
    { herramientas: [{ nombre: 'crear_documento', entrada: { titulo: 'Memo de prueba', tipo: 'memo', markdown: '# Memo\n\nContenido.\n\n## Fuentes\n- TRASPASO', para: 'junta' } }] },
    { texto: 'Te dejé el memo en la biblioteca.' },
  ]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'hacé un memo' });
  decir(r.documentos.length === 1 && r.documentos[0].titulo === 'Memo de prueba', 'crear_documento guarda el documento');
  const lista = await memoria.documentos();
  decir(lista.some((d) => d.titulo === 'Memo de prueba' && d.tipo === 'memo'), 'y aparece en la biblioteca de la junta');
}

titulo('proponer_envio prepara y NO manda');
{
  let mando = false;
  const canales = require('../lib/canales.js');
  const wReal = canales.whatsapp; canales.whatsapp = async () => { mando = true; };
  const { cer } = conClaude([
    { herramientas: [{ nombre: 'proponer_envio', entrada: { canal: 'whatsapp', destinatario: 'José', texto: 'Recordatorio: junta el martes.' } }] },
    { texto: 'Te lo dejé listo para que lo confirmes.' },
  ]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'mandame un recordatorio por WhatsApp' });
  decir(r.envios.length === 1 && r.envios[0].canal === 'whatsapp' && r.envios[0].a.correo === JOSE.correo, 'el envío queda propuesto con su destinatario resuelto', JSON.stringify(r.envios[0]?.a));
  decir(mando === false, 'y NO se mandó nada: el cerebro no llama al canal');
  canales.whatsapp = wReal;
}
{
  const { cer } = conClaude([
    { herramientas: [{ nombre: 'proponer_envio', entrada: { canal: 'correo', destinatario: 'pepe@fuera.com', texto: 'hola' } }] },
    { texto: 'No puedo.' },
  ]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'mandale a pepe' });
  decir(r.envios.length === 0, 'con un destinatario que no es de la junta no se prepara nada');
  decir(/No hay ningún miembro/.test(r.herramientas[0].salida), 'y el modelo se entera de por qué', r.herramientas[0].salida);
}
{
  const { cer } = conClaude([
    { herramientas: [{ nombre: 'proponer_envio', entrada: { canal: 'whatsapp', destinatario: 'Mayra', texto: 'hola' } }] },
    { texto: 'Mayra no tiene WhatsApp.' },
  ]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'whatsapp a Mayra' });
  decir(r.envios.length === 0 && /no tiene WhatsApp/.test(r.herramientas[0].salida), 'sin número registrado no hay envío por WhatsApp');
}

titulo('el bucle termina y una herramienta rota no tumba el turno');
{
  const { cer, c } = conClaude([{ texto: 'otra vuelta', herramientas: [{ nombre: 'estado_vivo', entrada: {} }] }]);   // pide siempre → tope
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'dale' });
  decir(c.llamadas.length <= 8, `un modelo que pide herramientas sin parar se corta a las ${c.llamadas.length} vueltas`);
  decir(typeof r.texto === 'string', 'y devuelve texto igual');
}
{
  const { cer } = conClaude([
    { herramientas: [{ nombre: 'no_existe', entrada: {} }] },
    { texto: 'Perdón, esa no existe.' },
  ]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'x' });
  decir(/No existe la herramienta/.test(r.herramientas[0].salida) && /Perdón/.test(r.texto), 'una herramienta desconocida vuelve como texto al modelo, no como excepción');
}

titulo('el hilo se retoma');
{
  const conv = await memoria.abrirConversacion(JOSE.correo, { titulo: 'x' });
  await memoria.anotarTurno(conv._id, JOSE.correo, { rol: 'miembro', texto: 'primera pregunta' });
  await memoria.anotarTurno(conv._id, JOSE.correo, { rol: 'ultron', texto: 'primera respuesta' });
  const { cer, c } = conClaude([{ texto: 'sigo' }]);
  await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'segunda pregunta', conversacionId: String(conv._id) });
  const msgs = c.llamadas[0].messages;
  decir(msgs.length === 3 && msgs[0].content === 'primera pregunta' && msgs[1].role === 'assistant', 'los turnos anteriores van delante del nuevo', msgs.map((m) => m.role).join(','));
}
{
  const { cer, c } = conClaude([{ texto: 'sigo' }]);
  const ajena = await memoria.abrirConversacion('mayra@ordenglobal.org', {});
  await memoria.anotarTurno(ajena._id, 'mayra@ordenglobal.org', { rol: 'miembro', texto: 'secreto de Mayra' });
  await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'hola', conversacionId: String(ajena._id) });
  decir(!JSON.stringify(c.llamadas[0].messages).includes('secreto de Mayra'), 'un hilo de OTRO miembro no se le muestra aunque pase el id');
}

titulo('cuando Anthropic dice que no, se dice POR QUÉ');
{
  // El 4-sep la cuenta se quedó sin saldo y el panel decía «probá de nuevo»,
  // que era exactamente lo único que NO iba a funcionar. Los motivos con
  // arreglo conocido se llaman por su nombre; el resto sigue genérico.
  const err = (status, tipo, dice) => Object.assign(new Error(dice), { status, error: { error: { type: tipo, message: dice } } });
  const { cer } = conClaude([]);
  const casos = [
    ['sin saldo', err(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'), 'SIN_SALDO', /saldo/i],
    ['llave mala', err(401, 'authentication_error', 'invalid x-api-key'), 'LLAVE_MALA', /ANTHROPIC_API_KEY/],
    ['modelo que no ve', err(404, 'not_found_error', 'model: no-existe'), 'MODELO', /ULTRON_MODELO/],
    ['mucho ritmo', err(429, 'rate_limit_error', 'rate'), 'MUCHO_RITMO', /minuto/i],
    ['saturado', err(529, 'overloaded_error', 'overloaded'), 'SATURADO', /satur/i],
  ];
  for (const [que, e, codigo, dice] of casos) {
    const m = cer.motivo(e);
    decir(m.codigo === codigo && dice.test(m.mensaje), `${que} → ${codigo}, y el mensaje dice dónde se arregla`, m.codigo + ' · ' + m.mensaje);
  }
  const raro = cer.motivo(err(500, 'api_error', 'boom'));
  decir(raro.codigo === 'ERROR' && !/boom/.test(raro.mensaje), 'un fallo que no se conoce NO se explica inventando');
  const apagado = Object.assign(new Error('Falta ANTHROPIC_API_KEY.'), { codigo: 'CEREBRO_APAGADO' });
  decir(cer.motivo(apagado).codigo === 'CEREBRO_APAGADO', 'y el cerebro apagado sigue diciendo lo suyo');
}

titulo('los pendientes: lo que hay que HACER, aparte de lo que hay que saber');
{
  const { cer, c } = conClaude([
    { herramientas: [{ nombre: 'anotar_pendiente', entrada: { texto: 'Fondear la caliente con ORIGEN', quien: 'José', tema: 'ordenex' } }] },
    { texto: 'Anotado.' },
  ]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'hay que fondear la caliente' });
  const abiertos = await memoria.pendientes();
  decir(abiertos.some((p) => /Fondear la caliente/.test(p.texto)), 'se anota y queda abierto', abiertos.map((p) => p.texto).join(' · '));
  decir(r.pendientes.length === 1, 'y el turno lo devuelve para que el panel lo pinte');

  // Y en el turno siguiente el modelo los ve CON su id: sin id, «cerrá el del
  // gas» obliga a adivinar, y cerrar el equivocado es peor que no cerrar.
  const { cer: cer2, c: c2 } = conClaude([{ texto: 'ok' }]);
  await cer2.pensar({ miembro: JOSE, junta: JUNTA, texto: 'qué falta' });
  const sys2 = c2.llamadas[0].system.map((b) => b.text).join('\n');
  const id = abiertos.find((p) => /Fondear/.test(p.texto))._id;
  decir(/LO QUE ESTÁ PENDIENTE/.test(sys2) && sys2.includes(String(id)),
    'los pendientes abiertos van en el prompt, con su id');

  const cerrado = await memoria.cerrarPendiente(String(id), JOSE.correo);
  decir(cerrado.estado === 'hecho', 'se puede cerrar');
  decir(!(await memoria.pendientes()).some((p) => String(p._id) === String(id)), 'y deja de aparecer entre los abiertos');
}

titulo('dos pendientes que dicen lo mismo son uno');
{
  const a = await memoria.anotarPendiente({ texto: 'Fondear la billetera caliente de Ordenex con ORIGEN', creadoPor: JOSE.correo });
  const b = await memoria.anotarPendiente({ texto: 'fondear la billetera caliente de ordenex con origen.', creadoPor: JOSE.correo });
  const c = await memoria.anotarPendiente({ texto: 'Hay que fondear la billetera caliente de Ordenex con ORIGEN, me toca a mí', creadoPor: JOSE.correo });
  decir(b.repetido === true && String(b._id) === String(a._id), 'igual salvo mayúsculas y puntuación: es el mismo, no se crea otro');
  decir(c.repetido === true && String(c._id) === String(a._id), 'y uno que contiene al otro también', c.texto);
  decir((await memoria.pendientes()).filter((p) => /caliente de Ordenex/i.test(p.texto)).length === 1, 'queda uno solo abierto');
  const d = await memoria.anotarPendiente({ texto: 'Fondear el gas de Ethereum', creadoPor: JOSE.correo });
  decir(!d.repetido, 'y uno distinto sí se anota');
  const { cer } = conClaude([{ herramientas: [{ nombre: 'anotar_pendiente', entrada: { texto: 'Fondear la billetera caliente de Ordenex con ORIGEN' } }] }, { texto: 'ok' }]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'anotá' });
  decir(/Ya estaba anotado/.test(r.herramientas[0].salida) && r.pendientes.length === 0, 'y por la herramienta, el modelo se entera de que ya estaba', r.herramientas[0].salida);
}

titulo('lo que cuesta pensar, contado y no estimado');
{
  const { cer } = conClaude([{ texto: 'listo' }]);
  const r = await cer.pensar({ miembro: JOSE, junta: JUNTA, texto: 'hola' });
  decir(r.uso && typeof r.uso.entrada === 'number' && typeof r.uso.salida === 'number',
    'cada turno devuelve las fichas que gastó', JSON.stringify(r.uso));
  const d = cer.dolaresDe('claude-fable-5-1', { entrada: 1e6, salida: 0, lecturaCache: 0, escrituraCache: 0 });
  decir(Math.abs(d - 10) < 1e-9, 'un millón de fichas de entrada de Fable 5.1 son 10 dólares', String(d));
  const d2 = cer.dolaresDe('claude-fable-5-1', { entrada: 0, salida: 1e6, lecturaCache: 0, escrituraCache: 0 });
  decir(Math.abs(d2 - 50) < 1e-9, 'y un millón de salida, 50', String(d2));
  decir(cer.dolaresDe('modelo-que-no-conozco', { entrada: 1e6, salida: 1e6, lecturaCache: 0, escrituraCache: 0 }) === null,
    'un modelo sin precio conocido devuelve null, NO cero: un total que miente por lo bajo es peor que no tenerlo');
  const g = await memoria.gasto();
  decir(g.hoy.turnos > 0 && g.hoy.entrada > 0, 'y el gasto queda anotado para sumarlo por día', JSON.stringify(g.hoy));
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
