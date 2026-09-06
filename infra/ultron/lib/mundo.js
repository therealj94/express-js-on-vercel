/* EL MUNDO DE AFUERA: la hora y el clima.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * José se lo pidió a ULTRON en el iPad —«el clima de la isla Roatán y la
 * hora»— y ULTRON no pudo. La hora la tenía en el prompt pero solo la del
 * arranque del turno, y el clima no existía. Dos preguntas que cualquiera le
 * hace a un asistente el primer día.
 *
 * ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
 * Open-Meteo: sin llave, sin cuenta y sin límite práctico para lo que la casa
 * usa. Se pide el lugar por nombre a su geocodificador y el tiempo a su API.
 * Los dos son públicos: no hay ningún secreto que guardar ni que rotar.
 *
 * ── LA REGLA DE SIEMPRE ─────────────────────────────────────────────────────
 * Ninguna cifra se inventa. Si la lectura no llegó, se dice que no llegó. Y se
 * dice SIEMPRE la hora del dato y de dónde viene: un pronóstico sin hora es un
 * pronóstico de cualquier día.
 */

const LUGARES_DE_LA_CASA = {
  /* Los sitios que importan en Orden Global, con sus coordenadas fijas: así no
     se gasta una llamada al geocodificador ni se corre el riesgo de que
     devuelva el Roatán de otro país. */
  roatan: { nombre: 'Roatán, Islas de la Bahía, Honduras', lat: 16.3229, lon: -86.53605, zona: 'America/Tegucigalpa' },
  tegucigalpa: { nombre: 'Tegucigalpa, Honduras', lat: 14.0723, lon: -87.1921, zona: 'America/Tegucigalpa' },
  'san pedro sula': { nombre: 'San Pedro Sula, Honduras', lat: 15.5042, lon: -88.0250, zona: 'America/Tegucigalpa' },
  'la ceiba': { nombre: 'La Ceiba, Honduras', lat: 15.7597, lon: -86.7822, zona: 'America/Tegucigalpa' },
  utila: { nombre: 'Utila, Islas de la Bahía, Honduras', lat: 16.0997, lon: -86.8958, zona: 'America/Tegucigalpa' },
  guanaja: { nombre: 'Guanaja, Islas de la Bahía, Honduras', lat: 16.4553, lon: -85.8917, zona: 'America/Tegucigalpa' },
};

/* Los códigos de tiempo de la OMM, en castellano y sin adornos. */
const CIELO = {
  0: 'despejado', 1: 'casi despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'niebla', 48: 'niebla con escarcha',
  51: 'llovizna débil', 53: 'llovizna', 55: 'llovizna fuerte',
  56: 'llovizna helada', 57: 'llovizna helada fuerte',
  61: 'lluvia débil', 63: 'lluvia', 65: 'lluvia fuerte',
  66: 'lluvia helada', 67: 'lluvia helada fuerte',
  71: 'nieve débil', 73: 'nieve', 75: 'nieve fuerte', 77: 'granizo fino',
  80: 'chubascos débiles', 81: 'chubascos', 82: 'chubascos fuertes',
  85: 'chubascos de nieve', 86: 'chubascos de nieve fuertes',
  95: 'tormenta eléctrica', 96: 'tormenta con granizo', 99: 'tormenta con granizo fuerte',
};
const cielo = (c) => CIELO[c] || `código ${c}`;

const llano = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function pedir(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'ULTRON-FP (Orden Global)' } });
  if (!r.ok) throw Object.assign(new Error(`el servicio del tiempo contestó ${r.status}`), { codigo: 'CLIMA' });
  return r.json();
}

