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
  // ── Las manos sobre el ecosistema: leen las APIs de verdad de cada casa ───
  {
    name: 'ordenex_mercado',
    description: 'Lee un mercado de Ordenex ahora mismo: libro (compras y ventas), últimos tratos y la referencia del oro. Mercados: AUKA-ORIGEN, ONDK-ORIGEN, USDT-ORIGEN (o los que devuelva estado_vivo).',
    input_schema: { type: 'object', properties: { mercado: { type: 'string', description: 'Par, p. ej. AUKA-ORIGEN' } }, required: ['mercado'] },
  },
  {
    name: 'cadena_direccion',
    description: 'Consulta una dirección en la cadena 8532 (OrdenScan): saldo, tokens (ONDK, AUKA, ORIGEN…) y últimas transacciones.',
    input_schema: { type: 'object', properties: { direccion: { type: 'string', description: '0x… de 42 caracteres' } }, required: ['direccion'] },
  },
  {
    name: 'cadena_altura',
    description: 'La altura actual de las cadenas de la casa: bloque de la 8532 (OrdenScan) y de la 5550 (Ordenex).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'aucorp_monedas',
    description: 'Las monedas que maneja AuCorp y si las tasas están al día. AuCorp es una FinTech con cuentas en moneda local, NO un banco.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'genesis_salud',
    description: 'Cómo está Genesis ID (identidad): estado del servicio y qué le falta para el cumplimiento.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'nodo_salud',
    description: 'Cómo está nuestro nodo de inteligencia (el motor donde pensás): modelo cargado, contexto, pedidos atendidos y rechazados.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_documentos',
    description: 'Lista los documentos de la biblioteca de la junta (memos, actas, análisis) con su id, para leerlos o abrirlos.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'leer_documento',
    description: 'Lee entero un documento de la biblioteca por su id (de listar_documentos).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'listar_pendientes',
    description: 'Lista los pendientes abiertos de la junta con su id, a quién le tocan y desde cuándo.',
    input_schema: { type: 'object', properties: { conHechos: { type: 'boolean', description: 'true para ver también los ya hechos' } } },
  },
  {
    name: 'calcular',
    description: 'Calcula una expresión aritmética exacta (+ - * / % ^ y paréntesis). Usala para cualquier cuenta: no hagas aritmética de cabeza.',
    input_schema: { type: 'object', properties: { expresion: { type: 'string', description: 'p. ej. 4467.53 / 31.1035 / 55' } }, required: ['expresion'] },
  },
  {
    name: 'gasto',
    description: 'Lo gastado en pensar hoy y en el mes: turnos, fichas y dólares.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cadena_5550_saldo',
    description: 'Lee en la cadena 5550 (la de ORIGEN) el saldo de una dirección: ORIGEN nativo y los tokens de la casa (AUKA, AGKA, ONDK…).',
    input_schema: { type: 'object', properties: { direccion: { type: 'string', description: '0x… de 42 caracteres' } }, required: ['direccion'] },
  },
  {
    name: 'cotizar',
    description: 'Cotiza con el precio de AHORA: cuánto ORIGEN dan N USDT (sentido «compra») o cuántos USDT dan N ORIGEN con la comisión de salida del 1 % (sentido «venta»).',
    input_schema: { type: 'object', properties: { monto: { type: 'number', description: 'La cantidad' }, sentido: { type: 'string', enum: ['compra', 'venta'] } }, required: ['monto', 'sentido'] },
  },
  {
    name: 'parte_del_dia',
    description: 'Arma el parte del día para la junta: estado de cada casa, precio, bloques, pendientes abiertos, documentos recientes y gasto. Úsalo cuando pidan «el parte», «cómo estamos» o un resumen general.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_conversaciones',
    description: 'Busca en las conversaciones anteriores de esta persona con ULTRON por una palabra o tema, y devuelve los fragmentos que coinciden con su fecha.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] },
  },
  {
    name: 'olvidar',
    description: 'Borra una memoria guardada, por su id, cuando la persona dice que ya no aplica o que estaba mal.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'nube_estado',
    description: 'Lee en AWS cómo están las máquinas de la casa: el nodo de inteligencia y los nodos de la cadena (encendidas, apagadas, su IP). Solo lee.',
    input_schema: { type: 'object', properties: {} },
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

/* ── LOS NOMBRES DE LA CASA NO SE BUSCAN SOLOS ────────────────────────────────
 *
 * «Orden Global», a secas, le devuelve al buscador seis artículos sobre el
 * orden internacional y ni una línea de la casa; con eso delante el modelo
 * contesta que la organización no existe en internet. Decírselo en el prompt no
 * alcanzó —qwen propone la búsqueda buena y sigue mandando la mala—, así que la
 * afina la herramienta, que no se olvida.
 *
 * Solo cuando la consulta es el nombre PELADO: si alguien pregunta «Orden
 * Global demanda 2026» esa consulta es suya y se manda tal cual.
 */
const NOMBRES_DE_LA_CASA = [
  { re: /\borden\s*global\b/i, como: '"Orden Global" ordenglobal.org Honduras' },
  { re: /\bordenex\b/i, como: '"Ordenex" ordenexchange.link ORIGEN' },
  { re: /\borden\s*scan\b/i, como: '"OrdenScan" ordenscan.com' },
  { re: /\bau\s*corp\b/i, como: '"AuCorp" "Orden Global" Honduras' },
  { re: /\bveta\s*wallet\b/i, como: '"Veta Wallet" "Orden Global" ORIGEN' },
  { re: /\bgenesis\s*id\b/i, como: '"Genesis ID" "Orden Global" identidad' },
  { re: /\b(auka|agka)\b/i, como: '"Orden Global" AUKA AGKA plata oro' },
];
// Lo que no cuenta como «pregunta»: el relleno con el que se pide una búsqueda.
const RELLENO = /\b(informacion|información|info|datos?|sobre|acerca|de|del|la|el|los|las|un|una|que|qué|se|dice|dicen|en|internet|web|busca|busque|buscar|buscame|y|o|empresa|organizacion|organización|compania|compañia|compañía|proyecto|plataforma|ecosistema)\b/gi;

function afinarConsulta(q) {
  for (const n of NOMBRES_DE_LA_CASA) {
    if (!n.re.test(q)) continue;
    const resto = q.replace(n.re, ' ').replace(RELLENO, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    // Una palabra suelta todavía es el nombre pelado; dos ya son una pregunta.
    if (resto.split(/\s+/).filter(Boolean).length <= 1) return n.como;
  }
  return null;
}

/** DuckDuckGo (sin llave) o Brave (con ULTRON_BRAVE). Devuelve texto para el modelo. */
async function buscarWeb(consulta) {
  let q = String(consulta || '').trim().slice(0, 200);
  if (!q) return 'Consulta vacía.';
  const afinada = afinarConsulta(q);
  // El aviso va CON los resultados: el modelo tiene que poder decir con qué se
  // buscó de verdad, y que lo de internet es lo que se dice afuera de la casa.
  const nota = afinada
    ? `(La consulta «${q}» trae artículos de geopolítica, no a la casa: se buscó «${afinada}». Lo que sigue es lo que se dice AFUERA de Orden Global; lo que la casa ES sale de las fichas y del estado vivo, no de aquí. Si un titular dice «respaldado en oro», esa es la palabra de esa fuente: se cita como está y, al comentarlo, la palabra de la casa es «referenciado».)\n\n`
    : '';
  if (afinada) q = afinada;
  const brave = (process.env.ULTRON_BRAVE || '').trim();
  try {
    if (brave) {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6&search_lang=es`,
        { headers: { 'X-Subscription-Token': brave, Accept: 'application/json' }, signal: AbortSignal.timeout(PLAZO_WEB_MS) });
      const j = await r.json();
      const res = (j.web?.results || []).slice(0, 6);
      if (!res.length) return `${nota}Sin resultados para «${q}».`;
      return nota + res.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.description || ''}`).join('\n');
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
    if (!res.length) return `${nota}Sin resultados para «${q}» (o el buscador no contestó bien).`;
    return nota + res.map((x, i) => `${i + 1}. ${x.titulo}\n   ${x.url}\n   ${x.resumen}`).join('\n');
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
        if (p && !p.repetido) ctx.pendientes.push({ _id: p._id, texto: p.texto, quien: p.quien });
        if (p?.repetido) return `Ya estaba anotado (id ${p._id}): «${p.texto}». No lo repetí.`;
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
      case 'ordenex_mercado': {
        const par = String(entrada.mercado || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (!par) return 'Falta el mercado.';
        const base = vivo.CASAS.ordenex.api;
        const [mercados, libro, tratos, ref] = await Promise.all([
          leerJson(base + '/mercados'), leerJson(`${base}/mercados/${par}/libro`), leerJson(`${base}/mercados/${par}/tratos`), leerJson(`${base}/mercados/${par}/referencia`),
        ]);
        const m = Array.isArray(mercados) ? mercados.find((x) => x.mercado === par) : null;
        if (!m) return `Ordenex no tiene el mercado ${par}. Los que hay: ${Array.isArray(mercados) ? mercados.map((x) => x.mercado).join(', ') : 'no se pudieron leer'}.`;
        const l = [`Mercado ${par} (Ordenex, leído ahora):`];
        l.push(`- último trato: ${m.ultimo ? ori(m.ultimo) : 'ninguno'} · volumen 24 h: ${ori(m.vol24h || '0')} · mejor compra: ${m.mejorCompra ? ori(m.mejorCompra) : '—'} · mejor venta: ${m.mejorVenta ? ori(m.mejorVenta) : '—'}`);
        if (libro && !libro.error) {
          l.push(`- libro: ${(libro.compras || []).length} compras, ${(libro.ventas || []).length} ventas`);
          for (const [p, c] of (libro.compras || []).slice(0, 5)) l.push(`  · compra ${ori(p)} × ${ori(c)}`);
          for (const [p, c] of (libro.ventas || []).slice(0, 5)) l.push(`  · venta ${ori(p)} × ${ori(c)}`);
        }
        if (Array.isArray(tratos)) l.push(`- tratos recientes: ${tratos.length}${tratos.slice(0, 5).map((t) => `\n  · ${t.precio ? ori(t.precio) : '?'} × ${t.cantidad ? ori(t.cantidad) : '?'} ${t.en ? new Date(t.en).toISOString() : ''}`).join('')}`);
        if (ref && !ref.error) { const v = Array.isArray(ref.velas) && ref.velas.length ? ref.velas[ref.velas.length - 1] : null; l.push(`- referencia: ${ref.rotulo || ''} (${ref.fuente || '?'})${v ? ` · último cierre ${v[4]} ${ref.unidad || ''}` : ''}`); }
        l.push('Precios en ORIGEN; las cantidades en unidades del activo. Los 18 decimales ya están convertidos.');
        return l.join('\n');
      }
      case 'cadena_direccion': {
        const d = String(entrada.direccion || '').trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(d)) return 'Dirección inválida: tiene que ser 0x seguido de 40 caracteres hexadecimales.';
        const j = await leerJson(`${vivo.CASAS.ordenscan.api}/address/${d}`);
        if (!j || j.error) return `OrdenScan no contestó por esa dirección${j?.error ? ': ' + j.error : ''}.`;
        const l = [`Dirección ${d} en la cadena 8532 (OrdenScan):`, `- saldo nativo: ${ori(j.balance || '0')}`];
        for (const [sym, t] of Object.entries(j.tokensBalance || {})) l.push(`- ${sym} (${t.name || sym}): ${ori(t.balance || '0')}${t.contractAddress ? ' · contrato ' + t.contractAddress : ''}`);
        const tx = Array.isArray(j.transactions) ? j.transactions : [];
        l.push(`- transacciones: ${tx.length}`);
        for (const t of tx.slice(0, 5)) l.push(`  · ${t.hash || t.transactionHash || '?'} ${t.from ? 'de ' + t.from : ''} ${t.to ? 'a ' + t.to : ''} ${t.value ? ori(t.value) : ''}`.trim());
        return l.join('\n');
      }
      case 'cadena_altura': {
        const [scan, v] = await Promise.all([leerJson(`${vivo.CASAS.ordenscan.api}/block/totalBlock`), vivo.leerConCache()]);
        return `Cadena 8532 (OrdenScan): bloque ${scan?.blockTotal ?? 'no leído'}. Cadena 5550 (Ordenex): bloque ${v?.ordenex?.bloque5550 ?? 'no leído'}. Leído ahora.`;
      }
      case 'aucorp_monedas': {
        const base = vivo.CASAS.aucorp.api;
        const [salud, mon] = await Promise.all([leerJson(base + '/salud'), leerJson(base + '/monedas')]);
        if (!salud) return 'AuCorp no contesta.';
        const l = [`AuCorp: ${salud.ok ? 'viva' : 'con problemas'} · tasas ${salud.tasas ? 'al día' : 'sin tasas'}${salud.tasasCuando ? ' (' + salud.tasasCuando + ')' : ''} · Genesis ${salud.genesis ? 'conectado' : 'no'} · sanciones cargadas: ${salud.sanciones?.registros ?? '?'} registros`];
        for (const m of mon?.monedas || []) l.push(`- ${m.codigo} ${m.nombre} (${m.pais})`);
        l.push('AuCorp es una FinTech: cuentas en moneda local. No es un banco y no hay «depósito asegurado».');
        return l.join('\n');
      }
      case 'genesis_salud': {
        const j = await leerJson(`${vivo.CASAS.genesis.api}/healthz`);
        if (!j) return 'Genesis ID no contesta.';
        const falta = j.cumplimiento?.falta || [];
        return `Genesis ID: ${j.estado || '?'} (${j.en || ''}). Cumplimiento ${j.cumplimiento?.completo ? 'completo' : 'incompleto'}${falta.length ? ':\n- ' + falta.join('\n- ') : '.'}`;
      }
      case 'nodo_salud': {
        const nodo = require('./cerebros/nodo');
        const s = await nodo.salud();
        if (!s?.vivo) return `El nodo no contesta${s?.porQue ? ': ' + s.porQue : ''}.`;
        return `Nodo vivo: modelo ${s.modelo || '?'} · contexto ${s.ctx || '?'} fichas · modelos cargados: ${(s.ollama?.modelos || []).join(', ') || '?'} · pedidos ${s.pedidos ?? '?'} · rechazados ${s.rechazados ?? '?'}.`;
      }
      case 'listar_documentos': {
        const docs = await memoria.documentos({ limite: 30 });
        if (!docs.length) return 'La biblioteca está vacía.';
        return docs.map((d) => `- [${d._id}] ${d.titulo} (${d.tipo || 'otro'}, ${d.miembro || '?'}, ${d.en ? new Date(d.en).toISOString().slice(0, 10) : ''})`).join('\n');
      }
      case 'leer_documento': {
        const d = await memoria.documento(String(entrada.id || '').trim());
        if (!d) return 'No hay un documento con ese id.';
        return `# ${d.titulo}\n(${d.tipo || 'otro'} · ${d.en ? new Date(d.en).toISOString().slice(0, 10) : ''})\n\n${String(d.markdown || '').slice(0, ctx.chico ? 6000 : 20000)}`;
      }
      case 'listar_pendientes': {
        const ps = await memoria.pendientes({ conHechos: entrada.conHechos === true, limite: 40 });
        if (!ps.length) return 'No hay pendientes.';
        return ps.map((p) => `- [${p._id}] ${p.estado === 'hecho' ? '(hecho) ' : ''}${p.texto}${p.quien ? ' · le toca a ' + p.quien : ''}${p.tema ? ' · ' + p.tema : ''}${p.en ? ' · desde ' + new Date(p.en).toISOString().slice(0, 10) : ''}`).join('\n');
      }
      case 'cadena_5550_saldo': {
        const d = String(entrada.direccion || '').trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(d)) return 'Dirección inválida: tiene que ser 0x seguido de 40 caracteres hexadecimales.';
        const rpc = process.env.OG_CHAIN_PROVIDER || 'https://rpc.ordenglobal-rpc.com';
        const llamar = async (method, params) => {
          const r = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12_000) });
          const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
        };
        const nativo = BigInt(await llamar('eth_getBalance', [d, 'latest']));
        const l = [`Dirección ${d} en la cadena 5550 (leído ahora):`, `- ORIGEN: ${ori(nativo.toString())}`];
        const dato = '0x70a08231' + d.slice(2).toLowerCase().padStart(64, '0');
        for (const [sym, contrato] of Object.entries(TOKENS_5550)) {
          try { const v = BigInt(await llamar('eth_call', [{ to: contrato, data: dato }, 'latest']) || '0x0'); if (v > 0n) l.push(`- ${sym}: ${ori(v.toString())}`); } catch { /* un token que no contesta no tumba la lectura */ }
        }
        const n = parseInt(await llamar('eth_getTransactionCount', [d, 'latest']), 16);
        l.push(`- transacciones enviadas: ${n}`);
        return l.join('\n');
      }
      case 'cotizar': {
        const monto = Number(entrada.monto);
        if (!(monto > 0)) return 'El monto tiene que ser un número mayor que cero.';
        const v = await vivo.leerConCache();
        const precio = v?.origen?.origenUsd;
        if (!precio) return 'No hay precio de referencia ahora mismo.';
        if (entrada.sentido === 'venta') {
          const bruto = monto * precio, comision = bruto * 0.01;
          return `Venta de ${monto} ORIGEN a ${precio.toFixed(6)} USD: bruto ${bruto.toFixed(4)} USDT, comisión de salida del 1 % ${comision.toFixed(4)} USDT, recibe ${(bruto - comision).toFixed(4)} USDT. Precio de referencia leído ${v.leidoEn}.`;
        }
        return `Compra con ${monto} USDT a ${precio.toFixed(6)} USD por ORIGEN: recibe ${(monto / precio).toFixed(6)} ORIGEN (sin comisión de entrada). Precio de referencia leído ${v.leidoEn}.`;
      }
      case 'parte_del_dia': {
        const [v, pend, docs, g] = await Promise.all([vivo.leer(), memoria.pendientes({ limite: 40 }), memoria.documentos({ limite: 5 }), memoria.gasto()]);
        const l = [`PARTE DEL DÍA · ${fecha()}`, '', 'Casas:', vivo.paraElModelo(v)];
        l.push('', `Pendientes abiertos: ${pend.length}`);
        for (const p of pend.slice(0, 12)) l.push(`- [${p._id}] ${p.texto}${p.quien ? ' · ' + p.quien : ''}`);
        l.push('', `Documentos recientes: ${docs.length}`);
        for (const d of docs) l.push(`- [${d._id}] ${d.titulo} (${d.tipo || 'otro'}, ${d.en ? new Date(d.en).toISOString().slice(0, 10) : ''})`);
        l.push('', `Gasto: hoy ${g.hoy.turnos} turnos · mes ${g.mes.turnos} turnos${g.mes.conPrecio ? ` · $${g.mes.dolares.toFixed(2)}` : ''}.`);
        return l.join('\n');
      }
      case 'buscar_conversaciones': {
        const q = String(entrada.consulta || '').trim().toLowerCase();
        if (q.length < 2) return 'Consulta demasiado corta.';
        const lista = await memoria.conversacionesDe(ctx.miembro.correo, { limite: 40 });
        const hallazgos = [];
        for (const c of lista) {
          const conv = await memoria.conversacion(c._id, ctx.miembro.correo);
          for (const t of conv?.turnos || []) {
            const tx = String(t.texto || '');
            const i = tx.toLowerCase().indexOf(q);
            if (i >= 0) { hallazgos.push(`- ${new Date(t.en || conv.tocado || conv.en).toISOString().slice(0, 10)} · ${t.rol === 'miembro' ? ctx.miembro.nombre : 'ULTRON'} en «${conv.titulo || 'sin título'}»: …${tx.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, ' ')}…`); }
            if (hallazgos.length >= 12) break;
          }
          if (hallazgos.length >= 12) break;
        }
        return hallazgos.length ? `Fragmentos que mencionan «${q}»:\n${hallazgos.join('\n')}` : `Ninguna conversación anterior menciona «${q}».`;
      }
      case 'olvidar': {
        const ok = await memoria.olvidar(String(entrada.id || ''), ctx.miembro.correo);
        return ok ? 'Memoria borrada.' : 'No hay una memoria con ese id que esta persona pueda borrar.';
      }
      case 'nube_estado': {
        if (!process.env.AWS_ACCESS_KEY_ID) return 'No hay credenciales de AWS configuradas: no puedo leer la nube.';
        const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
        const l = ['Máquinas de la casa en AWS (leído ahora):'];
        for (const region of ['us-east-1', 'us-east-2']) {
          try {
            const r = await new EC2Client({ region }).send(new DescribeInstancesCommand({}));
            for (const res of r.Reservations || []) for (const i of res.Instances || []) {
              const nombre = (i.Tags || []).find((t) => t.Key === 'Name')?.Value || i.InstanceId;
              l.push(`- ${nombre} (${i.InstanceId}, ${region}, ${i.InstanceType}): ${i.State?.Name}${i.PublicIpAddress ? ' · ' + i.PublicIpAddress : ''}`);
            }
          } catch (e) { l.push(`- ${region}: no se pudo leer (${String(e.message).slice(0, 80)})`); }
        }
        return l.length > 1 ? l.join('\n') : 'No hay máquinas visibles en us-east-1 ni us-east-2.';
      }
      case 'calcular': {
        return calcular(String(entrada.expresion || ''));
      }
      case 'gasto': {
        const g = await memoria.gasto();
        const f = (c) => `${c.turnos} turnos · ${c.entrada + c.salida} fichas · ${c.conPrecio ? '$' + c.dolares.toFixed(4) : 'dólares incompletos'}`;
        return `Hoy: ${f(g.hoy)}. Últimos 30 días: ${f(g.mes)}. En el nodo propio el pensar no cuesta por pregunta.`;
      }
      default:
        return `No existe la herramienta ${nombre}. Las que hay: ${DEFINICIONES.map((d) => d.name).join(', ')}.`;
    }
  } catch (e) {
    return `La herramienta ${nombre} falló: ${String(e?.message || e).slice(0, 200)}`;
  }
}

