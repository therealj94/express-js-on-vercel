/* LA ENTRADA DE ULTRON — arranque y puerta, en una sola pantalla.
 *
 * ── UN SOLO ENLACE ──────────────────────────────────────────────────────────
 * José lo pidió así: «un solo link, que no cambie». Antes había dos páginas
 * —la consola con su formulario y el OS— y quien no tenía sesión llegaba al OS
 * y veía un tablero de huecos sin saber por qué. Ahora se llega siempre al
 * mismo sitio y lo que pasa después es una SECUENCIA, no un salto entre
 * páginas: el núcleo despierta, dice de quién es, comprueba la casa, y solo
 * entonces pide la llave. Sin recargar nada.
 *
 * ── LA BARRA DICE LA VERDAD ─────────────────────────────────────────────────
 * Los pasos avanzan cuando algo TERMINA de verdad: el núcleo montado, `/salud`
 * contestado, `/yo` contestado. No hay temporizador que la empuje. Una barra
 * que corre sola mientras el servidor no contesta es una mentira con
 * animación, y cuando el servidor tarda de verdad —el nodo pensando— la
 * persona ve la barra llena y nada detrás.
 *
 * ── LO QUE NO SE ENSEÑA ANTES DE ENTRAR ─────────────────────────────────────
 * El tablero queda oculto durante todo el arranque y la puerta. El núcleo NO:
 * es lo único que se ve, y es lo que hace que esto parezca vivo desde el primer
 * segundo. Las seis casas aparecen bajo la puerta por su nombre —identidad—,
 * nunca con su estado: si están caídas o no es asunto de quien ya entró.
 */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cuerpo = document.body;

  /* Los pasos del arranque, con su peso en la barra. El último —la sesión— es
     el que decide si se abre el tablero o se pide la llave. */
  const PASOS = [
    { clave: 'nucleo', dice: 'despertando el núcleo' },
    { clave: 'casa', dice: 'preguntando por la casa' },
    { clave: 'sesion', dice: 'comprobando la sesión' },
  ];
  let hechos = 0;

  function paso(clave, dice, mal = false) {
    hechos++;
    const b = $('#eco-barra-i');
    if (b) b.style.width = `${Math.round((hechos / PASOS.length) * 100)}%`;
    const caja = $('#eco-pasos');
    if (!caja) return;
    const d = document.createElement('div');
    if (mal) d.className = 'mal';
    d.innerHTML = dice;
    caja.appendChild(d);
    /* Solo se ven los tres últimos: la caja tiene alto fijo para que la marca
       de arriba no baile mientras se van sumando renglones. */
    while (caja.children.length > 3) caja.removeChild(caja.firstChild);
  }

  /* ── EL ARRANQUE ────────────────────────────────────────────────────────── */

  const nucleoListo = new Promise((ok) => {
    if (window.ULTRON_HOLO_LISTO !== undefined) return ok();
    addEventListener('ultron-holo-ready', () => ok(), { once: true });
    /* Y si el núcleo no llegara nunca —una tarjeta rarísima—, el arranque no se
       queda colgado: a los cuatro segundos se sigue. La entrada no puede
       depender de un adorno. */
    setTimeout(ok, 4000);
  });

  const leer = (ruta) => fetch(ruta, { credentials: 'same-origin', signal: AbortSignal.timeout(20_000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(Object.assign(new Error(String(r.status)), { status: r.status }))));

  /* UN SUELO, NO UN TECHO. La barra sigue diciendo la verdad —avanza solo
     cuando un paso termina—, pero la pantalla no se va antes de que la marca
     y el «powered by» hayan terminado de aparecer. Con el servidor cerca, los
     tres pasos se resuelven en 80 ms y lo único que se veía era un parpadeo.
     Esperar a que una animación acabe no es inventar progreso: es no cortarla. */
  const ARRANQUE_MINIMO = 1900;
  const nacio = performance.now();
  const trasElSuelo = (fn) => setTimeout(fn, Math.max(0, ARRANQUE_MINIMO - (performance.now() - nacio)));

  async function arrancar() {
    await nucleoListo;
    paso('nucleo', 'núcleo <b>en línea</b>');

    let salud = null;
    try {
      salud = await leer('/salud');
      /* Lo que se dice del arranque es lo que YA es público en /salud y nada
         más: dónde piensa y si la voz está. Ni la nota, ni las herramientas,
         ni la bóveda — eso es de adentro. */
      paso('casa', `casa <b>${salud.donde === 'nodo' ? 'en el nodo propio' : 'en la nube'}</b>`);
    } catch {
      paso('casa', 'la casa no contesta', true);
    }

    let yo = null;
    try {
      yo = await leer('/yo');
      paso('sesion', `bienvenido, <b>${esc(String(yo.miembro?.nombre || '').split(' ')[0] || 'señor')}</b>`);
      trasElSuelo(abrir);
    } catch (e) {
      paso('sesion', e?.status === 401 ? 'hace falta su llave' : 'sesión no comprobada');
      trasElSuelo(() => pedirLlave(salud));
    }
  }

  /* ── LA PUERTA ──────────────────────────────────────────────────────────── */

  function pedirLlave(salud) {
    cuerpo.classList.remove('arrancando');
    cuerpo.classList.add('cerrada');
    $('#arranque').hidden = true;
    const pt = $('#puerta-os');
    pt.hidden = false;
    /* El pase de la wallet solo si este servidor tiene Genesis. */
    $('#pt-genesis').hidden = !salud?.genesis;
    if (innerWidth > 700) setTimeout(() => pt.querySelector('input[name=correo]')?.focus(), 260);
  }

  function dicho(html, mal = false) {
    const d = $('#pt-dicho');
    d.innerHTML = html; d.classList.toggle('mal', !!mal);
  }

  /* Se abre el tablero: la entrada se disuelve y los paneles quedan a la vista.
     `os.js` arranca solo cuando esto pasa, no antes: pedirle el tablero al
     servidor sin sesión son ocho peticiones que devuelven 401. */
  function abrir() {
    const e = $('#entrada');
    e.classList.add('se-va');
    cuerpo.classList.remove('arrancando', 'cerrada');
    setTimeout(() => { e.hidden = true; }, 520);
    document.dispatchEvent(new CustomEvent('ultron:adentro'));
  }

  /* ── EL OJO DE LA CLAVE ─────────────────────────────────────────────────── */
  const OJO_ABIERTO = '<path d="M1.5 12S5.2 5.5 12 5.5 22.5 12 22.5 12 18.8 18.5 12 18.5 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3.2"/>';
  const OJO_TACHADO = '<path d="M1.5 12S5.2 5.5 12 5.5c1.6 0 3 .36 4.2.92M22.5 12s-3.7 6.5-10.5 6.5c-1.6 0-3-.36-4.2-.92"/><path d="M9.9 9.9a3.2 3.2 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>';

  function ojo() {
    const b = $('#pt-ojo'), i = $('#pt-clave');
    const ver = i.type === 'password';
    i.type = ver ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Ocultar la clave' : 'Ver la clave');
    b.title = ver ? 'Ocultar la clave' : 'Ver la clave';
    b.querySelector('svg').innerHTML = ver ? OJO_TACHADO : OJO_ABIERTO;
    i.focus();
  }

  /* ── ENTRAR CON CLAVE ───────────────────────────────────────────────────── */
  async function entrar(ev) {
    ev.preventDefault();
    const f = ev.target, btn = $('#pt-entrar');
    const correo = f.correo.value.trim(), clave = f.clave.value;
    /* AQUÍ, dentro del clic. Es el único gesto garantizado entre abrir la
       página y la primera frase de ULTRON, y en iOS el permiso de audio se da
       en un gesto o no se da. Sin esto, José entraba y ULTRON no hablaba. */
    try { window.OS?.despertarVoz?.(); } catch { /* la voz no puede impedir entrar */ }
    btn.disabled = true; btn.textContent = 'Comprobando…'; dicho('');
    try {
      const r = await fetch('/entrar', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, clave }),
        signal: AbortSignal.timeout(25_000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(d.error || `El servidor respondió ${r.status}.`), { codigo: d.codigo });
      dicho(`Adelante, <b style="color:var(--letra-f)">${esc(String(d.miembro?.nombre || '').split(' ')[0] || '')}</b>`);
      setTimeout(abrir, 420);
    } catch (e) {
      /* El motivo exacto, no «no se pudo entrar»: quien se equivoca de clave y
         quien llega con el servidor caído necesitan hacer cosas distintas. */
      dicho(esc(e?.message || 'No se pudo comprobar.'), true);
      btn.disabled = false; btn.textContent = 'Ingresar';
      $('#pt-clave').select();
    }
  }

  /* ── ENTRAR CON LA WALLET (Genesis ID) ──────────────────────────────────── */
  async function conWallet() {
    const b = $('#pt-wallet');
    try { window.OS?.despertarVoz?.(); } catch { /* nada */ }
    b.disabled = true; b.textContent = 'Abriendo Genesis…';
    dicho('Confirmando su identidad con Genesis ID…');
    try {
      const r = await fetch('/entrar/genesis', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
        signal: AbortSignal.timeout(30_000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        /* El GID va aparte y seleccionable: existe para copiarlo y pasárselo a
           quien administra la lista de la junta. */
        throw Object.assign(new Error(d.error || `El servidor respondió ${r.status}.`), { gid: d.gid });
      }
      dicho(`Adelante, <b style="color:var(--letra-f)">${esc(String(d.miembro?.nombre || '').split(' ')[0] || '')}</b>`);
      setTimeout(abrir, 420);
    } catch (e) {
      dicho(esc(e?.message || 'Genesis no contestó.') + (e?.gid ? `<span class="pt-gid">${esc(e.gid)}</span>` : ''), true);
      b.disabled = false; b.textContent = 'Entrar con mi Veta Wallet';
    }
  }

  /* Si la sesión vence mientras se usa el tablero, se vuelve a la puerta en el
     sitio, sin recargar y sin perder lo que hay en pantalla detrás. */
  document.addEventListener('ultron:sin-sesion', () => {
    if (!$('#entrada').hidden) return;
    const e = $('#entrada');
    e.hidden = false; e.classList.remove('se-va');
    $('#arranque').hidden = true;
    leer('/salud').then((s) => pedirLlave(s)).catch(() => pedirLlave(null));
    dicho('La sesión venció. Ingrese de nuevo.', true);
  });

  $('#pt-form').addEventListener('submit', entrar);
  $('#pt-ojo').addEventListener('click', ojo);
  $('#pt-wallet').addEventListener('click', conWallet);
  arrancar();
})();
