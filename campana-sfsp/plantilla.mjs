// Plantilla del primer correo de SFSP, en español e inglés.
//
// Un solo correo por contacto, sin adjuntos: el video y la presentación van como
// enlaces (regla del directorio). El botón de WhatsApp abre el chat con José con
// un primer mensaje ya escrito que dice quién escribe.
//
// Nada de «regulado», «licenciado» ni rendimientos: el pie repite el aviso de la
// presentación (protocolo en desarrollo, material informativo).

export const JOSE = {
  nombre: 'José Ordoñez',
  correo: 'j.ordonez@ordenglobal.org',
  whatsapp: '50432136457',
  whatsappVisible: '+504 3213-6457',
  web: 'https://ordenglobal.org',
};

export const VIDEO = 'https://youtu.be/pccKeU8rqm8';
// La miniatura la sirve YouTube; si el lector bloquea imágenes, queda el texto del enlace.
export const MINIATURA = 'https://img.youtube.com/vi/pccKeU8rqm8/hqdefault.jpg';

export const PRESENTACION = {
  es: process.env.PRESENTACION_ES || 'https://ordenglobal.org/sfsp/SFSP-Centroamerica-ES.pdf',
  en: process.env.PRESENTACION_EN || 'https://ordenglobal.org/sfsp/SFSP-Centroamerica-EN.pdf',
};

// Por qué le escribimos a cada quien, según su sector.
const RAZON = {
  es: {
    GOBIERNO: 'por el papel de {org} en la política económica de {pais}',
    REGULADOR: 'por el papel de {org} en la supervisión financiera de {pais}',
    BANCO: 'por el lugar de {org} en la banca de la región',
    FINTECH: 'por el trabajo de {org} en la innovación financiera',
    GREMIO: 'por el peso de {org} en el sector empresarial',
    'MINERÍA/ORO': 'por la experiencia de {org} con el oro y los recursos reales',
    INVERSION: 'por el trabajo de {org} en la inversión en la región',
    MULTILATERAL: 'por el papel de {org} en la integración regional',
    MEDIO: 'porque {org} sigue de cerca la economía de la región',
    TECNOLOGIA: 'por el trabajo de {org} en infraestructura digital',
    INFLUENCIA: 'por lo que {org} ha hecho por la comunidad',
    ACADEMIA: 'por el análisis económico que hace {org}',
  },
  en: {
    GOBIERNO: "because of {org}'s role in economic policy",
    REGULADOR: "because of {org}'s role in financial supervision",
    BANCO: "because of {org}'s place in the region's banking",
    FINTECH: "because of {org}'s work in financial innovation",
    GREMIO: "because of {org}'s weight in the business community",
    'MINERÍA/ORO': "because of {org}'s experience with gold and real assets",
    INVERSION: "because of {org}'s work investing in the region",
    MULTILATERAL: "because of {org}'s role in regional integration",
    MEDIO: 'because {org} follows the region\'s economy closely',
    TECNOLOGIA: "because of {org}'s work on digital infrastructure",
    INFLUENCIA: 'because of what {org} has built for its community',
    ACADEMIA: "because of {org}'s economic research",
  },
};

