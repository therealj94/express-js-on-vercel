/* Ordenex · portafolio.js — la sala del dinero propio: saldos, depósito,
 * retiro y la actividad.
 *
 * Expone `const VPORTA` con el contrato que app.js espera de sus módulos:
 * { vista, vistaActividad, alPintar, apagar } más los manejadores de los
 * onclick. Las vistas devuelven HTML como string y se pintan por innerHTML;
 * lo asíncrono (traer saldos, traer movimientos) corre en alPintar() y
 * repinta SU pedazo — nunca el lienzo entero, que es del orquestador.
 *
 * Tres reglas que esta sala no negocia:
 *
 * 1. EL DINERO ES STRING DE WEI. Lo que llega se pinta con ONX.deWei y lo
 *    que se manda pasa por ONX.aWei; aquí no vive ni un Number con plata
 *    dentro. La única excepción, rotulada donde ocurre, es el valor de
 *    referencia en dólares: un cartel informativo, jamás un camino de dinero.
 *
 * 2. FAIL-CLOSED. Saldos que no se pudieron leer = formulario de retiro que
 *    no se arma. «No hay movimientos» y «no pudimos traerlos» son mensajes
 *    distintos y se dicen distinto.
 *
 * 3. EL RETIRO ES LA OPERACIÓN MÁS PELIGROSA DE LA CASA — es la única por la
 *    que el dinero SALE — y por eso va en dos pasos con resumen en medio, y
 *    con una retiroKey aleatoria que NO se regenera en un reintento de red:
 *    la clave es la idempotencia, y cambiarla ante un timeout es exactamente
 *    cómo se firma dos veces el mismo retiro.
 */

