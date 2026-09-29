// Del directorio (contactos.csv, sacado del PDF «SFSP · Directorio de contacto»)
// a la lista de envío (envios.csv).
//
//   node depurar.mjs
//
// Qué decide por cada contacto:
//  · estado: enviar | segunda_ola | no_enviar | sin_correo
//      - una sola persona por organización en la primera ola (el mismo texto a
//        siete personas del BCIE parece masivo); las demás quedan en segunda_ola;
//      - public-credentials@w3.org es una lista pública: lo que llega se publica.
//  · idioma: ES o EN (el portugués va en inglés, no hay versión PT).
//  · saludo: por nombre si llega a la persona; «A la atención de» si es un
//    buzón general; «equipo de» si no hay persona.
//  · lote: tandas de 30 (una hora de envío cada una), prioridad A primero.

import fs from 'node:fs';

const TANDA = 30;
const aqui = new URL('.', import.meta.url).pathname;

// CSV mínimo con comillas.
export function leerCsv(ruta) {
  const s = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '');
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (comillas) {
      if (ch === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0]) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...resto] = filas;
  return resto.map((f) => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])));
}

export function escribirCsv(ruta, filas, columnas) {
  const q = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  fs.writeFileSync(ruta, '﻿' + [columnas.join(','), ...filas.map((f) => columnas.map((k) => q(f[k])).join(','))].join('\n') + '\n');
}

const GENERICOS = new Set(['info', 'contacto', 'contact', 'contactenos', 'hola', 'mail', 'contato', 'asociacion', 'camara', 'comunicaciones', 'marketing', 'administracion', 'vinculaciones', 'say']);
const SOPORTE = new Set(['soporte', 'support', 'servicio.cliente', 'atencionalusuario', 'webmaster', 'servicios', 'cliente', 'consultas', 'seguimiento']);
const PRENSA = new Set(['press', 'prensa', 'media', 'redaccion', 'redaccionef', 'editor', 'ifcmedia']);
const LISTAS_PUBLICAS = new Set(['public-credentials@w3.org']);

export function tipoBuzon(correo) {
  const e = correo.toLowerCase();
  const [local, dominio] = e.split('@');
  if (LISTAS_PUBLICAS.has(e)) return 'lista pública';
  if (SOPORTE.has(local)) return 'soporte';
  if (dominio === 'gmail.com') return 'gmail';
  if (GENERICOS.has(local) || local === dominio.split('.')[0]) return 'genérico';
  if (PRENSA.has(local)) return 'prensa';
  if (/^[a-z]+\.?[a-z]+$/.test(local) && !/(invest|pitch|partner|member|director|presiden|fundacion|green|team|congres|americas|ri$|lms|bcci|cicr|secmca|fusades|amcham)/.test(local)) return 'personal';
  return 'área';
}

// «Contacto institucional», «Equipo de inversión», «Loomis International»… no son personas.
const NO_PERSONA = /^(contacto|institucional|equipo|redacci|prensa|press|media|organizaci|asociaci|associa|c[aá]mara|conferencia|direcci|relaci|alianzas|pitch|membership|corporate|programa|empresa|banco|secci|fundaci|comisi|federaci|red |mesa|editor|voice|bid |ifc|w3c|world|oficina|consejo|comunidad)/i;

