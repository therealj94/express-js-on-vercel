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

// Los nombres van a parar dentro de una regex construida a mano: cualquier
// signo del nombre ("O'Neil", "J.R.") tiene que llegar como letra, no como
// operador.
function esc(x) {
  return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── RESPONDE A SU NOMBRE ──────────────────────────────────────────────────
// «Nexus, envía 15 a Juan» ES «envía 15 a Juan»: si la frase empieza con el
// nombre del asistente (el que la persona le puso, o el AU-RA de fábrica) se
// le quita antes de traducir. Se hace palabra a palabra sobre la frase
// ORIGINAL --con mayúsculas y tildes-- porque el texto de un mensaje dictado
// se saca de ahí y recortar sobre la copia pelada descuadraría los índices.
function sinNombre(frase, alias) {
  const candidatos = [];
  if (alias && String(alias).trim()) candidatos.push(sinTildes(alias).trim());
  candidatos.push('nexus');
  const palabras = String(frase).trim().split(/\s+/);
  for (const cand of candidatos) {
    const n = cand.split(/\s+/).length;
    const cabeza = sinTildes(palabras.slice(0, n).join(' ')).replace(/[,.:;!¡¿?]+$/, '');
    if (cabeza !== cand) continue;
    // el nombre solo no es una orden: se devuelve vacío y el de arriba dirá
    return palabras.slice(n).join(' ').replace(/^[,.:;!¡¿?]+\s*/, '');
  }
  return String(frase).trim();
}

// El monto: un número ANCLADO al verbo de dinero. El primer número suelto de
// la frase no vale --«envía a Juan lo de la mesa 12» NO es un envío de 12--:
// si entre el verbo y la cifra cabe media frase, mejor pedir el número limpio
// que arriesgar un oído de más. Y «1,000» / «1.000» son MIL, no un peso: los
// grupos de tres tras el separador son millares, no decimales.
function sacarMonto(s) {
  const m = s.match(
    /\b(?:envia(?:le|r|me)?|envio|manda(?:le|r)?|transfiere(?:le)?|pasale|send|transfer|pay|cobra(?:le|r)?|cobro|charge|collect|swap|cambia(?:r|me)?|convierte(?:me)?|intercambia(?:r)?)\b[^0-9]{0,20}(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/,
  );
  if (!m) return null;
  const tok = m[1];
  const millar = tok.match(/^(\d{1,3}(?:[.,]\d{3})+)(?:([.,])(\d{1,2}))?$/);
  if (millar) {
    const entero = millar[1].replace(/[.,]/g, '');
    return millar[3] ? entero + '.' + millar[3] : entero;
  }
  return tok.replace(',', '.');
}

// ── BUSCAR NEGOCIOS ──────────────────────────────────────────────────────
// «quiero arroz chino» abre el directorio de MyTokenPay ya filtrado. Las
// categorías son las REALES de src/og/pay/comerciosDemo.js (CATS): lo que
// tiene categoría se filtra por `cat`, y lo que es un plato o una palabra
// concreta («pizza», «china», «surf») viaja como búsqueda libre `q`, que
// ExplorarPay ya siembra en su caja. `et` es la etiqueta que AU-RA dice:
// «te llevo a los comercios de comida china».
const NEGOCIOS = [
  [/\b(comida china|arroz chino|chino|china|chinese)\b/, { q: 'china' }, { es: 'comida china', en: 'Chinese food' }],
  [/\bpizz(a|as|eria)\b/, { q: 'pizza' }, { es: 'pizza', en: 'pizza' }],
  [/\bsurf\b/, { q: 'surf' }, { es: 'surf', en: 'surf' }],
  [/\b(farmacia|medicinas?|clinica|doctor|medico|pharmacy|drugstore)\b/, { cat: 'salud' }, { es: 'salud', en: 'health' }],
  [/\b(cafes?|cafeterias?|capuchino|espresso|coffee)\b/, { cat: 'cafeterias' }, { es: 'café', en: 'coffee' }],
  [/\b(restaurantes?|comida|comer|almuerzo|almorzar|cena|cenar|desayunar|donde como|hambre|restaurants?|food|eat|lunch|dinner|hungry)\b/, { cat: 'restaurantes' }, { es: 'comida', en: 'food' }],
  [/\b(hotel(es)?|hospedaje|hostal|hostel|donde dormir)\b/, { cat: 'hoteles' }, { es: 'hoteles', en: 'hotels' }],
  [/\b(gimnasios?|gym|crossfit|fitness|entrenar)\b/, { cat: 'gimnasios' }, { es: 'gimnasios', en: 'gyms' }],
  [/\b(belleza|spa|salon|peluqueria|barberia|manicure|beauty)\b/, { cat: 'belleza' }, { es: 'belleza', en: 'beauty' }],
  [/\b(bar(es)?|discoteca|antro|copas|vida nocturna|nightlife)\b/, { cat: 'vida-nocturna' }, { es: 'vida nocturna', en: 'nightlife' }],
  [/\b(ropa|moda|zapatos|accesorios|fashion|clothes|clothing)\b/, { cat: 'moda' }, { es: 'moda', en: 'fashion' }],
  [/\b(celular(es)?|telefono|laptop|computadora|electronica|tecnologia|electronics|tech store)\b/, { cat: 'tecnologia' }, { es: 'tecnología', en: 'tech' }],
  [/\b(cursos?|academia|escuela|educacion|courses?)\b/, { cat: 'educacion' }, { es: 'educación', en: 'education' }],
  [/\b(taller|mecanico|llantas|automotriz|mechanic)\b/, { cat: 'automotriz' }, { es: 'talleres', en: 'auto shops' }],
  [/\b(tours?|turismo|excursion|paseo|buceo|catamaran|tourism)\b/, { cat: 'turismo' }, { es: 'turismo', en: 'tourism' }],
  [/\b(minimarket|abarrotes|conveniencia|tienda|convenience)\b/, { cat: 'conveniencia' }, { es: 'tiendas', en: 'stores' }],
];

/**
 * traducir(frase, contactos, alias) → uno de:
 *   { ruta, params }          — entrada válida del mapa
 *   { ruta, params, negocio } — ídem, con la etiqueta hablada del directorio
 *   { falla: 'sinContacto' }  — el nombre no está en la libreta
 *   { falla: 'sinMonto' }     — envío sin cantidad clara
 *   null                      — fuera del mapa: se dice, no se intenta
 *
 * `contactos` = [{ nombre, correo, addr }] — la libreta real del chat.
 * `alias` = el nombre del asistente, para quitárselo si la frase empieza así.
 */
export function traducir(frase, contactos, alias) {
  const orig = sinNombre(String(frase || ''), alias);
  const s = ' ' + sinTildes(orig).trim() + ' ';
  if (s.trim() === '') return null;
  const lib = contactos || [];

  // El contacto SOLO cuenta con bordes de palabra: «mándale 50 a Mariana»
  // con Ana en la libreta apuntaba el dinero a Ana, porque un substring sin
  // bordes encuentra «ana» dentro de «mariana». Y si dos nombres caben, gana
  // el MÁS LARGO (Mariana antes que Ana): el corto siempre cabe dentro del
  // largo, nunca al revés.
  const contiene = (pajar, nombre) => {
    const n = sinTildes(nombre).trim();
    if (!n) return false;
    return new RegExp('(^|[^a-z0-9])' + esc(n) + '($|[^a-z0-9])').test(pajar);
  };
  const buscar = (donde) => lib
    .filter((c) => c.nombre)
    .slice()
    .sort((a, b) => sinTildes(b.nombre).length - sinTildes(a.nombre).length)
    .find((c) => contiene(donde, c.nombre)) || null;

  // ── mandar un MENSAJE ──────────────────────────────────────────────
  // Va ANTES que el envío de dinero porque comparten verbo: «envíale un
  // mensaje a María» no es «envíale ORIGEN a María». El texto del mensaje
  // (si vino) se saca de la frase ORIGINAL --con mayúsculas y tildes--,
  // y el contacto se busca solo en la parte ANTERIOR al texto: así un
  // nombre mencionado DENTRO del mensaje no cambia el destinatario.
  if (/\b(envia(le|r|me)?|envio|manda(le|r)?|send)\b/.test(s)
      && /\b(mensaje|mensajito|message|text(o)?)\b/.test(s)) {
    const m = orig.match(/[:：]\s*(.+)$/s)
      || orig.match(/\b(?:que\s+diga|que\s+dice|diciendo|saying|that\s+says)\s+(.+)$/is);
    const antes = sinTildes(m ? orig.slice(0, m.index) : orig);
    const quien = buscar(antes);
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
    const quien = buscar(s);
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

  // ── swap: cambiar una moneda por otra ──────────────────────────────
  // Con o sin monto: la pantalla del swap se abre PREPARADA y ahí se firma,
  // igual que el envío. wallet/swap lleva firma:true en el mapa.
  if (/\b(swap|intercambia(r)?|convierte(me)?|cambia(r|me)?|convert|exchange)\b/.test(s)
      && !/\b(nombre|name|idioma|language|clave|contrasena|password)\b/.test(s)) {
    const monto = sacarMonto(s);
    return { ruta: 'wallet/swap', params: monto ? { amount: monto } : {} };
  }

  // ── chatear con alguien ────────────────────────────────────────────
  if (/\b(chat(ea|ear)?|escribe(le)?|habla(r)? con|message|text)\b/.test(s)) {
    const quien = buscar(s);
    return { ruta: 'chat/abrir', params: quien ? { con: quien.correo } : {} };
  }

  // ── buscar negocios ────────────────────────────────────────────────
  // Después de los verbos de dinero (que ya devolvieron) y antes del mapa
  // de abrir: «quiero arroz chino» o «una farmacia» no abren apps, abren el
  // directorio filtrado. La primera regla que encaja manda, por eso lo
  // concreto (china, pizza, surf) va antes que lo genérico (comida, tienda).
  for (const [re, params, et] of NEGOCIOS) {
    if (re.test(s)) return { ruta: 'pay/explorar', params: { ...params }, negocio: et };
  }

  // ── abrir / mostrar: el destino sale de cómo se llama la cosa ──────
  const DEST = [
    [/veta ?wallet|billetera|cartera|wallet|mi dinero|my money|saldo|balance/, 'wallet/abrir'],
    [/my ?token ?pay|pasarela|punto de venta|negocio|comercio|merchant/, 'pay/abrir'],
    [/genesis|identidad|identity|verificar|kyc|pasaporte|passport/, 'id/abrir'],
    [/recib(e|ir)|mi direccion|receive|mi qr/, 'wallet/recibir'],
    [/tarjeta|card|visa/, 'wallet/tarjeta'],
    [/ajustes|configuracion|preferencias|settings|preferences/, 'ajustes'],
    [/\bchat\b|mensajes|conversacion|messages/, 'chat/abrir'],
    // «ayuda» NO navega a ninguna parte: enseña los EJEMPLOS en la propia
    // hoja del asistente. Sacarte al tablero para decirte «aquí estoy» era
    // responder a una pregunta con una mudanza.
    [/\bayuda\b|\bhelp\b|que puedes|what can you/, 'asistente/ayuda'],
    [/asistente|assistant/, 'asistente/abrir'],
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
       'hazme un reporte de mi billetera', 'envíale un mensaje a María',
       'quiero comida china', 'búscame una farmacia',
       'envíale un mensaje a Juan que diga ya voy'],
  en: ['i want to see veta wallet', 'send 15 to Juan', 'open mytokenpay',
       'show me my card', 'i want to receive', 'chat with María',
       'charge 200', 'open genesis id',
       'give me a summary of my wallet', 'send a message to María',
       'i want chinese food', 'find me a pharmacy',
       'send Juan a message saying on my way'],
};

// ── LO MÁS PARECIDO ───────────────────────────────────────────────────────
// «No te entendí» y punto es una puerta cerrada: la persona no sabe si
// preguntó mal, si la app no sirve o si tiene que rendirse. Cuando el
// traductor devuelve null, esto busca entre los ejemplos QUE SÍ entiende los
// que más se parecen a lo que se dijo, y la hoja los enseña.
//
// Es tosco a propósito —palabras compartidas, sin diccionario ni modelo—
// porque tiene que caber aquí y correr en un teléfono barato sin pedirle nada
// a nadie. Si nada se parece lo bastante, devuelve los de siempre: nunca una
// lista vacía, que sería la misma puerta cerrada con más pasos.
export function masParecido(frase, lang, cuantos = 3) {
  const todos = EJEMPLOS[lang] || EJEMPLOS.es;
  const dichas = sinTildes(frase).split(/[^a-z0-9]+/).filter((x) => x.length > 2);
  if (!dichas.length) return todos.slice(0, cuantos);
  const puntos = (ej) => sinTildes(ej).split(/[^a-z0-9]+/).filter((x) => x.length > 2)
    .reduce((s, p) => s + dichas.reduce((t2, x) =>
      t2 + (p.startsWith(x) || x.startsWith(p) ? Math.min(p.length, x.length) : 0), 0), 0);
  const marcados = todos.map((ej) => ({ ej, pts: puntos(ej) }))
    .filter((o) => o.pts >= 3)
    .sort((a, b) => b.pts - a.pts);
  return (marcados.length ? marcados.map((o) => o.ej) : todos).slice(0, cuantos);
}
