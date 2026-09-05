// EL CEREBRO DEL NODO: ULTRON pensando con el modelo de AU-RA, en nuestra tarjeta.
//
// ── LO QUE CAMBIA RESPECTO A CLAUDE, Y POR QUÉ ──────────────────────────────
//
// El modelo es el MISMO que atiende a los clientes de AU-RA (qwen2.5:14b), con
// el mismo contexto de 12 288 fichas, y eso no es una limitación que se pueda
// negociar desde aquí: la tarjeta carga un modelo a la vez, y un pedido con
// otro tamaño lo desaloja. El motor del nodo lo fija de todas formas; este
// archivo está escrito SABIENDO que es así, y por eso:
//
//   · el prompt tiene PRESUPUESTO: unas 30 mil letras entre identidad, saber,
//     memoria, estado vivo, hilo y resultados de herramientas. Lo que no cabe
//     se recorta con criterio (primero lo viejo del hilo, después las
//     secciones sobrantes), nunca al azar por el final.
//   · las herramientas llegan como `tool_calls` de Ollama. Un modelo de 14 mil
//     millones a veces las escribe como texto (<tool_call>…</tool_call>) en
//     vez de como llamada; se leen igual. Y si manda argumentos rotos, la
//     herramienta contesta con texto diciendo qué faltó, y el modelo corrige.
//   · no hay búsqueda web del proveedor: buscar_web y leer_pagina son nuestras.
//
// Lo que NO cambia: las manos (lib/herramientas.js), la memoria, el panel, las
// reglas. Cambia el cerebro, no la casa.

const https = require('node:https');
const http = require('node:http');
const saber = require('../saber');
const vivo = require('../vivo');
const memoria = require('../memoria');
const herramientas = require('../herramientas');

const URL_NODO = (process.env.ULTRON_NODO_URL || '').replace(/\/$/, '');
const SECRETO = (process.env.ULTRON_NODO_SECRETO || '').trim();
const CERT = (process.env.ULTRON_NODO_CERT || '').trim();
const MODELO = process.env.ULTRON_NODO_MODELO || 'qwen2.5:14b';
const MAX_VUELTAS = 6;
const PLAZO_MS = 170_000;

/* EL PRESUPUESTO, EN FICHAS Y NO EN LETRAS.
   5-sep, segunda prueba real: una sola llamada midió 13 421 fichas de entrada
   con un contexto de 12 288. Cuando el pedido no cabe, Ollama recorta POR EL
   PRINCIPIO —o sea la identidad y las reglas— y no avisa. El presupuesto en
   letras se quedaba corto porque las secciones del saber traen tablas, JSON y
   direcciones, que salen a menos de dos letras por ficha, no a tres.

   Así que: se cuenta en fichas con una estimación CONSERVADORA (2,4 letras
   por ficha), se mide primero la base (identidad, voz, memoria, pendientes,
   estado vivo) y el saber recibe lo que sobra, no un tope fijo. Y cada
   llamada real devuelve cuántas fichas evaluó: si se acerca al techo, se
   escribe en el registro con todas las letras. */
const CTX = Number(process.env.ULTRON_NODO_CTX || 12_288);
const RESERVA_SALIDA = 1_500;
const PRESUPUESTO_FICHAS = Number(process.env.ULTRON_NODO_PRESUPUESTO_FICHAS || (CTX - RESERVA_SALIDA - 600));   // 10 188
const LETRAS_POR_FICHA = 2.4;
const fichas = (t) => Math.ceil(String(t || '').length / LETRAS_POR_FICHA);
const PRESUPUESTO = Math.floor(PRESUPUESTO_FICHAS * LETRAS_POR_FICHA);   // en letras, para el hilo y los resultados
const TOPE_HILO = 5_000;          // el hilo anterior, como mucho
const TOPE_TURNO = 1_200;         // cada turno viejo, como mucho
const TOPE_RESULTADO = 2_800;     // cada resultado de herramienta
const SABER_MINIMO = 2_500;       // por debajo de esto no vale la pena traer secciones

function encendido() { return !!(URL_NODO && SECRETO); }

// ── Hablar con el motor ─────────────────────────────────────────────────────

