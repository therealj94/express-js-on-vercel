// LAS HERRAMIENTAS DE ULTRON: lo que puede HACER, con nombre, y un solo sitio
// donde se ejecutan. Las usan los dos cerebros —el del nodo y Claude— porque
// un asistente cuyas manos cambian según el cerebro que lleve no es un
// asistente, son dos.
//
// ── LAS QUE VEN Y ABREN ─────────────────────────────────────────────────────
//
//   buscar_web / leer_pagina   internet sin depender de nadie: el nodo no tiene
//                              buscador y la junta pidió que ULTRON esté
//                              conectado. DuckDuckGo sin llave; si algún día
//                              hay llave de Brave (ULTRON_BRAVE), se usa esa.
//   abrir                      le pone a la persona un botón para ABRIR una casa
//                              o un documento. No abre nada solo: un navegador
//                              no deja abrir pestañas sin que alguien toque, y
//                              está bien que sea así. Solo sitios de la casa.
//   estado_vivo                mira cómo están las casas ahora mismo.
//
// ── LAS QUE RECUERDAN Y ESCRIBEN ────────────────────────────────────────────
//
//   buscar_saber, recordar, anotar_pendiente, cerrar_pendiente, crear_documento
//
// ── LA QUE PREPARA Y NO MANDA ───────────────────────────────────────────────
//
//   proponer_envio             deja listo un WhatsApp o correo. La persona lo
//                              manda desde el panel. Nunca sale solo.
//
// Ninguna llega a una billetera ni a una llave. Ni tiene con qué.

const saber = require('./saber');
const vivo = require('./vivo');
const memoria = require('./memoria');

// Adónde puede mandar a abrir. Cerrado a la casa a propósito: «abrí» con una
// URL cualquiera es la forma más fácil de que un modelo lleve a alguien a un
// sitio que no es nuestro.
const CASAS = {
  ordenex: { nombre: 'Ordenex', url: 'https://ordenexchange.link/' },
  ordenscan: { nombre: 'OrdenScan', url: 'https://ordenscan.com/' },
  aucorp: { nombre: 'AuCorp', url: 'https://main.d2e55u6ls6v9xt.amplifyapp.com/banca/' },
  wallet: { nombre: 'Veta Wallet', url: 'https://app.vetawallet.com/' },
  ordenglobal: { nombre: 'Orden Global', url: 'https://ordenglobal.org/' },
  aura: { nombre: 'AU-RA', url: 'https://ordenglobal.org/aura' },
};

const DEFINICIONES = [
  {
    name: 'buscar_saber',
    description: 'Busca en lo que Orden Global tiene escrito (documentos, dosieres de la junta, fichas legales) más secciones sobre un tema.',
    input_schema: { type: 'object', properties: { pregunta: { type: 'string', description: 'De qué querés más secciones' } }, required: ['pregunta'] },
  },
  {
    name: 'estado_vivo',
    description: 'Lee ahora mismo cómo están Ordenex, AuCorp, Veta Wallet, Genesis ID, OrdenScan y el precio del ORIGEN.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_web',
    description: 'Busca en internet. Para lo de hoy o de fuera de la casa: precio del oro, una ley, una noticia, un competidor. Devuelve títulos, enlaces y resúmenes.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Qué buscar, en pocas palabras' } }, required: ['consulta'] },
  },
  {
    name: 'leer_pagina',
    description: 'Lee el texto de una página de internet (una URL que salió en buscar_web o que la persona dio).',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  {
    name: 'abrir',
    description: 'Le pone a la persona un botón para abrir una casa (ordenex, ordenscan, aucorp, wallet, ordenglobal, aura) o un documento de la biblioteca (documento:<id>). No abre nada solo.',
    input_schema: { type: 'object', properties: { que: { type: 'string', description: 'ordenex · ordenscan · aucorp · wallet · ordenglobal · aura · documento:<id>' }, porQue: { type: 'string', description: 'Para qué, en una frase' } }, required: ['que'] },
  },
  {
    name: 'recordar',
    description: 'Guarda en la memoria algo que conviene no olvidar: una decisión, una preferencia, un dato. Alcance «junta» si es de todos, «miembro» si es de esta persona.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' }, alcance: { type: 'string', enum: ['junta', 'miembro'] }, tema: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'anotar_pendiente',
    description: 'Anota algo que la junta tiene que HACER. Distinto de recordar: esto se cierra cuando se hace.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' }, quien: { type: 'string', description: 'A quién le toca; vacío si es de la junta' }, tema: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'cerrar_pendiente',
    description: 'Marca un pendiente como hecho, por su id. Solo cuando alguien de la junta dice que ya se hizo.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'crear_documento',
    description: 'Escribe y guarda un documento completo en markdown: memo, acta, análisis, carta o plan. Queda en la biblioteca.',
    input_schema: { type: 'object', properties: { titulo: { type: 'string' }, tipo: { type: 'string', enum: ['memo', 'acta', 'analisis', 'carta', 'plan', 'otro'] }, markdown: { type: 'string' }, para: { type: 'string', enum: ['junta', 'fuera'] } }, required: ['titulo', 'markdown'] },
  },
  {
    name: 'proponer_envio',
    description: 'Prepara un WhatsApp o un correo para un miembro de la junta. NO lo manda: la persona lo confirma en el panel.',
    input_schema: { type: 'object', properties: { canal: { type: 'string', enum: ['whatsapp', 'correo'] }, destinatario: { type: 'string', description: 'Nombre o correo del miembro' }, asunto: { type: 'string' }, texto: { type: 'string' } }, required: ['canal', 'destinatario', 'texto'] },
  },
];

