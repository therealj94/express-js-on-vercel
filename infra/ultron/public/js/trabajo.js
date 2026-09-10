/* ULTRON TALLER · capa de trabajo encima del OS.
 *
 * No reemplaza os.js. Se engancha a tres ganchos que os.js llama:
 *   ULTRON_TALLER.inicio()
 *   ULTRON_TALLER.paso({ nombre, hace })
 *   ULTRON_TALLER.fin({ ok })
 *
 * Lo que se ve: un rastro de pasos (como Grok), modo TALLER que achica los
 * paneles de status y agranda la respuesta, y se esconden los huecos «—».
 */
(function () {
  const CLAVE = 'ultron-taller';

  function $(id) { return document.getElementById(id); }

  const css = `
#rastro{
  position:absolute;left:12px;right:12px;top:36px;z-index:6;
  display:flex;flex-wrap:wrap;gap:6px;pointer-events:none;
  max-height:72px;overflow:hidden;
}
#rastro:empty{display:none}
#rastro .paso{
  pointer-events:auto;
  font:11px/1.2 var(--mono, ui-monospace, monospace);
  letter-spacing:.04em;text-transform:lowercase;
  color:var(--letra-f,#E4E9EE);
  background:rgba(5,225,255,.08);
  border:1px solid rgba(5,225,255,.28);
  padding:5px 8px;border-radius:2px;
  max-width:100%;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
#rastro .paso.va{border-color:var(--cian,#05E1FF);color:var(--cian,#05E1FF);
  box-shadow:0 0 12px rgba(5,225,255,.2)}
#rastro .paso.ok{border-color:rgba(92,242,176,.45);color:var(--verde,#5CF2B0)}
#rastro .paso.mal{border-color:rgba(255,90,110,.5);color:var(--rojo,#FF5A6E)}
#mando-taller{
  font:11px/1 var(--mono,ui-monospace,monospace);
  letter-spacing:.16em;color:var(--cian,#05E1FF);
  border:1px solid rgba(5,225,255,.35);
  padding:6px 10px;margin-left:8px;
}
#mando-taller[aria-pressed="true"]{background:rgba(5,225,255,.14)}
body.taller #cuerpo{
  grid-template-columns:minmax(140px,16%) minmax(360px,1fr) minmax(150px,18%) !important;
}
body.taller #globo{max-width:min(760px,96%);margin:0 auto;max-height:68%;bottom:10px}
body.taller #globo #dicho{font-size:clamp(15px,1.6vw,18px);line-height:1.5}
body.taller #rastro{max-height:132px;overflow-y:auto;flex-wrap:nowrap;flex-direction:column;align-items:flex-start}
body.taller .p .sub:is(:empty),
body.taller .hueco{opacity:.45}
@media (max-width:860px){
  body.taller #izq, body.taller #der{display:none}
  body.taller #cuerpo{grid-template-columns:1fr !important}
  #rastro{top:28px;max-height:56px}
}
`;

  function inyectar() {
    if ($('ultron-taller-css')) return;
    const s = document.createElement('style');
    s.id = 'ultron-taller-css';
    s.textContent = css;
    document.head.appendChild(s);

    if (!$('rastro')) {
      const r = document.createElement('div');
      r.id = 'rastro';
      r.setAttribute('aria-live', 'polite');
      const centro = $('centro');
      if (centro) centro.appendChild(r);
    }

    const techo = $('techo');
    if (techo && !$('mando-taller')) {
      const b = document.createElement('button');
      b.id = 'mando-taller';
      b.type = 'button';
      b.textContent = 'HILO';
      b.title = 'Agrandar el chat y achicar el tablero';
      b.addEventListener('click', () => setTaller(!document.body.classList.contains('taller')));
      techo.appendChild(b);
    }

    setTaller(localStorage.getItem(CLAVE) !== 'off', true);
  }

  function setTaller(on, silencioso) {
    document.body.classList.toggle('taller', !!on);
    const b = $('mando-taller');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { localStorage.setItem(CLAVE, on ? 'on' : 'off'); } catch {}
    if (!silencioso) {
      const e = $('estado-txt');
      if (e && !e.textContent.includes(' · ')) e.textContent = on ? 'HILO' : 'EN LÍNEA';
    }
  }

  function inicio() {
    inyectar();
    const r = $('rastro');
    if (r) r.innerHTML = '';
    paso({ nombre: 'turno', hace: 'pensando' });
  }

  function paso(d) {
    inyectar();
    const r = $('rastro');
    if (!r) return;
    r.querySelectorAll('.paso.va').forEach((el) => {
      el.classList.remove('va');
      el.classList.add('ok');
    });
    const el = document.createElement('div');
    el.className = 'paso va';
    const txt = (d && (d.hace || d.nombre)) || 'paso';
    el.textContent = String(txt).replace(/_/g, ' ');
    r.appendChild(el);
    r.scrollTop = r.scrollHeight;
  }

  function fin(d) {
    const r = $('rastro');
    if (!r) return;
    r.querySelectorAll('.paso.va').forEach((el) => {
      el.classList.remove('va');
      el.classList.add(d && d.ok === false ? 'mal' : 'ok');
    });
  }

  window.ULTRON_TALLER = { inicio, paso, fin, setTaller };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inyectar);
  } else {
    inyectar();
  }
})();