/**
 * Un pedido a /api/chat en streaming. `alTrozo(contenido)` recibe el texto a
 * medida que sale. Devuelve el mensaje final armado: { content, tool_calls,
 * uso }. Lanza con `codigo` si el motor no contesta o dice que no.
 */
function pedir(cuerpo, { alTrozo = () => {}, plazo = PLAZO_MS } = {}) {
  return new Promise((resolver, fallar) => {
    let u;
    try { u = new URL(URL_NODO + '/api/chat'); } catch { return fallar(conCodigo('NODO_APAGADO', 'ULTRON_NODO_URL no es una URL.')); }
    const seguro = u.protocol === 'https:';
    const datos = JSON.stringify(cuerpo);
    const opciones = {
      method: 'POST', hostname: u.hostname, port: u.port || (seguro ? 443 : 80), path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos), 'x-ultron-secreto': SECRETO },
      timeout: plazo,
    };
    // El certificado propio del motor: se confía en ESE y en ningún otro. Sin
    // CERT (pruebas por http) no aplica.
    if (seguro && CERT) { opciones.ca = CERT; }
    const req = (seguro ? https : http).request(opciones, (res) => {
      if (res.statusCode !== 200) {
        let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => {
          const codigo = res.statusCode === 401 ? 'NODO_NO' : res.statusCode === 503 ? 'MODELO_MUDO' : res.statusCode === 502 ? 'MODELO' : 'NODO_ERROR';
          fallar(conCodigo(codigo, `el motor contestó ${res.statusCode}: ${t.slice(0, 200)}`, res.statusCode));
        });
        return;
      }
      let resto = ''; let content = ''; const tool_calls = []; let final = null;
      res.setEncoding('utf8');
      res.on('data', (d) => {
        resto += d;
        const lineas = resto.split('\n'); resto = lineas.pop();
        for (const l of lineas) {
          if (!l.trim()) continue;
          let j; try { j = JSON.parse(l); } catch { continue; }
          const m = j.message || {};
          if (m.content) { content += m.content; alTrozo(m.content); }
          for (const tc of m.tool_calls || []) tool_calls.push(tc);
          if (j.done) final = j;
        }
      });
      res.on('end', () => {
        if (resto.trim()) { try { const j = JSON.parse(resto); if (j.message?.content) { content += j.message.content; alTrozo(j.message.content); } for (const tc of j.message?.tool_calls || []) tool_calls.push(tc); if (j.done) final = j; } catch { /* trozo roto */ } }
        resolver({ content, tool_calls, uso: { entrada: final?.prompt_eval_count || 0, salida: final?.eval_count || 0 }, final });
      });
      res.on('error', (e) => fallar(conCodigo('NODO_MUDO', e.message)));
    });
    req.on('timeout', () => { req.destroy(conCodigo('NODO_LENTO', `el nodo no terminó en ${Math.round(plazo / 1000)} s`)); });
    req.on('error', (e) => fallar(e.codigo ? e : conCodigo('NODO_MUDO', e.message)));
    req.end(datos);
  });
}

function conCodigo(codigo, mensaje, status) { const e = new Error(mensaje); e.codigo = codigo; if (status) e.status = status; return e; }

// ── Las llamadas a herramientas escritas como texto ─────────────────────────

/* Un modelo chico a veces escribe la llamada en vez de hacerla:
   <tool_call>{"name":"estado_vivo","arguments":{}}</tool_call>. Ollama suele
   atraparlo, pero no siempre. Se lee igual y se quita del texto que ve la
   persona: una etiqueta XML en medio de la respuesta no es una respuesta. */
function llamadasEnTexto(texto) {
  const salida = []; let limpio = texto;
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g; let m;
  while ((m = re.exec(texto))) {
    try { const j = JSON.parse(m[1]); if (j && j.name) salida.push({ function: { name: j.name, arguments: j.arguments || j.parameters || {} } }); } catch { /* no era JSON */ }
    limpio = limpio.replace(m[0], '');
  }
  return { llamadas: salida, limpio: limpio.trim() };
}

// ── El prompt, con presupuesto ──────────────────────────────────────────────

function recortar(t, n) { t = String(t || ''); return t.length <= n ? t : t.slice(0, n - 12) + '\n[…recortado]'; }