/** Un lugar: primero los de la casa, y si no, el geocodificador. */
async function buscarLugar(texto) {
  const k = llano(texto).replace(/^(isla|la isla|ciudad de|el|la) /, '');
  for (const [clave, l] of Object.entries(LUGARES_DE_LA_CASA)) {
    if (k === clave || k.includes(clave) || clave.includes(k)) return l;
  }
  /* Si el geocodificador no se puede alcanzar —sin red, el servicio caído— se
     dice ESO y no «no existe ese lugar»: mandar a alguien a corregir el nombre
     de un sitio que sí existe es peor que no contestar. */
  let d;
  try { d = await pedir(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(texto)}&count=1&language=es`); }
  catch (e) { throw Object.assign(new Error(`No se pudo buscar «${texto}»: ${e.message}. Los sitios de la casa (Roatán, Tegucigalpa, San Pedro Sula, La Ceiba, Utila, Guanaja) no dependen de esto.`), { codigo: 'SIN_BUSCADOR' }); }
  const r = (d.results || [])[0];
  if (!r) throw Object.assign(new Error(`No encontré ningún lugar llamado «${texto}».`), { codigo: 'SIN_LUGAR' });
  return {
    nombre: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude, zona: r.timezone || 'UTC',
  };
}

/**
 * El tiempo de un lugar: ahora y los próximos días.
 * Devuelve texto listo para leer en voz alta.
 */
async function clima({ lugar = 'Roatán', dias = 3 } = {}) {
  const l = await buscarLugar(lugar);
  const n = Math.min(7, Math.max(1, Number(dias) || 3));
  const d = await pedir(`https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
    + `&timezone=${encodeURIComponent(l.zona)}&forecast_days=${n}`);

  const c = d.current || {};
  const lineas = [
    `${l.nombre} · ahora (${c.time || 'sin hora'}, hora del lugar):`,
    `  ${Math.round(c.temperature_2m)} °C, se sienten ${Math.round(c.apparent_temperature)} °C · ${cielo(c.weather_code)}`
    + ` · humedad ${c.relative_humidity_2m} % · viento ${Math.round(c.wind_speed_10m)} km/h`
    + (c.precipitation > 0 ? ` · lloviendo (${c.precipitation} mm)` : ''),
  ];
  const dd = d.daily || {};
  if (dd.time?.length) {
    lineas.push('', 'Los próximos días:');
    for (let i = 0; i < dd.time.length; i++) {
      lineas.push(`  ${dd.time[i]} · ${Math.round(dd.temperature_2m_min[i])} a ${Math.round(dd.temperature_2m_max[i])} °C`
        + ` · ${cielo(dd.weather_code[i])} · probabilidad de lluvia ${dd.precipitation_probability_max[i] ?? '?'} %`);
    }
  }
  lineas.push('', 'Fuente: Open-Meteo, leído ahora. Es un pronóstico, no una certeza.');
  return lineas.join('\n');
}

/**
 * La hora. Siempre la de Honduras, y la del lugar que se pida si es otro.
 * Sin llamar a nadie: el reloj del servidor con la zona correcta.
 */
function hora({ lugar = null } = {}) {
  const fmt = (zona) => new Date().toLocaleString('es-HN', { timeZone: zona, dateStyle: 'full', timeStyle: 'medium' });
  const lineas = [`Honduras (Tegucigalpa): ${fmt('America/Tegucigalpa')}`];
  if (lugar) {
    const k = llano(lugar);
    const dela = Object.entries(LUGARES_DE_LA_CASA).find(([c]) => k.includes(c));
    /* Las de la casa comparten zona con Tegucigalpa: no se repite la misma
       hora dos veces con dos nombres, que confunde más de lo que aclara. */
    if (dela && dela[1].zona === 'America/Tegucigalpa') lineas.push(`${dela[1].nombre} está en la misma zona horaria.`);
    else {
      const zona = ZONAS[k] || lugar;
      try { lineas.push(`${lugar}: ${fmt(zona)}`); }
      catch { lineas.push(`No conozco la zona horaria de «${lugar}».`); }
    }
  }
  lineas.push('UTC: ' + new Date().toISOString().replace('T', ' ').slice(0, 19));
  return lineas.join('\n');
}

/* Las zonas que la casa toca de verdad. Lo que no está aquí se intenta tal
   cual —«Europe/Madrid» funciona— y si no, se dice que no se conoce. */
const ZONAS = {
  'nueva york': 'America/New_York', 'new york': 'America/New_York', miami: 'America/New_York',
  madrid: 'Europe/Madrid', espana: 'Europe/Madrid', londres: 'Europe/London',
  'ciudad de mexico': 'America/Mexico_City', mexico: 'America/Mexico_City',
  panama: 'America/Panama', bogota: 'America/Bogota', dubai: 'Asia/Dubai',
  singapur: 'Asia/Singapore', tokio: 'Asia/Tokyo', 'hong kong': 'Asia/Hong_Kong',
  'los angeles': 'America/Los_Angeles', chicago: 'America/Chicago',
};

module.exports = { clima, hora, buscarLugar, LUGARES_DE_LA_CASA, ZONAS, _adentro: { cielo, llano, pedir } };