// ── Internet ────────────────────────────────────────────────────────────────

const PLAZO_WEB_MS = 12_000;
const TOPE_PAGINA = 9_000;

function limpiarHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** DuckDuckGo (sin llave) o Brave (con ULTRON_BRAVE). Devuelve texto para el modelo. */
async function buscarWeb(consulta) {
  const q = String(consulta || '').trim().slice(0, 200);
  if (!q) return 'Consulta vacía.';
  const brave = (process.env.ULTRON_BRAVE || '').trim();
  try {
    if (brave) {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6&search_lang=es`,
        { headers: { 'X-Subscription-Token': brave, Accept: 'application/json' }, signal: AbortSignal.timeout(PLAZO_WEB_MS) });
      const j = await r.json();
      const res = (j.web?.results || []).slice(0, 6);
      if (!res.length) return `Sin resultados para «${q}».`;
      return res.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.description || ''}`).join('\n');
    }
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=es-es`,
      { headers: { 'User-Agent': 'Mozilla/5.0 ULTRON/1' }, signal: AbortSignal.timeout(PLAZO_WEB_MS) });
    const html = await r.text();
    const res = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m;
    while ((m = re.exec(html)) && res.length < 6) {
      let url = m[1];
      const uddg = /uddg=([^&]+)/.exec(url); if (uddg) url = decodeURIComponent(uddg[1]);
      res.push({ url, titulo: limpiarHtml(m[2]), resumen: limpiarHtml(m[3] || '') });
    }
    if (!res.length) return `Sin resultados para «${q}» (o el buscador no contestó bien).`;
    return res.map((x, i) => `${i + 1}. ${x.titulo}\n   ${x.url}\n   ${x.resumen}`).join('\n');
  } catch (e) {
    return `No pude buscar «${q}»: ${e?.name === 'TimeoutError' ? 'el buscador tardó demasiado' : String(e?.message || e).slice(0, 120)}.`;
  }
}

async function leerPagina(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { return 'La URL no es válida.'; }
  if (!/^https?:$/.test(u.protocol)) return 'Solo http o https.';
  // Ni redes privadas ni localhost: una herramienta que lee URLs es una puerta
  // hacia adentro si no se le cierra.
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/.test(u.hostname)) return 'Esa dirección no se lee.';
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 ULTRON/1', Accept: 'text/html,text/plain,application/json' }, signal: AbortSignal.timeout(PLAZO_WEB_MS), redirect: 'follow' });
    const tipo = r.headers.get('content-type') || '';
    const cuerpo = await r.text();
    const texto = /html/.test(tipo) ? limpiarHtml(cuerpo) : cuerpo;
    if (!texto.trim()) return `La página contestó ${r.status} pero sin texto legible.`;
    return `(${u.hostname} · ${r.status} · ${texto.length > TOPE_PAGINA ? 'recortado' : 'entero'})\n${texto.slice(0, TOPE_PAGINA)}`;
  } catch (e) {
    return `No pude leer ${u.hostname}: ${e?.name === 'TimeoutError' ? 'tardó demasiado' : String(e?.message || e).slice(0, 120)}.`;
  }
}

// ── Ejecutar ────────────────────────────────────────────────────────────────

/**
 * Corre una herramienta y devuelve TEXTO para el modelo. Nunca lanza: un
 * fallo es texto también, para que el modelo lo lea y se corrija. `ctx`
 * acumula lo que el panel tiene que pintar (fuentes, documentos, envíos,
 * pendientes, acciones).
 */
async function correr(nombre, entrada, ctx) {
  entrada = entrada && typeof entrada === 'object' ? entrada : {};
  ctx.acciones = ctx.acciones || [];
  try {
    switch (nombre) {
      case 'buscar_saber': {
        const s = saber.buscar(String(entrada.pregunta || ''), { maximo: ctx.chico ? 5 : 8, maxBytes: ctx.chico ? 12_000 : 40_000 });
        ctx.fuentes.push(...s.map((x) => ({ id: x.id, titulo: x.titulo, fuente: x.fuente })));
        return s.length
          ? s.map((x) => `### [${x.id}] ${x.titulo}\n(fuente: ${x.fuente})\n${x.texto}`).join('\n\n')
          : 'No hay secciones del saber sobre eso.';
      }
      case 'estado_vivo': {
        const v = await vivo.leer();
        return vivo.paraElModelo(v);
      }
      case 'buscar_web': {
        const t = await buscarWeb(entrada.consulta || entrada.query || entrada.q);
        ctx.fuentes.push({ id: 'web:' + String(entrada.consulta || '').slice(0, 40), titulo: `Búsqueda: ${entrada.consulta || ''}`, fuente: 'internet' });
        return t;
      }
      case 'leer_pagina': {
        const t = await leerPagina(entrada.url);
        try { ctx.fuentes.push({ id: 'url:' + new URL(entrada.url).hostname, titulo: new URL(entrada.url).hostname, fuente: String(entrada.url) }); } catch { /* url mala */ }
        return t;
      }
      case 'abrir': {
        const que = String(entrada.que || '').trim().toLowerCase();
        let accion = null;
        if (que.startsWith('documento:')) {
          const id = que.slice('documento:'.length).trim();
          const d = await memoria.documento(id);
          if (!d) return `No hay un documento con id ${id}.`;
          accion = { tipo: 'abrir', nombre: d.titulo, url: `/documentos/${d._id}/descargar?formato=html`, porQue: entrada.porQue || null };
        } else if (CASAS[que]) {
          accion = { tipo: 'abrir', nombre: CASAS[que].nombre, url: CASAS[que].url, porQue: entrada.porQue || null };
        } else {
          return `No puedo abrir «${que}». Solo: ${Object.keys(CASAS).join(', ')} o documento:<id>.`;
        }
        ctx.acciones.push(accion);
        return `Le puse a la persona un botón para abrir ${accion.nombre}.`;
      }
      case 'recordar': {
        const m = await memoria.recordar({
          texto: entrada.texto, alcance: entrada.alcance === 'junta' ? 'junta' : 'miembro',
          miembro: ctx.miembro.correo, dichoPor: ctx.miembro.nombre, tema: entrada.tema, origen: 'deducido',
        });
        if (m) ctx.memorias.push(m);
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
        if (!entrada.titulo || !entrada.markdown) return 'Faltan titulo o markdown.';
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
        if (!entrada.texto) return 'Falta el texto del mensaje.';
        const p = { id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, canal: entrada.canal === 'correo' ? 'correo' : 'whatsapp',
          a: { nombre: quien.nombre, correo: quien.correo, whatsapp: quien.whatsapp || null },
          asunto: entrada.asunto || null, texto: entrada.texto, propuestoPor: ctx.miembro.correo };
        ctx.envios.push(p);
        return `Envío preparado (${p.id}) por ${p.canal} a ${quien.nombre}. NO se ha mandado: la persona lo confirma en el panel.`;
      }
      default:
        return `No existe la herramienta ${nombre}. Las que hay: ${DEFINICIONES.map((d) => d.name).join(', ')}.`;
    }
  } catch (e) {
    return `La herramienta ${nombre} falló: ${String(e?.message || e).slice(0, 200)}`;
  }
}

/** Las definiciones en el formato de Ollama. */
function paraOllama() {
  return DEFINICIONES.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.input_schema } }));
}

module.exports = { DEFINICIONES, CASAS, correr, paraOllama, buscarWeb, leerPagina, _adentro: { limpiarHtml } };
