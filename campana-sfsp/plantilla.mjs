// Plantilla del primer correo de SFSP, en español e inglés.
//
// Corto a propósito. Lo primero que se ve es la portada del video, y después cuatro
// párrafos: quién escribe, qué es, qué significa para quien lo lee (una frase por sector)
// y una pregunta concreta. Pocos enlaces, una sola imagen alojada en ordenglobal.org (el
// mismo dominio que envía) y nada de adjuntos: así se lee como un correo de persona a
// persona y no como publicidad.
//
// Nada de «regulado», «licenciado» ni rendimientos: el pie repite el aviso de la
// presentación (protocolo en desarrollo, material informativo).

export const JOSE = {
  nombre: 'José Ordoñez',
  correo: 'j.ordonez@ordenglobal.org',
  whatsapp: '50432136457',
  whatsappVisible: '+504 3213-6457',
  web: 'https://ordenglobal.org',
  // La dirección que publica el sitio; un correo comercial tiene que decir de dónde sale.
  empresa: 'Orden Global Corp · British Columbia, Canadá · Roatán Próspera, Honduras',
};

export const VIDEO = 'https://youtu.be/pccKeU8rqm8';

// La portada del video con el botón de reproducir, servida desde ordenglobal.org: la
// miniatura de YouTube la bloquean muchos lectores de correo.
export const PORTADA = {
  es: 'https://www.ordenglobal.org/sfsp/video-es.jpg',
  en: 'https://www.ordenglobal.org/sfsp/video-en.jpg',
};

export const PRESENTACION = {
  es: process.env.PRESENTACION_ES || 'https://www.ordenglobal.org/sfsp/SFSP-Centroamerica-ES.pdf',
  en: process.env.PRESENTACION_EN || 'https://www.ordenglobal.org/sfsp/SFSP-Centroamerica-EN.pdf',
};

// Qué significa SFSP para quien lo lee, según su sector. No nombra a la organización
// (así no hay que adivinar «el» o «la») y no promete nada que dependa de una licencia.
const PARA_USTED = {
  es: {
    GOBIERNO: 'Para un gobierno, es comerciar con toda la región como si fuera un solo mercado.',
    REGULADOR: 'Para un regulador, son reglas compartidas en los siete países, con la supervisión en manos de cada uno.',
    BANCO: 'Para un banco, es la oportunidad de estar entre los primeros en conectar a sus clientes con toda la región.',
    FINTECH: 'Para una fintech, es una sola infraestructura para operar en los siete países, en lugar de siete.',
    GREMIO: 'Para las empresas, es vender en siete países con una sola identidad, una sola moneda y una sola comisión.',
    'MINERÍA/ORO': 'Para el sector del oro, es que el recurso de la región sea la referencia de su moneda común.',
    INVERSION: 'Para quien invierte, es conocer temprano un protocolo que ya está construido y que busca a sus primeros aliados.',
    MULTILATERAL: 'Para la integración regional, es una herramienta concreta: identidad, moneda y comercio compartidos.',
    MEDIO: 'Para sus lectores, es una historia que apenas empieza: siete países que podrían funcionar como uno.',
    TECNOLOGIA: 'Para quien construye infraestructura digital, es una red regional con la identidad y los pagos ya diseñados.',
    INFLUENCIA: 'Para su comunidad, es una forma concreta de llevar la adopción a toda la región.',
    ACADEMIA: 'Para el análisis económico, es un caso nuevo: integración monetaria construida desde la región.',
  },
  en: {
    GOBIERNO: 'For a government, it means trading with the whole region as one market.',
    REGULADOR: 'For a regulator, it means shared rules across seven countries, with supervision kept by each one.',
    BANCO: 'For a bank, it is the chance to be among the first to connect its clients to the whole region.',
    FINTECH: 'For a fintech, it is one infrastructure to operate in seven countries instead of seven.',
    GREMIO: 'For businesses, it means selling in seven countries with one identity, one currency and one fee.',
    'MINERÍA/ORO': "For the gold sector, it means the region's own resource becomes the reference for its common currency.",
    INVERSION: 'For an investor, it is an early look at a protocol that is already built and looking for its first partners.',
    MULTILATERAL: 'For regional integration, it is a concrete tool: shared identity, currency and trade.',
    MEDIO: 'For your readers, it is a story just beginning: seven countries that could work as one.',
    TECNOLOGIA: 'For those building digital infrastructure, it is a regional network with identity and payments already designed.',
    INFLUENCIA: 'For your community, it is a concrete way to take adoption to the whole region.',
    ACADEMIA: 'For economic research, it is a new case: monetary integration built from within the region.',
  },
};