const TEXTO = {
  es: {
    asunto: '¿Y si le dijera que podemos unir a Centroamérica?',
    presentacion: 'Soy José Ordoñez, cofundador de Orden Global. Le escribo {razon}.',
    gancho: '¿Y si le dijera que podemos unir a Centroamérica?',
    problema: 'Hoy somos siete países: siete monedas, siete trámites y siete fronteras. En cada frontera perdemos tiempo, dinero y oportunidades.',
    propuesta: 'SFSP, el Protocolo de Sistema Financiero Social, propone que la región funcione como un solo mercado:',
    pilares: [
      ['Una identidad', 'verificada una vez, válida en los 7 países; usted decide qué muestra.'],
      ['Una moneda', 'referenciada al oro, pensada para emitirse contra recursos reales verificados y custodiados.'],
      ['Un comercio', 'pagar y recibir al instante, con una sola comisión mínima.'],
    ],
    soberania: 'Cada país conserva su soberanía; compartimos las reglas. Y no es una idea en papel: el protocolo ya está construido, con 15 series, 11 contratos inteligentes y 553 pruebas superadas.',
    video: 'Ver el video · 2 minutos',
    verPdf: 'Ver la presentación',
    cierre: 'Buscamos a los primeros países y aliados. Si esto llegó a usted, es porque está entre los primeros. ¿Conversamos 20 minutos?',
    whatsapp: 'Escribirme por WhatsApp',
    waMensaje: 'Hola José, recibí su correo sobre SFSP. Soy {quien}.',
    cargo: 'Cofundador, Orden Global',
    aviso: 'Protocolo en desarrollo. Material informativo; no constituye oferta de valores, inversión ni moneda.',
    baja: 'Si prefiere no recibir más correos, responda «no» y no volveremos a escribirle.',
  },
  en: {
    asunto: 'What if we could unite Central America?',
    presentacion: "I'm José Ordoñez, co-founder of Orden Global. I'm writing to you {razon}.",
    gancho: 'What if we could unite Central America?',
    problema: 'Today we are seven countries: seven currencies, seven sets of paperwork and seven borders. At every border we lose time, money and opportunities.',
    propuesta: 'SFSP, the Social Financial System Protocol, proposes that the region work as a single market:',
    pilares: [
      ['One identity', 'verified once, valid in all 7 countries; you decide what it shows.'],
      ['One currency', 'referenced to gold, designed to be issued against real, verified and custodied resources.'],
      ['One market', 'pay and get paid instantly, with a single minimal fee.'],
    ],
    soberania: 'Each country keeps its sovereignty; we share the rules. And this is not an idea on paper: the protocol is already built, with 15 series, 11 smart contracts and 553 tests passed.',
    video: 'Watch the film · 2 minutes, English subtitles',
    verPdf: 'View the presentation',
    cierre: 'We are looking for the first countries and partners. If this reached you, you are among the first. Could we talk for 20 minutes?',
    whatsapp: 'Message me on WhatsApp',
    waMensaje: 'Hi José, I received your email about SFSP. This is {quien}.',
    cargo: 'Co-founder, Orden Global',
    aviso: 'Protocol under development. Informational material; not an offer of securities, investment or currency.',
    baja: 'If you would rather not hear from us again, reply "no" and we will not write again.',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rellenar = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/**
 * El correo de un contacto. `c` es una fila de envios.csv:
 * { idioma, saludo, org, pais, sector, persona }.
 */
export function correo(c) {
  const idioma = c.idioma === 'ES' ? 'es' : 'en';
  const t = TEXTO[idioma];
  const org = c.org_corta || c.org;
  const razon = rellenar(RAZON[idioma][c.sector] || RAZON[idioma].GREMIO, { org, pais: c.pais });
  const quien = c.persona_real ? `${c.persona} (${org})` : org;
  const wa = `https://wa.me/${JOSE.whatsapp}?text=${encodeURIComponent(rellenar(t.waMensaje, { quien }))}`;
  const pdf = PRESENTACION[idioma];
  const intro = rellenar(t.presentacion, { razon });

  const texto = [
    c.saludo,
    '',
    intro,
    '',
    t.gancho,
    t.problema,
    '',
    t.propuesta,
    ...t.pilares.map(([a, b]) => `· ${a}: ${b}`),
    '',
    t.soberania,
    '',
    `${t.video}: ${VIDEO}`,
    `${t.verPdf}: ${pdf}`,
    '',
    t.cierre,
    `WhatsApp: ${JOSE.whatsappVisible} · ${wa}`,
    '',
    JOSE.nombre,
    t.cargo,
    `${JOSE.correo} · ${JOSE.whatsappVisible}`,
    JOSE.web.replace('https://', ''),
    '',
    '—',
    t.aviso,
    t.baja,
  ].join('\n');

  const oro = '#B8913A';
  const tinta = '#1A1712';
  const suave = '#5C554A';
  const boton = (href, txt, fondo, color) =>
    `<a href="${esc(href)}" style="display:inline-block;background:${fondo};color:${color};text-decoration:none;font:600 15px/1 Helvetica,Arial,sans-serif;padding:14px 22px;border-radius:6px;margin:0 8px 10px 0">${esc(txt)}</a>`;

  const html = `<!doctype html>
<html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.asunto)}</title></head>
<body style="margin:0;padding:0;background:#F1E9DC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1E9DC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF8;border-radius:10px;overflow:hidden">
<tr><td style="background:#0B0A08;padding:18px 28px;font:600 11px/1 'Courier New',monospace;letter-spacing:4px;color:${oro}">ORDEN GLOBAL · SFSP</td></tr>
<tr><td style="padding:28px 28px 8px;font:16px/1.6 Georgia,'Times New Roman',serif;color:${tinta}">
<p style="margin:0 0 16px">${esc(c.saludo)}</p>
<p style="margin:0 0 16px">${esc(intro)}</p>
<p style="margin:0 0 6px;font:italic 24px/1.3 Georgia,serif;color:${tinta}">${esc(t.gancho)}</p>
<p style="margin:0 0 16px;color:${suave}">${esc(t.problema)}</p>
<p style="margin:0 0 10px">${esc(t.propuesta)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
${t.pilares.map(([a, b], i) => `<tr><td valign="top" style="padding:6px 12px 6px 0;font:italic 16px/1.5 Georgia,serif;color:${oro}">0${i + 1}</td><td style="padding:6px 0;font:16px/1.5 Georgia,serif;color:${tinta}"><strong>${esc(a)}</strong>: ${esc(b)}</td></tr>`).join('\n')}
</table>
<p style="margin:0 0 20px">${esc(t.soberania)}</p>
</td></tr>
<tr><td style="padding:0 28px 8px">
<a href="${esc(VIDEO)}" style="text-decoration:none"><img src="${esc(MINIATURA)}" width="544" alt="${esc(t.video)}" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:8px;background:#0B0A08"></a>
<p style="margin:8px 0 18px;font:14px/1.4 Helvetica,Arial,sans-serif"><a href="${esc(VIDEO)}" style="color:${oro};font-weight:600">▶ ${esc(t.video)}</a></p>
${boton(pdf, t.verPdf, '#0B0A08', '#F1E9DC')}
</td></tr>
<tr><td style="padding:12px 28px 8px;font:16px/1.6 Georgia,serif;color:${tinta}">
<p style="margin:0 0 16px">${esc(t.cierre)}</p>
${boton(wa, t.whatsapp, '#25D366', '#FFFFFF')}
</td></tr>
<tr><td style="padding:16px 28px 24px;font:14px/1.5 Helvetica,Arial,sans-serif;color:${tinta}">
<strong>${esc(JOSE.nombre)}</strong><br>
<span style="color:${suave}">${esc(t.cargo)}</span><br>
<a href="mailto:${JOSE.correo}" style="color:${tinta}">${JOSE.correo}</a> · <a href="${esc(wa)}" style="color:${tinta}">${JOSE.whatsappVisible}</a><br>
<a href="${JOSE.web}" style="color:${oro}">ordenglobal.org</a>
</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #E6DDCC;font:12px/1.5 Helvetica,Arial,sans-serif;color:#8A8274">
${esc(t.aviso)}<br>${esc(t.baja)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { asunto: t.asunto, texto, html, idioma };
}