export function esPersona(persona, org) {
  const p = persona.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (!p || NO_PERSONA.test(p)) return false;
  const palabras = p.split(/\s+/);
  if (palabras.length < 2 || palabras.length > 6) return false;
  if (!palabras.every((w) => /^[A-ZÁÉÍÓÚÑ][\p{L}.'-]*,?$/u.test(w) || /^(de|del|la|y|PhD|J\.)$/.test(w))) return false;
  const o = org.toLowerCase();
  return !palabras.some((w) => w.length > 3 && o.includes(w.toLowerCase().replace(/,$/, '')));
}

// «NexBridge Digital Financial Solutions (emisor registrado CNAD)» → «NexBridge Digital Financial Solutions».
// Las siglas entre paréntesis se quedan: «Banco Central de Reserva (BCR)».
export function orgCorta(org) {
  return org
    .split(' · ')[0]
    .replace(/\s*\(([^)]*)\)?/g, (m, dentro) => (/^[A-Z0-9 &.-]+$/.test(dentro.trim()) ? ` (${dentro.trim()})` : ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// Por el nombre si hay persona, aunque el buzón sea general: quien lo abre sabe a quién
// pasárselo, y un «A la atención de… Presidente…» suena a oficio. Sin persona no se inventa
// un destinatario: la primera línea del correo ya dice quién escribe y por qué.
function saludo(c) {
  const nombre = c.persona.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (c.idioma === 'ES') return c.persona_real ? `Buenos días, ${nombre}:` : 'Buenos días:';
  return c.persona_real ? `Dear ${nombre},` : 'Hello,';
}

// Mismo dominio pero otra organización: se escriben aparte.
const APARTE = new Map([['062', 'La Gremial de Minas es su propia gremial dentro de la CIG']]);

const RANGO_BUZON = { personal: 0, 'área': 1, prensa: 2, 'genérico': 3, gmail: 3, soporte: 4 };
const RANGO_PRIOR = { A: 0, B: 1, C: 2 };

export function depurar(contactos) {
  const filas = contactos.map((c) => {
    const correo = c.correo.trim().toLowerCase();
    const r = { ...c, correo, org_corta: orgCorta(c.org), idioma: c.idioma === 'ES' ? 'ES' : 'EN' };
    r.persona_real = esPersona(c.persona, c.org) ? 'sí' : '';
    r.tipo_buzon = correo ? tipoBuzon(correo) : '';
    r.estado = correo ? 'enviar' : 'sin_correo';
    r.motivo = correo ? '' : 'Sin correo publicado: LinkedIn, redes o formulario';
    if (c.idioma === 'PT') r.motivo = 'Portugués: va la versión en inglés';
    if (r.tipo_buzon === 'lista pública') { r.estado = 'no_enviar'; r.motivo = 'Lista de correo pública: el mensaje quedaría publicado'; }
    return r;
  });

  // Una por organización (mismo dominio, salvo gmail) en la primera ola.
  const porDominio = new Map();
  for (const r of filas) {
    if (r.estado !== 'enviar') continue;
    const d = r.correo.split('@')[1];
    if (d === 'gmail.com' || APARTE.has(r.n)) continue;
    if (!porDominio.has(d)) porDominio.set(d, []);
    porDominio.get(d).push(r);
  }
  for (const grupo of porDominio.values()) {
    if (grupo.length < 2) continue;
    // Para un medio, la redacción es la puerta correcta.
    grupo.sort((a, b) =>
      (RANGO_PRIOR[a.prior] - RANGO_PRIOR[b.prior]) ||
      (RANGO_BUZON[a.tipo_buzon] - RANGO_BUZON[b.tipo_buzon]) ||
      a.n.localeCompare(b.n));
    const [primero, ...resto] = grupo;
    for (const r of resto) { r.estado = 'segunda_ola'; r.motivo = `Misma organización que #${primero.n}: esperar su respuesta o escribirle con otro texto`; }
  }

  for (const r of filas) r.saludo = r.correo ? saludo(r) : '';

  // Tandas de 30: A primero, luego B y C, en el orden del directorio.
  const cola = filas.filter((r) => r.estado === 'enviar')
    .sort((a, b) => (RANGO_PRIOR[a.prior] - RANGO_PRIOR[b.prior]) || a.n.localeCompare(b.n));
  cola.forEach((r, i) => { r.lote = String(Math.floor(i / TANDA) + 1); });
  return filas;
}

export const COLUMNAS = ['n', 'lote', 'estado', 'motivo', 'prior', 'idioma', 'correo', 'tipo_buzon', 'saludo', 'persona', 'persona_real', 'cargo', 'org', 'org_corta', 'pais', 'sector', 'seccion', 'canales', 'fuente'];

if (process.argv[1] && new URL(import.meta.url).pathname === fs.realpathSync(process.argv[1])) {
  const filas = depurar(leerCsv(aqui + 'contactos.csv'));
  escribirCsv(aqui + 'envios.csv', filas, COLUMNAS);
  const cuenta = {};
  for (const r of filas) cuenta[r.estado] = (cuenta[r.estado] || 0) + 1;
  const lotes = new Set(filas.filter((r) => r.lote).map((r) => r.lote));
  console.log(`${filas.length} contactos:`, cuenta, `· ${lotes.size} tandas de hasta ${TANDA}`);
}