const TEXTO = {
  es: {
    asunto: 'Una idea para unir a Centroamérica',
    quien: 'Soy José Ordoñez, cofundador de Orden Global. Le escribo con una pregunta:',
    gancho: '¿Y si le dijera que podemos unir a Centroamérica?',
    que: 'Hoy somos siete monedas, siete trámites y siete fronteras. SFSP, el Protocolo de Sistema Financiero Social, las convierte en una: una identidad válida en los siete países, una moneda referenciada al oro y pagos al instante entre San Salvador, Tegucigalpa, Guatemala y Panamá. Cada país conserva su soberanía.',
    hecho: 'No es una idea en papel: el protocolo ya está construido y ha superado 553 pruebas.',
    verVideo: 'Ver el video · 2 min',
    verPdf: 'o la presentación en PDF',
    cierre: 'Estamos eligiendo a los primeros países y aliados, y me gustaría que usted estuviera entre ellos. ¿Tiene 20 minutos para conversar esta semana o la próxima?',
    whatsapp: 'Escríbame por WhatsApp',
    waMensaje: 'Hola José, recibí su correo sobre SFSP. Soy {quien}.',
    cargo: 'Cofundador, Orden Global',
    aviso: 'Protocolo en desarrollo. Material informativo; no constituye oferta de valores, inversión ni moneda.',
    baja: 'Si prefiere no recibir más correos, responda «no» y no volveremos a escribirle.',
  },
  en: {
    asunto: 'An idea to unite Central America',
    quien: "I'm José Ordoñez, co-founder of Orden Global. I'm writing with a question:",
    gancho: 'What if we could unite Central America?',
    que: 'Today we are seven currencies, seven sets of paperwork and seven borders. SFSP, the Social Financial System Protocol, turns them into one: one identity valid in all seven countries, one currency referenced to gold, and instant payments between San Salvador, Tegucigalpa, Guatemala City and Panama. Each country keeps its sovereignty.',
    hecho: 'This is not an idea on paper: the protocol is already built and has passed 553 tests.',
    verVideo: 'Watch the film · 2 min, English subtitles',
    verPdf: 'or the presentation (PDF)',
    cierre: 'We are choosing the first countries and partners, and I would like you to be among them. Could we talk for 20 minutes this week or next?',
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
 * { idioma, saludo, sector, persona, persona_real, org, org_corta }.
 */
export function correo(c) {
  const idioma = c.idioma === 'ES' ? 'es' : 'en';
  const t = TEXTO[idioma];
  const org = c.org_corta || c.org;
  const paraUsted = PARA_USTED[idioma][c.sector] || PARA_USTED[idioma].GREMIO;
  const quien = c.persona_real ? `${c.persona.replace(/\s*\([^)]*\)/g, '')} (${org})` : org;
  const wa = `https://wa.me/${JOSE.whatsapp}?text=${encodeURIComponent(rellenar(t.waMensaje, { quien }))}`;
  const pdf = PRESENTACION[idioma];

  const texto = [
    c.saludo,
    '',
    `${t.quien} ${t.gancho}`,
    '',
    t.que,
    '',
    paraUsted,
    '',
    t.hecho,
    `${t.verVideo}: ${VIDEO}`,
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
    JOSE.empresa,
  ].join('\n');

  const oro = '#9A7426';
  const tinta = '#1A1712';
  const suave = '#6B6457';
  const letra = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const p = (s) => `<p style="margin:0 0 16px">${s}</p>`;

  // Un correo que parece escrito, no un folleto: fondo blanco, una columna, la letra del
  // sistema. Solo la portada del video y el botón de WhatsApp llevan color.
  const html = `<!doctype html>
<html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.asunto)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 14px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="font:16px/1.6 ${letra};color:${tinta}">
${p(esc(c.saludo))}
${p(`${esc(t.quien)} <strong>${esc(t.gancho)}</strong>`)}
</td></tr>
<tr><td style="padding:0 0 6px">
<a href="${esc(VIDEO)}" style="text-decoration:none;display:block"><img src="${esc(PORTADA[idioma])}" width="600" alt="▶ ${esc(t.verVideo)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:8px;font:600 16px ${letra};color:${oro}"></a>
</td></tr>
<tr><td style="padding:0 0 18px;font:14px/1.5 ${letra}">
<a href="${esc(VIDEO)}" style="color:${oro};font-weight:600;text-decoration:none">▶ ${esc(t.verVideo)}</a><span style="color:${suave}"> &nbsp;·&nbsp; </span><a href="${esc(pdf)}" style="color:${suave}">${esc(t.verPdf)}</a>
</td></tr>
<tr><td style="font:16px/1.6 ${letra};color:${tinta}">
${p(esc(t.que))}
${p(esc(paraUsted))}
${p(esc(t.hecho))}
${p(esc(t.cierre))}
<a href="${esc(wa)}" style="display:inline-block;background:#1FAF55;color:#FFFFFF;text-decoration:none;font:600 15px/1 ${letra};padding:13px 20px;border-radius:6px">${esc(t.whatsapp)}</a>
<p style="margin:24px 0 0;font-size:15px;line-height:1.5">
<strong>${esc(JOSE.nombre)}</strong><br>
<span style="color:${suave}">${esc(t.cargo)}</span><br>
<a href="mailto:${JOSE.correo}" style="color:${tinta}">${JOSE.correo}</a> · <a href="${esc(wa)}" style="color:${tinta}">${JOSE.whatsappVisible}</a><br>
<a href="${JOSE.web}" style="color:${oro}">ordenglobal.org</a>
</p>
</td></tr>
<tr><td style="padding:22px 0 0;font:12px/1.5 ${letra};color:#8A8274">
${esc(t.aviso)}<br>${esc(t.baja)}<br>${esc(JOSE.empresa)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { asunto: t.asunto, texto, html, idioma };
}
