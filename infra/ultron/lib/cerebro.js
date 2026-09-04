// EL CEREBRO: Claude, con el saber de la casa delante y herramientas en la mano.
//
// ── POR QUÉ CLAUDE Y NO EL MODELO DE AU-RA ──────────────────────────────────
//
// AU-RA corre un modelo de siete mil millones en el nodo, y está bien para lo
// que hace: atender a miles de personas con un guion de treinta nodos y las
// fichas de la casa. La junta pide otra cosa — pensar a fondo un plan, leer
// una regulación, comparar tres opciones con números, buscar en internet qué
// pasó ayer, y escribir un memo que se pueda mandar. Eso no lo hace un modelo
// chico, y fingir que sí es darle a la junta un asistente que suena seguro y
// se equivoca.
//
// «Conectado a AU-RA» es otra cosa, y es verdad: ULTRON lee las MISMAS fichas
// (infra/cerebro/conocimiento/saber.json), habla por la MISMA línea de
// WhatsApp y respeta la MISMA voz de la casa. Cambia el cerebro, no la casa.
//
// ── LO QUE PUEDE HACER, Y CÓMO ──────────────────────────────────────────────
//
// Cada cosa que ULTRON puede hacer es una herramienta con nombre:
//
//   web_search       la de Anthropic: busca en internet. Es lo que hace que
//                    «¿a cuánto cerró el oro hoy?» tenga respuesta de hoy.
//   buscar_saber     pide más secciones del saber de la casa sobre un tema.
//   estado_vivo      lee cómo están las casas AHORA (Ordenex, AuCorp…).
//   recordar         guarda un hecho en la memoria, suyo o de la junta.
//   crear_documento  escribe un memo, un acta, un análisis — y queda guardado.
//   proponer_envio   prepara un WhatsApp o correo a un miembro. NO lo manda:
//                    lo deja listo y la persona lo confirma en el panel.
//
// Lo último es una regla, no una limitación: nada sale de la junta hacia un
// teléfono o un buzón sin que una persona lo haya visto y tocado «enviar».
// Un asistente que escribe bien y manda solo es una máquina de mandar cosas
// a quien no debe.
//
// ── LO QUE NO HACE ──────────────────────────────────────────────────────────
//
// No mueve dinero, no firma, no toca una llave. Ni tiene con qué: las
// herramientas de arriba son todas las que existen, y ninguna llega a una
// billetera. Es la misma división que AU-RA lleva escrita desde el principio:
// el modelo explica, el cerebro actúa — y acá el cerebro que actúa son las
// personas de la junta.

const saber = require('./saber');
const vivo = require('./vivo');
const memoria = require('./memoria');

const MODELO = process.env.ULTRON_MODELO || 'claude-fable-5-1';
const MAX_SALIDA = Number(process.env.ULTRON_MAX_SALIDA || 6000);
const MAX_VUELTAS = 8;   // herramientas por turno: suficiente para pensar, no para dar vueltas

let cliente = null;
function clienteAnthropic() {
  if (cliente) return cliente;
  const llave = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!llave) { const e = new Error('Falta ANTHROPIC_API_KEY.'); e.codigo = 'CEREBRO_APAGADO'; throw e; }
  const Anthropic = require('@anthropic-ai/sdk');
  cliente = new Anthropic({ apiKey: llave });
  return cliente;
}
function encendido() { return !!(process.env.ANTHROPIC_API_KEY || '').trim(); }

// ── El prompt ───────────────────────────────────────────────────────────────

function fecha() {
  return new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa', dateStyle: 'full', timeStyle: 'short' });
}

