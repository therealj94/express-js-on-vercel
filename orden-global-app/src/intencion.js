// ═══ EL TRADUCTOR ══════════════════════════════════════════════════════
// Frase → una entrada del mapa. Gramática determinista, no adivinanza:
// cuatro verbos --abrir · enviar · cobrar · mostrar-- y las entidades salen
// de la libreta de contactos, nunca de la imaginación.
//
// El monto y el destinatario JAMÁS se inventan: si el nombre no está en la
// libreta se dice, y si el monto no se entendió se dice. Un asistente que
// rellena huecos con suposiciones es exactamente lo que no puede existir
// encima de una billetera.
//
// Sin imports: lo carga React Native y también la prueba de node tal cual.

export function sinTildes(x) {
  return String(x || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// El monto: un número con coma o punto, hasta dos decimales. Se exige que
// esté PEGADO al contexto de la frase de envío; "envía mil" no pasa --las
// cantidades en letras se rechazan a propósito: mejor pedir el número que
// arriesgar un oído de más--.
function sacarMonto(s) {
  const m = s.match(/(\d+(?:[.,]\d{1,2})?)/);
  return m ? m[1].replace(',', '.') : null;
}

/**
 * traducir(frase, contactos) → uno de:
 *   { ruta, params }          — entrada válida del mapa
 *   { falla: 'sinContacto' }  — el nombre no está en la libreta
 *   { falla: 'sinMonto' }     — envío sin cantidad clara
 *   null                      — fuera del mapa: se dice, no se intenta
 *
 * `contactos` = [{ nombre, correo, addr }] — la libreta real del chat.
 */
export function traducir(frase, contactos) {
  const s = ' ' + sinTildes(frase).trim() + ' ';
  if (s.trim() === '') return null;
  const lib = contactos || [];
  const buscar = () => lib.find((c) => c.nombre && s.includes(' ' + sinTildes(c.nombre) + ' ')
    || (c.nombre && s.includes(sinTildes(c.nombre))));

  // ── mandar un MENSAJE ──────────────────────────────────────────────
  // Va ANTES que el envío de dinero porque comparten verbo: «envíale un
  // mensaje a María» no es «envíale ORIGEN a María». El texto del mensaje
  // (si vino) se saca de la frase ORIGINAL --con mayúsculas y tildes--,
  // y el contacto se busca solo en la parte ANTERIOR al texto: así un
  // nombre mencionado DENTRO del mensaje no cambia el destinatario.
  if (/\b(envia(le|r|me)?|envio|manda(le|r)?|send)\b/.test(s)
      && /\b(mensaje|mensajito|message|text(o)?)\b/.test(s)) {
    const orig = String(frase || '');
    const m = orig.match(/[:：]\s*(.+)$/s)
      || orig.match(/\b(?:que\s+diga|que\s+dice|diciendo|saying|that\s+says)\s+(.+)$/is);
    const antes = ' ' + sinTildes(m ? orig.slice(0, m.index) : orig) + ' ';
    const quien = lib.find((c) => c.nombre && antes.includes(sinTildes(c.nombre)));
    if (!quien) return { falla: 'sinContacto' };
    const params = { con: quien.correo };
    const txt = m && m[1].trim();
    if (txt) params.txt = txt;
    return { ruta: 'chat/abrir', params };
  }

  // ── reporte de la billetera ────────────────────────────────────────
  // También antes que «enviar»: «envíame un reporte de mi billetera» es un
  // reporte, no un envío. Sin params: la pantalla lee la cuenta viva.
  if (/\b(reporte|resumen|report|summary)\b/.test(s)
      || /\bcomo (va|esta|anda|quedo) mi (billetera|cartera|cuenta|dinero|veta ?wallet|wallet)\b/.test(s)
      || /\bhow('s| is| are)? my (wallet|account|money) (doing|going)\b/.test(s)) {
    return { ruta: 'wallet/reporte', params: {} };
  }

  // ── enviar ─────────────────────────────────────────────────────────
  if (/\b(envia(le|r|me)?|envio|manda(le|r)?|transfiere(le)?|pasale|send|transfer|pay)\b/.test(s)
      && !/\b(cobra|charge)\b/.test(s)) {
    const quien = buscar();
    const monto = sacarMonto(s);
    if (!quien) return { falla: 'sinContacto' };
    if (!monto) return { falla: 'sinMonto' };
    return { ruta: 'wallet/enviar', params: { to: quien.addr || quien.correo, nombre: quien.nombre, amount: monto } };
  }

  // ── cobrar ─────────────────────────────────────────────────────────
  if (/\b(cobra(le|r)?|cobro|charge|collect)\b/.test(s)) {
    const monto = sacarMonto(s);
    return { ruta: 'pay/cobrar', params: monto ? { monto } : {} };
  }

  // ── chatear con alguien ────────────────────────────────────────────
  if (/\b(chat(ea|ear)?|escribe(le)?|habla(r)? con|message|text)\b/.test(s)) {
    const quien = buscar();
    return { ruta: 'chat/abrir', params: quien ? { con: quien.correo } : {} };
  }

  // ── abrir / mostrar: el destino sale de cómo se llama la cosa ──────
  const DEST = [
    [/veta ?wallet|billetera|cartera|wallet|mi dinero|my money|saldo|balance/, 'wallet/abrir'],
    [/my ?token ?pay|pasarela|punto de venta|negocio|comercio|merchant/, 'pay/abrir'],
    [/genesis|identidad|identity|verificar|kyc|pasaporte|passport/, 'id/abrir'],
    [/recib(e|ir)|mi direccion|receive|mi qr/, 'wallet/recibir'],
    [/tarjeta|card|visa/, 'wallet/tarjeta'],
    
    [/\bchat\b|mensajes|conversacion|messages/, 'chat/abrir'],
    [/asistente|assistant|ayuda|help|que puedes|what can you/, 'asistente/abrir'],
    [/actividad|movimientos|historial|activity/, 'wallet/actividad'],
    [/inicio|principal|home|volver|vuelve|back/, 'inicio'],
  ];
  const abre = /\b(abre(me)?|abrir|open|quiero (ver|ir|entrar|chatear)|muestra(me)?|show( me)?|ensename|llevame|ve a|go to|enseñame|vamos a|entra(r)? a|mis\b|my\b)\b/.test(s);
  for (const [re, ruta] of DEST) {
    if (re.test(s) && (abre || /^ *[a-z? ]{0,26}$/.test(s))) return { ruta, params: {} };
  }
  return null;
}

// Los ejemplos que enseña la pantalla del asistente: viven junto al traductor
// para que nunca se enseñe una frase que el traductor no entiende. La prueba
// de node comprueba exactamente eso.
export const EJEMPLOS = {
  es: ['quiero ver veta wallet', 'envía 15 a Juan', 'abre mytokenpay',
       'muéstrame mi tarjeta', 'quiero recibir', 'quiero chatear con María',
       'cóbrale 200', 'abre genesis id',
       'hazme un reporte de mi billetera', 'envíale un mensaje a María'],
  en: ['i want to see veta wallet', 'send 15 to Juan', 'open mytokenpay',
       'show me my card', 'i want to receive', 'chat with María',
       'charge 200', 'open genesis id',
       'give me a summary of my wallet', 'send a message to María'],
};
