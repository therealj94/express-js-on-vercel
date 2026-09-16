/* EL ARNÉS DEL AGENTE.
 *
 * El modelo (Qwen 3.8 27B) razona bien y llama mal. Si se le muestran
 * sesenta esquemas o se le pide que elija caja, a menudo ENUMERA el
 * catálogo y no corre nada. Internet y la bóveda «desaparecen» aunque
 * existan. Eso no se arregla cambiando el modelo: se arregla acá.
 *
 * El arnés hace tres cosas ANTES de que el modelo hable:
 *   1. Lee la intención del pedido (reglas, no otra llamada al nodo).
 *   2. Abre solo las cajas que hacen falta, para no hinchar el contexto.
 *   3. Si la intención es clara (buscá en internet, listá la bóveda,
 *      leé esta URL), CORRE la herramienta y le entrega el resultado.
 * El modelo escribe la respuesta. Las manos las mueve el arnés.
 */

const CAJA_POR_GRUPO = {
  internet: /\b(internet|google|duckduckgo|noticia|noticias|titular|web\b|busc[aáeé]|googlear|en l[ií]nea|qu[eé] se dice|precio|oro|gold|onza|plata|silver|xag|agka|auka|origen|cotiz|mercado)\b/i,
  boveda: /\b(b[oó]veda|secretos?|api[_ ]?keys?|llaves?|heroku var|credencial|elevenlabs|abrir la b[oó]veda|abr[ií] la b[oó]veda)\b/i,
  taller: /\b(repo|repositorio|c[oó]digo|archivo .+\.(js|ts|py|md)|le[eé] (el )?nodo|despleg|terminal|pull request|\bpr\b|patch)\b/i,
  documentos: /\b(pdf|documento|memor[aá]ndum|acta|informe|carta|exportar)\b/i,
  operaciones: /\b(heroku|dyno|reinici(ar|á)|aws|ec2|mongo|nodos? de la casa)\b/i,
  equipo: /\b(bots?|equipo|cronista|m[eé]dico|centinela|cerrajero)\b/i,
  salud: /\b(salud de ultron|bit[aá]cora|autorrepar|c[oó]mo est[aá]s vos)\b/i,
  cadenas: /\b(ordenex|origen\b|usdt|billetera|saldo de|cadena 5550|aucorp|genesis)\b/i,
  cuentas: /\b(cotiz|gasto en fichas|parte del d[ií]a|nube)\b/i,
  personas: /\b(qui[eé]n es qui[eé]n|junta directiva|miembros de la junta)\b/i,
  avisar: /\b(avis(a|á|ar) (a )?la junta|mand(a|á|ar).*(whatsapp|correo))\b/i,
  memoria: /\b(conversaciones viejas|olvid(a|á|ar) (esto|esa memoria)|qu[eé] hablamos de)\b/i,
};

const URL_RE = /https?:\/\/[^\s)>"']+/i;

const NOMBRES_HERRAMIENTA = [
  'buscar_web', 'leer_pagina', 'mas_herramientas', 'boveda_listar', 'boveda_aplicar',
  'repo_arbol', 'repo_leer', 'repo_buscar', 'pagina_entrar', 'pagina_foto',
  'crear_documento', 'estado_vivo', 'ordenex_caja', 'habilidad_usar',
];