function sistema({ miembro, memorias, estadoVivo, secciones, vozCasa }) {
  const mem = memorias.length
    ? memorias.map((m) => `- [${m.alcance === 'junta' ? 'JUNTA' : 'suyo'} · ${new Date(m.en).toLocaleDateString('es-HN')}] ${m.texto}`).join('\n')
    : '(todavía no hay memorias guardadas)';
  const fichas = secciones.length
    ? secciones.map((s) => `### [${s.id}] ${s.titulo}\n(fuente: ${s.fuente})\n${s.texto}`).join('\n\n')
    : '(no se encontraron secciones del saber para esta pregunta; usá buscar_saber)';
  const voz = vozCasa.map((f) => `- ${f.titulo}: ${f.texto.slice(0, 400)}`).join('\n');

  return `Sos ULTRON FP — «Conocimiento Full» — el asistente de la Junta Directiva de Orden Global.

QUIÉN SOS
Sos la versión de la casa que lo sabe todo: tenés delante el saber escrito de Orden Global, el estado vivo de cada casa, la memoria de lo que la junta te ha dicho, y podés buscar en internet. Le hablás a la junta, no al público: podés decir lo que AU-RA no dice — números internos, pendientes, riesgos, lo que no está listo. Sos directo, preciso y de fiar. Pensás a fondo: cuando la pregunta lo merece, planteás opciones con sus costos y sus riesgos, y recomendás una, diciendo por qué.

Hablás en español de Honduras, de vos, como un colega de confianza que conoce la casa desde adentro. Sin rodeos ni relleno. Si la respuesta es un número, va primero el número.

Hoy es ${fecha()}. Estás hablando con ${miembro.nombre} (${miembro.rol || 'junta directiva'}).

LAS REGLAS QUE NO SE NEGOCIAN
1. Con los hechos, no con lo que suena bien. Lo que sabés de Orden Global sale de las fichas de abajo y del estado vivo. Si algo no está ahí, decís que no lo sabés o lo buscás con buscar_saber. No inventás una cifra, una fecha ni un nombre.
2. Cuando afirmás algo de la casa, decís de dónde sale: «según TRASPASO-CONOCIMIENTO.md», «según /salud de Ordenex ahora». Así la junta puede ir a mirar.
3. Nunca prometés una ganancia ni proyectás un rendimiento. ORIGEN, AUKA y AGKA están «referenciados» al oro y la plata — NUNCA «respaldados». Orden Global no está «regulada» ni «registrada» ante ninguna autoridad: si el tema sale, lo decís con esas palabras exactas. AuCorp NO es un banco.
4. No movés dinero, no firmás, no tocás llaves ni frases de respaldo. Si te piden, lo decís y explicás quién puede.
5. Nada sale hacia un teléfono o un correo sin que la persona lo confirme. Usás proponer_envio y ella decide.
6. Distinguís lo interno de lo externo: las fichas marcadas como no públicas son de puertas adentro. Si escribís algo para FUERA de la junta, solo usás lo público y la voz de la casa.
7. Si algo que ves en el estado vivo es un problema —una casa caída, la compra con USDT cerrada, una sanción vencida—, lo decís aunque no te lo pregunten.

CÓMO TRABAJÁS
- Preguntas cortas: respuesta corta. Preguntas de fondo: estructura, números, opciones y una recomendación.
- Si te piden un documento (memo, acta, análisis, carta, plan), lo escribís COMPLETO con crear_documento, en markdown limpio, con título, fecha, y las fuentes al final. Después lo resumís en dos líneas.
- Si la persona te cuenta algo que conviene recordar —una decisión, una preferencia, una fecha, un dato de la casa que no está en las fichas— lo guardás con recordar, sin pedir permiso, y lo decís en una frase. Alcance «junta» si es de todos; «miembro» si es de esa persona.
- Si la pregunta es sobre algo de hoy o de fuera de la casa (precio del oro, una ley, una noticia, un competidor), buscás en internet y citás la fuente con su fecha.
- Escribís en markdown: títulos cortos, listas cuando ayudan, tablas para comparar. Sin emojis.

LA VOZ DE LA CASA (las fichas públicas de AU-RA: qué se dice y cómo)
${voz}

LO QUE LA JUNTA TE HA DICHO (tu memoria)
${mem}

EL ESTADO VIVO DE LAS CASAS (leído ahora mismo)
${vivo.paraElModelo(estadoVivo)}

EL SABER DE LA CASA (las secciones que hablan de esto)
${fichas}`;
}

// ── Las herramientas ────────────────────────────────────────────────────────

