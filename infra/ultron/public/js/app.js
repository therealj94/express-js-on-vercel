/* El arranque de la consola: la sesión, las vistas y el aviso. */
const APP = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = MARKDOWN.esc;
  let yo = null;
  let avisoT = null;

  function avisar(texto) {
    const a = $('aviso'); a.textContent = texto; a.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => { a.hidden = true; }, 4500);
  }

  function vista(nombre) {
    const esTablero = nombre === 'tablero';
    document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === nombre));
    $('tablero').classList.toggle('vista-movil', esTablero);
    $('principal').style.display = esTablero && window.innerWidth <= 1180 ? 'none' : '';
    document.querySelectorAll('[data-vista]').forEach((b) => { if (b.dataset.vista === nombre) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (location.hash !== '#' + nombre) history.replaceState(null, '', '#' + nombre);
    // La figura solo anima cuando se la está mirando.
    if (nombre === 'despacho') { PRESENCIA.correr(); $('entrada').focus({ preventScroll: true }); } else PRESENCIA.parar();
  }

  function pintarCabecera() {
    $('quienSoy').innerHTML = `<b>${esc(yo.miembro.nombre)}</b> · ${esc(yo.miembro.rol || 'Junta Directiva')}`;
    /* «sin cerebro» en rojo en la cabecera se lee como un insulto y como una
       avería. No hay avería: falta una llave. Se dice eso, y en ámbar, que es
       el color de lo que está a medio poner. */
    $('pulsoCerebro').className = 'pulso ' + (yo.cerebro ? 'ok' : 'aviso');
    $('pulsoCerebro').lastElementChild.textContent = yo.cerebro ? (yo.donde === 'nodo' ? 'nodo propio' : 'Claude') : 'cerebro sin configurar';
    $('pulsoVoz').className = 'pulso oculta-movil ' + (yo.voz ? 'ok' : '');
    $('pulsoVoz').lastElementChild.textContent = yo.voz ? 'voz' : 'voz del navegador';
    $('piePlataforma').textContent = `Orden Global · ${new Date().getFullYear()}`;
  }

  async function entrar() {
    $('puerta').hidden = true; $('consola').hidden = false;
    pintarCabecera();
    PRESENCIA.arrancar();
    TABLERO.arrancar(yo);
    DESPACHO.arrancar(yo);
    INSTRUMENTOS.arrancar();
    REGISTRO.arrancar(yo);
    ECOSISTEMA.pintar(TABLERO.vivoActual());
    vista(['despacho', 'ecosistema', 'instrumentos', 'pendientes', 'biblioteca', 'bitacora', 'junta', 'ajustes', 'tablero'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'despacho');
  }

  function puerta() {
    TABLERO.parar();
    $('consola').hidden = true; $('puerta').hidden = false;
    $('puertaError').textContent = '';
    setTimeout(() => $('formPuerta').elements.correo.focus(), 50);
  }

  async function arrancar() {
    document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => vista(b.dataset.vista)));
    $('formPuerta').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target; $('puertaError').textContent = '';
      try { await DATOS.entrar(f.correo.value.trim(), f.clave.value); yo = await DATOS.yo(); f.clave.value = ''; entrar(); }
      catch (x) { $('puertaError').textContent = x.status === 401 ? 'Correo o clave incorrectos.' : 'No fue posible ingresar. Intente de nuevo.'; }
    });
    $('salir').addEventListener('click', async () => { await DATOS.salir().catch(() => {}); location.reload(); });
    document.addEventListener('ultron:sin-sesion', () => { if (!$('consola').hidden) { puerta(); avisar('La sesión venció. Ingrese de nuevo.'); } });
    DESPACHO.enlazar(); ECOSISTEMA.enlazar(); INSTRUMENTOS.enlazar();
    try { yo = await DATOS.yo(); REGISTRO.enlazar(yo); entrar(); }
    catch (x) { REGISTRO.enlazar(null); if (x.status === 401) puerta(); else { puerta(); avisar('No fue posible comunicarse con el servidor.'); } }
  }

  document.addEventListener('DOMContentLoaded', arrancar);
  return { vista, avisar, yoActual: () => yo };
})();
