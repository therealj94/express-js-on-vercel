// Envío de la campaña SFSP por Amazon SES, desde el correo de José.
//
//   node enviar.mjs vista                     escribe vista/<n>.html de cada contacto, no envía nada
//   node enviar.mjs prueba tu@correo.com [n]  manda el correo del contacto n (o el primero) a tu@correo.com
//   node enviar.mjs lote 1                    muestra quiénes van en el lote 1, no envía
//   node enviar.mjs lote 1 --confirmo         envía el lote 1 (uno cada 30 s)
//
// Variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (us-east-1 por defecto).
// El dominio ordenglobal.org está verificado en SES (SPF, DKIM, DMARC); el usuario IAM
// necesita ses:SendEmail para j.ordonez@ordenglobal.org.
//
// Nunca repite: cada envío queda en registro.jsonl y se salta. Quien pida no recibir más
// va a bajas.txt (un correo por línea) y no se le vuelve a escribir.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { leerCsv } from './depurar.mjs';
import { correo, JOSE, PRESENTACION, VIDEO } from './plantilla.mjs';

const aqui = new URL('.', import.meta.url).pathname;
const REMITENTE = `${JOSE.nombre} <${JOSE.correo}>`;
const PAUSA_MS = 30_000;
const REGISTRO = aqui + 'registro.jsonl';
const BAJAS = aqui + 'bajas.txt';

const leerLineas = (r) => (fs.existsSync(r) ? fs.readFileSync(r, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);
const yaEnviados = () => new Set(leerLineas(REGISTRO).map((l) => JSON.parse(l)).filter((x) => x.ok && !x.prueba).map((x) => x.correo));
const bajas = () => new Set(leerLineas(BAJAS).map((l) => l.toLowerCase()));

function peticionSes({ para, asunto, texto, html }) {
  const access = String(process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secret = String(process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  // «us east-1» también vale: así viene escrita en algún entorno.
  const region = String(process.env.AWS_REGION || 'us-east-1').trim().toLowerCase().replace(/\s+/g, '-');
  const host = `email.${region}.amazonaws.com`;
  const ruta = '/v2/email/outbound-emails';
  const cuerpo = JSON.stringify({
    FromEmailAddress: REMITENTE,
    Destination: { ToAddresses: [para] },
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
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const fecha = amzDate.slice(0, 8);
  const headers = { 'content-type': 'application/json', host, 'x-amz-date': amzDate };
  const firmadas = Object.keys(headers).sort();
  const canonica = ['POST', ruta, '', firmadas.map((k) => `${k}:${headers[k]}\n`).join(''), firmadas.join(';'), sha(cuerpo)].join('\n');
  const alcance = `${fecha}/${region}/ses/aws4_request`;
  const kFirma = hmac(hmac(hmac(hmac(`AWS4${secret}`, fecha), region), 'ses'), 'aws4_request');
  const firma = crypto.createHmac('sha256', kFirma).update(`AWS4-HMAC-SHA256\n${amzDate}\n${alcance}\n${sha(canonica)}`).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${access}/${alcance}, SignedHeaders=${firmadas.join(';')}, Signature=${firma}`;
  return { url: `https://${host}${ruta}`, headers, cuerpo };
}

async function mandar(m) {
  const p = peticionSes(m);
  const r = await fetch(p.url, { method: 'POST', headers: p.headers, body: p.cuerpo, signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  if (!r.ok) return { ok: false, detalle: `SES ${r.status}: ${t.slice(0, 200)}` };
  return { ok: true, id: JSON.parse(t || '{}').MessageId };
}

// Un correo con la presentación rota no se puede recoger: se comprueba antes de enviar.
// YouTube contesta 429 a las visitas automáticas; su oEmbed dice si el video es público.
async function enlacesVivos() {
  const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(VIDEO)}`;
  for (const url of [oembed, PRESENTACION.es, PRESENTACION.en]) {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) }).catch((e) => ({ ok: false, status: e.message }));
    if (!r.ok) throw new Error(`El enlace ${url} no responde (${r.status}). No se envía nada.`);
  }
}

const contactos = () => leerCsv(aqui + 'envios.csv');
const [modo, arg, extra] = process.argv.slice(2);

if (modo === 'vista') {
  fs.mkdirSync(aqui + 'vista', { recursive: true });
  const cs = contactos().filter((c) => c.correo && c.estado !== 'no_enviar');
  for (const c of cs) fs.writeFileSync(aqui + `vista/${c.n}.html`, correo(c).html);
  console.log(`${cs.length} vistas en vista/`);
} else if (modo === 'prueba') {
  if (!arg?.includes('@')) throw new Error('Uso: node enviar.mjs prueba tu@correo.com [n]');
  const c = contactos().find((x) => (extra ? x.n === extra.padStart(3, '0') : x.estado === 'enviar'));
  const m = correo(c);
  const r = await mandar({ para: arg, asunto: `[PRUEBA · #${c.n}] ${m.asunto}`, texto: m.texto, html: m.html });
  fs.appendFileSync(REGISTRO, JSON.stringify({ en: new Date().toISOString(), prueba: true, n: c.n, correo: arg, ...r }) + '\n');
  console.log(r.ok ? `Prueba de #${c.n} enviada a ${arg}` : r.detalle);
} else if (modo === 'lote') {
  const hechos = yaEnviados();
  const fuera = bajas();
  const cola = contactos().filter((c) => c.lote === arg && c.estado === 'enviar' && !hechos.has(c.correo) && !fuera.has(c.correo));
  console.log(`Lote ${arg}: ${cola.length} por enviar`);
  for (const c of cola) console.log(`  #${c.n} ${c.prior} ${c.idioma} ${c.correo} · ${c.saludo}`);
  if (extra !== '--confirmo') {
    console.log('\nNo se envió nada. Para enviar: node enviar.mjs lote ' + arg + ' --confirmo');
  } else {
    await enlacesVivos();
    for (const [i, c] of cola.entries()) {
      const m = correo(c);
      const r = await mandar({ para: c.correo, asunto: m.asunto, texto: m.texto, html: m.html }).catch((e) => ({ ok: false, detalle: e.message }));
      fs.appendFileSync(REGISTRO, JSON.stringify({ en: new Date().toISOString(), n: c.n, correo: c.correo, lote: arg, ...r }) + '\n');
      console.log(`${r.ok ? '✓' : '✗'} #${c.n} ${c.correo}${r.ok ? '' : ' · ' + r.detalle}`);
      if (i < cola.length - 1) await new Promise((ok) => setTimeout(ok, PAUSA_MS));
    }
  }
} else {
  console.log('Uso: node enviar.mjs vista | prueba tu@correo.com [n] | lote N [--confirmo]');
}
