// Genera el informe PDF "Cómo está la Tesorería de Orden Global".
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SHOTS = '${process.env.CAPTURAS || '/tmp/capturas'}';
const SALIDA = '${__dirname}/Tesoreria-Orden-Global-Estado-del-sistema.pdf';
const R = require(path.join(RAIZ, 'app/reglas.js'));
const S = require(path.join(RAIZ, 'app/datos.js'));
const e = R.clon(S.estado); R.sellarLibro(e); const r = R.respaldo(e);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n, d = 0) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (n) => '$' + num(n);
const FECHA = '20 de septiembre de 2026';

const PERM_DESC = {
  'origen.freno': 'Congelar / levantar la emisión', 'origen.politica': 'Política y precio del oro', 'origen.reservas': 'Reservas',
  'origen.emitir': 'Emitir y quemar ORIGEN', 'solicitud.crear': 'Pedir emisión', 'solicitud.firmar': 'Firmar y objetar',
  'solicitud.dictaminar': 'Aprobar o rechazar', 'tesoreria.operar': 'Operar tokens',
};

const comandos = R.nombresComandos.map((n) => `<tr><td class="mono">${n}</td><td>${esc(PERM_DESC[R.comandos[n].permiso] || R.comandos[n].permiso)}</td><td class="mono faint">${R.comandos[n].permiso}</td></tr>`).join('');

const reservas = e.reservas.map((x) => `<tr><td><b>${esc(x.nombre)}</b><br><span class="faint">${esc(x.custodio)} · ${esc(x.auditor)}</span></td><td>${esc(x.clase)}</td><td class="der">${usd(x.valorCertificado)}</td><td class="der">${Math.round(x.haircut * 100)}%</td><td class="der ${R.valorAdmisible(x) > 0 ? 'ok' : 'faint'}">${usd(R.valorAdmisible(x))}</td><td>${x.estado === 'certificada' ? (x.vence && new Date(x.vence) < new Date('2026-09-20') ? '<span class="tag bad">vencida</span>' : '<span class="tag ok">certificada</span>') : '<span class="tag warn">' + esc(x.estado.replace('_', ' ')) + '</span>'}</td></tr>`).join('');

const tokens = [...e.securities.map((t) => ({ t, sec: true, s: R.saludSecurity(t, new Date('2026-09-20')) })), ...e.utilities.map((t) => ({ t, sec: false, s: R.saludUtility(t) }))]
  .map(({ t, sec, s }) => `<tr><td><b>${t.simbolo}</b><br><span class="faint">${esc(t.nombre)}</span></td><td>${sec ? 'Security · ' + esc(R.TIPOS_SEC[t.tipo]) : 'Utility'}</td><td class="der">${sec ? '$' + num(t.precioUnitario, 2) : '$' + num(t.precioAncla, 2)}</td><td class="der">${num(t.supply.emitido)}<br><span class="faint">de ${num(t.supply.autorizado)}</span></td><td class="der">${usd(t.origenAsignado)}</td><td><span class="tag ${s.salud === 'ok' ? 'ok' : s.salud === 'warn' ? 'warn' : 'bad'}">${s.salud === 'ok' ? 'en regla' : s.salud === 'warn' ? 'revisar' : 'alerta'}</span>${s.alertas.length ? '<br><span class="faint small">' + esc(s.alertas[0]) + '</span>' : ''}</td></tr>`).join('');

