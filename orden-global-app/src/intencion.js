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

  // ── enviar ─────────────────────────────────────────────────────────
  if (/\b(envia(le|r|me)?|envio|manda(le|r)?|transfiere(le)?|pasale|send|transfer|pay)\b/.test(s)
      && !/\b(cobra|charge)\b/.test(s)) {
    const quien = buscar();
    const monto = sacarMonto(s);
    if (!quien) return { falla: 'sinContacto' };
    if (!monto) return { falla: 'sinMonto' };
    return { ruta: 'wallet/enviar', params: { to: quien.addr || quien.correo, nombre: quien.nombre, monto } };
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
    [/explorador|explorer|ordenscan|scan\b|bloque|block|transaccion|transaction|hash/, 'scan/abrir'],
    [/cerebro|brain|neuronas?|neurons?|agentes|la red\b/, 'cerebro/abrir'],
    [/\bchat\b|mensajes|conversacion|messages/, 'chat/abrir'],
    [/asistente|assistant|ayuda|help|que puedes|what can you/, 'asistente/abrir'],
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
       'muéstrame el explorador', 'abre el cerebro', 'quiero chatear con María',
       'cóbrale 200', 'abre genesis id'],
  en: ['i want to see veta wallet', 'send 15 to Juan', 'open mytokenpay',
       'show me the explorer', 'open the brain', 'chat with María',
       'charge 200', 'open genesis id'],
};
