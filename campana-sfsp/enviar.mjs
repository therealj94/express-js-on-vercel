// Envío de la campaña SFSP desde el buzón de José, poco a poco.
//
//   node enviar.mjs vista                        escribe vista/<n>.html de cada contacto, no envía nada
//   node enviar.mjs prueba tu@correo.com [n]     manda el correo del contacto n (o el primero) a tu@correo.com
//   node enviar.mjs cola [--max 30]              muestra los próximos por enviar, no envía
//   node enviar.mjs cola --max 30 --confirmo     los envía, a razón de POR_HORA (30 por defecto)
//
// Sale por el SMTP del buzón j.ordonez@ordenglobal.org (el servidor de correo del dominio, con su
// SPF y su DKIM), como cualquier correo que José escribe a mano. No sale por Amazon SES: esa cuenta
// está aprobada solo para correos de servicio a usuarios registrados de Veta y Genesis, y un correo
// en frío la pone en riesgo.
//
// Variables:
//  · SMTP_CLAVE (obligatoria): la contraseña del buzón.
//  · SMTP_HOST (mail.ordenglobal.org), SMTP_PUERTO (465), SMTP_USUARIO (j.ordonez@ordenglobal.org).
//  · POR_HORA (30): cuántos por hora. Entre uno y otro hay 3600/POR_HORA segundos, con ±20 % al azar
//    para que no parezca una máquina.
//  · COPIA_A: si se pone, cada correo va con copia oculta a esa dirección.
//
// Nunca repite: cada envío queda en registro.jsonl y se salta. Quien pida no recibir más va a
// bajas.txt (un correo por línea) y no se le vuelve a escribir.

import crypto from 'node:crypto';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { leerCsv } from './depurar.mjs';
import { correo, JOSE, PORTADA, PRESENTACION, VIDEO } from './plantilla.mjs';

const aqui = new URL('.', import.meta.url).pathname;
const REGISTRO = aqui + 'registro.jsonl';
const BAJAS = aqui + 'bajas.txt';
const POR_HORA = Math.max(1, Number(process.env.POR_HORA || 30));

const leerLineas = (r) => (fs.existsSync(r) ? fs.readFileSync(r, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);
const yaEnviados = () => new Set(leerLineas(REGISTRO).map((l) => JSON.parse(l)).filter((x) => x.ok && !x.prueba).map((x) => x.correo));
const bajas = () => new Set(leerLineas(BAJAS).map((l) => l.toLowerCase()));

let transporte;
function smtp() {
  if (!process.env.SMTP_CLAVE) throw new Error('Falta SMTP_CLAVE (la contraseña del buzón de José).');
  transporte ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.ordenglobal.org',
    port: Number(process.env.SMTP_PUERTO || 465),
    secure: Number(process.env.SMTP_PUERTO || 465) === 465,
    auth: { user: process.env.SMTP_USUARIO || JOSE.correo, pass: process.env.SMTP_CLAVE },
  });
  return transporte;
}

// TRANSPORTE=ses: por Amazon SES v2, firmado a mano (sin SDK), desde el mismo remitente.
// Decisión de José (28-sep): ir por SES a ritmo por hora, sabiendo que la cuenta se aprobó
// para correos de servicio. Si SES empieza a rebotar o quejarse, se para y se pasa a SMTP.
async function mandarSes({ para, asunto, texto, html }) {
  const region = String(process.env.AWS_REGION || 'us-east-1').trim().toLowerCase().replace(/\s+/g, '-');
  const host = `email.${region}.amazonaws.com`;
  const ruta = '/v2/email/outbound-emails';
  const cuerpo = JSON.stringify({
    FromEmailAddress: `${JOSE.nombre} <${JOSE.correo}>`,
    Destination: { ToAddresses: [para], ...(process.env.COPIA_A ? { BccAddresses: [process.env.COPIA_A] } : {}) },
    ReplyToAddresses: [JOSE.correo],
    Content: {
      Simple: {
        Subject: { Data: asunto, Charset: 'UTF-8' },
        Body: { Text: { Data: texto, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } },
        Headers: [{ Name: 'List-Unsubscribe', Value: `<mailto:${JOSE.correo}?subject=no>` }],
      },
    },
  });
  const sha = (d) => crypto.createHash('sha256').update(d).digest('hex');
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const amz = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const fecha = amz.slice(0, 8);
  const h = { 'content-type': 'application/json', host, 'x-amz-date': amz };
  if (process.env.AWS_SESSION_TOKEN) h['x-amz-security-token'] = process.env.AWS_SESSION_TOKEN;
  const firmadas = Object.keys(h).sort();
  const canonica = ['POST', ruta, '', firmadas.map((k) => `${k}:${h[k]}\n`).join(''), firmadas.join(';'), sha(cuerpo)].join('\n');
  const alcance = `${fecha}/${region}/ses/aws4_request`;
  const kFirma = hmac(hmac(hmac(hmac(`AWS4${process.env.AWS_SECRET_ACCESS_KEY}`, fecha), region), 'ses'), 'aws4_request');
  const firma = crypto.createHmac('sha256', kFirma).update(`AWS4-HMAC-SHA256\n${amz}\n${alcance}\n${sha(canonica)}`).digest('hex');
  h.authorization = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${alcance}, SignedHeaders=${firmadas.join(';')}, Signature=${firma}`;
  try {
    const r = await fetch(`https://${host}${ruta}`, { method: 'POST', headers: h, body: cuerpo, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    if (!r.ok) return { ok: false, detalle: `SES ${r.status}: ${t.slice(0, 200)}` };
    return { ok: true, id: JSON.parse(t || '{}').MessageId, via: 'ses' };
  } catch (e) {
    return { ok: false, detalle: String(e?.message || e).slice(0, 200) };
  }
}