// ── Auxiliares de las manos sobre el ecosistema ─────────────────────────────

/** Los tokens de la casa en la 5550, para leer saldos. Contratos públicos. */
const TOKENS_5550 = {
  AUKA: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B', AGKA: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B',
  ONDK: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1', MNKA: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead',
};
const fecha = () => new Date().toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Tegucigalpa' });

/** GET JSON con plazo; null si no contesta o no es JSON. */
async function leerJson(url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return r.ok ? null : { error: `HTTP ${r.status}` }; }
  } catch (e) { return { error: String(e?.message || e).slice(0, 80) }; }
}

/** Un entero de 18 decimales (wei) a número legible. Acepta números normales. */
function ori(v) {
  const s = String(v ?? '0').trim();
  if (!/^\d+$/.test(s)) return s;
  if (s.length <= 12) return s;                            // ya viene en unidades
  const ent = s.slice(0, -18) || '0', dec = s.slice(-18).padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return Number(ent).toLocaleString('en-US') + (dec ? '.' + dec : '');
}

/** Aritmética exacta y nada más: sin nombres, sin llamadas, sin trucos. */
function calcular(expresion) {
  const e = expresion.replace(/,/g, '').replace(/\s+/g, '').replace(/\^/g, '**').replace(/×/g, '*').replace(/÷/g, '/');
  if (!e) return 'Expresión vacía.';
  if (!/^[0-9.+\-*/%()]+$/.test(e) || /[a-zA-Z_$]/.test(e)) return 'Solo números y + - * / % ^ ( ).';
  if (e.length > 200) return 'Expresión demasiado larga.';
  try {
    const r = Function(`"use strict"; return (${e});`)();
    if (typeof r !== 'number' || !Number.isFinite(r)) return 'No da un número.';
    return `${expresion.trim()} = ${Number.isInteger(r) ? r : r.toPrecision(10).replace(/\.?0+$/, '')}`;
  } catch { return 'No pude calcular eso.'; }
}