const VPORTA = (() => {
  'use strict';

  // El explorador de la cadena: los hash de retiro se enlazan ahí, igual que
  // en la billetera. La ruta /tx/ es la que ya usa apps-web/veta-wallet.
  const EXPLORADOR = 'https://ordenscan.com';

  // Los helpers del orquestador, tomados en diferido: este archivo se carga
  // ANTES que app.js, así que nombrar ONX en el nivel superior reventaría.
  // Dentro de una función ya no: para cuando alguien pinta, ONX existe.
  const esc = (s) => ONX.esc(s);
  const jsTxt = (s) => ONX.jsTxt(s);
  /* El mismo monto, pero para una URL: punto decimal, sin separadores de miles
     y sin ceros de cola. `dinero` formatea para OJOS y mete comas — y una coma
     que viaja en el enlace llega al campo de la wallet, donde «1,234» no es lo
     mismo que 1234. Este se hace con texto sobre el wei, sin pasar por Number:
     un saldo grande perderia enteros en el flotante. */
  function montoURL(wei) {
    try {
      const w = BigInt(wei);
      if (w <= 0n) return null;
      const ent = (w / 10n ** 18n).toString();
      const dec = (w % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
      return dec ? `${ent}.${dec}` : ent;
    } catch { return null; }
  }

  const rell = (txt, m) => String(txt).replace(/\{(\w+)\}/g, (_, k) => m[k] ?? '');

  const dinero = (s, dec = 6) => {
    const v = ONX.deWei(s, dec);
    return v == null ? '—' : v; // un monto ilegible es un guion, jamás un cero
  };

  /* ═══ los textos de la sala — patrón AURA_TXT de la billetera: el módulo
     trae sus dos idiomas y pregunta cuál toca con idiomaActivo(). ═════════ */
  const TXT = {
    es: {
      titulo: 'Portafolio', sub: 'Tus saldos en el libro de la casa, tu buzón de depósito y la puerta de salida.',
      actTitulo: 'Actividad', actSub: 'Todo lo que pasó con tu dinero: asientos del libro, depósitos y retiros.',

      entraT: 'Esta sala pide tu cuenta', entraP: 'Los saldos, el depósito y el retiro son tuyos y de nadie más: hay que entrar para verlos. La cuenta es la misma de todo el ecosistema.',
      entrar: 'Entrar con mi cuenta Veta Wallet',

      saldosT: 'Tus saldos', saldosP: 'Disponible es lo que podés gastar; reservado es lo que una orden abierta o una solicitud fiat tiene en garantía.',
      cargando: 'Trayendo tus saldos…',
      falloSaldos: 'No pudimos leer tus saldos.', falloSaldosP: 'Sin saldos leídos no se arma un retiro: probá de nuevo en un momento.',
      traer: 'Traer desde mi Veta Wallet',
      depUno: 'Depositar',
      panelT: 'Confirmá en tu Veta Wallet',
      panelPie: 'Lo de arriba es tu Veta Wallet, en su propio dominio. Ordenex no puede leer lo que escribís ahí — ni tu contraseña.',
      cerrar: 'Cerrar',
      depEsperando: 'Te abrimos tu Veta Wallet en una ventana. Confirmá el envío de {activo} allá — la clave se pone en la billetera, nunca acá.',
      depFirmado: 'Firmado: {monto} {activo} va en camino. El depósito se acredita cuando la cadena lo confirme; esta pantalla se actualiza sola.',
      depUnoT: 'Abre tu Veta Wallet con el activo, el monto y la dirección ya puestos. La clave se pone allá, nunca aquí.',
      walT: 'En tu Veta Wallet',
      walP: 'Esto es lo que tenés en tu billetera, leído de la cadena. No está en Ordenex: una casa de cambio solo guarda lo que le depositan.',
      walEn: 'en tu wallet',
      walVacio: 'Tu wallet no tiene saldo en la cadena 5550.',
      walSinDir: 'Tu cuenta todavía no trae la dirección de tu Veta Wallet. Volvé a entrar desde la billetera para que viaje con la sesión.',
      walFallo: 'No pudimos leer tu wallet en la cadena. Preferimos decirlo antes que pintar un cero.',
      walComo: 'Para operar con esto, mandalo a tu dirección de depósito de aquí abajo. En cuanto la cadena lo confirme, aparece arriba y se puede vender.',
      reintentar: 'Reintentar',
      reservado: 'reservado',
      refNota: 'El valor en dólares es una referencia informativa (oro y plata del mismo feed de la billetera), rotulada y jamás el precio de una operación. Los activos sin feed real no llevan valor: acá no se inventa un número.',
      refOrigen: 'ref. oro · gramo/55', refOro: 'ref. onza de oro', refPlata: 'ref. onza de plata',

      depT: 'Depositar', depP: 'Esta dirección es tuya y solo tuya: lo que caiga ahí, el vigía lo acredita en tu saldo en menos de un minuto.',
      depAviso: 'Mandá acá únicamente activos de la cadena 5550 — ORIGEN y sus catorce tokens. Lo que venga de cualquier otra red no llega y no se puede recuperar.',
      depSin: 'La casa no pudo crear tu dirección de depósito ahora.', depSinP: 'No es tu culpa: probá de nuevo en un rato.',
      copiar: 'Copiar', copiado: 'Copiado', copiarMal: 'No se pudo copiar; seleccioná y copiá a mano.',

      retT: 'Retirar', retP: 'A cualquier dirección de la cadena 5550. Antes de firmarse pasa el tamiz de la casa.',
      retActivo: 'Activo', retCantidad: 'Cantidad', retDireccion: 'Dirección de destino',
      retDisp: 'Disponible:', retTodo: 'Todo',
      retDirAyuda: 'Una dirección de la cadena 5550: 0x y 40 caracteres hexadecimales.',
      continuar: 'Continuar', volver: 'Volver',
      confT: 'Confirmá el retiro', confP: 'Esto sale a la cadena y no se puede deshacer. Revisá la dirección con tus propios ojos: un retiro a la dirección equivocada no tiene botón de vuelta.',
      confirmar: 'Confirmar retiro', enviando: 'Firmando…',
      listoT: 'El retiro salió a la cadena', listoP: 'El hash es la prueba de emisión; en unos segundos lo ves minado en el explorador.',
      verTx: 'Ver en Ordenscan', otro: 'Hacer otro retiro',
      eCantidad: 'La cantidad no es válida: un número positivo, con hasta 18 decimales.',
      eSaldo: 'No te alcanza: pedís más de lo disponible.',
      eDireccion: 'La dirección no es válida: tiene que ser 0x seguido de 40 caracteres hexadecimales.',
      eReintento: 'Reintentá con el mismo botón: la casa reconoce el intento y no firma dos veces.',

      actCargando: 'Trayendo tus movimientos…',
      actVacio: 'Todavía no hay movimientos', actVacioP: 'Cuando deposites, operes o retires, acá queda el rastro completo.',
      actFallo: 'No pudimos traer tus movimientos', actFalloP: 'No es que no haya: es que no llegaron. Probá de nuevo.',
      actNota50: 'Se enseñan los últimos 50 de cada tipo; lo más viejo sigue guardado en el libro de la casa.',
      mvDeposito: 'Depósito acreditado', mvBloque: 'bloque',
      mvRetEnviado: 'Retiro enviado', mvRetPendiente: 'Retiro en curso', mvRetFallido: 'Retiro fallido · saldo devuelto',
      asiento: {
        acreditar: 'Acreditación', debitar: 'Débito',
        'reservar-sale': 'Reserva · sale de disponible', 'reservar-entra': 'Reserva · entra en garantía',
        'liberar-sale': 'Liberación · sale de la garantía', 'liberar-entra': 'Liberación · vuelve a disponible',
        'ejecutar-sale': 'Garantía ejecutada · pagaste', 'ejecutar-entra': 'Garantía ejecutada · cobraste',
      },
    },
    en: {
      titulo: 'Portfolio', sub: 'Your balances in the house ledger, your deposit box and the way out.',
      actTitulo: 'Activity', actSub: 'Everything that happened to your money: ledger entries, deposits and withdrawals.',

      entraT: 'This room asks for your account', entraP: 'Balances, deposits and withdrawals are yours and no one else’s: sign in to see them. The account is the same one across the ecosystem.',
      entrar: 'Sign in with my Veta Wallet account',

      saldosT: 'Your balances', saldosP: 'Available is what you can spend; reserved is what an open order or a fiat request holds as collateral.',
      cargando: 'Fetching your balances…',
      falloSaldos: 'We couldn’t read your balances.', falloSaldosP: 'Without balances read, no withdrawal form gets built: try again in a moment.',
      traer: 'Bring it from my Veta Wallet',
      depUno: 'Deposit',
      panelT: 'Confirm in your Veta Wallet',
      panelPie: 'What you see above is your Veta Wallet, on its own domain. Ordenex cannot read anything you type there — not even your password.',
      cerrar: 'Close',
      depEsperando: 'We opened your Veta Wallet in a window. Confirm the {activo} transfer there — the password is entered in the wallet, never here.',
      depFirmado: 'Signed: {monto} {activo} is on its way. The deposit lands once the chain confirms it; this screen updates itself.',
      depUnoT: 'Opens your Veta Wallet with the asset, the amount and the address already filled in. The password is entered there, never here.',
      walT: 'In your Veta Wallet',
      walP: 'This is what you hold in your wallet, read from the chain. It is not in Ordenex: an exchange only holds what is deposited with it.',
      walEn: 'in your wallet',
      walVacio: 'Your wallet holds no balance on chain 5550.',
      walSinDir: 'Your account does not carry your Veta Wallet address yet. Sign in again from the wallet so it travels with the session.',
      walFallo: 'We could not read your wallet on chain. We would rather say so than paint a zero.',
      walComo: 'To trade with this, send it to your deposit address below. As soon as the chain confirms it, it shows up above and can be sold.',
      reintentar: 'Retry',
      reservado: 'reserved',
      refNota: 'The dollar value is an informational reference (gold and silver, same feed as the wallet), labelled and never the price of any trade. Assets with no real feed carry no value: no numbers get invented here.',
      refOrigen: 'ref. gold · gram/55', refOro: 'ref. ounce of gold', refPlata: 'ref. ounce of silver',

      depT: 'Deposit', depP: 'This address is yours alone: whatever lands there, the watcher credits to your balance within a minute.',
      depAviso: 'Send here only assets of chain 5550 — ORIGEN and its fourteen tokens. Anything coming from any other network never arrives and cannot be recovered.',
      depSin: 'The house couldn’t create your deposit address right now.', depSinP: 'Not your fault: try again in a while.',
      copiar: 'Copy', copiado: 'Copied', copiarMal: 'Couldn’t copy; select and copy by hand.',

      retT: 'Withdraw', retP: 'To any chain 5550 address. It goes through the house screening before it gets signed.',
      retActivo: 'Asset', retCantidad: 'Amount', retDireccion: 'Destination address',
      retDisp: 'Available:', retTodo: 'All',
      retDirAyuda: 'A chain 5550 address: 0x plus 40 hexadecimal characters.',
      continuar: 'Continue', volver: 'Back',
      confT: 'Confirm the withdrawal', confP: 'This goes out to the chain and cannot be undone. Check the address with your own eyes: a withdrawal to the wrong address has no way back.',
      confirmar: 'Confirm withdrawal', enviando: 'Signing…',
      listoT: 'The withdrawal went out to the chain', listoP: 'The hash is the proof of emission; you’ll see it mined in the explorer within seconds.',
      verTx: 'View on Ordenscan', otro: 'Make another withdrawal',
      eCantidad: 'The amount is not valid: a positive number, up to 18 decimals.',
      eSaldo: 'Not enough: you’re asking for more than what’s available.',
      eDireccion: 'The address is not valid: it must be 0x followed by 40 hexadecimal characters.',
      eReintento: 'Retry with the same button: the house recognizes the attempt and never signs twice.',

      actCargando: 'Fetching your activity…',
      actVacio: 'No activity yet', actVacioP: 'When you deposit, trade or withdraw, the full trail lands here.',
      actFallo: 'We couldn’t fetch your activity', actFalloP: 'It’s not that there is none: it just didn’t arrive. Try again.',
      actNota50: 'The last 50 of each kind are shown; older entries stay stored in the house ledger.',
      mvDeposito: 'Deposit credited', mvBloque: 'block',
      mvRetEnviado: 'Withdrawal sent', mvRetPendiente: 'Withdrawal in flight', mvRetFallido: 'Withdrawal failed · balance returned',
      asiento: {
        acreditar: 'Credit', debitar: 'Debit',
        'reservar-sale': 'Reserve · out of available', 'reservar-entra': 'Reserve · into collateral',
        'liberar-sale': 'Release · out of collateral', 'liberar-entra': 'Release · back to available',
        'ejecutar-sale': 'Collateral executed · you paid', 'ejecutar-entra': 'Collateral executed · you got paid',
      },
    },
  };
  const tx = () => TXT[idiomaActivo() === 'en' ? 'en' : 'es'];

  /* El estilo propio de la sala viaja con el módulo y no en index.html: el
     módulo es un huésped en un cascarón que no escribe, y sus pocas clases
     tienen que llegar con él — instalar el archivo es instalar la sala
     entera. Un <style> por innerHTML se aplica igual que uno estático, y al
     re-pintar la vista se reemplaza, no se acumula. */
  const ESTILO = `<style>
    .po-error{color:var(--coral);font-size:13px;line-height:1.55;margin:12px 0}
    .po-dep{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;margin-top:14px}
    .po-qr{width:min(190px,58vw);flex:0 0 auto;background:#F3ECD9;padding:12px;border-radius:var(--r)}
    .po-dep-txt{flex:1;min-width:230px}
    .po-dep-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .po-dep-uno{flex:none;margin-left:12px;white-space:nowrap}

    /* El panel. Ancho de MetaMask en escritorio, pantalla entera en telefono. */
    .po-capa{position:fixed;inset:0;z-index:200;display:grid;place-items:center;
      background:rgba(4,7,11,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      padding:20px;animation:poEntra .18s ease}
    @keyframes poEntra{from{opacity:0}to{opacity:1}}
    .po-panel{width:min(100%,436px);max-height:min(92vh,860px);display:flex;flex-direction:column;
      background:var(--pozo);border:1px solid var(--linea);border-radius:14px;overflow:hidden;
      box-shadow:0 30px 80px -20px rgba(0,0,0,.7)}
    .po-panel-cab{display:flex;align-items:center;gap:10px;padding:12px 14px;
      border-bottom:1px solid var(--linea2);background:rgba(238,241,245,.03)}
    .po-panel-tit{font-weight:700;font-size:14px;color:var(--crema)}
    /* El dominio, a la vista. Es lo que separa un panel de la wallet de un
       formulario que finge serlo: quien mira puede comprobarlo. */
    .po-panel-dom{margin-left:auto;font-size:11px;color:var(--oroLt);
      padding:3px 8px;border:1px solid var(--linea2);border-radius:100px}
    .po-panel-x{color:var(--humo);font-size:15px;padding:2px 6px;line-height:1}
    .po-panel-x:hover{color:var(--crema)}
    .po-panel-marco{flex:1;width:100%;min-height:min(70vh,600px);border:0;display:block;background:#03282A}
    .po-panel-pie{padding:10px 14px;border-top:1px solid var(--linea2);font-size:11.5px;
      line-height:1.5;color:var(--humo)}
    @media (max-width:560px){
      .po-capa{padding:0}
      .po-panel{width:100%;height:100%;max-height:none;border-radius:0;border:0}
      .po-panel-marco{min-height:0}
    }
    .po-dir{font-family:var(--mono);font-variant-ligatures:none;font-size:13.5px;word-break:break-all;
      background:var(--campo);border:1px solid var(--campoBr);border-radius:var(--r);padding:12px 14px;margin-bottom:12px}
    .po-aviso{border:1px solid var(--linea2);background:rgba(201,169,97,.08);border-radius:var(--r);
      padding:12px 14px;font-size:12.5px;line-height:1.6;color:var(--oroLt);margin-top:14px}
    .po-sub{display:block;font-size:11px;color:var(--humo);font-family:var(--sans);font-weight:400;margin-top:2px}
    .po-res{margin:14px 0}
    .po-res .fila{display:flex;justify-content:space-between;gap:14px;padding:9px 0;
      border-bottom:1px solid rgba(255,255,255,.05);font-size:14px}
    .po-res .fila:last-child{border-bottom:0}
    .po-res .fila b{color:var(--bruma);font-weight:500}
    .po-res .fila span{font-family:var(--mono);font-variant-numeric:lining-nums tabular-nums;text-align:right;word-break:break-all}
    .po-tx{color:var(--acento);text-decoration:none;border-bottom:1px solid rgba(116,230,200,.4)}
    .po-tx:hover{color:#D9FBF1}
    .po-glifo{width:100%;height:100%;display:grid;place-items:center;font-size:15px;font-weight:700}
    .po-cant{display:flex;gap:10px;align-items:center}
    .po-cant input{flex:1}
  </style>`;

  // ── el estado de la sala — lets del closure, como toda la casa ────────────
  let carga = 0;            // sello de vigencia: una respuesta vieja no pinta
  let cuentas = null;       // [{activo, disponible, reservado}] o null si no llegaron
  let falloSaldos = false;  // «no llegaron» ≠ «están en cero»
  let direccion = null;     // la dirección de depósito propia
  /* La wallet de la persona, que NO es una cuenta de esta casa. `walletSaldos`
     va en null mientras no llegó, 'fallo' si no se pudo leer, y un arreglo con
     lo que tiene. Los tres estados son distintos y se pintan distinto: un
     arreglo vacío dice «no tenés nada allá», y eso es otra cosa que «no pude
     mirar». */
  /* La wallet, para el enlace de un gesto. Se define aqui y no se toma de
     app.js porque cada modulo vive en su propio closure: leerla de alla
     obligaria a exponerla en ONX solo para esto. Misma variable de entorno,
     mismo valor por defecto. */
  const WALLET = String(
    (typeof window !== 'undefined' && window.ONX_WALLET) || 'https://app.vetawallet.com'
  ).replace(/\/$/, '');

  let direccionWallet = null;
  let walletSaldos = null;
  let referencias = null;   // { origen, oro, plata } en USD — el cartel, o null
  let activoElegido = 'ORIGEN';
  let borrador = null;      // { cantidadTxt, direccion } — lo tecleado, para volver
  let confirmando = null;   // { activo, cantidad, direccion, retiroKey, error } — paso 2
  let enviando = false;
  let resultado = null;     // la respuesta buena del último retiro

  // La retiroKey: aleatoria de verdad (crypto) y con prefijo que dice de
  // dónde vino. Se genera al ENTRAR al paso de confirmación y se conserva
  // durante los reintentos de red — es la reserva de idempotencia del
  // contrato: misma clave, mismo resultado, jamás segunda firma.
  function llaveRetiro() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return 'web-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  // De wei a texto SIN separadores de miles: lo que se mete en un input tiene
  // que volver a pasar por aWei, y aWei (con razón) no traga comas.
  function crudo(s) {
    let n;
    try { n = BigInt(s); } catch { return ''; }
    const cola = (n % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
    return (n / 10n ** 18n).toString() + (cola ? '.' + cola : '');
  }

  const fecha = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleString(idiomaActivo() === 'en' ? 'en-US' : 'es-HN',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const dirCorta = (d) => (d ? String(d).slice(0, 6) + '…' + String(d).slice(-4) : '—');

  // El disco de cada activo: logo propio si lo tiene, glifo sobre su
  // degradado si no — el mismo reparto que la billetera y que cadena.js.
  function disco(sim) {
    const m = CADENA.meta(sim);
    if (m.img) return `<img src="${esc(m.img)}" alt="">`;
    const [a, b] = m.grad || ['#1E8C74', '#0A463F'];
    return `<span class="po-glifo" style="background:linear-gradient(140deg,${esc(a)},${esc(b)});color:${esc(m.fg || '#EAD79C')}">${esc(m.glifo || sim.slice(0, 2))}</span>`;
  }

  // El panel de «entrá primero»: portafolio y actividad son 🔒 en el contrato.
  const pedirSesion = (titulo, sub) => `${ESTILO}
    <div class="cab"><div><h2>${esc(titulo)}</h2><div class="sub">${esc(sub)}</div></div></div>
    <div class="vidrio bloque"><div class="vacio">
      <b>${esc(tx().entraT)}</b>${esc(tx().entraP)}<br><br>
      <button class="btn btn-oro" onclick="ONX.entrar()">${esc(tx().entrar)}</button>
    </div></div>`;

  // ═══ LA VISTA: PORTAFOLIO ═════════════════════════════════════════════════

  function vista() {
    const t = tx();
    if (!DATOS.haySesion()) return pedirSesion(t.titulo, t.sub);
    return `${ESTILO}
      <div class="cab"><div><h2>${esc(t.titulo)}</h2><div class="sub">${esc(t.sub)}</div></div></div>
      <div class="vidrio bloque">
        <h3>${esc(t.saldosT)}</h3>
        <p class="pie">${esc(t.saldosP)}</p>
        <div id="po-saldos">${saldosHTML()}</div>
        <p class="pie" style="margin-top:14px">${esc(t.refNota)}</p>
      </div>
      <!-- «¿Y lo que tengo en mi wallet?» Se contesta ANTES de explicar como
           depositar, porque es la pregunta que viene primero. -->
      <div class="vidrio bloque" id="po-wallet-caja">${walletHTML()}</div>
      <div class="vidrio bloque">
        <h3>${esc(t.depT)}</h3>
        <p class="pie">${esc(t.depP)}</p>
        <div id="po-deposito">${depositoHTML()}</div>
      </div>
      <div class="vidrio bloque">
        <h3>${esc(t.retT)}</h3>
        <p class="pie">${esc(t.retP)}</p>
        <div id="po-retiro">${retiroHTML()}</div>
      </div>`;
  }

  // ── saldos ────────────────────────────────────────────────────────────────

  function saldosHTML() {
    const t = tx();
    if (falloSaldos) return `<div class="vacio"><b>${esc(t.falloSaldos)}</b>${esc(t.falloSaldosP)}<br><br>
      <button class="btn btn-linea btn-sm" onclick="VPORTA.recargar()">${esc(t.reintentar)}</button></div>`;
    if (!cuentas) return `<div class="vacio">${esc(t.cargando)}</div>`;
    return cuentas.map((c) => {
      const m = CADENA.meta(c.activo);
      let reservado = 0n, total = 0n;
      try { reservado = BigInt(c.reservado); total = BigInt(c.disponible) + reservado; } catch {}
      const ref = valorReferencia(c.activo, total);
      return `<div class="hilera">
        <div class="ic">${disco(c.activo)}</div>
        <div class="txt"><b>${esc(c.activo)}</b><small>${esc(m.n || c.activo)}</small></div>
        <div class="val">${esc(dinero(c.disponible))}
          ${reservado > 0n ? `<span class="po-sub">${esc(t.reservado)}: ${esc(dinero(c.reservado))}</span>` : ''}
          ${ref ? `<span class="po-sub">${esc(ref)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  /* ── LO QUE HAY EN LA VETA WALLET ──────────────────────────────────────────
     La casa de cambio guarda lo que le DEPOSITAN. Quien entra con su cuenta y
     ve el portafolio vacío concluye —con toda razón— que Ordenex «no le cargó»
     sus activos. No los perdió: están en su wallet, a un depósito de
     distancia, y esta caja lo dice con la dirección y los saldos delante.

     Va rotulada como de la wallet en todas partes y sin ningún botón de
     operar: mezclarla con el saldo de la casa sería ofrecer para vender algo
     que la casa no tiene en custodia. */
  function walletHTML() {
    const t = tx();
    if (!direccionWallet) {
      return `<h3>${esc(t.walT)}</h3><p class="pie">${esc(t.walSinDir)}</p>`;
    }
    const cab = `<h3>${esc(t.walT)}</h3>
      <p class="pie">${esc(t.walP)}</p>
      <div class="po-dir mono">${esc(direccionWallet)}</div>`;
    if (walletSaldos === 'fallo') {
      return `${cab}<div class="vacio">${esc(t.walFallo)}
        <br><br><button class="btn btn-linea btn-sm" onclick="VPORTA.recargarWallet()">${esc(t.reintentar)}</button></div>`;
    }
    if (!walletSaldos) return `${cab}<div class="vacio">${esc(t.cargando)}</div>`;
    if (!walletSaldos.length) return `${cab}<div class="vacio">${esc(t.walVacio)}</div>`;
    return cab + walletSaldos.map((f) => {
      const m = CADENA.meta(f.s);
      let total = 0n;
      try { total = BigInt(f.wei); } catch {}
      const ref = valorReferencia(f.s, total);
      return `<div class="hilera">
        <div class="ic">${disco(f.s)}</div>
        <div class="txt"><b>${esc(f.s)}</b><small>${esc(m.n || f.s)}</small></div>
        <div class="val">${esc(dinero(f.wei))}
          <span class="po-sub">${esc(t.walEn)}</span>
          ${ref ? `<span class="po-sub">${esc(ref)}</span>` : ''}
        </div>
        ${(direccion && montoURL(f.wei)) ? `<button class="btn btn-linea btn-sm po-dep-uno"
          onclick="VPORTA.depositar(${jsTxt(f.s)},${jsTxt(montoURL(f.wei))})"
          title="${esc(t.depUnoT)}">${esc(t.depUno)}</button>` : ''}
      </div>`;
    }).join('') + `<p class="pie" style="margin-top:14px">${esc(t.walComo)}</p>
      ${direccion ? `<div class="po-dep-btns"><a class="btn btn-oro btn-sm"
        href="${esc(WALLET)}/#pagar${esc(direccion)}" target="_blank" rel="noopener">${esc(t.traer)}</a></div>` : ''}`;
  }

  /* ═══ DEPOSITAR EN UNA VENTANA ════════════════════════════════════════════
     Se abre la wallet en una emergente de 420 px, como MetaMask, en vez de
     mandar a la persona a otra pestaña. Y la clave se pone ALLA, en el dominio
     de la wallet: un panel de Ordenex pidiendo la contraseña de la billetera,
     por comodo que fuera, es enseñar el gesto exacto con el que despues le
     vacian la cuenta a alguien.

     Si el navegador bloquea la emergente —pasa, y no siempre avisa— se cae a
     abrir una pestaña. Un boton que no hace nada porque el bloqueador se lo
     comio es peor que uno que abre de mas. */
  /* EL PANEL, DENTRO DE ORDENEX ─────────────────────────────────────────────
     La wallet se dibuja aqui mismo, en un marco. Parece MetaMask y se comporta
     como MetaMask, y la parte que importa es POR QUE se puede:

     Lo de adentro sigue siendo el documento de la wallet, servido por SU
     dominio. El navegador aisla los dos: Ordenex no puede leer ni un caracter
     de lo que se teclea ahi dentro, ni el campo de la contraseña, ni la
     sesion. Lo unico que cruza es un mensaje al terminar, y solo porque las
     dos partes lo permiten explicitamente.

     Es la diferencia entre esto y un formulario de Ordenex que pida la clave
     de la billetera: aquel la leeria; este no puede aunque quiera. Y la wallet
     solo se deja enmarcar por los origenes de esta casa —cabecera
     frame-ancestors, puesta en su despliegue—, asi que este mismo panel no lo
     puede armar una pagina cualquiera.

     En un telefono el marco se lleva la pantalla entera, que es lo correcto:
     un panel de 430 px en 390 px de ancho es un panel con scroll horizontal. */
  let panelAbierto = false;

  function depositar(sim, monto) {
    if (!direccion) return;
    const url = `${WALLET}/#pagar${direccion}?s=${encodeURIComponent(sim)}`
      + `&m=${encodeURIComponent(monto)}&pop=1`;
    cerrarPanel();
    const t = tx();
    const capa = document.createElement('div');
    capa.className = 'po-capa';
    capa.id = 'po-capa';
    capa.innerHTML = `
      <div class="po-panel" role="dialog" aria-modal="true" aria-label="${esc(t.panelT)}">
        <div class="po-panel-cab">
          <span class="po-panel-tit">${esc(t.panelT)}</span>
          <span class="po-panel-dom mono">app.vetawallet.com</span>
          <button class="po-panel-x" onclick="VPORTA.cerrarPanel()" aria-label="${esc(t.cerrar)}">✕</button>
        </div>
        <iframe class="po-panel-marco" src="${esc(url)}" title="${esc(t.panelT)}"
                allow="clipboard-write"></iframe>
        <div class="po-panel-pie">${esc(t.panelPie)}</div>
      </div>`;
    // Tocar fuera cierra; tocar dentro no. Un panel que se cierra al rozarlo
    // en medio de escribir una contraseña es una manera de perder el gesto.
    capa.addEventListener('click', (e) => { if (e.target === capa) cerrarPanel(); });
    document.body.appendChild(capa);
    document.body.style.overflow = 'hidden';
    panelAbierto = true;
    addEventListener('keydown', alEscape);
    avisarEspera(sim);
  }

  function alEscape(e) { if (e.key === 'Escape') cerrarPanel(); }

  function cerrarPanel() {
    const c = document.getElementById('po-capa');
    if (c) c.remove();
    document.body.style.overflow = '';
    removeEventListener('keydown', alEscape);
    panelAbierto = false;
  }

  /* Mientras la ventana esta abierta, esta pantalla dice que espera. Y cuando
     la wallet avisa que firmo, se pasa a sondear el portafolio: el deposito no
     esta hecho cuando se firma, esta hecho cuando el vigia lo acredita, y
     decir «listo» un minuto antes es la clase de mentira comoda que hace que
     alguien recargue diez veces. */
  function avisarEspera(sim) {
    const caja = document.getElementById('po-wallet-caja');
    if (!caja) return;
    const t = tx();
    let av = document.getElementById('po-esperando');
    if (!av) {
      av = document.createElement('div');
      av.id = 'po-esperando';
      av.className = 'po-aviso';
      av.style.marginTop = '12px';
      caja.appendChild(av);
    }
    av.textContent = rell(t.depEsperando, { activo: sim });
  }

  let sondeoDeposito = null;

  function alAvisarLaWallet(ev) {
    // El origen se comprueba SIEMPRE: un mensaje de cualquier otra pagina no
    // tiene por que mover nada de esta.
    let esperado = '';
    try { esperado = new URL(WALLET).origin; } catch { return; }
    if (ev.origin !== esperado) return;
    const d = ev.data;
    if (!d || d.de !== 'veta-wallet' || !d.ok) return;

    const t = tx();
    const av = document.getElementById('po-esperando');
    if (av) av.textContent = rell(t.depFirmado, { activo: d.activo || '', monto: d.monto || '' });
    // El panel ya cumplio: se cierra solo y la persona vuelve a ver su
    // portafolio, que es donde va a aparecer el deposito.
    setTimeout(cerrarPanel, 1200);

    /* Se sondea el portafolio hasta que el saldo cambie o pasen dos minutos.
       El vigia mira cada 30 s, asi que cada 8 son cuatro miradas por vuelta
       suya: suficiente para que se note enseguida y no tanto como para
       martillar el API. */
    if (sondeoDeposito) clearInterval(sondeoDeposito);
    let vueltas = 0;
    sondeoDeposito = setInterval(() => {
      vueltas += 1;
      cargar();
      cargarWallet();
      if (vueltas >= 15) { clearInterval(sondeoDeposito); sondeoDeposito = null; }
    }, 8000);
  }

  async function cargarWallet() {
    if (!direccionWallet) return;
    try {
      walletSaldos = await CADENA.saldosEnWallet(direccionWallet);
    } catch {
      // Fail-closed de pantalla: se dice que no se pudo leer, no se pinta cero.
      walletSaldos = 'fallo';
    }
    const caja = document.getElementById('po-wallet-caja');
    if (caja) caja.innerHTML = walletHTML();
  }

  function recargarWallet() {
    walletSaldos = null;
    const caja = document.getElementById('po-wallet-caja');
    if (caja) caja.innerHTML = walletHTML();
    cargarWallet();
  }

  /* El valor de referencia, SOLO para los tres activos referenciados del
     contrato: ORIGEN (gramo de oro / 55), AUKA (onza de oro), AGKA (onza de
     plata). Los tokens de sector no llevan valor: sin feed real, nada — la
     regla n.º 2 de la casa prohíbe el número inventado.

     Aquí — y solo aquí — el wei pasa por un flotante: es el cartel de «la
     onza va a tanto» colgado junto al saldo, no un camino de dinero. La
     fracción se corta a 4 decimales ANTES de multiplicar para que el Number
     nunca cargue los 18 dígitos enteros. */
  function valorReferencia(activo, totalWei) {
    if (!referencias || totalWei <= 0n) return null;
    const t = tx();
    let usd = null, rotulo = null;
    if (activo === 'ORIGEN') { usd = referencias.origen; rotulo = t.refOrigen; }
    else if (activo === 'AUKA') { usd = referencias.oro; rotulo = t.refOro; }
    else if (activo === 'AGKA') { usd = referencias.plata; rotulo = t.refPlata; }
    if (usd == null) return null;
    const v = (Number(totalWei / 10n ** 14n) / 1e4) * usd;
    if (!isFinite(v)) return null;
    return '≈ $' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' · ' + rotulo;
  }

  // ── depósito ──────────────────────────────────────────────────────────────

  function depositoHTML() {
    const t = tx();
    if (falloSaldos) return `<div class="vacio"><b>${esc(t.falloSaldos)}</b><br><br>
      <button class="btn btn-linea btn-sm" onclick="VPORTA.recargar()">${esc(t.reintentar)}</button></div>`;
    if (!cuentas) return `<div class="vacio">${esc(t.cargando)}</div>`;
    if (!direccion) return `<div class="vacio"><b>${esc(t.depSin)}</b>${esc(t.depSinP)}<br><br>
      <button class="btn btn-linea btn-sm" onclick="VPORTA.recargar()">${esc(t.reintentar)}</button></div>`;

    // El QR es el de la casa (qr.js, escrito a mano): el mismo que enseña la
    // billetera, para que lo que un teléfono lee acá lo lea también allá.
    let qr = '';
    try { qr = QR.svg(direccion, { claro: '#F3ECD9', oscuro: '#021B1C', margen: 2 }); } catch {}
    return `<div class="po-dep">
      ${qr ? `<div class="po-qr">${qr}</div>` : ''}
      <div class="po-dep-txt">
        <div class="po-dir">${esc(direccion)}</div>
        <div class="po-dep-btns">
          <!-- El puente de un gesto. La billetera ya entiende
               #pagar<direccion>: abre «enviar» con la direccion puesta y solo
               pide la clave. Sin esto, traer fondos era copiar una direccion
               de 42 caracteres, cambiar de pestaña y pegarla — tres pasos
               donde uno se equivoca, y el error se paga en la cadena. -->
          <a class="btn btn-oro btn-sm" href="${esc(WALLET)}/#pagar${esc(direccion)}"
             target="_blank" rel="noopener">${esc(t.traer)}</a>
          <button class="btn btn-linea btn-sm" onclick="VPORTA.copiar(${jsTxt(direccion)})">${esc(t.copiar)}</button>
        </div>
        <div class="po-aviso">${esc(t.depAviso)}</div>
      </div>
    </div>`;
  }

  // ── retiro: formulario → confirmación → resultado ─────────────────────────

  function retiroHTML() {
    const t = tx();
    // Fail-closed: sin saldos leídos no se arma el formulario. El servidor
    // también lo pararía, pero dejar teclear un retiro sobre un saldo que no
    // se pudo mirar es invitar al error que la casa promete no cometer.
    if (falloSaldos) return `<div class="vacio"><b>${esc(t.falloSaldos)}</b>${esc(t.falloSaldosP)}<br><br>
      <button class="btn btn-linea btn-sm" onclick="VPORTA.recargar()">${esc(t.reintentar)}</button></div>`;
    if (!cuentas) return `<div class="vacio">${esc(t.cargando)}</div>`;
    if (resultado) return resultadoHTML();
    if (confirmando) return confirmacionHTML();

    const disp = disponibleDe(activoElegido);
    return `
      <div class="campo"><label for="po-ret-activo">${esc(t.retActivo)}</label>
        <select id="po-ret-activo" onchange="VPORTA.eligeActivo()">
          ${cuentas.map((c) => `<option value="${esc(c.activo)}"${c.activo === activoElegido ? ' selected' : ''}>${esc(c.activo)}</option>`).join('')}
        </select>
        <span class="ayuda">${esc(t.retDisp)} <span id="po-ret-disp" class="mono">${esc(dinero(disp))}</span></span>
      </div>
      <div class="campo"><label for="po-ret-cantidad">${esc(t.retCantidad)}</label>
        <div class="po-cant">
          <input id="po-ret-cantidad" inputmode="decimal" autocomplete="off" spellcheck="false"
            placeholder="0.0" value="${esc(borrador?.cantidadTxt || '')}">
          <button class="btn btn-linea btn-sm" onclick="VPORTA.todo()">${esc(t.retTodo)}</button>
        </div>
      </div>
      <div class="campo"><label for="po-ret-dir">${esc(t.retDireccion)}</label>
        <input id="po-ret-dir" class="mono" autocomplete="off" spellcheck="false"
          placeholder="0x…" value="${esc(borrador?.direccion || '')}">
        <span class="ayuda">${esc(t.retDirAyuda)}</span>
      </div>
      <p id="po-ret-error" class="po-error oculto"></p>
      <button class="btn btn-oro btn-full" onclick="VPORTA.continuar()">${esc(t.continuar)}</button>`;
  }

  function confirmacionHTML() {
    const t = tx();
    const c = confirmando;
    return `
      <h3>${esc(t.confT)}</h3>
      <p class="pie">${esc(t.confP)}</p>
      <div class="po-res">
        <div class="fila"><b>${esc(t.retActivo)}</b><span>${esc(c.activo)}</span></div>
        <div class="fila"><b>${esc(t.retCantidad)}</b><span>${esc(dinero(c.cantidad, 18))} ${esc(c.activo)}</span></div>
        <div class="fila"><b>${esc(t.retDireccion)}</b><span>${esc(c.direccion)}</span></div>
      </div>
      ${c.error ? `<p class="po-error">${esc(c.error)}</p>` : ''}
      <button class="btn btn-oro btn-full" id="po-ret-confirmar" onclick="VPORTA.confirmarRetiro()"
        ${enviando ? 'disabled' : ''}>${esc(enviando ? t.enviando : t.confirmar)}</button>
      <div style="height:10px"></div>
      <button class="btn btn-linea btn-full" onclick="VPORTA.volver()" ${enviando ? 'disabled' : ''}>${esc(t.volver)}</button>`;
  }

  function resultadoHTML() {
    const t = tx();
    const r = resultado;
    return `
      <h3>${esc(t.listoT)}</h3>
      <p class="pie">${esc(t.listoP)}</p>
      <div class="po-res">
        <div class="fila"><b>${esc(t.retCantidad)}</b><span>${esc(dinero(r.cantidad, 18))} ${esc(r.activo)}</span></div>
        <div class="fila"><b>${esc(t.retDireccion)}</b><span>${esc(r.direccion)}</span></div>
        ${r.hash ? `<div class="fila"><b>Hash</b><span><a class="po-tx" target="_blank" rel="noopener"
          href="${esc(EXPLORADOR + '/tx/' + encodeURIComponent(r.hash))}">${esc(dirCorta(r.hash))} · ${esc(t.verTx)}</a></span></div>` : ''}
      </div>
      <button class="btn btn-linea btn-full" onclick="VPORTA.otro()">${esc(t.otro)}</button>`;
  }

  function disponibleDe(activo) {
    const c = (cuentas || []).find((x) => x.activo === activo);
    return c ? c.disponible : '0';
  }

  function pintarRetiro() {
    const el = document.getElementById('po-retiro');
    if (el) el.innerHTML = retiroHTML();
  }

  function errorRetiro(msj) {
    const el = document.getElementById('po-ret-error');
    if (!el) return;
    el.textContent = msj;
    el.classList.remove('oculto');
  }

  // ── los manejadores del retiro ────────────────────────────────────────────

  function eligeActivo() {
    const sel = document.getElementById('po-ret-activo');
    if (!sel) return;
    activoElegido = sel.value;
    const disp = document.getElementById('po-ret-disp');
    if (disp) disp.textContent = dinero(disponibleDe(activoElegido));
  }

  function todo() {
    const inp = document.getElementById('po-ret-cantidad');
    if (inp) inp.value = crudo(disponibleDe(activoElegido));
  }

  /* Paso 1 → paso 2. Se valida TODO antes de enseñar la confirmación: una
     dirección mal escrita no debe llegar ni al resumen — el resumen es para
     revisar el destino, no para descubrir que era ilegible. */
  function continuar() {
    const t = tx();
    const cantidadTxt = String(document.getElementById('po-ret-cantidad')?.value || '').trim();
    const direccionTxt = String(document.getElementById('po-ret-dir')?.value || '').trim();
    borrador = { cantidadTxt, direccion: direccionTxt };

    const cantidad = ONX.aWei(cantidadTxt);
    if (cantidad == null || BigInt(cantidad) <= 0n) return errorRetiro(t.eCantidad);
    // La validación 0x del contrato. El servidor además normaliza el checksum
    // (getAddress); aquí basta con la forma — el checksum mal puesto lo
    // rechaza él con su propio error, en claro.
    if (!/^0x[0-9a-fA-F]{40}$/.test(direccionTxt)) return errorRetiro(t.eDireccion);
    let disp = 0n;
    try { disp = BigInt(disponibleDe(activoElegido)); } catch {}
    if (BigInt(cantidad) > disp) return errorRetiro(t.eSaldo);

    confirmando = { activo: activoElegido, cantidad, direccion: direccionTxt, retiroKey: llaveRetiro(), error: null };
    pintarRetiro();
  }

  function volver() {
    if (enviando) return;
    confirmando = null;
    pintarRetiro();
  }

  async function confirmarRetiro() {
    if (enviando || !confirmando) return;
    const t = tx();
    enviando = true;
    confirmando.error = null;
    pintarRetiro();
    const mia = carga;
    try {
      const r = await DATOS.retirar({
        activo: confirmando.activo,
        cantidad: confirmando.cantidad,
        direccion: confirmando.direccion,
        retiroKey: confirmando.retiroKey,
      });
      enviando = false;
      if (mia !== carga) return; // la vista ya no es esta; el retiro igual salió
      resultado = r;
      confirmando = null;
      borrador = null;
      pintarRetiro();
      cargar(); // los saldos ya cambiaron: se refrescan sin que nadie lo pida
    } catch (e) {
      enviando = false;
      if (mia !== carga) return;
      if (e?.codigo === 'SESION_VENCIDA') { ONX.avisar(e.message); ONX.vista('portafolio'); return; }
      if (!confirmando) return;
      /* La clave y los errores. Si el intento MURIÓ en el servidor (la firma
         falló, el débito falló, la clave quedó quemada), la próxima va con
         clave nueva — reusar una clave quemada solo devuelve el mismo
         epitafio. Pero si fue la RED la que falló, o el retiro «sigue en
         curso», la clave se conserva: reintentar con la misma es exactamente
         lo que hace imposible firmar dos veces. */
      const quemada = ['RETIRO_FALLO', 'FIRMA_FALLO', 'DEBITO_FALLO', 'SALDO_INSUFICIENTE', 'RETIRO_KEY_AJENA'].includes(e?.codigo);
      if (quemada) confirmando.retiroKey = llaveRetiro();
      // El error del API, en claro: su mensaje ya viene escrito para personas.
      const detalle = e?.message || String(e);
      confirmando.error = detalle + (quemada || !e?.codigo || e.codigo === 'RETIRO_EN_CURSO' ? ' ' + t.eReintento : '');
      pintarRetiro();
      cargar(); // por si el débito quedó a medias, que los saldos digan la verdad
    }
  }

  function otro() {
    resultado = null;
    pintarRetiro();
  }

  async function copiar(texto) {
    const t = tx();
    try {
      await navigator.clipboard.writeText(texto);
      ONX.avisar(t.copiado);
    } catch {
      ONX.avisar(t.copiarMal);
    }
  }

  // ── la carga del portafolio ───────────────────────────────────────────────

  async function cargar() {
    if (!DATOS.haySesion()) return;
    const mia = ++carga;
    try {
      const p = await DATOS.portafolio();
      if (mia !== carga) return;
      cuentas = Array.isArray(p?.cuentas) ? p.cuentas : [];
      direccion = p?.direccionDeposito || null;
      direccionWallet = p?.direccionWallet || null;
      falloSaldos = false;
    } catch (e) {
      if (mia !== carga) return;
      if (e?.codigo === 'SESION_VENCIDA') { ONX.avisar(e.message); ONX.vista('portafolio'); return; }
      // Los saldos viejos, si los hay, se quedan: un dato viejo y honesto
      // vale más que borrar la pantalla. Sin dato previo, se dice el fallo.
      if (!cuentas) falloSaldos = true;
    }
    pintarTodo();

    // La wallet se lee por RPC y va aparte del portafolio: si la cadena tarda,
    // los saldos de la casa ya están en pantalla.
    cargarWallet();

    /* La referencia va aparte y DESPUÉS: es un cartel. Si el feed no llega,
       los saldos ya están pintados y el cartel simplemente no aparece —
       jamás un cartel caído tira la sala. */
    try {
      const lista = await DATOS.mercados();
      if (mia !== carga) return;
      referencias = extraerReferencias(lista);
      const el = document.getElementById('po-saldos');
      if (el) el.innerHTML = saldosHTML();
    } catch {}
  }

  /* De GET /mercados sale la referencia rotulada: cada fila puede traer
     { usd, rotulo, origenUsd, … } o null. El oro viene en la fila de AUKA,
     la plata en la de AGKA, y el gramin (origenUsd) en cualquiera. */
  function extraerReferencias(lista) {
    let origen = null, oro = null, plata = null;
    for (const m of Array.isArray(lista) ? lista : []) {
      const r = m?.referencia;
      if (!r || typeof r !== 'object') continue;
      if (origen == null && typeof r.origenUsd === 'number') origen = r.origenUsd;
      const base = String(m.mercado || '').split('-')[0];
      if (base === 'AUKA' && typeof r.usd === 'number') oro = r.usd;
      if (base === 'AGKA' && typeof r.usd === 'number') plata = r.usd;
    }
    return origen == null && oro == null && plata == null ? null : { origen, oro, plata };
  }

  function pintarTodo() {
    const s = document.getElementById('po-saldos');
    if (s) s.innerHTML = saldosHTML();
    const d = document.getElementById('po-deposito');
    if (d) d.innerHTML = depositoHTML();
    pintarRetiro();
  }

  // ═══ LA VISTA: ACTIVIDAD ══════════════════════════════════════════════════

  function vistaActividad() {
    const t = tx();
    if (!DATOS.haySesion()) return pedirSesion(t.actTitulo, t.actSub);
    return `${ESTILO}
      <div class="cab"><div><h2>${esc(t.actTitulo)}</h2><div class="sub">${esc(t.actSub)}</div></div></div>
      <div class="vidrio bloque"><div id="ac-lista"><div class="vacio">${esc(t.actCargando)}</div></div></div>`;
  }

  async function cargarActividad() {
    if (!DATOS.haySesion()) return;
    const t = tx();
    const mia = ++carga;
    let d;
    try {
      d = await DATOS.movimientos();
    } catch (e) {
      if (mia !== carga) return;
      if (e?.codigo === 'SESION_VENCIDA') { ONX.avisar(e.message); ONX.vista('actividad'); return; }
      const el = document.getElementById('ac-lista');
      if (el) el.innerHTML = `<div class="vacio"><b>${esc(t.actFallo)}</b>${esc(t.actFalloP)}<br><br>
        <button class="btn btn-linea btn-sm" onclick="VPORTA.recargarActividad()">${esc(t.reintentar)}</button></div>`;
      return;
    }
    if (mia !== carga) return;
    const el = document.getElementById('ac-lista');
    if (el) el.innerHTML = actividadHTML(d);
  }

  /* Las tres colecciones en UNA línea de tiempo, lo más nuevo primero. Los
     asientos son la verdad del libro; los depósitos y retiros traen además su
     cara de cadena — el bloque, el hash — y el hash se enlaza al explorador:
     la prueba pública de que el dinero se movió de verdad. */
  function actividadHTML(d) {
    const t = tx();
    const filas = [
      ...(Array.isArray(d?.depositos) ? d.depositos : []).map((x) => ({ f: 'deposito', ...x })),
      ...(Array.isArray(d?.retiros) ? d.retiros : []).map((x) => ({ f: 'retiro', ...x })),
      ...(Array.isArray(d?.asientos) ? d.asientos : []).map((x) => ({ f: 'asiento', ...x })),
    ].sort((a, b) => new Date(b.en || 0) - new Date(a.en || 0));

    if (!filas.length) return `<div class="vacio"><b>${esc(t.actVacio)}</b>${esc(t.actVacioP)}</div>`;

    const cuerpo = filas.map((m) => {
      if (m.f === 'deposito') return filaHTML({
        icono: 'M12 3v12M7 10l5 5 5-5M4 19h16',
        titulo: t.mvDeposito,
        detalle: esc(dirCorta(m.direccion)) + (m.bloque != null ? ` · ${esc(t.mvBloque)} ${esc(String(m.bloque))}` : ''),
        monto: '+' + dinero(m.cantidad), entra: true, activo: m.activo, en: m.en,
      });
      if (m.f === 'retiro') {
        const titulo = m.estado === 'enviado' ? t.mvRetEnviado : m.estado === 'fallido' ? t.mvRetFallido : t.mvRetPendiente;
        const enlace = m.hash
          ? ` · <a class="po-tx" target="_blank" rel="noopener" href="${esc(EXPLORADOR + '/tx/' + encodeURIComponent(m.hash))}">${esc(t.verTx)}</a>`
          : '';
        return filaHTML({
          icono: 'M12 21V9M7 14l5-5 5 5M4 3h16',
          titulo,
          detalle: esc(dirCorta(m.direccion)) + enlace,
          monto: (m.estado === 'fallido' ? '' : '−') + dinero(m.cantidad),
          entra: false, activo: m.activo, en: m.en,
        });
      }
      // asiento del libro: el tipo dice qué pata del movimiento es, y la ref
      // ata la fila a su operación (trato, retiro, solicitud fiat).
      const negativo = String(m.monto || '').startsWith('-');
      return filaHTML({
        icono: 'M5 5h14M5 12h14M5 19h9',
        titulo: (t.asiento[m.tipo] || m.tipo || '—'),
        detalle: `<span class="mono">${esc(m.ref || '')}</span>`,
        monto: (negativo ? '' : '+') + dinero(m.monto),
        entra: !negativo, activo: m.activo, en: m.en,
      });
    }).join('');

    const nota = d?.siguiente ? `<p class="pie" style="margin-top:14px">${esc(t.actNota50)}</p>` : '';
    return cuerpo + nota;
  }

  function filaHTML({ icono, titulo, detalle, monto, entra, activo, en }) {
    return `<div class="hilera">
      <div class="ic"><svg viewBox="0 0 24 24"><path d="${icono}"/></svg></div>
      <div class="txt"><b>${esc(titulo)}</b><small>${detalle}</small></div>
      <div class="val ${entra ? 'entra' : 'sale'}">${esc(monto)}
        <span class="po-sub">${esc(activo || '')} · ${esc(fecha(en))}</span></div>
    </div>`;
  }

  // ═══ el contrato con app.js ═══════════════════════════════════════════════

  function alPintar(cual) {
    if (cual === 'portafolio') {
      cargar();
      // El oido para la ventana de la wallet. Se pone UNA vez y se queda: el
      // mensaje puede llegar despues de haber cambiado de pantalla, y perderlo
      // dejaria el deposito sin sondear.
      if (!oidoPuesto) { addEventListener('message', alAvisarLaWallet); oidoPuesto = true; }
    }
    else if (cual === 'actividad') cargarActividad();
  }
  let oidoPuesto = false;

  /* Idempotente, como exige el orquestador. No hay sondeos que parar en esta
     sala (saldos y movimientos se traen al pintar, no en bucle); lo que sí se
     apaga es lo transitorio: subir el sello de carga deja mudas las
     respuestas en vuelo, y una confirmación de retiro a medio camino no debe
     sobrevivir a una navegación — quien vuelve, vuelve al formulario. */
  function apagar() {
    carga++;
    confirmando = null;
    enviando = false;
    resultado = null;
    borrador = null;
    // El sondeo del deposito SI se apaga: es transitorio y no tiene por que
    // sobrevivir a salir de la sala.
    if (sondeoDeposito) { clearInterval(sondeoDeposito); sondeoDeposito = null; }
  }

  return {
    vista, vistaActividad, alPintar, apagar,
    eligeActivo, todo, continuar, volver, confirmarRetiro, otro, copiar,
    recargar: cargar, recargarActividad: cargarActividad, recargarWallet, depositar, cerrarPanel,
  };
})();
