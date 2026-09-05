/* El arranque de la consola: la sesión, las vistas y el aviso. */
const APP = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = MARKDOWN.esc;
  let yo = null;
  let avisoT = null;

  /* Adónde se va a buscar el pase. La wallet atiende #sso-ultron: si hay
     sesión le pide el pase a Genesis, y si no, primero hace entrar a la
     persona. Vuelve acá con #sso=<pase>. Se puede apuntar a otra wallet
     definiendo ULTRON_WALLET antes de este archivo, para probar el circuito
     entero contra un ensayo. */
  const WALLET = String(window.ULTRON_WALLET || 'https://app.vetawallet.com').replace(/\/$/, '');

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

  function puerta({ foco = true } = {}) {
    TABLERO.parar();
    $('consola').hidden = true; $('puerta').hidden = false;
    $('puertaError').textContent = ''; $('puertaEstado').hidden = true;
    /* Se vuelve a preguntar CADA VEZ que se enseña la puerta, y no una sola
       vez al arrancar: quien entró con sesión vigente nunca pasó por acá, y
       cuando su sesión venciera a las doce horas le saldría una puerta sin el
       botón de la wallet sin más motivo que el orden en que se cargó la
       página. */
    mirarSiHayGenesis();
    if (foco) setTimeout(() => $('formPuerta').elements.correo.focus(), 50);
  }

  const decirError = (html) => { $('puertaError').innerHTML = html; $('puertaEstado').hidden = true; };
  const decirEstado = (texto) => { $('puertaError').textContent = ''; const e = $('puertaEstado'); e.textContent = texto; e.hidden = false; };

  /* ¿Se puede entrar con la wallet? Lo dice /salud, que es público. Si no
     contesta —o dice que no— el botón se queda escondido y la puerta es la de
     siempre: la clave nunca deja de funcionar, así que no hay nada que
     degradar. */
  async function mirarSiHayGenesis() {
    try {
      const s = await DATOS.salud();
      $('puertaGenesis').hidden = !s?.genesis;
    } catch { $('puertaGenesis').hidden = true; }
  }

  /* ── El viaje de vuelta ───────────────────────────────────────────────────
   *
   * La wallet devuelve a la persona con #sso=<pase>. Se canjea contra nuestro
   * servidor, que es el único que puede preguntarle a Genesis.
   *
   * EL HASH SE LIMPIA ANTES DE CANJEARLO. Un pase de sesión no se queda en la
   * barra de direcciones, ni en el historial, ni en la captura de pantalla que
   * alguien comparte para pedir ayuda.
   */
  async function canjearPase(pase) {
    decirEstado('Comprobando su identidad con Genesis ID…');
    try {
      await DATOS.entrarConGenesis(pase);
      yo = await DATOS.yo();
      $('puertaEstado').hidden = true;
      REGISTRO.enlazar(yo);
      entrar();
    } catch (x) {
      /* Cada «no» lleva a un sitio distinto, así que cada uno se dice
         distinto. El de NO_ES_JUNTA es el único que enseña algo más que una
         frase: sin ver su GID escrito, la persona no tiene forma de pedir que
         la agreguen, y el «no» sería un callejón sin salida. */
      if (x.codigo === 'NO_ES_JUNTA') {
        decirError('Su identidad es válida, pero no está en la Junta Directiva. Pase este identificador a quien administra ULTRON:'
          + `<span class="puerta-gid">${esc(x.gid || '—')}</span>`);
      } else if (x.codigo === 'SIN_VERIFICAR') {
        decirError('Su identidad ya no figura como verificada en Genesis ID. Complete la verificación en Veta Wallet y vuelva a intentar.');
      } else if (x.codigo === 'GENESIS_CAIDO') {
        decirError('No se pudo comprobar su identidad con Genesis ID. Intente de nuevo, o ingrese con su clave.');
      } else if (x.codigo === 'SIN_GENESIS') {
        decirError('El ingreso con Veta Wallet no está configurado en este servidor. Ingrese con su clave.');
      } else if (x.status === 401) {
        decirError('El pase venció. Toque «Entrar con mi Veta Wallet» otra vez.');
      } else {
        decirError('No fue posible ingresar. Intente de nuevo.');
      }
      $('puertaEstado').hidden = true;
    }
  }

  async function arrancar() {
    document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => vista(b.dataset.vista)));
    $('formPuerta').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target; decirError('');
      try { await DATOS.entrar(f.correo.value.trim(), f.clave.value); yo = await DATOS.yo(); f.clave.value = ''; entrar(); }
      catch (x) { decirError(x.status === 401 ? 'Correo o clave incorrectos.' : 'No fue posible ingresar. Intente de nuevo.'); }
    });
    $('btnWallet').addEventListener('click', () => {
      decirEstado('Abriendo Veta Wallet…');
      location.href = WALLET + '/#sso-ultron';
    });
    $('salir').addEventListener('click', async () => { await DATOS.salir().catch(() => {}); location.reload(); });
    document.addEventListener('ultron:sin-sesion', () => { if (!$('consola').hidden) { puerta(); avisar('La sesión venció. Ingrese de nuevo.'); } });
    DESPACHO.enlazar(); ECOSISTEMA.enlazar(); INSTRUMENTOS.enlazar();

    /* La vuelta de la wallet se atiende ANTES que nada. Quien llega con un
       pase en la mano no necesita que primero se le pregunte a /yo si ya
       tenía sesión: viene justamente a abrir una. */
    const hash = String(location.hash || '');
    if (hash.startsWith('#sso=')) {
      const pase = decodeURIComponent(hash.slice(5));
      history.replaceState(null, '', location.pathname + location.search);
      puerta({ foco: false });
      await canjearPase(pase);
      return;
    }

    try { yo = await DATOS.yo(); REGISTRO.enlazar(yo); entrar(); }
    catch (x) {
      REGISTRO.enlazar(null);
      puerta();
      if (x.status !== 401) avisar('No fue posible comunicarse con el servidor.');
    }
  }

  document.addEventListener('DOMContentLoaded', arrancar);
  return { vista, avisar, yoActual: () => yo };
})();