/** Cómo se agrupan en la consola: la persona ve las manos por lo que tocan. */
const GRUPOS = {
  'La casa, en vivo': ['estado_vivo', 'parte_del_dia', 'cotizar', 'nodo_salud', 'nube_estado'],
  'Ordenex y las cadenas': ['ordenex_mercado', 'cadena_altura', 'cadena_direccion', 'cadena_5550_saldo'],
  'Las otras casas': ['aucorp_monedas', 'genesis_salud'],
  'El saber y la memoria': ['buscar_saber', 'buscar_conversaciones', 'recordar', 'olvidar'],
  'Pendientes y documentos': ['listar_pendientes', 'anotar_pendiente', 'cerrar_pendiente', 'listar_documentos', 'leer_documento', 'crear_documento'],
  'Internet': ['buscar_web', 'leer_pagina'],
  'Acciones que confirma la persona': ['abrir', 'proponer_envio'],
  'Cuentas': ['calcular', 'gasto'],
};

/** El catálogo para la consola: definición, grupo y si escribe algo. */
function catalogo() {
  const escriben = new Set(['recordar', 'olvidar', 'anotar_pendiente', 'cerrar_pendiente', 'crear_documento', 'proponer_envio']);
  const grupoDe = (n) => Object.entries(GRUPOS).find(([, l]) => l.includes(n))?.[0] || 'Otras';
  return DEFINICIONES.map((d) => ({ nombre: d.name, descripcion: d.description, entrada: d.input_schema, grupo: grupoDe(d.name), escribe: escriben.has(d.name) }));
}

/** Las definiciones en el formato de Ollama. */
function paraOllama() {
  return DEFINICIONES.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.input_schema } }));
}

module.exports = { DEFINICIONES, CASAS, GRUPOS, catalogo, correr, paraOllama, buscarWeb, leerPagina, _adentro: { limpiarHtml, ori, calcular, leerJson, afinarConsulta } };