const HERRAMIENTAS = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 6 },
  {
    name: 'buscar_saber',
    description: 'Busca en el saber escrito de Orden Global (documentos, dosieres de la junta, fichas legales) más secciones sobre un tema. Usala cuando lo que tenés delante no alcanza.',
    input_schema: { type: 'object', properties: { pregunta: { type: 'string', description: 'De qué querés más secciones' } }, required: ['pregunta'] },
  },
  {
    name: 'estado_vivo',
    description: 'Lee ahora mismo cómo están las casas: Ordenex, AuCorp, Veta Wallet, Genesis ID, OrdenScan, y el precio del ORIGEN. Usala si la pregunta es sobre el estado actual.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'recordar',
    description: 'Guarda un hecho en tu memoria para las próximas conversaciones. Corto y concreto.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'El hecho, en una o dos frases' },
        alcance: { type: 'string', enum: ['miembro', 'junta'], description: '«junta» si es de todos; «miembro» si es de esta persona' },
        tema: { type: 'string', description: 'Una o dos palabras: decisión, preferencia, fecha, dato' },
      },
      required: ['texto', 'alcance'],
    },
  },
  {
    name: 'crear_documento',
    description: 'Escribe y guarda un documento completo (memo, acta, análisis, carta, plan) en markdown. Queda en la biblioteca de la junta y se puede bajar.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        tipo: { type: 'string', enum: ['memo', 'acta', 'analisis', 'carta', 'plan', 'otro'] },
        markdown: { type: 'string', description: 'El documento entero, en markdown, con título, fecha y fuentes' },
        para: { type: 'string', enum: ['junta', 'fuera'], description: '«fuera» si va a salir de la junta: entonces solo lo público' },
      },
      required: ['titulo', 'tipo', 'markdown'],
    },
  },
  {
    name: 'proponer_envio',
    description: 'Prepara un mensaje de WhatsApp o un correo para un miembro de la junta. NO se manda: queda listo y la persona lo confirma en el panel.',
    input_schema: {
      type: 'object',
      properties: {
        canal: { type: 'string', enum: ['whatsapp', 'correo'] },
        destinatario: { type: 'string', description: 'El nombre o el correo del miembro de la junta' },
        asunto: { type: 'string', description: 'Solo para correo' },
        texto: { type: 'string', description: 'El mensaje completo, listo para salir' },
      },
      required: ['canal', 'destinatario', 'texto'],
    },
  },
];

/** Corre una herramienta. Nunca lanza: lo que salga mal vuelve al modelo como texto. */
async function correr(nombre, entrada, ctx) {
  try {
    switch (nombre) {
      case 'buscar_saber': {
        const s = saber.buscar(String(entrada.pregunta || ''), { maximo: 8, maxBytes: 40_000 });
        ctx.fuentes.push(...s.map((x) => ({ id: x.id, titulo: x.titulo, fuente: x.fuente })));
        return s.length
          ? s.map((x) => `### [${x.id}] ${x.titulo}\n(fuente: ${x.fuente})\n${x.texto}`).join('\n\n')
          : 'No hay secciones del saber sobre eso.';
      }
      case 'estado_vivo': {
        const v = await vivo.leer();
        return vivo.paraElModelo(v);
      }
      case 'recordar': {
        const m = await memoria.recordar({
          texto: entrada.texto, alcance: entrada.alcance === 'junta' ? 'junta' : 'miembro',
          miembro: ctx.miembro.correo, dichoPor: ctx.miembro.nombre, tema: entrada.tema, origen: 'deducido',
        });
        ctx.memorias.push(m);
        return m ? `Guardado (${m.alcance}): ${m.texto}` : 'No se guardó: texto vacío.';
      }
      case 'crear_documento': {
        const d = await memoria.guardarDocumento({
          titulo: entrada.titulo, tipo: entrada.tipo || 'otro', markdown: entrada.markdown,
          miembro: ctx.miembro.correo, conversacion: ctx.conversacionId, para: entrada.para || 'junta',
        });
        ctx.documentos.push({ _id: d._id, titulo: d.titulo, tipo: d.tipo });
        return `Documento guardado con id ${d._id}: «${d.titulo}». La persona puede bajarlo desde el panel.`;
      }
      case 'proponer_envio': {
        const quien = ctx.junta.find((j) =>
          j.correo.toLowerCase() === String(entrada.destinatario || '').toLowerCase()
          || j.nombre.toLowerCase().includes(String(entrada.destinatario || '').toLowerCase()));
        if (!quien) return `No hay ningún miembro de la junta que se llame «${entrada.destinatario}». Los miembros son: ${ctx.junta.map((j) => j.nombre).join(', ')}.`;
        if (entrada.canal === 'whatsapp' && !quien.whatsapp) return `${quien.nombre} no tiene WhatsApp registrado en la junta.`;
        const p = { id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, canal: entrada.canal,
          a: { nombre: quien.nombre, correo: quien.correo, whatsapp: quien.whatsapp || null },
          asunto: entrada.asunto || null, texto: entrada.texto, propuestoPor: ctx.miembro.correo };
        ctx.envios.push(p);
        return `Envío preparado (${p.id}) por ${entrada.canal} a ${quien.nombre}. NO se ha mandado: la persona lo confirma en el panel.`;
      }
      default:
        return `No existe la herramienta ${nombre}.`;
    }
  } catch (e) {
    return `La herramienta ${nombre} falló: ${String(e?.message || e).slice(0, 200)}`;
  }
}