async function jpeg(page, archivo, ancho) {
  const b64 = fs.readFileSync(path.join(SHOTS, archivo)).toString('base64');
  return page.evaluate(async ([b64, ancho]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const esc = Math.min(1, ancho / img.width);
    const c = document.createElement('canvas'); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }, [b64, ancho]);
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<html><body></body></html>');
  const I = {};
  for (const f of ['pdf-hub', 'pdf-origen-panel', 'pdf-origen-reservas', 'pdf-solicitud', 'pdf-operadores', 'pdf-libro', 'pdf-cadena', 'pdf-security-panel', 'pdf-security-ondk', 'pdf-mercado', 'pdf-utility-panel', 'pdf-utility-capacidad', 'api-cambio-contrasena', 'api-prueba', 'api-security-auditor']) {
    I[f] = await jpeg(p, f + '.png', 1600);
  }
  const fig = (k, pie, alto) => `<figure><img src="${I[k]}" style="${alto ? 'max-height:' + alto + 'mm;object-fit:cover;object-position:top' : ''}"><figcaption>${pie}</figcaption></figure>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tesorería de Orden Global · Estado del sistema</title>
<style>
  @page{size:A4;margin:18mm 16mm 20mm 16mm}
  :root{--ink:#132524;--muted:#5A7370;--faint:#8AA09C;--line:#D5E0DD;--bg2:#F0F4F3;--gold:#8F7132;--violet:#7C3FBF;--cyan:#0E8F98;--ok:#0F9D63;--warn:#966D0E;--bad:#C74E42}
  *{box-sizing:border-box}
  body{font:10.5pt/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);margin:0}
  h1{font-size:26pt;letter-spacing:-.02em;margin:0 0 6pt;line-height:1.15}
  h2{font-size:16pt;letter-spacing:-.01em;margin:0 0 10pt;padding-bottom:6pt;border-bottom:2px solid var(--gold);break-after:avoid}
  h3{font-size:11.5pt;margin:14pt 0 5pt;break-after:avoid}
  p{margin:0 0 7pt}
  .sec{break-before:page}
  .kicker{font-size:8.5pt;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);margin-bottom:8pt}
  .muted{color:var(--muted)} .faint{color:var(--faint)} .small{font-size:8.5pt} .ok{color:var(--ok)} .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9pt}
  .der{text-align:right}
  table{width:100%;border-collapse:collapse;font-size:9.3pt;margin:6pt 0 10pt;break-inside:auto}
  th{text-align:left;font-size:8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);padding:5pt 6pt;border-bottom:1px solid var(--line)}
  td{padding:5pt 6pt;border-bottom:1px solid var(--line);vertical-align:top}
  tr{break-inside:avoid}
  .tag{display:inline-block;font-size:8pt;font-weight:600;padding:1pt 6pt;border-radius:99px;background:var(--bg2);color:var(--muted)}
  .tag.ok{background:#E1F5EC;color:var(--ok)} .tag.warn{background:#F7EFD6;color:var(--warn)} .tag.bad{background:#F8E3E0;color:var(--bad)}
  figure{margin:8pt 0 12pt;break-inside:avoid}
  figure img{width:100%;max-height:108mm;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:6px;display:block}
  figcaption{font-size:8.5pt;color:var(--muted);margin-top:4pt}
  .dos{display:grid;grid-template-columns:1fr 1fr;gap:12pt}
  .caja{border:1px solid var(--line);border-radius:8px;padding:10pt 12pt;background:#fff;break-inside:avoid;margin-bottom:8pt}
  .caja b.t{display:block;font-size:10pt;margin-bottom:3pt}
  .kpi{border:1px solid var(--line);border-radius:8px;padding:9pt 11pt;background:var(--bg2)}
  .kpi .et{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)} .kpi .v{font-size:17pt;font-weight:650;letter-spacing:-.02em;margin-top:2pt} .kpi .n{font-size:8.5pt;color:var(--muted)}
  .cuatro{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin:8pt 0 12pt}
  .flujo{display:grid;grid-template-columns:repeat(3,1fr);gap:6pt;margin:10pt 0}
  .flujo .n{flex:1;border:1px solid var(--line);border-radius:6px;padding:7pt 8pt;font-size:8.8pt;background:var(--bg2)} .flujo .n b{display:block;margin-bottom:2pt}
  .flujo .n.a{border-color:var(--violet);background:#F1E8FA} .flujo .f{display:none}
  .arq{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10pt;margin:10pt 0}
  .arq .b{border:1.5px solid var(--line);border-radius:8px;padding:9pt 10pt;font-size:9pt} .arq .b b{display:block;font-size:10pt;margin-bottom:3pt}
  .arq .b.v{border-color:var(--violet)} .arq .b.g{border-color:var(--gold)} .arq .b.c{border-color:var(--cyan)}
  ul{margin:0 0 8pt 16pt;padding:0} li{margin-bottom:3pt}
  .portada{height:250mm;display:flex;flex-direction:column;justify-content:center}
  .portada .escudo{width:64px;height:64px;border-radius:18px;border:1px solid var(--line);display:grid;place-items:center;background:linear-gradient(135deg,#F1E8FA,#fff);margin-bottom:22pt}
  .portada .escudo svg{width:34px;height:34px;stroke:var(--violet);fill:none;stroke-width:1.5}
  .portada .meta{margin-top:26pt;font-size:9.5pt;color:var(--muted);line-height:1.7}
  .estado{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8pt;margin:8pt 0}
  .estado .e{border-radius:8px;padding:8pt 10pt;font-size:9pt;border:1px solid var(--line)} .estado .e b{display:block}
  .estado .listo{background:#E1F5EC;border-color:#BFE7D3} .estado .pend{background:#F7EFD6;border-color:#EBDDB0}
  code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9pt;background:var(--bg2);padding:0 3pt;border-radius:3px}
</style></head><body>

<div class="portada">
  <div class="escudo"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg></div>
  <div class="kicker">Orden Global Corp · ecosistema ORIGEN</div>
  <h1>Tesorería de Orden Global<br><span class="muted" style="font-weight:500">Estado del sistema</span></h1>
  <p class="muted" style="font-size:12pt;max-width:130mm;margin-top:8pt">Autoridad de Emisión de ORIGEN, Tesorería de Security Tokens y Tesorería de Utility Tokens: qué hay construido, cómo funciona, cómo se prueba, cómo se despliega y qué queda por decidir.</p>
  <div class="meta">
    ${FECHA}<br>
    Repositorio <span class="mono">therealj94/express-js-on-vercel</span> · rama <span class="mono">claude/security-tokens-treasury-platform-tk5g77</span><br>
    Commits <span class="mono">65c99ef → 0bfc368 → 8032fea</span> · carpeta <span class="mono">tesoreria/</span><br>
    Preparado para J. Enamorado, Presidente del Consejo
  </div>
</div>

<section class="sec">
<h2>1. Resumen ejecutivo</h2>
<p><b>Qué es.</b> Una plataforma de tesorería con una sola regla: <b>ningún token sale al mercado sin respaldo certificado detrás</b>. No funciona como una cripto: el valor se certifica primero, el precio lo establece un valuador independiente y el Comité, y solo entonces se emiten los tokens que ese valor aguanta. Emitir más exige una causa admisible, evidencia, firmas del Consejo y ORIGEN libre.</p>
<p><b>Qué hay.</b> Tres plataformas web (Autoridad ORIGEN, Security, Utility), un portal, una página pública de prueba de reservas y un servidor con API. Las reglas de negocio viven en un solo archivo que corre igual en el navegador y en el servidor. Está conectado al ecosistema: ORIGEN se valora como en la cadena 5550 (1/55 g de oro), los consejeros entran con Genesis ID y la Autoridad concilia el supply real de la cadena contra lo que autorizó.</p>
<div class="estado">
  <div class="e listo"><b>Listo y probado</b>Front completo en dos modos, servidor con sesiones, roles, firmas Ed25519, libro SHA-256, conciliación con la cadena, 26 pruebas automáticas, smoke de navegador, blueprint de Render.</div>
  <div class="e pend"><b>Requiere configuración</b>Mongo (sin él, el libro se pierde en cada despliegue), contraseña del presidente, clave de API de Genesis para la sesión única.</div>
  <div class="e pend"><b>Decisiones del Consejo</b>Custodia de llaves de firma, cadencia de anclaje del libro en la cadena, quién ejecuta el <i>mint</i> on-chain, fuente del precio del oro.</div>
</div>
<div class="cuatro">
  <div class="kpi"><div class="et">Reservas admisibles</div><div class="v">${usd(r.admisible)}</div><div class="n">7 activos, 5 computan</div></div>
  <div class="kpi"><div class="et">ORIGEN en circulación</div><div class="v">${num(r.emitidoUnidades / 1e6, 2)} M</div><div class="n">≈ ${usd(r.emitido)} a $${num(e.politica.oroUsdPorGramo, 2)}/g</div></div>
  <div class="kpi"><div class="et">Ratio de respaldo</div><div class="v">${num(r.ratio, 1)}%</div><div class="n">objetivo ${e.politica.ratioObjetivo}% · mínimo ${e.politica.ratioMinimo}%</div></div>
  <div class="kpi"><div class="et">ORIGEN libre</div><div class="v">${usd(r.libre)}</div><div class="n">${usd(r.enCola)} pedidos en cola</div></div>
</div>
<p class="small faint">Cifras de la semilla de demostración al ${FECHA}. En producción salen del almacén del servidor.</p>
<h3>Cómo se emite un token</h3>
<div class="flujo">
  <div class="n"><b>1 · Activo real</b>Mineral, inmueble, caja, contrato.</div><div class="f">→</div>
  <div class="n"><b>2 · Certificación</b>Auditor o valuador independiente, con folio y vigencia.</div><div class="f">→</div>
  <div class="n"><b>3 · Aforo</b>Descuento por riesgo de realización. Solo lo que queda respalda.</div><div class="f">→</div>
  <div class="n a"><b>4 · ORIGEN</b>La Autoridad emite unidades de respaldo contra la reserva.</div><div class="f">→</div>
  <div class="n"><b>5 · Solicitud</b>Causa, evidencia, firmas M-de-N, ventana de objeción.</div><div class="f">→</div>
  <div class="n"><b>6 · Emisión</b>Solo lo que el valor certificado aguanta, al precio establecido.</div>
</div>
</section>

<section class="sec">
<h2>2. Las reglas que el sistema hace cumplir</h2>
<p>Están en <code>app/reglas.js</code>. El navegador las evalúa en cada pantalla para <b>explicar</b> (dictamen anticipado, techos, alertas); el servidor las evalúa en cada comando para <b>impedir</b>. Si un comando falla, el estado no cambia.</p>
<table><thead><tr><th>Invariante</th><th>Dónde se aplica</th></tr></thead><tbody>
<tr><td>Valor del ORIGEN emitido ≤ Σ reservas certificadas × (1 − aforo)</td><td class="mono">respaldo() · origen.emitir</td></tr>
<tr><td>Un certificado vencido o en revisión vale <b>cero</b></td><td class="mono">valorAdmisible()</td></tr>
<tr><td>ORIGEN comprometido ≤ ORIGEN emitido; el resto es <i>libre</i></td><td class="mono">respaldo()</td></tr>
<tr><td>No se aprueba una emisión si pide más que lo libre, si el ratio está bajo el mínimo o si faltan firmas</td><td class="mono">solicitud.aprobar</td></tr>
<tr><td>Security: lo autorizado × precio ≤ valuación certificada; el precio es el del Comité, no el del solicitante</td><td class="mono">solicitud.crear · valuacion.asentar</td></tr>
<tr><td>Utility: circulante ≤ capacidad de servicio contratada; pasivo redimible ≤ ORIGEN asignado</td><td class="mono">saludUtility() · capacidad.actualizar</td></tr>
<tr><td>Emitir exige cabecera autorizada <b>y</b> respaldo <b>y</b> valuación <b>y</b> capacidad suficientes</td><td class="mono">token.emitir</td></tr>
<tr><td>El secundario solo admite órdenes dentro de la banda (±5 %) sobre el precio certificado</td><td class="mono">orden.colocar</td></tr>
<tr><td>El transfer agent bloquea lock-up y destinatarios sin Genesis ID verificado</td><td class="mono">token.transferir</td></tr>
<tr><td>Quemar libera el ORIGEN proporcional y lo devuelve al pozo libre</td><td class="mono">token.quemar</td></tr>
<tr><td>El ratio mínimo nunca baja de 100 % ni se exigen más firmas que consejeros</td><td class="mono">politica.modificar</td></tr>
<tr><td>Toda mutación es un comando con permiso, y queda en un libro encadenado por hash</td><td class="mono">ejecutar() · verificarLibro()</td></tr>
</tbody></table>
<h3>Security frente a utility</h3>
<table><thead><tr><th></th><th>Utility</th><th>Security</th></tr></thead><tbody>
<tr><td>Qué entrega</td><td>Acceso a un servicio</td><td>Derecho patrimonial</td></tr>
<tr><td>Precio</td><td>Anclado al costo del servicio</td><td>Valuación independiente certificada</td></tr>
<tr><td>Por qué se emite</td><td>Hay capacidad contratada y consumo</td><td>Hay activo certificado</td></tr>
<tr><td>Rendimiento</td><td>Ninguno</td><td>Dividendo o participación</td></tr>
<tr><td>Secundario</td><td>Libre entre usuarios</td><td>Ventanas, banda de precio y acreditados</td></tr>
<tr><td>Respaldo ORIGEN</td><td>Solo la parte redimible</td><td>El total del valor emitido</td></tr>
</tbody></table>
<h3>Roles</h3>
<table><thead><tr><th>Rol</th><th>Puede</th></tr></thead><tbody>
<tr><td><b>presidente</b></td><td>Todo: política y precio del oro, operadores, freno, dictaminar, firmar, reiniciar</td></tr>
<tr><td><b>consejero</b></td><td>Firmar, dictaminar, objetar, solicitar, operar tesorerías, reservas, emitir y quemar ORIGEN, freno</td></tr>
<tr><td><b>tesorero</b></td><td>Solicitar emisión, operar tesorerías, reservas. No firma ni dictamina</td></tr>
<tr><td><b>auditor</b></td><td>Ver todo, no tocar nada. La interfaz no le enseña botones de acción y el servidor los rechaza igual</td></tr>
</tbody></table>
</section>

<section class="sec">
<h2>3. El portal y la Autoridad de Emisión de ORIGEN</h2>
${fig('pdf-hub', 'Portal: las tres puertas, el modo (servidor o demostración local), cifras vivas y el flujo de emisión.', 92)}
<p>La Autoridad es el banco central del ecosistema. Certifica reservas, emite y quema ORIGEN, y autoriza o niega toda emisión de tokens. Vistas: panel de respaldo, cola de emisión, emitir/quemar, reservas, prueba de reservas, cadena 5550, política y Consejo, libro sellado.</p>
${fig('pdf-origen-panel', 'Panel de respaldo: reservas admisibles, ORIGEN en circulación con su equivalente en USD, comprometido y libre; ratio con objetivo y mínimo; avisos (certificados vencidos y por vencer); freno de emergencia; cola con dictamen automático.')}
</section>

<section>
${fig('pdf-origen-reservas', 'Registro maestro de reservas: valor certificado, aforo, admisible, estado y vigencia. RES-AG-07 no computa por certificado vencido; RES-PLA-06 está en revisión. Cada reserva se puede revaluar, certificar, poner en revisión o retirar.')}
${fig('pdf-solicitud', 'Expediente de una solicitud: dictamen de respaldo, causa del catálogo, evidencias con huella, firmas del Consejo (✓ = firma Ed25519 verificable) y botones de objetar, rechazar o autorizar, que se habilitan solo con firmas y respaldo suficientes.')}
</section>

<section>
${fig('pdf-libro', 'Libro sellado: cada asiento lleva el hash del anterior. En el servidor es SHA-256; alterar un asiento viejo rompe la cadena y se ve aquí.')}
${fig('pdf-cadena', 'Conciliación con la cadena 5550: totalSupply() real por RPC contra lo emitido y autorizado. ONDK cuadra: 555 M en cadena = 555 M en registro. Lo que exceda lo autorizado es supply sin expediente y sale en rojo.')}
</section>

<section class="sec">
<h2>4. Tesorería de Security Tokens</h2>
<p>ONDK, MPLE y VTRE: emisiones con valor patrimonial. Precio establecido por el Comité contra un informe independiente, que no flota. Tres techos simultáneos sobre el supply: valuación certificada, ORIGEN asignado y lo autorizado por la Autoridad. Cap table con transfer agent, distribuciones, reportes periódicos y mercado secundario con banda.</p>
${fig('pdf-security-panel', 'Panel de security: valor en circulación, valuación, tenedores, alertas (MPLE con un reporte vencido) y calendario de obligaciones.')}
${fig('pdf-security-ondk', 'Expediente de ONDK: supply y límites, valuación con historial, distribuciones, mercado, cumplimiento, tenedores y el expediente ante la Autoridad.', 108)}
</section>

<section>
${fig('pdf-mercado', 'Mercado secundario regulado: precio de referencia certificado, banda admitida, libro de órdenes y cruce. Una orden fuera de banda se rechaza; el régimen puede ser abierto, por ventanas o suspendido.')}
<h2 style="margin-top:14pt">5. Tesorería de Utility Tokens</h2>
<p>VETA, OGS y MTP: tokens que pagan un servicio. No dan propiedad ni rendimiento. Solo circulan mientras exista capacidad de servicio contratada que los honre; el ORIGEN respalda únicamente la parte redimible. Lo consumido se quema y libera respaldo.</p>
${fig('pdf-utility-panel', 'Panel de utility: circulante, capacidad comprometida, pasivo redimible, ORIGEN asignado y prueba de utilidad. MTP está deliberadamente en alerta (95 % de cobertura de servicio).')}
</section>

<section>
${fig('pdf-utility-capacidad', 'Prueba de utilidad por token: proveedor y contrato de capacidad, cobertura y vigencia. Reducir la capacidad por debajo del circulante está prohibido: primero hay que quemar.')}
${fig('api-prueba', 'Prueba de reservas pública (prueba.html): el documento que cualquier tenedor, auditor o regulador puede leer sin sesión. Sale de GET /api/prueba-de-reservas; sin servidor se construye en local.', 108)}
</section>

<section class="sec">
<h2>6. Arquitectura técnica</h2>
<div class="arq">
  <div class="b g"><b>Navegador</b><span class="mono">index · origen · security · utility · prueba</span><br>HTML/CSS/JS sin framework. <code>app/nucleo.js</code> es el cliente de estado: modo servidor (sesión + <code>POST api/comandos</code>) o modo local (localStorage). Las vistas llaman <code>T.ejecutar(nombre, datos)</code> y no distinguen el modo.</div>
  <div class="b v"><b>Reglas isomórficas</b><span class="mono">app/reglas.js · app/datos.js</span><br>Un archivo UMD con las reglas, catálogos, roles y ${R.nombresComandos.length} comandos. El navegador lo carga con <code>&lt;script&gt;</code>; el servidor con <code>require()</code>. Una sola fuente de verdad: no hay copia del negocio en el backend.</div>
  <div class="b c"><b>Servidor</b><span class="mono">tesoreria/servidor · Express + TypeScript</span><br>Sesiones (scrypt), roles, firmas Ed25519, libro SHA-256, almacén archivo/Mongo, lectura de la cadena 5550, puente con Genesis ID. Sirve el front y el API en el mismo origen.</div>
</div>
<div class="dos">
  <div class="caja"><b class="t">Almacén</b>Un documento con estado, operadores y sesiones. En desarrollo, un JSON con escritura atómica; en producción, MongoDB (<code>TESORERIA_MONGO_URL</code>), como Genesis ID. Cada comando que cambia el libro se vuelca antes de responder.</div>
  <div class="caja"><b class="t">Seguridad</b>Contraseñas con scrypt (RFC 7914), bloqueo tras 5 fallos, sesiones de 8 h, límite de peticiones en la entrada, cabeceras nosniff/DENY/no-referrer, contraseña provisional que deja mirar pero no operar, llaves privadas y hashes nunca salen del servidor.</div>
  <div class="caja"><b class="t">Firmas del Consejo</b>Cada operador nace con un par Ed25519. Firmar una solicitud es firmar su texto canónico (id, token, cantidad, precio, respaldo, fecha). <code>GET /api/solicitudes/:id/firmas</code> verifica cada firma contra la llave pública. Hoy la llave privada la custodia el servidor.</div>
  <div class="caja"><b class="t">Libro</b>SHA-256 encadenado; <code>/api/libro/verificar</code> recorre la cadena y <code>/api/libro/ancla</code> entrega el sello listo para publicarlo en la 5550. En el navegador (modo local) el encadenado usa FNV para explicar, no para probar.</div>
</div>
<h3>Integración con el ecosistema Orden Global</h3>
<ul>
  <li><b>ORIGEN como en la cadena.</b> 1 ORIGEN = 1 gramín = 1/55 g de oro certificado. Se valora al precio de referencia que fija el Consejo con fuente y fecha (<code>politica.oro</code>); si tiene más de 30 días, el panel avisa. Las reservas siguen en USD y el ratio se recalcula al mover el oro.</li>
  <li><b>Genesis ID.</b> La Tesorería queda dada de alta como app del ecosistema (<code>gid.verificar</code>, <code>gid.perfil</code>, <code>telemetria.enviar</code>). Un consejero con GID entra con la sesión única: Genesis emite el token, la Tesorería lo verifica con su clave de API y abre sesión. Nunca ve contraseñas ni documentos.</li>
  <li><b>Cadena 5550.</b> Lectura de <code>totalSupply()</code> por RPC (rpc.ordenglobal-rpc.com) y conciliación por token. La semilla de ONDK parte de los 555 M que la cadena reporta (contrato <span class="mono">0xfb83…19c1</span>).</li>
  <li><b>Cerebro.</b> El mapa del ecosistema en Genesis ID incorpora la Tesorería y sus relaciones (bóveda → Tesorería → ORIGEN; Genesis; RPC; Render; Mongo).</li>
</ul>
</section>

<section class="sec">
<h2>7. API del servidor</h2>
<table><thead><tr><th>Método</th><th>Ruta</th><th>Sesión</th><th>Qué hace</th></tr></thead><tbody>
<tr><td>GET</td><td class="mono">/api/salud · /healthz</td><td>no</td><td>Estado del servicio, almacén, commit, sello del libro</td></tr>
<tr><td>GET</td><td class="mono">/api/prueba-de-reservas · /api/respaldo</td><td>no</td><td>El documento público de respaldo</td></tr>
<tr><td>GET</td><td class="mono">/api/libro/verificar · /api/libro/ancla</td><td>no</td><td>Integridad y sello del libro</td></tr>
<tr><td>GET</td><td class="mono">/api/solicitudes/:id/firmas</td><td>no</td><td>Verificación Ed25519 de las firmas de una solicitud</td></tr>
<tr><td>POST</td><td class="mono">/api/sesion/entrar · /genesis · /salir · /contrasena</td><td>—</td><td>Sesión por contraseña o por token de Genesis ID; cambio de contraseña</td></tr>
<tr><td>GET</td><td class="mono">/api/estado</td><td>sí</td><td>El estado completo, con la sesión y el Consejo real</td></tr>
<tr><td>GET</td><td class="mono">/api/comandos</td><td>sí</td><td>Catálogo de comandos y cuáles permite el rol</td></tr>
<tr><td>POST</td><td class="mono">/api/comandos {nombre, datos}</td><td>sí + permiso</td><td><b>La única puerta de escritura</b></td></tr>
<tr><td>GET</td><td class="mono">/api/libro?desde=&amp;cuantos=</td><td>sí</td><td>Asientos paginados</td></tr>
<tr><td>GET</td><td class="mono">/api/cadena/conciliacion</td><td>sí</td><td>Supply en cadena frente a autorizado, por token</td></tr>
<tr><td>GET/POST</td><td class="mono">/api/operadores · POST /:id/baja</td><td>presidente</td><td>Alta y baja de operadores (la llave pública se entrega al crear)</td></tr>
<tr><td>POST</td><td class="mono">/api/estado/reiniciar</td><td>presidente</td><td>Volver a la semilla; queda asentado en el libro</td></tr>
</tbody></table>
<h3>Los ${R.nombresComandos.length} comandos</h3>
<table><thead><tr><th>Comando</th><th>Qué hace</th><th>Permiso</th></tr></thead><tbody>${comandos}</tbody></table>
</section>

<section class="sec">
<h2>8. Datos de la semilla</h2>
<p>La semilla de demostración (<code>app/datos.js</code>) es también el contrato de datos del API. Cuadra con todas las reglas: ratio ${num(r.ratio, 1)} %, ${usd(r.libre)} libres, y dos casos deliberados en alerta (MTP por capacidad, MPLE por un reporte vencido) para que se vean las alarmas trabajando.</p>
<h3>Reservas</h3>
<table><thead><tr><th>Activo</th><th>Clase</th><th class="der">Certificado</th><th class="der">Aforo</th><th class="der">Admisible</th><th>Estado</th></tr></thead><tbody>${reservas}</tbody></table>
<h3>Tokens</h3>
<table><thead><tr><th>Token</th><th>Clase</th><th class="der">Precio</th><th class="der">Emitidos</th><th class="der">ORIGEN asignado</th><th>Salud</th></tr></thead><tbody>${tokens}</tbody></table>
<p class="small faint">Precio de ONDK: $0.06 (valuación $34 M sobre 555 M tokens, como reporta la cadena). Consejo de la semilla: J. Enamorado, M. Arroyo, L. Bermúdez, R. Castellanos, A. Villalobos; con servidor, el Consejo son los operadores con rol de presidente o consejero.</p>
</section>

<section class="sec">
<h2>9. Verificación</h2>
<div class="dos">
  <div class="caja"><b class="t">26 pruebas automáticas (node:test)</b>
    <ul>
      <li>Reglas: semilla cuadra; certificado vencido vale cero; el oro mueve el ratio; no se emite bajo el mínimo; no se quema ORIGEN comprometido; el rol decide; aprobar exige firmas y respaldo; la valuación es un techo; emitir exige cabecera, respaldo y capacidad; banda y régimen del secundario; transfer agent; quemar libera respaldo; utility sin capacidad; el libro se rompe al tocar un asiento; límites de la política.</li>
      <li>API contra un servidor real: sin sesión nada; prueba pública; entrada y bloqueo por contraseña; alta de operadores solo por el presidente; contraseña provisional; auditor de solo lectura; flujo completo con tres firmas Ed25519 verificadas, aprobación, emisión y rechazo por encima del respaldo; baja de consejero; reinicio.</li>
    </ul></div>
  <div class="caja"><b class="t">Navegador real (Chromium)</b>
    <ul>
      <li>Modo local: 19 vistas sin errores de consola; expediente, dictamen anticipado, firma y aprobación.</li>
      <li>Modo servidor: entrada, contraseña provisional obligatoria, firma real del consejero, freno, alta de reserva sellada, conciliación viva con la cadena, prueba pública sin sesión, salida.</li>
      <li>Auditor: sin botones de acción en ninguna vista.</li>
      <li>Sin desbordes horizontales de 360 a 1440 px; claro y oscuro; impresión.</li>
    </ul></div>
</div>
${fig('api-cambio-contrasena', 'Contraseña provisional: al entrar, el cambio es obligatorio y no se puede cerrar. Hasta cambiarla, el servidor rechaza cualquier comando.', 70)}
${fig('api-security-auditor', 'La misma pantalla vista por un auditor: sin botones de emitir, solicitar, valuar ni transferir.', 70)}
</section>

<section class="sec">
<h2>10. Despliegue</h2>
<p><code>render.yaml</code> en la raíz del repo ya trae el servicio <b>tesoreria</b> (rootDir <code>tesoreria/servidor</code>, Node 20, <code>npm start</code>, healthcheck <code>/healthz</code>). En Render: New → Blueprint → este repo y rama.</p>
<table><thead><tr><th>Variable</th><th>Para qué</th><th>Estado</th></tr></thead><tbody>
<tr><td class="mono">TESORERIA_MONGO_URL / _DB</td><td>Almacén persistente. <b>Obligatoria para operar de verdad</b>: sin Mongo el libro se pierde en cada despliegue. Puede ser el clúster de Genesis con otra base.</td><td><span class="tag warn">por definir</span></td></tr>
<tr><td class="mono">TESORERIA_ADMIN_EMAIL / _PASSWORD / _NOMBRE</td><td>El primer presidente del Consejo. Sin contraseña se genera una y se imprime una sola vez.</td><td><span class="tag warn">por definir</span></td></tr>
<tr><td class="mono">TESORERIA_GENESIS_URL / _API_KEY</td><td>Sesión única con Genesis ID. La clave la imprime Genesis al arrancar tras este cambio (app <code>tesoreria</code>).</td><td><span class="tag warn">por definir</span></td></tr>
<tr><td class="mono">RPC_ORDEN_URL</td><td>RPC de la cadena 5550. Por defecto rpc.ordenglobal-rpc.com.</td><td><span class="tag ok">listo</span></td></tr>
<tr><td class="mono">TESORERIA_CORS</td><td>Orígenes adicionales (la copia estática en Vercel, si se usa contra este API).</td><td><span class="tag">opcional</span></td></tr>
</tbody></table>
<h3>Pasos</h3>
<ul>
  <li>Crear la base en Mongo y definir <code>TESORERIA_MONGO_URL</code>.</li>
  <li>Desplegar el blueprint. Entrar con el correo del presidente y cambiar la contraseña.</li>
  <li>Dar de alta a los consejeros desde Política y Consejo → Operadores (nombre, correo, rol, GID opcional). Cada uno recibe su llave pública; al entrar cambia su contraseña provisional.</li>
  <li>Registrar las reservas reales con folio y vigencia del certificado; ajustar el precio de referencia del oro con fuente.</li>
  <li>Redesplegar Genesis ID para que dé de alta la app <code>tesoreria</code> y copiar su clave a <code>TESORERIA_GENESIS_API_KEY</code>.</li>
  <li>En local: <code>cd tesoreria/servidor && npm install && npm start</code> → http://localhost:4100. Pruebas: <code>npm run prueba</code>.</li>
</ul>
<p>El front también se sirve estático en <code>/tesoreria</code> desde el Express del repo en Vercel; sin servidor detrás corre en modo demostración local.</p>
</section>

<section class="sec">
<h2>11. Lo que queda por decidir</h2>
<div class="caja"><b class="t">Custodia de las llaves de firma</b>Hoy las llaves Ed25519 del Consejo las guarda el servidor y las usa solo con sesión abierta (firma electrónica custodiada). Llevarlas al dispositivo del consejero (WebAuthn o llave de hardware) cambia la custodia, no el formato de la firma.</div>
<div class="caja"><b class="t">Anclaje del libro en la cadena</b><code>/api/libro/ancla</code> ya entrega el sello. Publicarlo en la 5550 requiere una cuenta con ORIGEN para pagar (hoy baseFee 0) y decidir la cadencia (por asiento, diaria, por dictamen).</div>
<div class="caja"><b class="t">Ejecución on-chain</b>La Tesorería autoriza; el <i>mint</i> en el contrato sigue siendo un acto del operador de la cadena. La conciliación es lo que cierra el círculo mientras tanto. MPLE, VTRE, VETA, OGS y MTP no tienen contrato registrado todavía: cuando lo tengan, entran en la conciliación.</div>
<div class="caja"><b class="t">Precio de referencia del oro</b>Se fija a mano con fuente y fecha, y queda en el libro. Puede automatizarse contra un fix público, pero conviene que siga siendo un acto del Consejo.</div>
<div class="caja"><b class="t">Genesis ID</b>El flujo de sesión única exige que el consejero tenga identidad verificada y su cuenta atada a la app que emite el token. Hay que decidir desde qué app entra el Consejo (el panel de Genesis o Veta Wallet).</div>
<h3>Estructura de archivos</h3>
<table><thead><tr><th>Archivo</th><th>Qué es</th></tr></thead><tbody>
<tr><td class="mono">tesoreria/index.html · origen.html · security.html · utility.html · prueba.html</td><td>Las páginas</td></tr>
<tr><td class="mono">tesoreria/app/estilo.css</td><td>Sistema visual: teal profundo y oro, claro/oscuro, responsive, impresión</td></tr>
<tr><td class="mono">tesoreria/app/reglas.js</td><td>Reglas, catálogos, roles y comandos (isomórfico)</td></tr>
<tr><td class="mono">tesoreria/app/datos.js</td><td>Semilla y contrato de datos</td></tr>
<tr><td class="mono">tesoreria/app/nucleo.js</td><td>Cliente de estado, sesión, chasis de interfaz</td></tr>
<tr><td class="mono">tesoreria/app/origen.js · security.js · utility.js</td><td>Las vistas de cada plataforma</td></tr>
<tr><td class="mono">tesoreria/servidor/src/index.ts · rutas.ts · store.ts · operadores.ts · cripto.ts · cadena.ts · genesis.ts · reglas.ts</td><td>El servidor</td></tr>
<tr><td class="mono">tesoreria/servidor/src/pruebas/reglas.test.ts · api.test.ts</td><td>Las 26 pruebas</td></tr>
<tr><td class="mono">tesoreria/README.md · render.yaml · genesis-id/public/cerebro-datos.js · genesis-id/src/auth/aplicaciones.ts</td><td>Documentación, despliegue e integración con Genesis</td></tr>
</tbody></table>
<p class="small faint">Unas 5 500 líneas entre front, servidor y pruebas, sin dependencias en el navegador y cuatro en el servidor (express, cors, mongodb, tsx).</p>
</section>
</body></html>`;

  await p.setContent(html, { waitUntil: 'load' });
  await p.pdf({
    path: SALIDA, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#8AA09C;padding:0 16mm;display:flex;justify-content:space-between;font-family:system-ui,sans-serif"><span>Tesorería de Orden Global · Estado del sistema · ${FECHA}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await b.close();
  console.log('pdf listo:', SALIDA, Math.round(fs.statSync(SALIDA).size / 1024), 'kB');
})();
