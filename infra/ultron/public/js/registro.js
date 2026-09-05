/* El registro: pendientes, memoria, biblioteca, bitácora, la junta, ajustes. */
const REGISTRO = (() => {
  'use strict';
  const esc = MARKDOWN.esc;
  const $ = (id) => document.getElementById(id);
  const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  let yo = null;

  // ── pendientes y memoria ────────────────────────────────────────────────
  async function pendientes() {
    const conHechos = $('verHechos').checked;
    let lista = []; try { lista = await DATOS.pendientes(conHechos); } catch { /* sin lectura */ }
    const abiertos = lista.filter((p) => p.estado !== 'hecho').length;
    $('nPendientes').textContent = abiertos || '';
    $('listaPendientes').innerHTML = lista.length ? lista.map((p) => `<div class="item ${p.estado === 'hecho' ? 'hecho' : ''}" data-id="${esc(p._id)}">
      <button class="caja-x" data-cerrar="${p.estado === 'hecho' ? 'reabrir' : 'cerrar'}" title="${p.estado === 'hecho' ? 'Reabrir' : 'Marcar como resuelto'}" aria-label="${p.estado === 'hecho' ? 'Reabrir' : 'Marcar como resuelto'}">${p.estado === 'hecho' ? '✓' : ''}</button>
      <div class="texto">${esc(p.texto)}<small>${p.quien ? 'A cargo de ' + esc(p.quien) + ' · ' : ''}${p.tema ? esc(p.tema) + ' · ' : ''}${fecha(p.en)}</small></div>
      <button class="quitar" data-borrar title="Eliminar" aria-label="Eliminar">×</button></div>`).join('') : '<div class="vacio">No hay pendientes anotados.</div>';
  }
  async function memorias() {
    let lista = []; try { lista = await DATOS.memorias(); } catch { /* sin lectura */ }
    $('listaMemorias').innerHTML = lista.length ? lista.map((m) => `<div class="item" data-id="${esc(m._id)}">
      <div class="texto">${esc(m.texto)}<small>${m.alcance === 'junta' ? 'De la Junta' : 'Suya'} · ${fecha(m.en)}${m.origen === 'deducido' ? ' · conservado por ULTRON' : ''}</small></div>
      <button class="quitar" data-olvidar title="Olvidar" aria-label="Olvidar">×</button></div>`).join('') : '<div class="vacio">ULTRON no conserva todavía ninguna indicación.</div>';
  }

  // ── biblioteca ──────────────────────────────────────────────────────────
  async function documentos() {
    let lista = []; try { lista = await DATOS.documentos(); } catch { /* sin lectura */ }
    $('listaDocumentos').innerHTML = lista.length ? lista.map((d) => `<div class="item doc" data-id="${esc(d._id)}">
      <div class="texto"><b>${esc(d.titulo)}</b><small>${esc(d.tipo || 'documento')} · ${fecha(d.en)} · ${esc(d.miembro || '')}</small></div>
      <a class="btn btn-chico" href="/documentos/${esc(d._id)}/descargar?formato=html" target="_blank" rel="noopener" onclick="event.stopPropagation()">Descargar</a></div>`).join('') : '<div class="vacio">La biblioteca está vacía. Pida a ULTRON un memorando, un acta o un análisis y quedará aquí.</div>';
  }
  async function leer(id) {
    const d = await DATOS.documento(id);
    const l = $('lector'); l.hidden = false;
    l.innerHTML = `<div class="rotulo">${esc(d.tipo || 'documento')} · ${fecha(d.en)}</div><h1 class="serif" style="margin:6px 0 14px">${esc(d.titulo)}</h1><div class="cuerpo">${MARKDOWN.aHtml(d.markdown || '')}</div><div class="acciones" style="margin-top:16px"><a class="btn btn-chico" href="/documentos/${esc(d._id)}/descargar?formato=html" target="_blank" rel="noopener">Descargar</a><button class="btn btn-chico" data-cerrar-lector>Cerrar</button></div>`;
    l.scrollIntoView({ block: 'start' });
  }

  // ── bitácora ────────────────────────────────────────────────────────────
  async function conversaciones() {
    let lista = []; try { lista = await DATOS.conversaciones(); } catch { /* sin lectura */ }
    $('listaConversaciones').innerHTML = `<div class="item" style="cursor:pointer" data-nueva><div class="texto"><b>Nueva conversación</b><small>Comienza un hilo en blanco en el Despacho.</small></div></div>` +
      (lista.length ? lista.map((c) => `<div class="item doc" data-conv="${esc(c._id)}"><div class="texto"><b>${esc(c.titulo || 'Sin título')}</b><small>${esc(c.canal || 'consola')} · ${c.turnos} turnos · ${fecha(c.tocado || c.en)}</small></div></div>`).join('') : '<div class="vacio">No hay conversaciones anteriores.</div>');
  }

  // ── la junta y los ajustes ──────────────────────────────────────────────
  function junta() {
    const m = yo?.junta || [];
    $('listaJunta').innerHTML = m.length ? m.map((x) => `<div class="item"><div class="texto"><b>${esc(x.nombre)}</b><small>${esc(x.rol || 'miembro de la Junta')} · ${esc(x.correo)} · WhatsApp ${x.whatsapp ? 'registrado' : 'no registrado'}</small></div>
      <button class="btn btn-chico" data-mensaje="${esc(x.nombre)}">Redactar mensaje</button></div>`).join('') : '<div class="vacio">—</div>';
  }
  async function ajustes() {
    try { $('silencio').checked = localStorage.getItem('ultron.silencio') === '1'; } catch { /* nada */ }
    /* La figura quieta parece rota, y no lo está: es el teléfono pidiendo no
       animar. Se dice, y se ofrece moverla igual. El aviso solo aparece cuando
       el dispositivo lo pide DE VERDAD — si no, sería ruido. */
    try { $('figuraViva').checked = localStorage.getItem('ultron.figuraViva') === '1'; } catch { /* nada */ }
    $('avisoQuieto').hidden = !(PRESENCIA.pideQuieto() && !PRESENCIA.insiste());
    $('plataforma').innerHTML = `
      <div class="dato"><span>Cerebro</span><b class="${yo?.cerebro ? 'ok' : 'mal'}">${yo?.cerebro ? (yo.donde === 'nodo' ? 'Nodo propio de Orden Global' : 'Claude') : 'sin configurar'}</b></div>
      <div class="dato"><span>Modelo</span><b>${esc(String(yo?.modelo || '—').replace(/^nodo:/, ''))}</b></div>
      <div class="dato"><span>Memoria</span><b>${yo?.memoria === 'mongo' ? 'persistente (MongoDB)' : 'provisional'}</b></div>
      <div class="dato"><span>Voz</span><b>${yo?.voz ? 'ElevenLabs' : 'la del navegador'}</b></div>
      <div class="dato"><span>Canales</span><b>${yo?.canales?.whatsapp ? 'WhatsApp' : ''}${yo?.canales?.whatsapp && yo?.canales?.correo ? ' · ' : ''}${yo?.canales?.correo ? 'correo' : ''}${!yo?.canales?.whatsapp && !yo?.canales?.correo ? 'ninguno' : ''}</b></div>
      <div class="dato"><span>Saber</span><b>${yo?.saber?.total ?? '—'} secciones · ${yo?.saber?.armadoEn ? fecha(yo.saber.armadoEn) : '—'}</b></div>`;
    let v = { actual: null, voces: [] }; try { v = await DATOS.voces(); } catch { /* sin voz */ }
    const elegida = (() => { try { return localStorage.getItem('ultron.voz') || ''; } catch { return ''; } })();
    const es = v.voces.filter((x) => x.idioma === 'es');
    $('voces').innerHTML = yo?.voz ? [`<button class="btn btn-chico ${!elegida ? 'btn-oro' : ''}" data-voz="">La de la casa</button>`, ...es.map((x) => `<button class="btn btn-chico ${elegida === x.id ? 'btn-oro' : ''}" data-voz="${esc(x.id)}" title="${esc([x.genero, x.edad, x.acento].filter(Boolean).join(' · '))}">${esc(x.nombre)}</button>`)].join('') : '<p class="tenue" style="font-size:13px">La voz de ElevenLabs no está configurada; se usa la del navegador.</p>';
  }

  function enlazar(quien) {
    yo = quien;
    // pestañas
    document.querySelectorAll('#pendientes [role=tab]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#pendientes [role=tab]').forEach((x) => x.setAttribute('aria-selected', x === b)); $('pPend').hidden = b.dataset.p !== 'pend'; $('pMem').hidden = b.dataset.p !== 'mem';
    }));
    $('formPendiente').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; await DATOS.anotarPendiente(f.texto.value.trim(), f.quien.value.trim()); f.reset(); pendientes(); });
    $('verHechos').addEventListener('change', pendientes);
    $('listaPendientes').addEventListener('click', async (e) => {
      const it = e.target.closest('.item'); if (!it) return;
      if (e.target.closest('[data-cerrar]')) { await DATOS.cerrarPendiente(it.dataset.id, e.target.closest('[data-cerrar]').dataset.cerrar === 'reabrir'); pendientes(); }
      if (e.target.closest('[data-borrar]')) { await DATOS.borrarPendiente(it.dataset.id); pendientes(); }
    });
    $('formMemoria').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; await DATOS.recordar(f.texto.value.trim(), f.alcance.value); f.reset(); memorias(); });
    $('listaMemorias').addEventListener('click', async (e) => { const it = e.target.closest('.item'); if (it && e.target.closest('[data-olvidar]')) { await DATOS.olvidar(it.dataset.id); memorias(); } });
    $('listaDocumentos').addEventListener('click', (e) => { const it = e.target.closest('.doc'); if (it) leer(it.dataset.id); });
    $('lector').addEventListener('click', (e) => { if (e.target.closest('[data-cerrar-lector]')) $('lector').hidden = true; });
    $('listaConversaciones').addEventListener('click', (e) => { if (e.target.closest('[data-nueva]')) { DESPACHO.nueva(); APP.vista('despacho'); return; } const it = e.target.closest('[data-conv]'); if (it) DESPACHO.retomar(it.dataset.conv); });
    $('listaJunta').addEventListener('click', (e) => { const b = e.target.closest('[data-mensaje]'); if (b) { APP.vista('despacho'); $('entrada').value = `Prepare un mensaje por WhatsApp para ${b.dataset.mensaje}: `; $('entrada').focus(); } });
    $('voces').addEventListener('click', (e) => { const b = e.target.closest('[data-voz]'); if (b) { DESPACHO.probarVoz(b.dataset.voz || null); ajustes(); } });
    $('figuraViva').addEventListener('change', (e) => {
      try { localStorage.setItem('ultron.figuraViva', e.target.checked ? '1' : '0'); } catch { /* nada */ }
      // Se aplica en el acto: parar y volver a arrancar relee la preferencia.
      PRESENCIA.parar(); PRESENCIA.correr();
      $('avisoQuieto').hidden = !(PRESENCIA.pideQuieto() && !PRESENCIA.insiste());
    });
    $('silencio').addEventListener('change', (e) => { try { localStorage.setItem('ultron.silencio', e.target.checked ? '1' : '0'); } catch { /* nada */ } if (e.target.checked) DESPACHO.conversar(false); });
    document.addEventListener('ultron:registro-cambio', () => { pendientes(); memorias(); documentos(); });
    document.addEventListener('ultron:bitacora', conversaciones);
  }
  function arrancar(quien) { yo = quien; pendientes(); memorias(); documentos(); conversaciones(); junta(); ajustes(); }

  return { enlazar, arrancar, pendientes, memorias, documentos, conversaciones };
})();
