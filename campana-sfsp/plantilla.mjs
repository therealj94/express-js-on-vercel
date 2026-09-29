// Plantilla del primer correo de SFSP, en español e inglés.
//
// Una invitación, no un folleto. Arriba, la pregunta. Después, qué es (los tres pilares),
// qué significa para quien lo lee (una frase por sector) y un bloque oscuro que invita a ser
// de los primeros: el video en YouTube, WhatsApp y la presentación. Sin imágenes (muchos
// lectores de correo las bloquean y una imagen rota parece spam) y sin adjuntos.
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

// La dirección completa de YouTube, no el acortador youtu.be: se ve de dónde viene.
export const VIDEO = 'https://www.youtube.com/watch?v=pccKeU8rqm8';

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
    asunto: 'Invitación personal: unir a Centroamérica',
    etiqueta: 'INVITACIÓN PERSONAL',
    elegido: 'Este correo no le llegó por casualidad.',
    seleccion: 'De toda la región, seleccionamos a un grupo reducido de líderes e instituciones para ser los primeros en conocer SFSP y formar parte de algo que puede cambiar la historia de Centroamérica.',
    suLista: { persona: 'Su nombre está en esa lista.', org: 'Su organización está en esa lista.' },
    quien: 'Soy José Ordoñez, cofundador de Orden Global.',
    historia: 'En 1823, cinco de nuestros países fueron una sola república. Doscientos años después, podemos volver a unirnos.',
    gancho: '¿Y si le dijera que podemos unir a Centroamérica?',
    que: 'Hoy somos siete monedas, siete trámites y siete fronteras, y en cada una perdemos tiempo, dinero y oportunidades. SFSP, el Protocolo de Sistema Financiero Social, propone que la región funcione como una sola economía, sin que ningún país pierda su soberanía:',
    pilares: [
      ['Una identidad', 'Verificada una vez, válida en los siete países.'],
      ['Una moneda', 'Referenciada al oro, pensada para emitirse contra recursos reales.'],
      ['Un comercio', 'Pagar y recibir al instante, con una sola comisión mínima.'],
    ],
    hecho: 'No es una idea en papel: el protocolo ya está construido y ha superado 553 pruebas.',
    verVideo: '▶ Ver el video en YouTube · 2 min',
    verPdf: 'Ver la presentación (PDF)',
    videoNota: 'Canal oficial de Orden Global ·',
    invitaTitulo: 'La historia la escriben los primeros.',
    invita: 'Estamos reuniendo a los países y aliados fundadores que van a construir esta Centroamérica, y queremos que usted sea parte. ¿Conversamos 20 minutos esta semana o la próxima?',
    boton: 'Quiero ser parte',
    oResponda: 'o simplemente responda a este correo.',
    waMensaje: 'Hola José, quiero ser parte de SFSP. Soy {quien}.',
    cargo: 'Cofundador, Orden Global',
    aviso: 'Protocolo en desarrollo. Material informativo; no constituye oferta de valores, inversión ni moneda.',
    baja: 'Si prefiere no recibir más correos, responda «no» y no volveremos a escribirle.',
  },
  en: {
    asunto: 'Personal invitation: uniting Central America',
    etiqueta: 'PERSONAL INVITATION',
    elegido: 'This email did not reach you by chance.',
    seleccion: 'From across the region, we selected a small group of leaders and institutions to be the first to learn about SFSP and to be part of something that can change the history of Central America.',
    suLista: { persona: 'Your name is on that list.', org: 'Your organization is on that list.' },
    quien: "I'm José Ordoñez, co-founder of Orden Global.",
    historia: 'In 1823, five of our countries were a single republic. Two hundred years later, we can unite again.',
    gancho: 'What if we could unite Central America?',
    que: 'Today we are seven currencies, seven sets of paperwork and seven borders, and at each one we lose time, money and opportunities. SFSP, the Social Financial System Protocol, proposes that the region work as a single economy, without any country giving up its sovereignty:',
    pilares: [
      ['One identity', 'Verified once, valid in all seven countries.'],
      ['One currency', 'Referenced to gold, designed to be issued against real resources.'],
      ['One market', 'Pay and get paid instantly, with a single minimal fee.'],
    ],
    hecho: 'This is not an idea on paper: the protocol is already built and has passed 553 tests.',
    verVideo: '▶ Watch the film on YouTube · 2 min',
    verPdf: 'View the presentation (PDF)',
    videoNota: 'Official Orden Global channel, English subtitles ·',
    invitaTitulo: 'History is written by those who go first.',
    invita: 'We are bringing together the founding countries and partners who will build this Central America, and we want you to be one of them. Could we talk for 20 minutes this week or next?',
    boton: 'I want to be part of it',
    oResponda: 'or simply reply to this email.',
    waMensaje: 'Hi José, I want to be part of SFSP. This is {quien}.',
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
  const suLista = c.persona_real ? t.suLista.persona : t.suLista.org;

  const texto = [
    c.saludo,
    '',
    t.elegido,
    `${t.seleccion} ${suLista}`,
    '',
    `${t.quien} ${t.historia}`,
    t.gancho,
    '',
    t.que,
    ...t.pilares.map(([a, b]) => `· ${a}: ${b}`),
    '',
    paraUsted,
    t.hecho,
    '',
    t.invitaTitulo,
    t.invita,
    '',
    `${t.verVideo.replace('▶ ', '')}: ${VIDEO}`,
    `${t.boton} (WhatsApp ${JOSE.whatsappVisible}): ${wa}`,
    `${t.verPdf}: ${pdf}`,
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

  // Los colores de la presentación: noche, marfil y oro. Una sola columna de 600 px, tablas
  // y estilos en línea (lo único que respetan Gmail y Outlook), y una sola imagen.
  const noche = '#0B0A08';
  const marfil = '#F4EEE3';
  const oro = '#B8913A';
  const oroTexto = '#8C6A22';
  const tinta = '#1A1712';
  const suave = '#6B6457';
  const serif = "Georgia,'Times New Roman',serif";
  const sans = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const p = (s, extra = '') => `<p style="margin:0 0 16px;${extra}">${s}</p>`;

  const pilares = t.pilares.map(([a, b], i) => `
<tr><td valign="top" width="44" style="padding:12px 0 12px;font:italic 22px/1 ${serif};color:${oro}">0${i + 1}</td>
<td style="padding:10px 0;border-bottom:${i < 2 ? `1px solid #E8DFCF` : '0'}"><div style="font:600 16px/1.3 ${serif};color:${tinta}">${esc(a)}</div><div style="font:14px/1.5 ${sans};color:${suave};margin-top:2px">${esc(b)}</div></td></tr>`).join('');

  const html = `<!doctype html>
<html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.asunto)}</title></head>
<body style="margin:0;padding:0;background:${marfil}">
<div style="display:none;max-height:0;overflow:hidden">${esc(t.gancho)} ${esc(t.hecho)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${marfil}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF9;border-radius:12px;overflow:hidden">

<tr><td style="background:${noche};padding:16px 28px;font:600 11px/1 'Courier New',monospace;letter-spacing:4px;color:${oro}">ORDEN GLOBAL · SFSP</td></tr>

<tr><td style="padding:30px 28px 4px;font:16px/1.65 ${sans};color:${tinta}">
<p style="margin:0 0 18px;font:700 11px/1 ${sans};letter-spacing:3px;color:${oroTexto}">${esc(t.etiqueta)}</p>
${p(esc(c.saludo))}
<p style="margin:0 0 14px;font:30px/1.2 ${serif};color:${tinta}">${esc(t.elegido)}</p>
${p(`${esc(t.seleccion)} <strong>${esc(suLista)}</strong>`, 'margin-bottom:22px')}
${p(esc(t.quien), 'margin-bottom:12px')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr><td style="border-left:3px solid ${oro};padding:4px 0 4px 16px;font:italic 20px/1.4 ${serif};color:${tinta}">${esc(t.historia)}<br><span style="color:${oroTexto}">${esc(t.gancho)}</span></td></tr></table>
</td></tr>

<tr><td style="padding:0 28px;font:16px/1.65 ${sans};color:${tinta}">
${p(esc(t.que), 'margin-bottom:6px')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${pilares}
</table>
${p(esc(paraUsted))}
${p(esc(t.hecho), 'margin-bottom:24px')}
</td></tr>

<tr><td style="padding:0 28px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${noche};border-radius:10px"><tr><td style="padding:26px 26px 24px">
<p style="margin:0 0 10px;font:italic 22px/1.3 ${serif};color:#F4EEE3">${esc(t.invitaTitulo)}</p>
<p style="margin:0 0 20px;font:15px/1.6 ${sans};color:#CFC6B6">${esc(t.invita)}</p>
<a href="${esc(VIDEO)}" style="display:block;background:#E62117;color:#FFFFFF;text-decoration:none;font:700 16px/1 ${sans};padding:16px 20px;border-radius:6px;text-align:center">${esc(t.verVideo)}</a>
<p style="margin:8px 0 18px;font:12px/1.5 ${sans};color:#9E9584;text-align:center">${esc(t.videoNota)} youtube.com</p>
<a href="${esc(wa)}" style="display:block;background:${oro};color:${noche};text-decoration:none;font:700 16px/1 ${sans};padding:16px 20px;border-radius:6px;text-align:center">${esc(t.boton)} · WhatsApp</a>
<p style="margin:16px 0 0;font:14px/1.5 ${sans};text-align:center"><a href="${esc(pdf)}" style="color:#F4EEE3">${esc(t.verPdf)}</a></p>
<p style="margin:6px 0 0;font:13px/1.5 ${sans};color:#9E9584;text-align:center">${esc(t.oResponda)}</p>
</td></tr></table>
</td></tr>

<tr><td style="padding:22px 28px 26px;font:15px/1.5 ${sans};color:${tinta}">
<strong>${esc(JOSE.nombre)}</strong><br>
<span style="color:${suave}">${esc(t.cargo)}</span><br>
<a href="mailto:${JOSE.correo}" style="color:${tinta}">${JOSE.correo}</a> · <a href="${esc(wa)}" style="color:${tinta}">${JOSE.whatsappVisible}</a><br>
<a href="${JOSE.web}" style="color:${oroTexto}">ordenglobal.org</a>
</td></tr>

<tr><td style="padding:16px 28px 20px;border-top:1px solid #E8DFCF;font:12px/1.5 ${sans};color:#8A8274">
${esc(t.aviso)}<br>${esc(t.baja)}<br>${esc(JOSE.empresa)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { asunto: t.asunto, texto, html, idioma };
}
