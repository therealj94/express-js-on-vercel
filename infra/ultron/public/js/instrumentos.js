/* Los instrumentos: el catálogo entero de lo que ULTRON puede hacer, y cada
 * uno ejecutable a mano. El formulario se arma desde el esquema de entrada
 * de la herramienta —el mismo que ve el modelo— así que lo que la persona
 * puede pedir a mano es exactamente lo que ULTRON puede pedir solo. */
const INSTRUMENTOS = (() => {
  'use strict';
  const esc = MARKDOWN.esc;
  let catalogo = [];

  function campo(nombre, def, requerido) {
    const id = `ins-${nombre}`;
    const etiqueta = `<span>${esc(nombre)}${requerido ? ' *' : ''}${def.description ? ` <small class="tenue">· ${esc(def.description)}</small>` : ''}</span>`;
    if (def.enum) return `<label class="campo">${etiqueta}<select class="entrada" name="${esc(nombre)}">${def.enum.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`;
    if (def.type === 'boolean') return `<label class="campo">${etiqueta}<select class="entrada" name="${esc(nombre)}"><option value="">no</option><option value="true">sí</option></select></label>`;
    if (def.type === 'number') return `<label class="campo">${etiqueta}<input class="entrada" name="${esc(nombre)}" type="number" step="any" ${requerido ? 'required' : ''}></label>`;
    const largo = /markdown|texto/.test(nombre);
    return `<label class="campo">${etiqueta}${largo ? `<textarea class="entrada" name="${esc(nombre)}" rows="4" ${requerido ? 'required' : ''}></textarea>` : `<input class="entrada" name="${esc(nombre)}" ${requerido ? 'required' : ''}>`}</label>`;
  }

  function pintar() {
    const grupos = new Map();
    for (const h of catalogo) { if (!grupos.has(h.grupo)) grupos.set(h.grupo, []); grupos.get(h.grupo).push(h); }
    document.getElementById('catalogo').innerHTML = [...grupos].map(([g, lista]) => `<div class="grupo"><h2>${esc(g)}</h2>${lista.map((h) => {
      const props = h.entrada?.properties || {}; const req = new Set(h.entrada?.required || []);
      const campos = Object.entries(props).map(([n, d]) => campo(n, d, req.has(n))).join('');
      return `<details class="instrumento" data-nombre="${esc(h.nombre)}"><summary><b>${esc(h.nombre)}</b><span>${esc(h.descripcion)}</span><span class="sello ${h.escribe ? 'escribe' : ''}">${h.escribe ? 'escribe' : 'lee'}</span></summary>
        <form class="forma">${campos ? `<div class="campos">${campos}</div>` : '<p class="tenue" style="font-size:13px;margin:8px 0 12px">Sin parámetros.</p>'}
        <button class="btn btn-oro btn-chico" type="submit">Ejecutar</button> <button class="btn btn-chico" type="button" data-preguntar>Pedírselo a ULTRON</button>
        <div class="salida vacia">La salida aparecerá aquí.</div><div class="ms"></div></form></details>`;
    }).join('')}</div>`).join('');
    document.getElementById('nInstrumentos').textContent = catalogo.length;
  }

  async function ejecutar(form) {
    const det = form.closest('.instrumento'); const nombre = det.dataset.nombre;
    const h = catalogo.find((x) => x.nombre === nombre); const props = h?.entrada?.properties || {};
    const entrada = {};
    for (const [n, d] of Object.entries(props)) {
      const el = form.elements[n]; if (!el) continue; const v = el.value;
      if (v === '' || v == null) continue;
      entrada[n] = d.type === 'number' ? Number(v) : d.type === 'boolean' ? v === 'true' : v;
    }
    const salida = form.querySelector('.salida'); const ms = form.querySelector('.ms');
    salida.classList.remove('vacia'); salida.textContent = 'Ejecutando…'; ms.textContent = '';
    try {
      const r = await DATOS.correr(nombre, entrada);
      salida.textContent = r.salida;
      const extras = [];
      for (const a of r.acciones || []) if (a.url) extras.push(`Abrir: ${a.nombre} → ${a.url}`);
      for (const d of r.documentos || []) extras.push(`Documento guardado: ${d.titulo} (${d._id})`);
      for (const e of r.envios || []) extras.push(`Envío preparado (${e.canal} a ${e.a?.nombre}): confírmelo desde el Despacho.`);
      if (extras.length) salida.textContent += '\n\n' + extras.join('\n');
      ms.textContent = `${r.ms} ms`;
      if (h?.escribe) document.dispatchEvent(new CustomEvent('ultron:registro-cambio'));
    } catch (e) { salida.textContent = `No se pudo ejecutar: ${e.message}`; }
  }

  async function arrancar() {
    try { catalogo = (await DATOS.herramientas()).herramientas; } catch { catalogo = []; }
    pintar();
  }
  function enlazar() {
    const c = document.getElementById('catalogo');
    c.addEventListener('submit', (e) => { e.preventDefault(); ejecutar(e.target); });
    c.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preguntar]'); if (!b) return;
      const h = catalogo.find((x) => x.nombre === b.closest('.instrumento').dataset.nombre);
      APP.vista('despacho'); document.getElementById('entrada').value = `Use el instrumento ${h.nombre}: ${h.descripcion.split('.')[0]}.`; document.getElementById('entrada').focus();
    });
  }
  return { arrancar, enlazar, catalogoActual: () => catalogo };
})();
