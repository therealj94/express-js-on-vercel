/* El despacho: la conversación con ULTRON.
 *
 * LO QUE ESTÁ GRABADO AQUÍ
 *
 * · CADA CONSULTA QUEDA A LA VISTA. Cuando ULTRON lee Ordenex, la cadena o la
 *   biblioteca, eso aparece en el hilo como un registro —qué instrumento, con
 *   qué entrada, qué devolvió— antes de la respuesta. Un sistema que consulta
 *   la casa a escondidas no le sirve a una junta: la junta tiene que poder ir
 *   a mirar de dónde salió cada número.
 * · EL TEXTO LLEGA A MEDIDA QUE SE PIENSA, y la voz lo dice frase por frase
 *   mientras sigue llegando. Ni una rueda girando en silencio.
 * · LA VOZ HABLA SIEMPRE, salvo que se la silencie en Ajustes. Y se despierta
 *   con el primer gesto de la persona, que es lo que un navegador exige.
 * · MODO CONVERSACIÓN: ULTRON escucha, responde y vuelve a escuchar. Se apaga
 *   solo tras tres silencios seguidos.
 */
const DESPACHO = (() => {
  'use strict';
  const esc = MARKDOWN.esc;
  const $ = (id) => document.getElementById(id);
  const ahora = () => new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });

  let yo = null;
  let conversacionId = null;
  let pensando = false;
  let conversando = false;
  let vaciasSeguidas = 0;
  let saludoDicho = false;
  let saludoPendiente = [];
  let audioPermitido = false;
  let locutor = null;
  const silencio = () => { try { return localStorage.getItem('ultron.silencio') === '1'; } catch { return false; } };
  const vozElegida = () => { try { return localStorage.getItem('ultron.voz') || null; } catch { return null; } };

  const SUGERENCIAS = [
    'Presente el parte del día.',
    '¿Cómo está el libro de AUKA-ORIGEN?',
    '¿Qué pendientes tiene la Junta abiertos?',
    '¿Cómo están los servidores de la casa?',
    'Cotice 100 USDT en ORIGEN.',
    'Redacte un memorando con el estado de Ordenex.',
  ];

  function elLocutor() {
    if (locutor) return locutor;
    locutor = new VOZ.Locutor({
      conElevenLabs: !!yo?.voz,
      // La envolvente del habla mueve la figura: el núcleo late y las cintas
      // se aceleran mientras ULTRON habla.
      alNivel: (v) => PRESENCIA.nivel(v),
      alEmpezar: () => { $('vozEstado').textContent = 'ULTRON está hablando'; PRESENCIA.estado('hablando'); },
      alTerminar: () => {
        $('vozEstado').textContent = conversando ? 'Conversación continua' : '';
        PRESENCIA.estado(conversando ? 'escuchando' : 'quieto'); PRESENCIA.nivel(0);
        if (conversando) setTimeout(() => { if (conversando) escucharUnaVez(); }, 350);
      },
      // Si el navegador no dejó sonar el audio, se dice por qué UNA vez: el
      // silencio sin explicación es lo que hace pensar que está roto.
      alFallo: (porQue) => {
        $('vozEstado').textContent = 'Voz por el navegador';
        APP.avisar(`Su navegador no permitió reproducir el audio (${porQue}). ULTRON continúa con la voz del navegador; toque la pantalla para habilitar la voz completa.`);
      },
    });
    locutor.vozId = vozElegida();
    return locutor;
  }
  function permitirAudio() { elLocutor().despertar(); if (audioPermitido) return; audioPermitido = true; decirSaludoSiSePuede(); }
  function decirSaludoSiSePuede() {
    if (!audioPermitido || saludoDicho || !saludoPendiente.length || silencio()) return;
    saludoDicho = true; for (const f of saludoPendiente) elLocutor().decir(f); saludoPendiente = [];
  }

  /** Portada cuando no hay nada dicho; la figura al fondo cuando sí. */
  function acomodarPresencia() {
    const vacio = $('hilo').childElementCount === 0;
    $('portada').hidden = !vacio;
    $('hilo').hidden = vacio;
    PRESENCIA.plano(vacio ? 'portada' : 'fondo');
  }

  // ── el hilo ─────────────────────────────────────────────────────────────
  function turno(de, html, { id } = {}) {
    const el = document.createElement('article');
    el.className = `turno ${de === 'ultron' ? 'ultron' : 'miembro'}`; if (id) el.id = id;
    el.innerHTML = `<div class="de"><b>${de === 'ultron' ? 'ULTRON' : esc(yo?.miembro?.nombre || 'Usted')}</b><time>${ahora()}</time></div><div class="cuerpo">${html}</div>`;
    $('hilo').appendChild(el); acomodarPresencia(); $('hilo').scrollTop = $('hilo').scrollHeight;
    return el;
  }
  function registro(nombre, entrada) {
    const el = document.createElement('details');
    el.className = 'registro';
    const ent = entrada && Object.keys(entrada).length ? JSON.stringify(entrada) : '';
    el.innerHTML = `<summary><b>${esc(nombre)}</b><span>${ent ? esc(ent.length > 90 ? ent.slice(0, 88) + '…' : ent) : 'consultando'}</span><span class="estado viva">en curso</span></summary><div class="detalle"><b>Entrada</b>\n${esc(ent || '(sin parámetros)')}\n\n<b>Salida</b>\n<span class="sal">…</span></div>`;
    return el;
  }

  async function enviar(texto, modo = 'texto') {
    const t = String(texto || '').trim();
    if (!t || pensando) return;
    permitirAudio(); const L = elLocutor(); L.callar();
    pensando = true; $('btnEnviar').disabled = true; $('sugerencias').hidden = true;
    PRESENCIA.estado('pensando');
    if ($('hilo').childElementCount === 0 && $('portadaLinea').textContent) turno('ultron', `<p>${esc($('portadaLinea').textContent)}</p>`);
    turno('miembro', `<p>${esc(t)}</p>`);
    const resp = turno('ultron', '<div class="pensando">Consultando</div>');
    const cuerpo = resp.querySelector('.cuerpo');
    let acumulado = ''; let hablado = false; const registros = [];
    const pintarTexto = () => { cuerpo.querySelector('.pensando')?.remove(); let z = cuerpo.querySelector('.md'); if (!z) { z = document.createElement('div'); z.className = 'md'; cuerpo.appendChild(z); } z.innerHTML = MARKDOWN.aHtml(acumulado); $('hilo').scrollTop = $('hilo').scrollHeight; };

    await DATOS.pensar(t, { conversacionId, modo }, {
      inicio: (d) => { conversacionId = d.conversacionId; },
      pensando: (d) => { const p = cuerpo.querySelector('.pensando'); if (p) p.textContent = d.motivo === 'otro idioma' ? 'Corrigiendo el idioma' : d.vuelta ? `Consultando (paso ${d.vuelta + 1})` : 'Consultando'; },
      texto: (d) => { acumulado += d.t; pintarTexto(); if (!silencio()) { L.alimentar(d.t); hablado = true; } },
      reemplazo: (d) => { acumulado = d.texto; pintarTexto(); },
      herramienta: (d) => { const r = registro(d.nombre, d.entrada); registros.push(r); cuerpo.querySelector('.pensando')?.before(r) || cuerpo.appendChild(r); $('hilo').scrollTop = $('hilo').scrollHeight; },
      herramienta_lista: (d) => { const r = [...registros].reverse().find((x) => x.querySelector('summary b').textContent === d.nombre && x.querySelector('.estado').classList.contains('viva')); if (!r) return; r.querySelector('.estado').textContent = 'consultado'; r.querySelector('.estado').classList.remove('viva'); r.querySelector('.sal').textContent = d.salida || '(sin salida)'; },
      titulo: () => { document.dispatchEvent(new CustomEvent('ultron:bitacora')); },
      fin: (d) => {
        acumulado = d.texto || acumulado; pintarTexto();
        if (hablado) L.cerrar();
        const extras = [];
        for (const a of d.acciones || []) if (a.tipo === 'abrir' && a.url) extras.push(`<a class="btn btn-chico" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir ${esc(a.nombre)}</a>`);
        for (const doc of d.documentos || []) extras.push(`<a class="btn btn-chico" href="/documentos/${esc(doc._id)}/descargar?formato=pdf" target="_blank" rel="noopener">Documento: ${esc(doc.titulo)} (PDF)</a>`);
        for (const e of d.envios || []) extras.push(`<button class="btn btn-chico btn-oro" data-envio='${esc(JSON.stringify(e))}'>Confirmar envío por ${e.canal} a ${esc(e.a?.nombre || '')}</button>`);
        if (extras.length) { const z = document.createElement('div'); z.className = 'acciones'; z.innerHTML = extras.join(''); cuerpo.appendChild(z); }
        const fuentes = (d.fuentes || []).filter((f) => f.fuente && f.fuente !== 'internet');
        if (fuentes.length) { const z = document.createElement('div'); z.className = 'fuentes'; z.innerHTML = 'Fuentes: ' + [...new Set(fuentes.map((f) => f.fuente))].slice(0, 6).map((f) => `<span>${esc(f)}</span>`).join(''); cuerpo.appendChild(z); }
        if ((d.herramientas || []).some((h) => /pendiente|recordar|documento|olvidar/.test(h.nombre))) document.dispatchEvent(new CustomEvent('ultron:registro-cambio'));
      },
      error: (mensaje) => { acumulado = acumulado || `No fue posible responder: ${mensaje}`; pintarTexto(); if (!silencio()) L.decir(mensaje); },
    }).catch((e) => { acumulado = acumulado || `No fue posible responder: ${e.message}`; pintarTexto(); });
    pensando = false; $('btnEnviar').disabled = false;
    if (!L.ocupado) PRESENCIA.estado('quieto');
  }

  // ── la voz de la persona ─────────────────────────────────────────────────
  async function escucharUnaVez() {
    if (!VOZ.hayOido()) { APP.avisar('Este navegador no admite dictado. Escriba la consulta y ULTRON responderá con voz.'); conversar(false); return; }
    permitirAudio(); elLocutor().callar();
    $('btnVoz').classList.add('escuchando'); $('vozEstado').textContent = 'Escuchando'; PRESENCIA.estado('escuchando');
    const dicho = await VOZ.escuchar({ alParcial: (t) => { $('entrada').value = t; } });
    $('btnVoz').classList.remove('escuchando'); $('vozEstado').textContent = conversando ? 'Conversación continua' : ''; PRESENCIA.estado('quieto');
    if (dicho) { vaciasSeguidas = 0; $('entrada').value = ''; await enviar(dicho, 'voz'); return; }
    if (conversando) { vaciasSeguidas++; if (vaciasSeguidas >= 3) { conversar(false); APP.avisar('Conversación en pausa por silencio.'); } else setTimeout(() => { if (conversando) escucharUnaVez(); }, 400); }
  }
  function conversar(encender) {
    conversando = encender; vaciasSeguidas = 0;
    $('btnConversar').classList.toggle('activo', encender);
    $('vozEstado').textContent = encender ? 'Conversación continua' : '';
    if (encender) escucharUnaVez(); else elLocutor().callar();
  }

  // ── retomar una conversación de la bitácora ─────────────────────────────
  async function retomar(id) {
    const c = await DATOS.conversacion(id);
    conversacionId = id; $('hilo').innerHTML = ''; $('sugerencias').hidden = true;
    for (const t of c.turnos || []) turno(t.rol === 'miembro' ? 'miembro' : 'ultron', t.rol === 'miembro' ? `<p>${esc(t.texto)}</p>` : `<div class="md">${MARKDOWN.aHtml(t.texto || '')}</div>`);
    acomodarPresencia(); APP.vista('despacho');
  }
  function nueva() { conversacionId = null; $('hilo').innerHTML = ''; $('sugerencias').hidden = false; acomodarPresencia(); saludar(); }

  // ── el saludo ───────────────────────────────────────────────────────────
  async function saludar() {
    try {
      const s = await DATOS.saludo();
      // En la portada, bajo la figura: es lo primero que se ve al entrar. Al
      // hilo pasa en cuanto haya conversación, para que quede en el registro.
      $('portadaLinea').textContent = s.texto;
      saludoPendiente.push(s.texto); saludoDicho = false; decirSaludoSiSePuede();
    } catch { $('portadaLinea').textContent = 'Quedo a su disposición.'; }
  }

  function arrancar(quien) {
    yo = quien; locutor = null;
    $('sugerencias').innerHTML = SUGERENCIAS.map((s) => `<button class="sug" type="button">${esc(s)}</button>`).join('');
    $('sugerencias').hidden = false;
    const marcador = () => { $('entrada').placeholder = window.innerWidth <= 820 ? 'Consulta o instrucción' : 'Indique la consulta o la instrucción para ULTRON'; };
    marcador(); window.addEventListener('resize', marcador);
    $('cerebroEstado').textContent = yo.cerebro ? (yo.donde === 'nodo' ? `Pensando en el nodo propio · ${String(yo.modelo).replace(/^nodo:/, '')}` : `Pensando con ${yo.modelo}`) : 'El cerebro no está configurado';
    acomodarPresencia();
    if ($('hilo').childElementCount === 0) saludar();
  }

  function enlazar() {
    const entrada = $('entrada');
    const auto = () => { entrada.style.height = 'auto'; entrada.style.height = Math.min(180, entrada.scrollHeight) + 'px'; };
    entrada.addEventListener('input', auto);
    entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = entrada.value; entrada.value = ''; auto(); enviar(t); } });
    $('btnEnviar').addEventListener('click', () => { const t = entrada.value; entrada.value = ''; auto(); enviar(t); });
    $('btnVoz').addEventListener('click', () => { if (conversando) return conversar(false); escucharUnaVez(); });
    $('btnConversar').addEventListener('click', () => conversar(!conversando));
    $('sugerencias').addEventListener('click', (e) => { const b = e.target.closest('.sug'); if (b) enviar(b.textContent); });
    $('hilo').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-envio]'); if (!b) return;
      const envio = JSON.parse(b.dataset.envio); b.disabled = true; b.textContent = 'Enviando…';
      try { const r = await DATOS.enviar(envio); b.textContent = `Enviado por ${r.canal} a ${r.a}`; } catch (x) { b.disabled = false; b.textContent = 'No se pudo enviar: ' + x.message; }
    });
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, permitirAudio);
  }

  function probarVoz(id) {
    try { localStorage.setItem('ultron.voz', id || ''); } catch { /* sin almacenamiento */ }
    permitirAudio(); const L = elLocutor(); L.callar(); L.vozId = id;
    L.decir(`${yo?.miembro?.nombre?.split(' ')[0] || ''}, esta es la voz con la que me dirigiría a usted. Indique si la conserva.`);
  }

  return { arrancar, enlazar, enviar, retomar, nueva, probarVoz, conversar };
})();
