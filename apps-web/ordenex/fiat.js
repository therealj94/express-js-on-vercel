/* Ordenex · fiat.js — el circuito de entrada y salida en lempiras y dólares,
 * con agentes verificados.
 *
 * Expone `const VFIAT` con el contrato que app.js espera: { vista, alPintar,
 * apagar } más los manejadores de los onclick. Tres pestañas: Comprar
 * (entrada: el usuario compra ORIGEN con fiat), Vender (salida: el espejo) y
 * Mis solicitudes (las dos puntas de todo lo abierto).
 *
 * Lo que esta vista tiene grabado del contrato:
 *
 * - LA CASA NO TOCA FIAT. El dinero de banco viaja entre las personas;
 *   Ordenex custodia la garantía en ORIGEN y arbitra. El aviso legal de la
 *   vista lo dice con todas las letras, porque callarlo sería dejar que
 *   alguien crea que le compra a la casa.
 *
 * - EL FLUJO ES EXACTO: abierta → tomada → fiat-avisado → liquidada |
 *   cancelada | disputa. Ni un estado más, ni un atajo. Quién puede hacer
 *   qué en cada estado sale de la misma tabla que usa el servidor (quién
 *   paga el fiat y quién lo recibe dependen del tipo), y la historia se
 *   enseña entera como línea de tiempo: es el expediente de la solicitud.
 *
 * - LOS NÚMEROS DE CUENTA SON SAGRADOS. La lista de agentes trae bancos como
 *   logos, sin cuentas ni titulares; los datos completos aparecen SOLO cuando
 *   la solicitud está tomada — es el servidor quien los manda recién ahí, y
 *   esta vista no los pide antes ni los guarda después.
 *
 * - EL PRECIO LO PACTAN LAS PARTES. La referencia (oro → gramin) se enseña al
 *   lado, rotulada como informativa; si el feed no llegó, guion — jamás un
 *   número inventado.
 *
 * El dinero: el ORIGEN va en strings de wei (ONX.aWei/deWei); el fiat va en
 * CENTAVOS, también como string entero operado con BigInt — '250000' son
 * 2.500,00 lempiras. Un float con plata dentro no entra a este archivo.
 */