const POR_SES = String(process.env.TRANSPORTE || '').toLowerCase() === 'ses';

async function mandar(m) {
  if (POR_SES) return mandarSes(m);
  const { para, asunto, texto, html } = m;
  try {
    const r = await smtp().sendMail({
      from: { name: JOSE.nombre, address: JOSE.correo },
      to: para,
      ...(process.env.COPIA_A ? { bcc: process.env.COPIA_A } : {}),
      subject: asunto,
      text: texto,
      html,
      headers: { 'List-Unsubscribe': `<mailto:${JOSE.correo}?subject=no>` },
    });
    return r.rejected?.length ? { ok: false, detalle: `rechazado: ${r.response}` } : { ok: true, id: r.messageId };
  } catch (e) {
    return { ok: false, detalle: String(e?.message || e).slice(0, 200) };
  }
}

// Un correo con la presentación rota no se puede recoger: se comprueba antes de enviar.
// YouTube contesta 429 a las visitas automáticas; su oEmbed dice si el video es público.
async function enlacesVivos() {
  const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(VIDEO)}`;
  for (const url of [oembed, PRESENTACION.es, PRESENTACION.en, PORTADA.es, PORTADA.en]) {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) }).catch((e) => ({ ok: false, status: e.message }));
    if (!r.ok) throw new Error(`El enlace ${url} no responde (${r.status}). No se envía nada.`);
  }
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pausa = () => (3600_000 / POR_HORA) * (0.8 + Math.random() * 0.4);

const contactos = () => leerCsv(aqui + 'envios.csv');
const args = process.argv.slice(2);
const modo = args[0];
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

if (modo === 'vista') {
  fs.mkdirSync(aqui + 'vista', { recursive: true });
  const cs = contactos().filter((c) => c.correo && c.estado !== 'no_enviar');
  for (const c of cs) fs.writeFileSync(aqui + `vista/${c.n}.html`, correo(c).html);
  console.log(`${cs.length} vistas en vista/`);
} else if (modo === 'prueba') {
  const para = args[1];
  if (!para?.includes('@')) throw new Error('Uso: node enviar.mjs prueba tu@correo.com [n]');
  const c = contactos().find((x) => (args[2] ? x.n === args[2].padStart(3, '0') : x.estado === 'enviar'));
  const m = correo(c);
  const r = await mandar({ para, asunto: `[PRUEBA · #${c.n}] ${m.asunto}`, texto: m.texto, html: m.html });
  fs.appendFileSync(REGISTRO, JSON.stringify({ en: new Date().toISOString(), prueba: true, n: c.n, correo: para, ...r }) + '\n');
  console.log(r.ok ? `Prueba de #${c.n} enviada a ${para}` : r.detalle);
} else if (modo === 'cola') {
  const max = Number(opcion('--max') || POR_HORA);
  const hechos = yaEnviados();
  const fuera = bajas();
  // El orden de los lotes: prioridad A primero.
  const cola = contactos()
    .filter((c) => c.estado === 'enviar' && !hechos.has(c.correo) && !fuera.has(c.correo))
    .sort((a, b) => Number(a.lote) - Number(b.lote) || a.n.localeCompare(b.n))
    .slice(0, max);
  const horas = (cola.length / POR_HORA).toFixed(1);
  console.log(`${cola.length} por enviar (${POR_HORA} por hora, unas ${horas} h):`);
  for (const c of cola) console.log(`  #${c.n} ${c.prior} ${c.idioma} ${c.correo} · ${c.saludo}`);
  if (!args.includes('--confirmo')) {
    console.log(`\nNo se envió nada. Para enviar: node enviar.mjs cola --max ${max} --confirmo`);
  } else {
    await enlacesVivos();
    if (!POR_SES) await smtp().verify();
    for (const [i, c] of cola.entries()) {
      const m = correo(c);
      const r = await mandar({ para: c.correo, asunto: m.asunto, texto: m.texto, html: m.html });
      fs.appendFileSync(REGISTRO, JSON.stringify({ en: new Date().toISOString(), n: c.n, correo: c.correo, ...r }) + '\n');
      console.log(`${new Date().toISOString().slice(11, 16)} ${r.ok ? '✓' : '✗'} #${c.n} ${c.correo}${r.ok ? '' : ' · ' + r.detalle}`);
      // Tres rechazos seguidos: algo anda mal con el buzón, no con los contactos.
      const ultimos = leerLineas(REGISTRO).slice(-3).map((l) => JSON.parse(l));
      if (ultimos.length === 3 && ultimos.every((x) => !x.ok && !x.prueba)) throw new Error('Tres fallos seguidos: se detiene el envío.');
      if (i < cola.length - 1) await esperar(pausa());
    }
  }
} else {
  console.log('Uso: node enviar.mjs vista | prueba tu@correo.com [n] | cola [--max N] [--confirmo]');
}