function consultaDeInternet(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const m = t.match(
    /(?:busc[aáeé](?:r|me|lo|la)?(?:\s+en\s+(?:internet|la\s+web|google))?|google[aá]|mir[aá](?:r)?\s+en\s+internet|en\s+internet|qu[eé]\s+se\s+dice(?:\s+de|\s+sobre)?|noticias?\s+(?:de|sobre)|precio(?:\s+actual|\s+hoy|\s+ahora)?\s+de)\s*[:«"]?\s*(.+)$/i,
  );
  if (m) return m[1].replace(/[?.!]+$/g, '').trim().slice(0, 200);
  return t.slice(0, 200);
}

function planear(texto) {
  const t = String(texto || '').trim();
  const cajas = [];
  const forzar = [];
  const motivos = [];

  for (const [caja, re] of Object.entries(CAJA_POR_GRUPO)) {
    if (re.test(t) && !cajas.includes(caja)) cajas.push(caja);
  }

  const url = (t.match(URL_RE) || [])[0];
  if (url) {
    if (!cajas.includes('internet')) cajas.push('internet');
    forzar.push({ name: 'leer_pagina', arguments: { url } });
    motivos.push('hay una URL: se lee');
  } else if (CAJA_POR_GRUPO.internet.test(t) || /\b(busc[aáeé]|google|oro|gold|plata|silver|xag|agka|auka|precio)\b/i.test(t)) {
    if (!cajas.includes('internet')) cajas.push('internet');
    forzar.push({ name: 'buscar_web', arguments: { consulta: consultaDeInternet(t) } });
    motivos.push('pedido de internet: se busca');
  }
  const idArch = t.match(/\bid\s+([a-f0-9]{24})\b/i) || t.match(/\((id\s+)?([a-f0-9]{24})\)/i);
  if (/\b(le[eé]|mir[aá]|describ[ií]|archivo|imagen|foto|captura)\b/i.test(t) && idArch) {
    const id = idArch[1] || idArch[2];
    forzar.unshift({ name: 'leer_archivo', arguments: { id, pregunta: t.slice(0, 240) } });
    motivos.push('hay una imagen/archivo: se mira de verdad');
  } else if (/\b(esta imagen|esta foto|esta captura|mir[aá](?:ste)? la imagen)\b/i.test(t)) {
    forzar.unshift({ name: 'listar_archivos', arguments: {} });
    motivos.push('pidió la imagen: se listan archivos subidos');
  }

  if (/\b(auka|origen|ordenex|cotiz|agka)\b/i.test(t)) {
    if (!cajas.includes('cadenas')) cajas.push('cadenas');
    if (!cajas.includes('cuentas')) cajas.push('cuentas');
    if (!forzar.some((f) => f.name === 'estado_vivo')) forzar.push({ name: 'estado_vivo', arguments: {} });
    if (!forzar.some((f) => f.name === 'cotizar') && /\b(auka|origen|cotiz)\b/i.test(t)) {
      forzar.push({ name: 'cotizar', arguments: { monto: 1, sentido: 'venta' } });
    }
    motivos.push('precio de la casa: estado vivo + cotizar');
  }

  if (CAJA_POR_GRUPO.boveda.test(t)) {
    if (!cajas.includes('boveda')) cajas.push('boveda');
    forzar.push({ name: 'boveda_listar', arguments: {} });
    motivos.push('pedido de bóveda: se lista sin valores');
  }

  if (/\b(clima|tiempo)\b/i.test(t) && !forzar.some((f) => f.name === 'buscar_web')) {
    forzar.push({ name: 'clima', arguments: {} });
    motivos.push('pidió el clima');
  }

  const regla = [
    'ARNÉS: no enumerés herramientas ni cajas. No digas «puedo usar». No inventes que no hay internet o bóveda.',
    'Si ya hay un resultado de herramienta en este turno, contestá con ESO en palabras.',
    'Si hace falta otra mano, llamá UNA sola. Internet = buscar_web o leer_pagina. Secretos = boveda_listar (nunca el valor).',
    'Páginas que se dibujan con JavaScript: leer_pagina ya usa el navegador; pagina_foto si hay que VERLA; pagina_entrar solo para iniciar sesión (pide permiso).',
  ].join(' ');

  return {
    cajas,
    forzar,
    rescate: forzar.length ? forzar : (cajas.includes('internet') ? [{ name: 'buscar_web', arguments: { consulta: consultaDeInternet(t) } }] : []),
    motivo: motivos.join('; ') || (cajas.length ? `cajas: ${cajas.join(',')}` : 'sin forzar'),
    regla,
  };
}

function esCatalogo(texto) {
  const x = String(texto || '');
  if (!x.trim()) return false;
  const hits = NOMBRES_HERRAMIENTA.filter((n) => x.includes(n)).length;
  if (hits >= 3) return true;
  return /las cajas son|herramientas disponibles|puedo usar las siguientes|mas_herramientas|abr[ií] la caja/i.test(x)
    && hits >= 1;
}

function llamadasDe(plan) {
  return (plan.forzar || []).map((f, i) => ({
    id: `arnes_${i}`,
    type: 'function',
    function: { name: f.name, arguments: typeof f.arguments === 'string' ? f.arguments : JSON.stringify(f.arguments || {}) },
  }));
}

module.exports = { planear, esCatalogo, consultaDeInternet, llamadasDe, CAJA_POR_GRUPO };
