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

/* LO QUE CUESTA PENSAR, por millón de fichas. Del cuadro de precios de la API,
   no de una estimación: entrada, salida y lectura de caché.
   Un modelo que NO esté acá no se cobra a cero — se devuelve `null` y quien
   sume dice que su total está incompleto. Un total que miente por lo bajo es
   peor que no tener total. */
const PRECIOS = {
  'claude-fable-5-1': { entrada: 10, salida: 50, cache: 0.25 },
  'claude-fable-5': { entrada: 10, salida: 50, cache: 0.25 },
  'claude-opus-5': { entrada: 5, salida: 25, cache: 0.5 },
  'claude-opus-4-8': { entrada: 5, salida: 25, cache: 0.5 },
  'claude-sonnet-5': { entrada: 2, salida: 10, cache: 0.2 },
  'claude-haiku-4-5': { entrada: 1, salida: 5, cache: 0.1 },
};

/** Los dólares de un uso, o null si no sabemos el precio de ese modelo. */
function dolaresDe(modelo, uso) {
  const p = PRECIOS[modelo];
  if (!p) return null;
  const m = 1e6;
  return (uso.entrada * p.entrada + uso.salida * p.salida + uso.lecturaCache * p.cache
    + uso.escrituraCache * p.entrada * 1.25) / m;
}

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

/* POR QUE ESTO EXISTE, Y NO UN «probá de nuevo»
 *
 * 4-sep, primera pregunta de verdad del panel: el cerebro estaba encendido, la
 * llave era buena, y ULTRON contestaba «no pudo contestar, probá de nuevo».
 * Probar de nuevo no iba a arreglar nada nunca: la cuenta de Anthropic no
 * tenía saldo. Eso estaba escrito con todas las letras en el registro de
 * Heroku, o sea en el único sitio donde la junta no va a mirar.
 *
 * Un error que se puede arreglar en dos minutos y se presenta como una
 * avería es peor que la avería: manda a la persona a buscar donde no es. Así
 * que los pocos motivos que tienen ARREGLO CONOCIDO se dicen con su nombre y
 * con dónde se arregla. El resto sigue siendo genérico a propósito: inventar
 * una causa es peor que decir que no se sabe.
 */
function motivo(e) {
  const estado = e?.status || e?.statusCode;
  const dentro = e?.error?.error || e?.error || {};
  const dice = String(dentro.message || e?.message || '');
  if (e?.codigo) return { codigo: e.codigo, mensaje: e.message };
  if (/credit balance is too low/i.test(dice)) {
    return { codigo: 'SIN_SALDO',
      mensaje: 'La cuenta de Anthropic se quedó sin saldo. En console.anthropic.com → Plans & Billing se carga crédito, y ULTRON vuelve solo.' };
  }
  if (estado === 401 || /authentication/i.test(dentro.type || '')) {
    return { codigo: 'LLAVE_MALA', mensaje: 'Anthropic no acepta la llave. Hay que revisar ANTHROPIC_API_KEY en Heroku.' };
  }
  if (estado === 403 || /permission/i.test(dentro.type || '')) {
    return { codigo: 'SIN_PERMISO', mensaje: 'La llave de Anthropic no tiene permiso para este modelo.' };
  }
  if (estado === 404 && /model/i.test(dice)) {
    return { codigo: 'MODELO', mensaje: `Esta cuenta no ve el modelo «${MODELO}». Se cambia con ULTRON_MODELO.` };
  }
  if (estado === 429) {
    return { codigo: 'MUCHO_RITMO', mensaje: 'Anthropic está limitando el ritmo. En un minuto vuelve a andar.' };
  }
  if (estado === 529 || /overloaded/i.test(dentro.type || '')) {
    return { codigo: 'SATURADO', mensaje: 'Anthropic está saturado en este momento. Probá de nuevo en un rato.' };
  }
  return { codigo: 'ERROR', mensaje: 'ULTRON no pudo contestar. Probá de nuevo.' };
}

// ── El prompt ───────────────────────────────────────────────────────────────

function fecha() {
  return new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa', dateStyle: 'full', timeStyle: 'short' });
}