const VFIAT = (() => {
  'use strict';

  // Diferidos a propósito: fiat.js se carga antes que app.js, y nombrar ONX
  // en el nivel superior reventaría. En tiempo de click, ONX ya existe.
  const esc = (s) => ONX.esc(s);
  const jsTxt = (s) => ONX.jsTxt(s);
  const origen = (s, dec = 6) => {
    const v = ONX.deWei(s, dec);
    return v == null ? '—' : v;
  };

  // ── el fiat en centavos, con BigInt y sin un double en el camino ──────────

  // De lo que teclea la gente ('2500', '2500.50', '2500,50') a centavos como
  // string. null ante cualquier cosa rara: adivinar un monto es peor que
  // rechazarlo — el mismo criterio que ONX.aWei con el wei.
  function aCentavos(txt) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!/^\d{1,13}(\.\d{1,2})?$/.test(s)) return null;
    const [ent, dec = ''] = s.split('.');
    try {
      const v = BigInt(ent) * 100n + BigInt((dec + '00').slice(0, 2));
      return v > 0n ? v.toString() : null;
    } catch { return null; }
  }

  // De centavos a texto, cortando jamás redondeando — '250000' → '2,500.00'.
  function deCentavos(s) {
    let n;
    try { n = BigInt(s); } catch { return '—'; }
    const ent = (n / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return ent + '.' + (n % 100n).toString().padStart(2, '0');
  }

  const simbolo = (moneda) => (moneda === 'HNL' ? 'L' : '$');

  /* ═══ los textos del circuito — patrón AURA_TXT: los dos idiomas viajan con
     el módulo y se elige con idiomaActivo(). Español con voseo, como la casa. */
  const TXT = {
    es: {
      titulo: 'Fiat', sub: 'Entrada y salida en lempiras o dólares, de persona a persona, con agentes verificados.',
      legal: 'El cambio fiat es entre personas con identidad verificada en Genesis ID. Ordenex custodia la garantía en ORIGEN y arbitra si hace falta; el dinero fiat viaja de banco a banco entre las partes — la casa no lo toca.',
      tabComprar: 'Comprar', tabVender: 'Vender', tabSolicitudes: 'Mis solicitudes',

      comprarP: 'Comprás ORIGEN con lempiras o dólares: elegís un agente, pactan el monto, transferís a su banco y, cuando él confirma que le llegó, el ORIGEN reservado en garantía pasa a tu saldo.',
      venderP: 'Vendés tu ORIGEN por lempiras o dólares: elegís un agente, tu ORIGEN queda reservado en garantía, el agente te transfiere a tu banco y, cuando confirmás que te llegó, la garantía se le entrega.',
      agCargando: 'Trayendo los agentes…',
      agVacio: 'Todavía no hay agentes activos', agVacioP: 'El alta de agentes la hace la casa, uno a uno. Volvé a mirar pronto.',
      agFallo: 'No pudimos traer los agentes', agFalloP: 'No es que no haya: es que no llegaron. Probá de nuevo.',
      reintentar: 'Reintentar',
      monedas: 'Opera en', comprarle: 'Comprarle ORIGEN', venderle: 'Venderle ORIGEN',
      entrarOperar: 'Entrar para operar',

      fCantidad: 'Cantidad de ORIGEN', fMoneda: 'Moneda', fMonto: 'Monto fiat pactado',
      fMontoAyuda: 'Lo que van a mover de banco a banco, en la moneda elegida. Hasta dos decimales.',
      fBancoEntrada: 'Banco del agente (opcional)', fBancoCualquiera: 'El que el agente prefiera',
      fBancoSalida: 'Dónde te paga el agente', fBancoSalidaAyuda: 'Banco, número de cuenta y titular, tal como los necesita el agente para transferirte.',
      fPactado: 'pactado entre las partes', fPorOrigen: 'por ORIGEN',
      fGarantiaEntrada: 'Al abrir, el ORIGEN del agente queda reservado en garantía en el libro de la casa: lo que vas a recibir ya está apartado antes de que muevas un lempira.',
      fGarantiaSalida: 'Al abrir, TU ORIGEN queda reservado en garantía. El agente te paga a tu banco y, cuando confirmes que llegó, la garantía se le entrega.',
      fAbrir: 'Abrir la solicitud', fVolver: 'Volver', fAbriendo: 'Abriendo…',
      fAbierta: 'Solicitud abierta. El agente ya la ve.',
      eCantidad: 'La cantidad de ORIGEN no es válida: un número positivo, con hasta 18 decimales.',
      eMonto: 'El monto fiat no es válido: un número positivo, con hasta dos decimales.',
      eBanco: 'Falta decir banco, cuenta y titular donde el agente te paga.',
      entraPrimero: 'Para operar fiat hay que entrar con tu cuenta Veta Wallet.',

      refCargando: 'Trayendo la referencia…',
      refLinea: 'Referencia: 1 ORIGEN ≈ $', refRot: 'oro, gramo/55 — informativa; el precio lo pactan las partes',
      refSin: 'Sin referencia ahora: el feed no llegó. El precio lo pactan las partes igual.',

      sCargando: 'Trayendo tus solicitudes…',
      sVacio: 'No tenés solicitudes', sVacioP: 'Abrí una desde Comprar o Vender y acá seguís su vida entera.',
      sFallo: 'No pudimos traer tus solicitudes', sFalloP: 'No es que no haya: es que no llegaron. Probá de nuevo.',
      sEntraT: 'Esta pestaña pide tu cuenta', sEntraP: 'Las solicitudes son tuyas y de nadie más: hay que entrar para verlas.',
      entrar: 'Entrar con mi cuenta Veta Wallet',

      tCompra: 'Comprás ORIGEN', tVenta: 'Vendés ORIGEN',
      tMeCompran: 'Te compran ORIGEN', tMeVenden: 'Te venden ORIGEN',
      rolAgente: 'Actuás como agente',
      agente: 'Agente',
      estado: { abierta: 'Abierta', tomada: 'Tomada', 'fiat-avisado': 'Fiat avisado', liquidada: 'Liquidada', cancelada: 'Cancelada', disputa: 'En disputa' },
      qUsuario: 'el usuario', qAgente: 'el agente', qCasa: 'la casa', qAdmin: 'el admin',
      qFavUsuario: 'a favor del usuario', qFavAgente: 'a favor del agente',

      bancosT: 'Transferí al banco del agente', bancosP: 'Estos datos aparecen recién ahora porque el agente ya tomó tu solicitud.',
      cuentaT: 'Cuenta', titularT: 'Titular', copiar: 'Copiar', copiado: 'Copiado', copiarMal: 'No se pudo copiar; seleccioná y copiá a mano.',
      tePagaA: 'El agente te paga a', pagaleA: 'Pagale a',
      refBancaria: 'Referencia bancaria avisada',

      turnoTomar: 'Le toca al agente: tomar la solicitud (o cualquiera puede cancelarla).',
      turnoTomarYo: 'Te toca a vos: tomá la solicitud si el trato va en serio.',
      turnoAvisarYo: 'Te toca a vos: transferí el fiat y avisá con la referencia bancaria.',
      turnoAvisarOtro: 'Le toca a la otra punta: transferir el fiat y avisar con la referencia.',
      turnoConfirmarYo: 'Te toca a vos: si el pago te llegó, confirmalo — con eso se entrega la garantía.',
      turnoConfirmarOtro: 'Le toca a la otra punta: confirmar que el pago llegó.',
      turnoDisputa: 'La solicitud está en disputa: la resuelve la casa con la historia como expediente.',

      aTomar: 'Tomar', aAvisar: 'Avisé el pago', aConfirmar: 'Recibí el pago', aCancelar: 'Cancelar', aDisputar: 'Disputar',
      aRefPh: 'Referencia de la transferencia',
      aNotaPh: 'Contá qué pasó (queda en el expediente)',
      seguro: '¿Seguro?', si: 'Sí, seguí', no: 'No, volver',
      confirmarAviso: 'Confirmar entrega la garantía a la otra punta y no se deshace.',
      cancelarAviso: 'Cancelar libera la garantía a su dueño.',
      eReferencia: 'Falta la referencia de la transferencia: sin número, el aviso no compromete a nada.',
      tomada: 'Solicitud tomada.', avisada: 'Pago avisado.', confirmada: 'Pago confirmado: la garantía se entregó.',
      cancelada: 'Solicitud cancelada.', disputada: 'La solicitud quedó en disputa; la mira la casa.',
      historiaT: 'Historia',
    },
    en: {
      titulo: 'Fiat', sub: 'Cash in and out in lempiras or dollars, person to person, through verified agents.',
      legal: 'Fiat exchange happens between people with a verified Genesis ID identity. Ordenex holds the ORIGEN collateral in escrow and arbitrates if needed; fiat money travels bank to bank between the parties — the house never touches it.',
      tabComprar: 'Buy', tabVender: 'Sell', tabSolicitudes: 'My requests',

      comprarP: 'You buy ORIGEN with lempiras or dollars: pick an agent, agree on the amount, transfer to their bank and, once they confirm it arrived, the ORIGEN held in escrow moves to your balance.',
      venderP: 'You sell your ORIGEN for lempiras or dollars: pick an agent, your ORIGEN is held in escrow, the agent transfers to your bank and, once you confirm it arrived, the collateral is handed to them.',
      agCargando: 'Fetching agents…',
      agVacio: 'No active agents yet', agVacioP: 'Agents are onboarded by the house, one by one. Check back soon.',
      agFallo: 'We couldn’t fetch the agents', agFalloP: 'It’s not that there are none: they just didn’t arrive. Try again.',
      reintentar: 'Retry',
      monedas: 'Trades in', comprarle: 'Buy ORIGEN', venderle: 'Sell ORIGEN',
      entrarOperar: 'Sign in to trade',

      fCantidad: 'Amount of ORIGEN', fMoneda: 'Currency', fMonto: 'Agreed fiat amount',
      fMontoAyuda: 'What will move bank to bank, in the chosen currency. Up to two decimals.',
      fBancoEntrada: 'Agent’s bank (optional)', fBancoCualquiera: 'Whichever the agent prefers',
      fBancoSalida: 'Where the agent pays you', fBancoSalidaAyuda: 'Bank, account number and holder, exactly as the agent needs them to transfer to you.',
      fPactado: 'agreed between the parties', fPorOrigen: 'per ORIGEN',
      fGarantiaEntrada: 'On opening, the agent’s ORIGEN is held in escrow in the house ledger: what you’ll receive is set aside before you move a single lempira.',
      fGarantiaSalida: 'On opening, YOUR ORIGEN is held in escrow. The agent pays your bank and, once you confirm it arrived, the collateral is handed to them.',
      fAbrir: 'Open the request', fVolver: 'Back', fAbriendo: 'Opening…',
      fAbierta: 'Request opened. The agent can already see it.',
      eCantidad: 'The ORIGEN amount is not valid: a positive number, up to 18 decimals.',
      eMonto: 'The fiat amount is not valid: a positive number, up to two decimals.',
      eBanco: 'Missing the bank, account and holder where the agent pays you.',
      entraPrimero: 'To trade fiat you must sign in with your Veta Wallet account.',

      refCargando: 'Fetching the reference…',
      refLinea: 'Reference: 1 ORIGEN ≈ $', refRot: 'gold, gram/55 — informational; the price is agreed by the parties',
      refSin: 'No reference right now: the feed didn’t arrive. The price is still agreed by the parties.',

      sCargando: 'Fetching your requests…',
      sVacio: 'You have no requests', sVacioP: 'Open one from Buy or Sell and follow its whole life here.',
      sFallo: 'We couldn’t fetch your requests', sFalloP: 'It’s not that there are none: they just didn’t arrive. Try again.',
      sEntraT: 'This tab asks for your account', sEntraP: 'Requests are yours and no one else’s: sign in to see them.',
      entrar: 'Sign in with my Veta Wallet account',

      tCompra: 'You buy ORIGEN', tVenta: 'You sell ORIGEN',
      tMeCompran: 'They buy your ORIGEN', tMeVenden: 'They sell you ORIGEN',
      rolAgente: 'You act as the agent',
      agente: 'Agent',
      estado: { abierta: 'Open', tomada: 'Taken', 'fiat-avisado': 'Fiat notified', liquidada: 'Settled', cancelada: 'Cancelled', disputa: 'In dispute' },
      qUsuario: 'the user', qAgente: 'the agent', qCasa: 'the house', qAdmin: 'the admin',
      qFavUsuario: 'in favor of the user', qFavAgente: 'in favor of the agent',

      bancosT: 'Transfer to the agent’s bank', bancosP: 'These details show up only now because the agent has taken your request.',
      cuentaT: 'Account', titularT: 'Holder', copiar: 'Copy', copiado: 'Copied', copiarMal: 'Couldn’t copy; select and copy by hand.',
      tePagaA: 'The agent pays you at', pagaleA: 'Pay them at',
      refBancaria: 'Bank reference notified',

      turnoTomar: 'It’s the agent’s turn: take the request (or either side can cancel it).',
      turnoTomarYo: 'Your turn: take the request if the deal is on.',
      turnoAvisarYo: 'Your turn: transfer the fiat and notify with the bank reference.',
      turnoAvisarOtro: 'The other side’s turn: transfer the fiat and notify with the reference.',
      turnoConfirmarYo: 'Your turn: if the payment arrived, confirm it — that hands over the collateral.',
      turnoConfirmarOtro: 'The other side’s turn: confirm the payment arrived.',
      turnoDisputa: 'The request is in dispute: the house resolves it with the history as the case file.',

      aTomar: 'Take', aAvisar: 'I sent the payment', aConfirmar: 'I received the payment', aCancelar: 'Cancel', aDisputar: 'Dispute',
      aRefPh: 'Transfer reference',
      aNotaPh: 'Tell what happened (goes on the record)',
      seguro: 'Are you sure?', si: 'Yes, go ahead', no: 'No, back',
      confirmarAviso: 'Confirming hands the collateral to the other side and cannot be undone.',
      cancelarAviso: 'Cancelling releases the collateral back to its owner.',
      eReferencia: 'Missing the transfer reference: without a number, the notice commits to nothing.',
      tomada: 'Request taken.', avisada: 'Payment notified.', confirmada: 'Payment confirmed: the collateral was handed over.',
      cancelada: 'Request cancelled.', disputada: 'The request is now in dispute; the house is on it.',
      historiaT: 'History',
    },
  };
  const tx = () => TXT[idiomaActivo() === 'en' ? 'en' : 'es'];

  /* El estilo viaja con el módulo, igual que en portafolio.js: el módulo es
     un huésped en un cascarón que no escribe, y sus clases llegan con él. */
  const ESTILO = `<style>
    .ft-legal{font-size:12.5px;color:var(--bruma);line-height:1.65;padding:14px 18px;margin-bottom:20px}
    .ft-tabs{display:flex;gap:5px;border:1px solid var(--linea2);border-radius:100px;padding:5px;
      background:rgba(2,22,23,.55);width:max-content;max-width:100%;overflow-x:auto;margin-bottom:22px}
    .ft-tabs button{padding:9px 18px;border-radius:100px;font-size:13.5px;font-weight:700;
      color:var(--bruma);transition:.18s;white-space:nowrap}
    .ft-tabs button[aria-selected=true]{background:rgba(116,230,200,.14);color:var(--acento)}
    .ft-bancos{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
    .ft-banco{display:inline-flex;align-items:center;background:#F3ECD9;border-radius:8px;padding:4px 9px}
    .ft-banco img{height:14px;display:block}
    .ft-banco i{font-style:normal;font-size:11px;font-weight:700;color:#3A2C08}
    .ft-error{color:var(--coral);font-size:13px;line-height:1.55;margin:12px 0}
    .ft-ref{font-size:12px;color:var(--humo);line-height:1.6;margin:12px 0}
    .ft-pactado{font-size:12.5px;color:var(--oroLt);margin:12px 0;font-family:var(--mono)}
    .ft-nota{border:1px solid var(--linea2);background:rgba(201,169,97,.07);border-radius:var(--r);
      padding:12px 14px;font-size:12.5px;line-height:1.6;color:var(--bruma);margin:14px 0}
    .ft-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .ft-cab small{color:var(--humo);font-size:12px}
    .ft-montos{margin:12px 0;font-family:var(--mono);font-size:15px;font-variant-numeric:lining-nums tabular-nums}
    .ft-montos small{display:block;font-family:var(--sans);color:var(--humo);font-size:11.5px;margin-top:3px}
    .ft-pasos{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:13px 0;font-size:11.5px;font-weight:700}
    .ft-paso{padding:4px 11px;border-radius:100px;border:1px solid var(--linea2);color:var(--humo)}
    .ft-paso.hecho{background:rgba(201,169,97,.12);color:var(--oroLt);border-color:var(--linea)}
    .ft-paso.actual{background:rgba(116,230,200,.14);color:var(--acento);border-color:rgba(116,230,200,.4)}
    .ft-flecha{color:var(--humo)}
    .ft-datos{border:1px solid var(--linea);background:rgba(201,169,97,.08);border-radius:var(--r);
      padding:14px 16px;margin:13px 0}
    .ft-datos h4{font-size:13.5px;color:var(--oroLt);margin-bottom:2px}
    .ft-datos .pie{margin-bottom:8px}
    .ft-cuenta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;
      border-bottom:1px solid rgba(255,255,255,.06)}
    .ft-cuenta:last-child{border-bottom:0}
    .ft-cuenta .mono{font-size:13.5px}
    .ft-turno{font-size:12.5px;color:var(--bruma);margin:12px 0;line-height:1.6}
    .ft-acciones{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}
    .ft-acciones input{flex:1;min-width:180px;padding:11px 14px;background:var(--campo);
      border:1px solid var(--campoBr);border-radius:100px;font-size:13.5px;color:var(--crema)}
    .ft-acciones input:focus{outline:none;border-color:var(--oro);box-shadow:0 0 0 3px rgba(201,169,97,.14)}
    .ft-tl{margin-top:14px;padding-top:6px;border-top:1px solid rgba(255,255,255,.06)}
    .ft-tl h4{font-size:12px;color:var(--humo);text-transform:uppercase;letter-spacing:.08em;margin:8px 0 2px}
    .ft-tl-item{position:relative;padding:9px 0 9px 22px;font-size:12.5px;color:var(--bruma);line-height:1.55}
    .ft-tl-item::before{content:"";position:absolute;left:4px;top:15px;width:7px;height:7px;border-radius:50%;
      background:var(--oro);box-shadow:0 0 0 3px rgba(201,169,97,.15)}
    .ft-tl-item:not(:last-child)::after{content:"";position:absolute;left:7px;top:26px;bottom:-6px;width:1px;
      background:rgba(201,169,97,.2)}
    .ft-tl-item b{color:var(--crema);font-weight:600}
    .ft-tl-item small{display:block;color:var(--humo);font-size:11.5px;margin-top:2px}
    .ft-tl-item em{display:block;font-style:italic;color:var(--bruma);margin-top:3px}
  </style>`;

  // Los logos de los bancos hondureños — el rescate n.º 2 del contrato. La
  // clave se busca como subcadena del nombre normalizado (sin tildes, sin
  // mayúsculas): «Banco Atlántida» y «ATLANTIDA» encuentran el mismo logo.
  // Si el agente trabaja con un banco que no está acá, se pinta el nombre:
  // un banco sin logo sigue siendo un banco.
  const LOGOS_BANCOS = [
    ['atlantida', 'atlantida_logo.svg'],
    ['occidente', 'occidente_logo.svg'],
    ['ficohsa', 'ficohsa_logo.svg'],
    ['davivienda', 'davivienda_logo.svg'],
    ['banpais', 'banpais_logo.svg'],
    ['bac', 'bac_logo.svg'],
  ];
  function chipBanco(nombre) {
    const plano = String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hit = LOGOS_BANCOS.find(([clave]) => plano.includes(clave));
    return hit
      ? `<span class="ft-banco" title="${esc(nombre)}"><img src="assets/bancos/${hit[1]}" alt="${esc(nombre)}"></span>`
      : `<span class="ft-banco"><i>${esc(nombre)}</i></span>`;
  }

  const fecha = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleString(idiomaActivo() === 'en' ? 'en-US' : 'es-HN',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // ── la tabla de las dos puntas — copiada del servidor, no reinventada ─────
  // En una entrada el usuario paga el fiat y el agente lo recibe; en una
  // salida, el espejo. Todo «quién puede qué» de esta vista cuelga de aquí.
  const pagadorFiat = (tipo) => (tipo === 'entrada' ? 'usuario' : 'agente');
  const receptorFiat = (tipo) => (tipo === 'entrada' ? 'agente' : 'usuario');

  // ── el estado del módulo ──────────────────────────────────────────────────
  let carga = 0;              // sello de vigencia: una respuesta vieja no pinta
  let pestana = 'comprar';    // 'comprar' | 'vender' | 'solicitudes'
  let agentesCache = null;    // null = sin traer; [] = de verdad no hay
  let falloAgentes = false;
  let solicitudesCache = null;
  let falloSolicitudes = false;
  let refCache;               // undefined = sin traer; null = feed caído; {origenUsd}
  let abriendo = null;        // { tipo, agenteId } — el formulario abierto
  let enviando = false;
  let armada = null;          // { id, que } — acción esperando el «¿seguro?»
  let errorTarjeta = null;    // { id, msj } — el error del API, en su tarjeta
  let pararSondeo = null;     // el apagador del sondeo de solicitudes

  // ═══ LA VISTA ═════════════════════════════════════════════════════════════

  function vista() {
    const t = tx();
    return `${ESTILO}
      <div class="cab"><div><h2>${esc(t.titulo)}</h2><div class="sub">${esc(t.sub)}</div></div></div>
      <div class="vidrio ft-legal">${esc(t.legal)}</div>
      <div class="ft-tabs" role="tablist">
        ${botonTab('comprar', t.tabComprar)}
        ${botonTab('vender', t.tabVender)}
        ${botonTab('solicitudes', t.tabSolicitudes)}
      </div>
      <div id="ft-zona">${zonaHTML()}</div>`;
  }

  const botonTab = (cual, texto) =>
    `<button role="tab" aria-selected="${pestana === cual}" onclick="VFIAT.pestana(${jsTxt(cual)})">${esc(texto)}</button>`;

  function zonaHTML() {
    if (pestana === 'solicitudes') return zonaSolicitudes();
    return zonaAgentes(pestana === 'vender' ? 'salida' : 'entrada');
  }

  function pintarZona() {
    const el = document.getElementById('ft-zona');
    if (el) el.innerHTML = zonaHTML();
  }

  // ── comprar / vender: agentes y formulario ────────────────────────────────

  function zonaAgentes(tipo) {
    const t = tx();
    if (abriendo && abriendo.tipo === tipo) return formHTML();

    let lista;
    if (falloAgentes) {
      lista = `<div class="vacio"><b>${esc(t.agFallo)}</b>${esc(t.agFalloP)}<br><br>
        <button class="btn btn-linea btn-sm" onclick="VFIAT.recargar()">${esc(t.reintentar)}</button></div>`;
    } else if (!agentesCache) {
      lista = `<div class="vacio">${esc(t.agCargando)}</div>`;
    } else if (!agentesCache.length) {
      lista = `<div class="vacio"><b>${esc(t.agVacio)}</b>${esc(t.agVacioP)}</div>`;
    } else {
      // La lista pública del contrato: nombre, monedas y bancos como logos.
      // Ni un número de cuenta: esos aparecen recién con la solicitud tomada.
      lista = agentesCache.map((a) => `
        <div class="hilera">
          <div class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/></svg></div>
          <div class="txt"><b>${esc(a.nombre)}</b>
            <small>${esc(t.monedas)} ${esc((a.monedas || []).join(' · '))}</small>
            <div class="ft-bancos">${(a.bancos || []).map(chipBanco).join('')}</div>
          </div>
          <div>${DATOS.haySesion()
            ? `<button class="btn btn-linea btn-sm" onclick="VFIAT.abrir(${jsTxt(tipo)}, ${jsTxt(a.id)})">${esc(tipo === 'entrada' ? t.comprarle : t.venderle)}</button>`
            : `<button class="btn btn-linea btn-sm" onclick="ONX.entrar()">${esc(t.entrarOperar)}</button>`}
          </div>
        </div>`).join('');
    }

    return `
      <div class="vidrio bloque">
        <p class="pie">${esc(tipo === 'entrada' ? t.comprarP : t.venderP)}</p>
        <p class="ft-ref">${refLinea()}</p>
        ${lista}
      </div>`;
  }

  /* La referencia informativa, rotulada — regla n.º 2 de la casa: se enseña
     AL LADO del monto pactado, dice de dónde sale, y si el feed no llegó se
     dice eso, jamás un número inventado. El único flotante del archivo vive
     acá, y es un cartel, no un camino de dinero. */
  function refLinea() {
    const t = tx();
    if (refCache === undefined) return esc(t.refCargando);
    if (refCache === null || typeof refCache.origenUsd !== 'number') return esc(t.refSin);
    const v = refCache.origenUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return esc(t.refLinea) + esc(v) + ' USD · ' + esc(t.refRot);
  }

  function formHTML() {
    const t = tx();
    const tipo = abriendo.tipo;
    const a = (agentesCache || []).find((x) => x.id === abriendo.agenteId);
    if (!a) { abriendo = null; return zonaAgentes(tipo); }

    const banco = tipo === 'entrada'
      ? `<div class="campo"><label for="ft-banco">${esc(t.fBancoEntrada)}</label>
          <select id="ft-banco"><option value="">${esc(t.fBancoCualquiera)}</option>
            ${(a.bancos || []).map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
          </select></div>`
      : `<div class="campo"><label for="ft-banco">${esc(t.fBancoSalida)}</label>
          <input id="ft-banco" autocomplete="off" placeholder="Banco · 00-000-000000 · Nombre Apellido">
          <span class="ayuda">${esc(t.fBancoSalidaAyuda)}</span></div>`;

    return `
      <div class="vidrio bloque">
        <div class="ft-cab"><h3>${esc(tipo === 'entrada' ? t.comprarle : t.venderle)} — ${esc(a.nombre)}</h3>
          <div class="ft-bancos">${(a.bancos || []).map(chipBanco).join('')}</div></div>
        <div class="ft-nota">${esc(tipo === 'entrada' ? t.fGarantiaEntrada : t.fGarantiaSalida)}</div>
        <div class="campo"><label for="ft-cantidad">${esc(t.fCantidad)}</label>
          <input id="ft-cantidad" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0.0"
            oninput="VFIAT.pintarPactado()"></div>
        <div class="campo"><label for="ft-moneda">${esc(t.fMoneda)}</label>
          <select id="ft-moneda" onchange="VFIAT.pintarPactado()">
            ${(a.monedas || []).map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
          </select></div>
        <div class="campo"><label for="ft-monto">${esc(t.fMonto)}</label>
          <input id="ft-monto" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="2,500.00"
            oninput="VFIAT.pintarPactado()">
          <span class="ayuda">${esc(t.fMontoAyuda)}</span></div>
        ${banco}
        <p class="ft-pactado oculto" id="ft-pactado"></p>
        <p class="ft-ref">${refLinea()}</p>
        <p id="ft-error" class="ft-error oculto"></p>
        <button class="btn btn-oro btn-full" id="ft-abrir" onclick="VFIAT.enviarSolicitud()">${esc(t.fAbrir)}</button>
        <div style="height:10px"></div>
        <button class="btn btn-linea btn-full" onclick="VFIAT.cerrarForm()">${esc(t.fVolver)}</button>
      </div>`;
  }

  function abrir(tipo, agenteId) {
    const t = tx();
    if (!DATOS.haySesion()) { ONX.avisar(t.entraPrimero); return; }
    abriendo = { tipo, agenteId };
    pintarZona();
    document.getElementById('ft-cantidad')?.focus();
  }

  function cerrarForm() {
    if (enviando) return;
    abriendo = null;
    pintarZona();
  }

  /* El precio implícito del pacto, calculado en vivo y con BigInt: centavos
     por ORIGEN = montoCentavos × 1e18 / cantidadWei. Es aritmética de lo que
     las partes YA pactaron — no una cotización de la casa — y por eso va
     rotulado «pactado entre las partes». */
  function pintarPactado() {
    const el = document.getElementById('ft-pactado');
    if (!el) return;
    const t = tx();
    const cantidad = ONX.aWei(document.getElementById('ft-cantidad')?.value || '');
    const monto = aCentavos(document.getElementById('ft-monto')?.value || '');
    const moneda = document.getElementById('ft-moneda')?.value || 'HNL';
    if (cantidad == null || monto == null || BigInt(cantidad) <= 0n) {
      el.classList.add('oculto');
      return;
    }
    const porOrigen = (BigInt(monto) * 10n ** 18n) / BigInt(cantidad);
    el.textContent = `≈ ${simbolo(moneda)} ${deCentavos(porOrigen.toString())} ${t.fPorOrigen} · ${t.fPactado}`;
    el.classList.remove('oculto');
  }

  function errorForm(msj) {
    const el = document.getElementById('ft-error');
    if (!el) return;
    el.textContent = msj;
    el.classList.remove('oculto');
  }

  async function enviarSolicitud() {
    if (enviando || !abriendo) return;
    const t = tx();
    if (!DATOS.haySesion()) { ONX.avisar(t.entraPrimero); return; }

    const tipo = abriendo.tipo;
    const cantidad = ONX.aWei(document.getElementById('ft-cantidad')?.value || '');
    const moneda = document.getElementById('ft-moneda')?.value || '';
    const montoFiat = aCentavos(document.getElementById('ft-monto')?.value || '');
    const banco = String(document.getElementById('ft-banco')?.value || '').trim();

    if (cantidad == null || BigInt(cantidad) <= 0n) return errorForm(t.eCantidad);
    if (montoFiat == null) return errorForm(t.eMonto);
    if (tipo === 'salida' && !banco) return errorForm(t.eBanco);

    enviando = true;
    const boton = document.getElementById('ft-abrir');
    if (boton) { boton.disabled = true; boton.textContent = t.fAbriendo; }
    const mia = carga;
    try {
      await DATOS.crearSolicitud({
        tipo, agenteId: abriendo.agenteId, cantidad, moneda, montoFiat,
        ...(banco ? { banco } : {}),
      });
      enviando = false;
      if (mia !== carga) return;
      abriendo = null;
      ONX.avisar(t.fAbierta);
      // La solicitud recién nacida se sigue desde su pestaña: ahí vive su
      // línea de tiempo y ahí van a aparecer los datos bancarios al tomarse.
      irPestana('solicitudes');
    } catch (e) {
      enviando = false;
      if (mia !== carga) return;
      if (e?.codigo === 'SESION_VENCIDA') { ONX.avisar(e.message); ONX.vista('fiat'); return; }
      // El error del API en claro: sus mensajes ya explican qué pasó (el tope
      // de diligencia, la garantía del agente que no alcanza, la identidad
      // sin verificar) mejor que cualquier traducción nuestra.
      if (boton) { boton.disabled = false; boton.textContent = t.fAbrir; }
      errorForm(e?.message || String(e));
    }
  }

  // ── mis solicitudes ───────────────────────────────────────────────────────

  function zonaSolicitudes() {
    const t = tx();
    if (!DATOS.haySesion()) {
      return `<div class="vidrio bloque"><div class="vacio">
        <b>${esc(t.sEntraT)}</b>${esc(t.sEntraP)}<br><br>
        <button class="btn btn-oro" onclick="ONX.entrar()">${esc(t.entrar)}</button></div></div>`;
    }
    if (falloSolicitudes) {
      return `<div class="vidrio bloque"><div class="vacio"><b>${esc(t.sFallo)}</b>${esc(t.sFalloP)}<br><br>
        <button class="btn btn-linea btn-sm" onclick="VFIAT.recargar()">${esc(t.reintentar)}</button></div></div>`;
    }
    if (!solicitudesCache) return `<div class="vidrio bloque"><div class="vacio">${esc(t.sCargando)}</div></div>`;
    if (!solicitudesCache.length) {
      return `<div class="vidrio bloque"><div class="vacio"><b>${esc(t.sVacio)}</b>${esc(t.sVacioP)}</div></div>`;
    }
    return solicitudesCache.map(tarjetaSolicitud).join('');
  }

  function tarjetaSolicitud(s) {
    const t = tx();
    // El título habla desde la punta que mira: para el usuario una entrada es
    // «comprás»; para el agente, «te compran». El rol lo dice el servidor.
    const titulo = s.rol === 'agente'
      ? (s.tipo === 'entrada' ? t.tMeCompran : t.tMeVenden)
      : (s.tipo === 'entrada' ? t.tCompra : t.tVenta);
    const pill = { abierta: 'e-no', tomada: 'e-rev', 'fiat-avisado': 'e-rev', liquidada: 'e-ok', cancelada: 'e-no', disputa: 'e-mal' }[s.estado] || 'e-no';
    const porOrigen = precioPactado(s);
    const err = errorTarjeta && errorTarjeta.id === s.id ? `<p class="ft-error">${esc(errorTarjeta.msj)}</p>` : '';

    return `
      <div class="vidrio bloque">
        <div class="ft-cab">
          <h3>${esc(titulo)}</h3>
          <div><span class="estado ${pill}">${esc(t.estado[s.estado] || s.estado)}</span>
            <small> · ${esc(fecha(s.en))}</small></div>
        </div>
        ${s.rol === 'agente' ? `<p class="pie">${esc(t.rolAgente)}</p>` : (s.agente ? `<p class="pie">${esc(t.agente)}: ${esc(s.agente.nombre)}</p>` : '')}
        <div class="ft-montos">${esc(origen(s.cantidad))} ORIGEN ⇄ ${esc(simbolo(s.moneda))} ${esc(deCentavos(s.montoFiat))} ${esc(s.moneda)}
          ${porOrigen ? `<small>≈ ${esc(simbolo(s.moneda))} ${esc(porOrigen)} ${esc(t.fPorOrigen)} · ${esc(t.fPactado)}</small>` : ''}
        </div>
        ${pasosHTML(s)}
        ${bancosHTML(s)}
        ${s.referencia ? `<p class="pie">${esc(t.refBancaria)}: <span class="mono">${esc(s.referencia)}</span></p>` : ''}
        <p class="ft-turno">${esc(turno(s))}</p>
        ${err}
        ${accionesHTML(s)}
        ${historiaHTML(s)}
      </div>`;
  }

  function precioPactado(s) {
    try {
      const c = BigInt(s.cantidad), m = BigInt(s.montoFiat);
      if (c <= 0n || m <= 0n) return null;
      return deCentavos(((m * 10n ** 18n) / c).toString());
    } catch { return null; }
  }

  /* La tira de pasos: el camino feliz EXACTO del contrato — abierta → tomada
     → fiat-avisado → liquidada. Hasta dónde llegó se lee de la historia, no
     se adivina: en una cancelada o una disputa la tira enseña lo recorrido y
     la pastilla de estado dice en qué rama terminó. */
  const CAMINO = ['abierta', 'tomada', 'fiat-avisado', 'liquidada'];
  function pasosHTML(s) {
    const t = tx();
    let alcanzado = 0;
    for (const h of s.historia || []) {
      const i = CAMINO.indexOf(h.a);
      if (i > alcanzado) alcanzado = i;
    }
    const actual = CAMINO.indexOf(s.estado);
    return `<div class="ft-pasos">${CAMINO.map((p, i) => {
      const clase = i === actual ? 'actual' : i <= alcanzado ? 'hecho' : '';
      return (i ? '<span class="ft-flecha">→</span>' : '') +
        `<span class="ft-paso ${clase}">${esc(t.estado[p])}</span>`;
    }).join('')}</div>`;
  }

  /* Los datos bancarios completos. Los del AGENTE llegan del servidor SOLO
     cuando la solicitud está tomada (bancosAgente) — esta vista no los pide
     antes ni podría: el API no los da. Los del USUARIO en una salida viven en
     `banco` (los escribió él al abrir) y se le enseñan al agente, que es
     quien tiene que pagarle ahí. */
  function bancosHTML(s) {
    const t = tx();
    if (Array.isArray(s.bancosAgente) && s.bancosAgente.length) {
      return `<div class="ft-datos"><h4>${esc(t.bancosT)}</h4><p class="pie">${esc(t.bancosP)}</p>
        ${s.bancosAgente.map((b) => `<div class="ft-cuenta">
          ${chipBanco(b.banco)}
          <span class="mono">${esc(b.cuenta)}</span>
          <span class="pie">${esc(t.titularT)}: ${esc(b.titular)}</span>
          <button class="btn btn-linea btn-sm" onclick="VFIAT.copiar(${jsTxt(b.cuenta)})">${esc(t.copiar)}</button>
        </div>`).join('')}</div>`;
    }
    if (s.tipo === 'salida' && s.banco) {
      const quien = s.rol === 'agente' ? t.pagaleA : t.tePagaA;
      return `<div class="ft-datos"><h4>${esc(quien)}</h4>
        <div class="ft-cuenta"><span class="mono">${esc(s.banco)}</span></div></div>`;
    }
    return '';
  }

  // A quién le toca mover, dicho con nombre: la mitad de las disputas nacen
  // de dos personas esperándose mutuamente.
  function turno(s) {
    const t = tx();
    if (s.estado === 'abierta') return s.rol === 'agente' ? t.turnoTomarYo : t.turnoTomar;
    if (s.estado === 'tomada') return s.rol === pagadorFiat(s.tipo) ? t.turnoAvisarYo : t.turnoAvisarOtro;
    if (s.estado === 'fiat-avisado') return s.rol === receptorFiat(s.tipo) ? t.turnoConfirmarYo : t.turnoConfirmarOtro;
    if (s.estado === 'disputa') return t.turnoDisputa;
    return '';
  }

  /* Qué botones ve cada punta en cada estado — la MISMA tabla que aplica el
     servidor (fiatController): tomar solo el agente con la solicitud abierta;
     avisar solo quien paga el fiat, con referencia obligatoria; confirmar
     solo quien lo recibe; cancelar libre hasta tomada y, con el fiat ya
     avisado, solo quien dijo haberlo pagado; disputar cualquiera desde tomada.
     Pintar un botón que el servidor va a rechazar sería mentirle al usuario
     dos veces. */
  function accionesHTML(s) {
    const t = tx();
    const acciones = [];
    if (s.estado === 'abierta') {
      if (s.rol === 'agente') acciones.push('tomar');
      acciones.push('cancelar');
    } else if (s.estado === 'tomada') {
      if (s.rol === pagadorFiat(s.tipo)) acciones.push('avisar');
      acciones.push('cancelar', 'disputar');
    } else if (s.estado === 'fiat-avisado') {
      if (s.rol === receptorFiat(s.tipo)) acciones.push('confirmar');
      if (s.rol === pagadorFiat(s.tipo)) acciones.push('cancelar');
      acciones.push('disputar');
    }
    if (!acciones.length) return '';

    // El «¿seguro?» armado: confirmar entrega la garantía, cancelar la
    // libera y disputar congela — ninguno merece salir por un dedazo. El
    // segundo paso reemplaza la botonera entera para que no queden dos
    // caminos a la vista.
    if (armada && armada.id === s.id) {
      const que = armada.que;
      const aviso = que === 'confirmar' ? t.confirmarAviso : que === 'cancelar' ? t.cancelarAviso : '';
      const nota = que === 'disputar'
        ? `<input id="ft-nota-${esc(s.id)}" maxlength="300" placeholder="${esc(t.aNotaPh)}">` : '';
      return `<div class="ft-acciones">
        <span class="pie"><b>${esc(t.seguro)}</b> ${esc(aviso)}</span>${nota}
        <button class="btn btn-oro btn-sm" onclick="VFIAT.ejecutarArmada()">${esc(t.si)}</button>
        <button class="btn btn-linea btn-sm" onclick="VFIAT.desarmar()">${esc(t.no)}</button>
      </div>`;
    }

    const botones = acciones.map((que) => {
      if (que === 'avisar') {
        // El aviso lleva la referencia bancaria pegada: es la mitad de la
        // prueba en una disputa, y el servidor no acepta un aviso sin número.
        return `<input id="ft-ref-${esc(s.id)}" maxlength="140" placeholder="${esc(t.aRefPh)}">
          <button class="btn btn-oro btn-sm" onclick="VFIAT.avisarPago(${jsTxt(s.id)})">${esc(t.aAvisar)}</button>`;
      }
      if (que === 'tomar') {
        // Tomar no mueve dinero (la garantía ya está reservada desde que la
        // solicitud nació): va directo, sin «¿seguro?».
        return `<button class="btn btn-oro btn-sm" onclick="VFIAT.accion(${jsTxt(s.id)}, 'tomar')">${esc(t.aTomar)}</button>`;
      }
      const clase = que === 'confirmar' ? 'btn-oro' : 'btn-linea';
      const rotulo = que === 'confirmar' ? t.aConfirmar : que === 'cancelar' ? t.aCancelar : t.aDisputar;
      return `<button class="btn ${clase} btn-sm" onclick="VFIAT.armar(${jsTxt(s.id)}, ${jsTxt(que)})">${esc(rotulo)}</button>`;
    }).join('');
    return `<div class="ft-acciones">${botones}</div>`;
  }

  /* La historia como línea de tiempo — el expediente completo, siempre a la
     vista: quién movió cada estado y cuándo, con su nota. En una disputa esto
     es la evidencia; enseñarlo entero desde el primer día es lo que hace que
     nadie se sorprenda de que exista. De `quien` se pinta el ROL, nunca el
     id: el identificador interno de la otra punta no es asunto de nadie. */
  function historiaHTML(s) {
    const t = tx();
    const filas = (s.historia || []).map((h) => {
      const paso = h.de
        ? `${t.estado[h.de] || h.de} → ${t.estado[h.a] || h.a}`
        : (t.estado[h.a] || h.a);
      return `<div class="ft-tl-item"><b>${esc(paso)}</b>
        <small>${esc(quienLabel(h.quien))} · ${esc(fecha(h.en))}</small>
        ${h.nota ? `<em>«${esc(h.nota)}»</em>` : ''}</div>`;
    }).join('');
    return filas ? `<div class="ft-tl"><h4>${esc(t.historiaT)}</h4>${filas}</div>` : '';
  }

  function quienLabel(q) {
    const t = tx();
    const [rol, resto] = String(q || '').split(':');
    if (rol === 'usuario') return t.qUsuario;
    if (rol === 'agente') return t.qAgente;
    if (rol === 'casa') return t.qCasa;
    if (rol === 'admin') return t.qAdmin + (resto === 'usuario' ? ` · ${t.qFavUsuario}` : resto === 'agente' ? ` · ${t.qFavAgente}` : '');
    return rol || '—';
  }

  // ── las acciones contra el API ────────────────────────────────────────────

  function armar(id, que) {
    armada = { id, que };
    errorTarjeta = null;
    pintarZona();
  }

  function desarmar() {
    armada = null;
    pintarZona();
  }

  function ejecutarArmada() {
    if (!armada) return;
    const { id, que } = armada;
    let cuerpo;
    if (que === 'disputar') {
      const nota = String(document.getElementById('ft-nota-' + id)?.value || '').trim();
      if (nota) cuerpo = { nota };
    }
    armada = null;
    accion(id, que, cuerpo);
  }

  function avisarPago(id) {
    const t = tx();
    const referencia = String(document.getElementById('ft-ref-' + id)?.value || '').trim();
    if (!referencia) {
      errorTarjeta = { id, msj: t.eReferencia };
      pintarZona();
      return;
    }
    accion(id, 'avisar', { referencia });
  }

  async function accion(id, que, cuerpo) {
    if (enviando) return;
    const t = tx();
    enviando = true;
    errorTarjeta = null;
    const mia = carga;
    try {
      const d = await DATOS.accionSolicitud(id, que, cuerpo);
      enviando = false;
      if (mia !== carga) return;
      // La respuesta trae la solicitud ya movida: se reemplaza en la cache y
      // se repinta — sin esperar al sondeo, que la pantalla diga ya lo que
      // el servidor ya sabe.
      if (d?.solicitud && Array.isArray(solicitudesCache)) {
        solicitudesCache = solicitudesCache.map((s) => (s.id === d.solicitud.id ? d.solicitud : s));
      }
      pintarZona();
      ONX.avisar({ tomar: t.tomada, avisar: t.avisada, confirmar: t.confirmada, cancelar: t.cancelada, disputar: t.disputada }[que] || '');
    } catch (e) {
      enviando = false;
      if (mia !== carga) return;
      if (e?.codigo === 'SESION_VENCIDA') { ONX.avisar(e.message); ONX.vista('fiat'); return; }
      // El error del API en claro, en la tarjeta que lo causó. Y si el
      // estado ya no era el esperado, alguien más movió la solicitud: se
      // retrae la lista entera para pintar la verdad nueva.
      errorTarjeta = { id, msj: e?.message || String(e) };
      pintarZona();
      if (e?.codigo === 'ESTADO_INVALIDO' || e?.codigo === 'ESTADO_EN_DISPUTA') cargarSolicitudes();
    }
  }

  // ── las cargas ────────────────────────────────────────────────────────────

  async function cargarAgentes() {
    const mia = carga;
    try {
      const lista = await DATOS.agentes();
      if (mia !== carga || pestana === 'solicitudes') return;
      agentesCache = Array.isArray(lista) ? lista : [];
      falloAgentes = false;
    } catch {
      if (mia !== carga || pestana === 'solicitudes') return;
      // Se dice «no llegaron», no «no hay»: si había una lista vieja se deja.
      if (!agentesCache) falloAgentes = true;
    }
    pintarZona();
  }

  // La referencia es un cartel aparte: si su feed tropieza, los agentes se
  // pintan igual y la línea dice la verdad («sin referencia ahora»).
  async function cargarReferencia() {
    const mia = carga;
    try {
      const lista = await DATOS.mercados();
      if (mia !== carga) return;
      let origenUsd = null;
      for (const m of Array.isArray(lista) ? lista : []) {
        if (typeof m?.referencia?.origenUsd === 'number') { origenUsd = m.referencia.origenUsd; break; }
      }
      refCache = origenUsd == null ? null : { origenUsd };
    } catch {
      if (mia !== carga) return;
      refCache = null;
    }
    if (pestana !== 'solicitudes') pintarZona();
  }

  async function cargarSolicitudes({ suave = false } = {}) {
    if (!DATOS.haySesion()) return;
    /* El sondeo no pisa una mano ocupada: con una confirmación armada o un
       dedo dentro de un campo (la referencia a medio teclear), repintar
       sería borrarle lo escrito a la persona por traerle un dato que puede
       esperar quince segundos más. */
    if (suave) {
      const zona = document.getElementById('ft-zona');
      const foco = document.activeElement;
      if (armada || (zona && foco && zona.contains(foco) && (foco.tagName === 'INPUT' || foco.tagName === 'SELECT'))) return;
    }
    const mia = carga;
    try {
      const lista = await DATOS.solicitudes();
      if (mia !== carga || pestana !== 'solicitudes') return;
      solicitudesCache = Array.isArray(lista) ? lista : [];
      falloSolicitudes = false;
    } catch (e) {
      if (mia !== carga || pestana !== 'solicitudes') return;
      if (e?.codigo === 'SESION_VENCIDA') { ONX.avisar(e.message); ONX.vista('fiat'); return; }
      if (!solicitudesCache) falloSolicitudes = true;
    }
    pintarZona();
  }

  function cargarZona() {
    detenerSondeo();
    if (pestana === 'solicitudes') {
      /* Las solicitudes cambian por la mano de la OTRA punta: sin un sondeo
         suave, el usuario se queda mirando «tomada» cuando el agente ya
         confirmó. Quince segundos, solo con la pestaña visible (DATOS.sondeo
         ya lo garantiza), y el apagador queda guardado para apagar(). */
      if (DATOS.haySesion()) pararSondeo = DATOS.sondeo(() => cargarSolicitudes({ suave: true }), 15000);
    } else {
      cargarAgentes();
      cargarReferencia();
    }
  }

  function detenerSondeo() {
    if (pararSondeo) { pararSondeo(); pararSondeo = null; }
  }

  function irPestana(cual) {
    if (cual !== 'comprar' && cual !== 'vender' && cual !== 'solicitudes') return;
    pestana = cual;
    armada = null;
    abriendo = null;
    errorTarjeta = null;
    // Las pestañas del cascarón se repintan a mano porque el cambio de
    // pestaña no pasa por ONX.vista(): es navegación interna de la sala.
    document.querySelectorAll('#lienzo .ft-tabs [role=tab]').forEach((b, i) =>
      b.setAttribute('aria-selected', String(['comprar', 'vender', 'solicitudes'][i] === cual)));
    pintarZona();
    cargarZona();
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

  function recargar() {
    falloAgentes = false;
    falloSolicitudes = false;
    pintarZona();
    cargarZona();
  }

  // ═══ el contrato con app.js ═══════════════════════════════════════════════

  function alPintar() {
    cargarZona();
  }

  /* Idempotente, como exige el orquestador: el sondeo se apaga (su apagador
     también lo es), el sello de carga sube para enmudecer respuestas en
     vuelo, y lo transitorio — formulario abierto, «¿seguro?» armado — no
     sobrevive a la navegación. Las caches de datos sí quedan: al volver, la
     sala se pinta con lo último sabido mientras llega lo fresco. */
  function apagar() {
    detenerSondeo();
    carga++;
    enviando = false;
    armada = null;
    abriendo = null;
    errorTarjeta = null;
  }

  return {
    vista, alPintar, apagar,
    pestana: irPestana, abrir, cerrarForm, enviarSolicitud, pintarPactado,
    armar, desarmar, ejecutarArmada, avisarPago, accion, copiar, recargar,
  };
})();