function armarMensajes({ system, previa, texto }) {
  const mensajes = [{ role: 'system', content: system }];
  // El hilo: lo último primero en importancia. Se toman los últimos ocho
  // turnos, cada uno recortado, y si aun así no cabe se van soltando los
  // más viejos.
  let hilo = (previa?.turnos || []).slice(-8).map((t) => ({ role: t.rol === 'miembro' ? 'user' : 'assistant', content: recortar(t.texto, TOPE_TURNO) }));
  let largo = hilo.reduce((a, m) => a + m.content.length, 0);
  while (hilo.length && largo > TOPE_HILO) { largo -= hilo[0].content.length; hilo = hilo.slice(1); }
  const disponible = PRESUPUESTO - system.length - texto.length;
  while (hilo.length && largo > disponible) { largo -= hilo[0].content.length; hilo = hilo.slice(1); }
  mensajes.push(...hilo, { role: 'user', content: texto });
  return mensajes;
}

/* Un modelo chico a veces cierra diciendo lo mismo dos veces con otras
   palabras, o exactamente igual. Lo exactamente igual se quita; lo parecido
   se deja, que no es asunto de una regex decidir qué es redundante. */
function sinRepetidos(texto) {
  const vistos = new Set(); const salida = [];
  for (const p of String(texto).split(/\n{2,}/)) {
    const clave = p.trim().toLowerCase().replace(/[`*_"'«».,:;!?]/g, '').replace(/\s+/g, ' ');
    if (clave && vistos.has(clave)) continue;
    if (clave) vistos.add(clave);
    salida.push(p);
  }
  return salida.join('\n\n');
}

function largoDe(mensajes) { return mensajes.reduce((a, m) => a + String(m.content || '').length + JSON.stringify(m.tool_calls || '').length, 0); }

// ── Pensar ──────────────────────────────────────────────────────────────────

async function pensar({ miembro, junta, texto, conversacionId, emitir = () => {}, sistema }) {
  if (!encendido()) throw conCodigo('NODO_APAGADO', 'Faltan ULTRON_NODO_URL o ULTRON_NODO_SECRETO.');
  const ctx = { miembro, junta, conversacionId, fuentes: [], memorias: [], documentos: [], envios: [], pendientes: [], acciones: [], chico: true };

  const [memorias, estadoVivo, abiertos] = await Promise.all([
    memoria.memoriasDe(miembro.correo, { limite: 30 }),
    vivo.leerConCache(),
    memoria.pendientes({ limite: 25 }),
  ]);
  // Primero la base sin saber, para saber cuánto queda. El hilo anterior se
  // reserva aparte; el saber recibe lo que sobra, y si sobra poco, poco.
  const previa = conversacionId ? await memoria.conversacion(conversacionId, miembro.correo) : null;
  const voz = saber.vozDeLaCasa().slice(0, 6);
  const armar = (secciones) => sistema({ miembro, memorias, estadoVivo, secciones, vozCasa: voz, pendientes: abiertos, chico: true }).map((b) => b.text).join('\n\n');
  const base = armar([]);
  const hiloEstimado = Math.min(TOPE_HILO, (previa?.turnos || []).slice(-8).reduce((a, t) => a + Math.min(TOPE_TURNO, String(t.texto || '').length), 0));
  const sobra = PRESUPUESTO_FICHAS - fichas(base) - fichas(hiloEstimado ? 'x'.repeat(hiloEstimado) : '') - fichas(texto);
  const paraSaber = Math.max(0, Math.floor(sobra * LETRAS_POR_FICHA));
  const secciones = paraSaber >= SABER_MINIMO ? saber.buscar(texto, { maximo: 8, maxBytes: paraSaber }) : [];
  if (paraSaber < SABER_MINIMO) console.warn(`[nodo] sin sitio para el saber: la base ya ocupa ${fichas(base)} fichas de ${PRESUPUESTO_FICHAS}`);
  ctx.fuentes.push(...secciones.map((s) => ({ id: s.id, titulo: s.titulo, fuente: s.fuente })));
  const system = armar(secciones);
  const mensajes = armarMensajes({ system, previa, texto });

  let textoFinal = '';
  const usadas = [];
  const uso = { entrada: 0, salida: 0, lecturaCache: 0, escrituraCache: 0 };
  const opciones = { temperature: 0.35, num_predict: 1400, repeat_penalty: 1.08 };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    emitir('pensando', { vuelta });
    let dicho = '';
    const r = await pedir({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama(), stream: true, options: opciones },
      { alTrozo: (t) => { dicho += t; emitir('texto', { t }); } });
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
    if (r.uso.entrada > CTX * 0.92) console.warn(`[nodo] AVISO: una llamada evaluó ${r.uso.entrada} fichas con un contexto de ${CTX}: el principio del prompt pudo quedar fuera`);

    const enTexto = llamadasEnTexto(r.content);
    const llamadas = [...r.tool_calls, ...enTexto.llamadas];
    let visible = enTexto.limpio;
    if (!llamadas.length) { textoFinal += (textoFinal && visible ? '\n\n' : '') + visible; break; }

    // Hubo herramientas: lo dicho antes de llamarlas se conserva si es texto de
    // verdad (una frase de «voy a mirar»), no si era la etiqueta.
    if (visible) textoFinal += (textoFinal ? '\n\n' : '') + visible;
    mensajes.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined });
    for (const tc of llamadas) {
      const nombre = tc.function?.name; let entrada = tc.function?.arguments;
      if (typeof entrada === 'string') { try { entrada = JSON.parse(entrada); } catch { entrada = {}; } }
      emitir('herramienta', { nombre, entrada });
      const salida = await herramientas.correr(nombre, entrada || {}, ctx);
      usadas.push({ nombre, entrada, salida: String(salida).slice(0, 2000) });
      emitir('herramienta-lista', { nombre });
      mensajes.push({ role: 'tool', content: recortar(salida, TOPE_RESULTADO), tool_name: nombre });
    }
    // Si con los resultados el pedido se pasa del presupuesto, se sueltan los
    // turnos viejos del hilo (nunca el system ni la pregunta ni los resultados).
    while (largoDe(mensajes) > PRESUPUESTO && mensajes.length > 3 && mensajes[1].role !== 'tool' && !mensajes[1].tool_calls) mensajes.splice(1, 1);
  }
  /* LA GUARDA DE LAS CITAS. 5-sep, primera prueba real: «El oro cerró hoy a
     US$ 4,435 (según buscar_web)» — y buscar_web no se había llamado. El
     número venía del estado vivo y la fuente era inventada. Un modelo chico
     hace esto, y no se arregla pidiéndole por favor: se mira si citó una
     herramienta que no corrió, y si lo hizo se le devuelve UNA vez para que
     la llame o quite la cita. Si reincide, la cita se marca en el texto para
     que la persona lo vea. */
  // Solo las de internet: el estado vivo y el saber SÍ van en el prompt, así
  // que citarlos sin llamarlos es correcto. Una búsqueda, no.
  const CITA = /seg[uú]n\s+[`«"']?(buscar_web|leer_pagina)[`»"']?/gi;
  const citadas = [...new Set([...textoFinal.matchAll(CITA)].map((m) => m[1].toLowerCase()))];
  const corridas = new Set(usadas.map((h) => h.nombre));
  const falsas = citadas.filter((c) => !corridas.has(c));
  if (falsas.length) {
    emitir('pensando', { vuelta: MAX_VUELTAS, motivo: 'cita sin herramienta' });
    mensajes.push({ role: 'assistant', content: textoFinal });
    mensajes.push({ role: 'user', content: `[sistema] Citaste «${falsas.join('», «')}» pero no la llamaste en este turno. Llamala ahora y contestá con lo que devuelva, o reescribí la respuesta sin esa cita diciendo de dónde sale de verdad el dato.` });
    let dicho = '';
    const r = await pedir({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama(), stream: true, options: opciones }, { alTrozo: (t) => { dicho += t; } });
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
    const enTexto = llamadasEnTexto(r.content);
    const llamadas = [...r.tool_calls, ...enTexto.llamadas];
    if (llamadas.length) {
      mensajes.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined });
      for (const tc of llamadas) {
        const nombre = tc.function?.name; let entrada = tc.function?.arguments;
        if (typeof entrada === 'string') { try { entrada = JSON.parse(entrada); } catch { entrada = {}; } }
        emitir('herramienta', { nombre, entrada });
        const salida = await herramientas.correr(nombre, entrada || {}, ctx);
        usadas.push({ nombre, entrada, salida: String(salida).slice(0, 2000) });
        emitir('herramienta-lista', { nombre });
        mensajes.push({ role: 'tool', content: recortar(salida, TOPE_RESULTADO), tool_name: nombre });
      }
      const r2 = await pedir({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama(), stream: true, options: opciones }, { alTrozo: (t) => {} });
      uso.entrada += r2.uso.entrada; uso.salida += r2.uso.salida;
      dicho = llamadasEnTexto(r2.content).limpio;
    } else dicho = enTexto.limpio;
    if (dicho.trim()) { textoFinal = dicho.trim(); emitir('reemplazo', { texto: textoFinal }); }
    // Si aun así cita lo que no corrió, se marca: la persona tiene que verlo.
    const todavia = [...textoFinal.matchAll(CITA)].map((m) => m[1].toLowerCase()).filter((c) => !new Set(usadas.map((h) => h.nombre)).has(c));
    if (todavia.length) textoFinal += `\n\n_(ULTRON citó ${todavia.join(', ')} sin haberla usado en este turno: tomá ese dato con cuidado.)_`;
  }
  textoFinal = sinRepetidos(textoFinal);
  if (!textoFinal.trim()) textoFinal = 'Miré lo que pediste pero no me salió una respuesta con palabras. Preguntámelo de otra forma.';

  const vistas = new Set();
  const fuentes = ctx.fuentes.filter((f) => !vistas.has(f.id) && vistas.add(f.id));
  // En el nodo pensar no cuesta por ficha: la tarjeta ya está pagada. Cero es
  // el número honesto, y se anota igual para contar los turnos.
  memoria.anotarGasto({ miembro: miembro.correo, modelo: 'nodo:' + MODELO, ...uso, dolares: 0, canal: ctx.canal || 'panel' })
    .catch((e) => console.error(`[gasto] ${e.message}`));
  return { texto: textoFinal, fuentes, herramientas: usadas, memorias: ctx.memorias, documentos: ctx.documentos,
           envios: ctx.envios, pendientes: ctx.pendientes, acciones: ctx.acciones, uso: { ...uso, dolares: 0 }, modelo: 'nodo:' + MODELO };
}

/** Un título corto, sin herramientas y con pocas fichas. */
async function titular(texto) {
  try {
    const r = await pedir({ model: MODELO, stream: false, options: { temperature: 0.2, num_predict: 24 },
      messages: [{ role: 'user', content: `Título de máximo seis palabras, en español, sin comillas ni punto final, para una conversación que empieza así:\n\n${texto.slice(0, 400)}\n\nSolo el título.` }] },
      { plazo: 30_000 });
    return (r.content || '').split('\n')[0].replace(/^["«»]+|["«»]+$/g, '').trim().slice(0, 80) || null;
  } catch { return null; }
}

/** ¿El motor contesta? Para /salud y para el punto del panel. */
async function salud() {
  if (!encendido()) return { vivo: false, porQue: 'sin URL o secreto' };
  return new Promise((resolver) => {
    let u; try { u = new URL(URL_NODO + '/salud'); } catch { return resolver({ vivo: false, porQue: 'URL mala' }); }
    const seguro = u.protocol === 'https:';
    const opciones = { method: 'GET', hostname: u.hostname, port: u.port || (seguro ? 443 : 80), path: u.pathname, headers: { 'x-ultron-secreto': SECRETO }, timeout: 8000 };
    if (seguro && CERT) opciones.ca = CERT;
    const req = (seguro ? https : http).request(opciones, (res) => {
      let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { try { const j = JSON.parse(t); resolver({ vivo: res.statusCode === 200 && !!j.ok, ...j }); } catch { resolver({ vivo: false, porQue: `contestó ${res.statusCode}` }); } });
    });
    req.on('timeout', () => { req.destroy(); resolver({ vivo: false, porQue: 'no contesta a tiempo' }); });
    req.on('error', (e) => resolver({ vivo: false, porQue: e.code || e.message }));
    req.end();
  });
}

module.exports = { pensar, titular, salud, encendido, MODELO, _adentro: { pedir, llamadasEnTexto, armarMensajes, sinRepetidos, fichas, PRESUPUESTO, PRESUPUESTO_FICHAS, CTX } };