function sistema({ miembro, memorias, estadoVivo, secciones, vozCasa, pendientes = [] }) {
  const mem = memorias.length
    ? memorias.map((m) => `- [${m.alcance === 'junta' ? 'JUNTA' : 'suyo'} · ${new Date(m.en).toLocaleDateString('es-HN')}] ${m.texto}`).join('\n')
    : '(todavía no hay memorias guardadas)';
  const fichas = secciones.length
    ? secciones.map((s) => `### [${s.id}] ${s.titulo}\n(fuente: ${s.fuente})\n${s.texto}`).join('\n\n')
    : '(no se encontraron secciones del saber para esta pregunta; usá buscar_saber)';
  const voz = vozCasa.map((f) => `- ${f.titulo}: ${f.texto.slice(0, 400)}`).join('\n');
  /* Los pendientes van CON su id: sin el id, «cerrá el del gas» obliga a
     adivinar cuál era, y cerrar el equivocado es peor que no cerrar ninguno. */
  const tareas = pendientes.length
    ? pendientes.map((p) => `- [${p._id}]${p.quien ? ` (${p.quien})` : ''}${p.tema ? ` {${p.tema}}` : ''} ${p.texto}`).join('\n')
    : '(no hay nada pendiente anotado)';

  /* DOS BLOQUES, Y NO ES COSMÉTICO. La caché de la API es por PREFIJO: lo que
     no cambia entre turnos se cobra a una fracción si va PRIMERO y byte por
     byte igual. La identidad y las reglas son las mismas siempre; la fecha,
     con quién habla, la memoria, los pendientes, el estado vivo y las
     secciones cambian en cada pregunta. Separarlos es lo que hace que el
     primer bloque se pueda reusar; mezclarlos lo invalidaría todo en cada
     turno. Por eso «Hoy es…» está en el segundo bloque y no arriba. */
  const estable = `Sos ULTRON FP — «Conocimiento Full» — el asistente de la Junta Directiva de Orden Global.

QUIÉN SOS
Sos la versión de la casa que lo sabe todo: tenés delante el saber escrito de Orden Global, el estado vivo de cada casa, la memoria de lo que la junta te ha dicho, y podés buscar en internet. Le hablás a la junta, no al público: podés decir lo que AU-RA no dice — números internos, pendientes, riesgos, lo que no está listo. Sos directo, preciso y de fiar. Pensás a fondo: cuando la pregunta lo merece, planteás opciones con sus costos y sus riesgos, y recomendás una, diciendo por qué.

Hablás en español de Honduras, de vos, como un colega de confianza que conoce la casa desde adentro. Sin rodeos ni relleno. Si la respuesta es un número, va primero el número.

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
${voz}`;

  const delMomento = `Hoy es ${fecha()}. Estás hablando con ${miembro.nombre} (${miembro.rol || 'junta directiva'}).

LO QUE LA JUNTA TE HA DICHO (tu memoria)
${mem}

LO QUE ESTÁ PENDIENTE (tareas abiertas, con su id)
${tareas}
Cuando en la conversación aparezca algo que hay que hacer, anotalo con anotar_pendiente. Cerrá uno solo si alguien de la junta dice que ya se hizo.

EL ESTADO VIVO DE LAS CASAS (leído ahora mismo)
${vivo.paraElModelo(estadoVivo)}

EL SABER DE LA CASA (las secciones que hablan de esto)
${fichas}`;

  // La voz de la casa entra en el bloque estable, así que el corte queda ahí.
  return [
    { type: 'text', text: estable, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: delMomento },
  ];
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
    name: 'anotar_pendiente',
    description: 'Anota algo que la junta tiene que HACER. Distinto de recordar, que guarda cómo son las cosas: esto se puede cerrar cuando se haga. Usalo cuando en la conversación aparece una tarea, un paso que falta o un compromiso.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Qué hay que hacer, en una frase clara y concreta.' },
        quien: { type: 'string', description: 'A quién le toca. Vacío si es de toda la junta.' },
        tema: { type: 'string', description: 'Una palabra: ordenex, aucorp, wallet, seguridad, legal…' },
      },
      required: ['texto'],
    },
  },
  {
    name: 'cerrar_pendiente',
    description: 'Marca un pendiente como hecho. Usalo solo cuando alguien de la junta dice que ya se hizo, nunca por tu cuenta.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'El id del pendiente, tal como aparece en la lista.' } },
      required: ['id'],
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
      case 'anotar_pendiente': {
        const p = await memoria.anotarPendiente({
          texto: entrada.texto, quien: entrada.quien, tema: entrada.tema, creadoPor: ctx.miembro.correo,
        });
        if (p) ctx.pendientes.push({ _id: p._id, texto: p.texto, quien: p.quien });
        return p ? `Anotado como pendiente (id ${p._id}): ${p.texto}` : 'No se anotó: texto vacío.';
      }
      case 'cerrar_pendiente': {
        const p = await memoria.cerrarPendiente(String(entrada.id || ''), ctx.miembro.correo);
        return p ? `Cerrado: ${p.texto}` : 'No existe un pendiente con ese id.';
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
  const ctx = { miembro, junta, conversacionId, fuentes: [], memorias: [], documentos: [], envios: [], pendientes: [] };

  // El contexto: memoria, estado vivo, saber, voz de la casa.
  const [memorias, estadoVivo, abiertos] = await Promise.all([
    memoria.memoriasDe(miembro.correo),
    vivo.leerConCache(),
    memoria.pendientes({ limite: 40 }),
  ]);
  const secciones = saber.buscar(texto, { maximo: 12, maxBytes: 60_000 });
  ctx.fuentes.push(...secciones.map((s) => ({ id: s.id, titulo: s.titulo, fuente: s.fuente })));
  const system = sistema({ miembro, memorias, estadoVivo, secciones, vozCasa: saber.vozDeLaCasa(), pendientes: abiertos });

  // El hilo: los turnos anteriores, para que retome.
  const previa = conversacionId ? await memoria.conversacion(conversacionId, miembro.correo) : null;
  const mensajes = [];
  for (const t of (previa?.turnos || []).slice(-16)) {
    mensajes.push({ role: t.rol === 'miembro' ? 'user' : 'assistant', content: t.texto });
  }
  mensajes.push({ role: 'user', content: texto });

  let textoFinal = '';
  const herramientasUsadas = [];
  // El gasto del turno entero: un turno son varias llamadas (una por vuelta de
  // herramientas), y a la junta le importa lo que costó LA PREGUNTA.
  const uso = { entrada: 0, salida: 0, lecturaCache: 0, escrituraCache: 0 };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = cl.messages.stream({
      model: MODELO, max_tokens: MAX_SALIDA, system, tools: HERRAMIENTAS, messages: mensajes,
    });
    let textoVuelta = '';
    stream.on('text', (t) => { textoVuelta += t; emitir('texto', { t }); });
    const msg = await stream.finalMessage();
    const u = msg.usage || {};
    uso.entrada += u.input_tokens || 0;
    uso.salida += u.output_tokens || 0;
    uso.lecturaCache += u.cache_read_input_tokens || 0;
    uso.escrituraCache += u.cache_creation_input_tokens || 0;
    textoFinal += (textoFinal && textoVuelta ? '\n\n' : '') + textoVuelta;

    /* UN RECHAZO NO ES UNA AVERÍA, y no se puede quedar en silencio. El modelo
       puede declinar una petición (stop_reason «refusal», HTTP 200): sin esto
       la persona veía una respuesta vacía y no sabía si se había roto algo. */
    if (msg.stop_reason === 'refusal') {
      const que = msg.stop_details?.category ? ` (${msg.stop_details.category})` : '';
      textoFinal += (textoFinal ? '\n\n' : '')
        + `No puedo contestar eso${que}. No es una falla del sistema: es una decisión del modelo sobre esta petición en concreto. Si creés que es un error, planteámelo de otra forma o decímelo y lo vemos.`;
      break;
    }

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

  const dolares = dolaresDe(MODELO, uso);
  // Se anota aparte del hilo: el gasto se suma por día y por mes, y recorrer
  // todas las conversaciones para sumarlo sería caro y frágil.
  memoria.anotarGasto({ miembro: miembro.correo, modelo: MODELO, ...uso, dolares, canal: ctx.canal || 'panel' })
    .catch((e) => console.error(`[gasto] no se pudo anotar: ${e.message}`));

  return { texto: textoFinal, fuentes, herramientas: herramientasUsadas,
           memorias: ctx.memorias, documentos: ctx.documentos, envios: ctx.envios,
           pendientes: ctx.pendientes, uso: { ...uso, dolares }, modelo: MODELO };
}

/** Un título corto para un hilo nuevo, con el modelo chico y barato. */
async function titular(texto) {
  try {
    const cl = clienteAnthropic();
    const r = await cl.messages.create({
      model: process.env.ULTRON_MODELO_CHICO || 'claude-haiku-4-5', max_tokens: 30,
      messages: [{ role: 'user', content: `Título de máximo seis palabras, en español, sin comillas ni punto final, para una conversación que empieza así:\n\n${texto.slice(0, 500)}` }],
    });
    return (r.content?.[0]?.text || '').trim().slice(0, 80) || null;
  } catch { return null; }
}

module.exports = { pensar, titular, encendido, motivo, dolaresDe, PRECIOS, MODELO, HERRAMIENTAS, _adentro: { sistema, correr, clienteAnthropic } };