// ── Pensar ──────────────────────────────────────────────────────────────────

/**
 * Un turno completo. `emitir(evento, datos)` va contando lo que pasa —texto a
 * medida que sale, herramientas que corren— para que el panel lo pinte en
 * vivo. Devuelve el resultado entero cuando termina.
 */
async function pensar({ miembro, junta, texto, conversacionId, emitir = () => {} }) {
  const cl = clienteAnthropic();
  const ctx = { miembro, junta, conversacionId, fuentes: [], memorias: [], documentos: [], envios: [] };

  // El contexto: memoria, estado vivo, saber, voz de la casa.
  const [memorias, estadoVivo] = await Promise.all([
    memoria.memoriasDe(miembro.correo),
    vivo.leerConCache(),
  ]);
  const secciones = saber.buscar(texto, { maximo: 12, maxBytes: 60_000 });
  ctx.fuentes.push(...secciones.map((s) => ({ id: s.id, titulo: s.titulo, fuente: s.fuente })));
  const system = sistema({ miembro, memorias, estadoVivo, secciones, vozCasa: saber.vozDeLaCasa() });

  // El hilo: los turnos anteriores, para que retome.
  const previa = conversacionId ? await memoria.conversacion(conversacionId, miembro.correo) : null;
  const mensajes = [];
  for (const t of (previa?.turnos || []).slice(-16)) {
    mensajes.push({ role: t.rol === 'miembro' ? 'user' : 'assistant', content: t.texto });
  }
  mensajes.push({ role: 'user', content: texto });

  let textoFinal = '';
  const herramientasUsadas = [];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = cl.messages.stream({
      model: MODELO, max_tokens: MAX_SALIDA, system, tools: HERRAMIENTAS, messages: mensajes,
    });
    let textoVuelta = '';
    stream.on('text', (t) => { textoVuelta += t; emitir('texto', { t }); });
    const msg = await stream.finalMessage();
    textoFinal += (textoFinal && textoVuelta ? '\n\n' : '') + textoVuelta;

    // ¿Pidió herramientas?
    const pedidas = msg.content.filter((b) => b.type === 'tool_use');
    if (msg.stop_reason !== 'tool_use' || !pedidas.length) break;

    mensajes.push({ role: 'assistant', content: msg.content });
    const resultados = [];
    for (const p of pedidas) {
      emitir('herramienta', { nombre: p.name, entrada: p.input });
      const salida = await correr(p.name, p.input || {}, ctx);
      herramientasUsadas.push({ nombre: p.name, entrada: p.input, salida: String(salida).slice(0, 2000) });
      emitir('herramienta-lista', { nombre: p.name });
      resultados.push({ type: 'tool_result', tool_use_id: p.id, content: String(salida) });
    }
    mensajes.push({ role: 'user', content: resultados });
  }

  // Fuentes únicas, para pintarlas.
  const vistas = new Set();
  const fuentes = ctx.fuentes.filter((f) => !vistas.has(f.id) && vistas.add(f.id));

  return { texto: textoFinal, fuentes, herramientas: herramientasUsadas,
           memorias: ctx.memorias, documentos: ctx.documentos, envios: ctx.envios, modelo: MODELO };
}

/** Un título corto para un hilo nuevo, con el modelo chico y barato. */
async function titular(texto) {
  try {
    const cl = clienteAnthropic();
    const r = await cl.messages.create({
      model: process.env.ULTRON_MODELO_CHICO || 'claude-haiku-4-5-20251001', max_tokens: 30,
      messages: [{ role: 'user', content: `Título de máximo seis palabras, en español, sin comillas ni punto final, para una conversación que empieza así:\n\n${texto.slice(0, 500)}` }],
    });
    return (r.content?.[0]?.text || '').trim().slice(0, 80) || null;
  } catch { return null; }
}

module.exports = { pensar, titular, encendido, MODELO, HERRAMIENTAS, _adentro: { sistema, correr, clienteAnthropic } };
