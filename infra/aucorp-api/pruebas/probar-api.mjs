/* El API entero, de punta a punta.
 *
 *   node pruebas/probar-api.mjs
 *
 * Mongo en memoria y un Genesis fingido —fingido SOLO Genesis, que es de otra
 * casa; todo lo de AuCorp corre de verdad, incluida la tasa de cambio real—.
 *
 * Lo que se persigue: que el recorrido completo funcione (entrar, abrir
 * cuenta, que entre dinero por la frontera, transferir, cambiar de moneda, ver
 * el extracto) y que las puertas cerradas estén cerradas: sin sesión no se
 * mira nada, sin clave de operaciones no entra dinero, y sin KYC no se mueve.
 */
let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no está instalado: esta prueba NO corrió y NO probó nada.');
  process.exit(0);
}

const http = await import('node:http');

// ── El Genesis fingido ──────────────────────────────────────────────────────
// El token que llega ES el gid. Un token que empieza por `sinkyc` devuelve una
// identidad sin verificar, para poder probar esa puerta.
const genesisFalso = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (d) => { cuerpo += d; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/sso/verificar') {
      const { token } = JSON.parse(cuerpo || '{}');
      return res.end(JSON.stringify({
        valido: true, gid: token,
        perfil: {
          verificada: !String(token).startsWith('sinkyc'),
          nombre: `Titular ${token}`,
          apps: [{ app: 'veta-wallet', direccion: '0x' + '1'.repeat(40) }],
        },
      }));
    }
    if (req.url === '/api/v1/movimientos') return res.end(JSON.stringify({ ok: true }));
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((ok) => genesisFalso.listen(0, ok));

const servidor = await MongoMemoryServer.create();
process.env.MONGODB_URI = servidor.getUri();
process.env.GENESIS_URL = `http://127.0.0.1:${genesisFalso.address().port}`;
process.env.GENESIS_API_KEY = 'clave-de-prueba';
process.env.AUCORP_TOKEN = 'secreto-largo-de-prueba-para-firmar-sesiones';
process.env.AUCORP_ADMIN_KEY = 'clave-de-operaciones-de-prueba';
process.env.CORS_ORIGENES = 'http://localhost';
process.env.PORT = '0';

const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../app.js');
// app.js ya llamó a listen(0) y exporta su servidor.
await new Promise((ok) => setTimeout(ok, 400));

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

const BASE = `http://127.0.0.1:${app.servidor.address().port}`;

const pedir = async (ruta, { metodo = 'GET', token, admin, cuerpo } = {}) => {
  const cab = { 'Content-Type': 'application/json' };
  if (token) cab.Authorization = `Bearer ${token}`;
  if (admin) cab['X-Admin-Key'] = admin;
  const r = await fetch(BASE + ruta, {
    method: metodo, headers: cab,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
};
const ADMIN = 'clave-de-operaciones-de-prueba';

decir('la lista de monedas es pública y dice lo que NO promete');
{
  const r = await pedir('/monedas');
  comprobar(r.estado === 200 && r.datos.monedas?.length === 21, 'las 21 monedas, sin sesión');
  comprobar(/corresponsal/.test(r.datos.aviso || ''),
    'y avisa que manejar una moneda no es poder liquidarla en ese país');
}

decir('entrar con Genesis ID');
let ana, beto;
{
  const r = await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token: 'gid-ana' } });
  comprobar(r.estado === 200 && !!r.datos.token, 'Ana entra con su token de SSO', String(r.estado));
  comprobar(r.datos.usuario?.verificada === true, 'y viene marcada como verificada');
  comprobar(r.datos.usuario?.direccionWallet?.startsWith('0x'),
    'y trae la dirección de su Veta Wallet — los dos lados, un solo dueño');
  ana = r.datos.token;

  const r2 = await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token: 'gid-beto' } });
  beto = r2.datos.token;

  const sin = await pedir('/cuentas');
  comprobar(sin.estado === 401, 'sin sesión no se ven las cuentas de nadie', String(sin.estado));
}

decir('abrir cuentas en moneda local');
{
  for (const m of ['USD', 'HNL', 'CLP']) {
    const r = await pedir('/cuentas', { metodo: 'POST', token: ana, cuerpo: { moneda: m } });
    comprobar(r.estado === 200 && r.datos.cuenta?.moneda === m, `Ana abre su cuenta en ${m}`, String(r.estado));
  }
  const otra = await pedir('/cuentas', { metodo: 'POST', token: ana, cuerpo: { moneda: 'USD' } });
  comprobar(otra.estado === 200, 'abrir dos veces la misma no es un error ni crea otra cuenta');

  await pedir('/cuentas', { metodo: 'POST', token: beto, cuerpo: { moneda: 'USD' } });

  const mala = await pedir('/cuentas', { metodo: 'POST', token: ana, cuerpo: { moneda: 'XXX' } });
  comprobar(mala.estado === 400, 'una moneda inventada se rechaza');
}

decir('SIN KYC NO SE MUEVE DINERO');
{
  const r = await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token: 'sinkyc-carlos' } });
  comprobar(r.estado === 200, 'un usuario sin verificar SÍ puede entrar y mirar la casa');
  const abrir = await pedir('/cuentas', { metodo: 'POST', token: r.datos.token, cuerpo: { moneda: 'USD' } });
  comprobar(abrir.estado === 403 && abrir.datos.codigo === 'IDENTIDAD_SIN_VERIFICAR',
    'pero no puede abrir cuenta, y se le dice POR QUÉ para que pueda terminarlo',
    JSON.stringify(abrir.datos));
}

decir('LA FRONTERA: el dinero entra solo por operaciones');
{
  const sinClave = await pedir('/tesoreria/deposito', { metodo: 'POST', cuerpo: {
    gid: 'gid-ana', moneda: 'USD', monto: '1000000', ref: 'intento-robo-0001', comprobante: 'x' } });
  comprobar(sinClave.estado === 401, 'sin clave de operaciones NO se acredita nada', String(sinClave.estado));

  const comoUsuario = await pedir('/tesoreria/deposito', { metodo: 'POST', token: ana, cuerpo: {
    gid: 'gid-ana', moneda: 'USD', monto: '1000000', ref: 'intento-robo-0002', comprobante: 'x' } });
  comprobar(comoUsuario.estado === 401,
    'y una sesión de usuario TAMPOCO sirve: nadie se acredita su propio depósito');

  const sinComprobante = await pedir('/tesoreria/deposito', { metodo: 'POST', admin: ADMIN, cuerpo: {
    gid: 'gid-ana', moneda: 'USD', monto: '500', ref: 'dep-sin-comprobante-1' } });
  comprobar(sinComprobante.estado === 400 && sinComprobante.datos.codigo === 'COMPROBANTE_FALTA',
    'un depósito sin comprobante del corresponsal se rechaza', JSON.stringify(sinComprobante.datos));

  // El sello de idempotencia tiene que ser una llave de verdad. Un «tr-1» que
  // el propio usuario puede repetir sin darse cuenta le devolvería en silencio
  // la operación vieja creyendo que hizo una nueva.
  const refCorta = await pedir('/tesoreria/deposito', { metodo: 'POST', admin: ADMIN, cuerpo: {
    gid: 'gid-ana', moneda: 'USD', monto: '500', ref: 'a1', comprobante: 'x' } });
  comprobar(refCorta.estado === 400 && refCorta.datos.codigo === 'REF_FALTA',
    'y un sello demasiado corto para ser único tampoco vale', JSON.stringify(refCorta.datos));

  const ok = await pedir('/tesoreria/deposito', { metodo: 'POST', admin: ADMIN, cuerpo: {
    gid: 'gid-ana', moneda: 'USD', monto: '1,000.00', ref: 'deposito-ana-20260817-4471',
    comprobante: 'Extracto corresponsal 2026-08-17 #4471' } });
  comprobar(ok.estado === 200 && ok.datos.monto?.texto === '1000.00',
    'operaciones acredita 1,000.00 USD (escrito a la americana y leído bien)',
    JSON.stringify(ok.datos.monto));

  const otra = await pedir('/tesoreria/deposito', { metodo: 'POST', admin: ADMIN, cuerpo: {
    gid: 'gid-ana', moneda: 'USD', monto: '1000', ref: 'deposito-ana-20260817-4471', comprobante: 'el mismo' } });
  comprobar(otra.datos.repetido === true, 'y el mismo sello no acredita dos veces');

  const saldo = await pedir('/cuentas', { token: ana });
  const usd = saldo.datos.cuentas.find((c) => c.moneda === 'USD');
  comprobar(usd?.saldo?.texto === '1000.00', 'Ana ve 1000.00 en su cuenta', usd?.saldo?.texto);
}

decir('transferir a otro cliente');
{
  const r = await pedir('/movimientos/transferir', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'transferencia-ana-beto-0001', para: 'gid-beto', moneda: 'USD', monto: '250,50' } });
  comprobar(r.estado === 200, 'Ana le manda 250,50 a Beto (escrito a la europea)', JSON.stringify(r.datos));

  const deBeto = await pedir('/cuentas', { token: beto });
  comprobar(deBeto.datos.cuentas.find((c) => c.moneda === 'USD')?.saldo?.texto === '250.50',
    'y a Beto le llegan 250.50 exactos');

  /* Una cifra absurda choca primero con el LÍMITE, no con el saldo, porque el
     límite se comprueba antes de tocar el libro. Es el orden correcto: lo
     barato y lo que no deja rastro va delante. Que además no tenga el dinero
     se comprueba abajo, con el nivel arriba, donde el límite ya no estorba. */
  const mucho = await pedir('/movimientos/transferir', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'transferencia-ana-beto-0002', para: 'gid-beto', moneda: 'USD', monto: '999999' } });
  comprobar(mucho.estado === 400 && mucho.datos.codigo === 'LIMITE_DIARIO',
    'una cifra absurda choca primero con el límite, que se mira antes que el libro',
    JSON.stringify(mucho.datos.codigo));

  const aSiMismo = await pedir('/movimientos/transferir', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'transferencia-ana-ana-0003', para: 'gid-ana', moneda: 'USD', monto: '1' } });
  comprobar(aSiMismo.estado === 400, 'ni transferirse a sí misma');
}

decir('cambiar de moneda, con la tasa REAL guardada en el asiento');
{
  const c = await pedir('/movimientos/cotizar?de=USD&a=HNL&monto=100', { token: ana });
  comprobar(c.estado === 200 && c.datos.cotizacion?.cuando,
    'la cotización llega con la fecha de la fuente', c.datos.cotizacion?.cuando);

  const r = await pedir('/movimientos/cambiar', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'cambio-ana-usd-hnl-0001', de: 'USD', a: 'HNL', monto: '100.00' } });
  comprobar(r.estado === 200, 'Ana cambia 100.00 USD a lempiras', JSON.stringify(r.datos.recibe || r.datos));
  comprobar(Number(r.datos.recibe?.texto) > 1500, 'y recibe lempiras de verdad, no un 1:1',
    r.datos.recibe?.texto);

  const ext = await pedir('/movimientos?moneda=HNL', { token: ana });
  const fx = ext.datos.movimientos?.[0];
  comprobar(/Cambio USD→HNL a \d+/.test(fx?.glosa || ''),
    'y el asiento guarda la tasa aplicada, la media y el margen', fx?.glosa);

  const chico = await pedir('/movimientos/cambiar', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'cambio-ana-clp-usd-0002', de: 'CLP', a: 'USD', monto: '1' } });
  comprobar(chico.estado === 400 && chico.datos.codigo === 'MONTO_MINIMO',
    'un monto que no llega ni a una unidad de la otra moneda se rechaza en vez de quedárselo',
    JSON.stringify(chico.datos));
}

decir('la libreta de destinos');
let benBanco;
{
  const interno = await pedir('/beneficiarios', { metodo: 'POST', token: ana, cuerpo: {
    alias: 'Beto', tipo: 'interno', moneda: 'USD', gidDestino: 'gid-beto' } });
  comprobar(interno.estado === 200, 'Ana guarda a Beto como destino interno', JSON.stringify(interno.datos));

  const r = await pedir('/beneficiarios', { metodo: 'POST', token: ana, cuerpo: {
    alias: 'Mi cuenta del banco', tipo: 'bancario', moneda: 'USD',
    banco: 'Banco Atlántida', titular: 'Ana Pérez', numero: '01234567890123', pais: 'Honduras' } });
  comprobar(r.estado === 200, 'y su propia cuenta bancaria');
  benBanco = r.datos.beneficiario?.id;
  comprobar(r.datos.beneficiario?.numero === '···0123',
    'el número vuelve ENMASCARADO: alcanza para reconocerlo, no para copiarlo',
    r.datos.beneficiario?.numero);

  const sinKyc = await pedir('/beneficiarios', { metodo: 'POST', token: ana, cuerpo: {
    alias: 'Alguien', tipo: 'interno', moneda: 'USD', gidDestino: 'sinkyc-carlos' } });
  comprobar(sinKyc.estado === 400,
    'guardar a alguien que NO puede recibir se rechaza AHORA, no cuando ya mandó el dinero');

  const repe = await pedir('/beneficiarios', { metodo: 'POST', token: ana, cuerpo: {
    alias: 'Beto', tipo: 'interno', moneda: 'USD', gidDestino: 'gid-beto' } });
  comprobar(repe.estado === 400, 'y dos destinos con el mismo nombre, tampoco');
}

decir('a dónde deposita la gente: la cuenta REAL de la casa');
{
  const sinNada = await pedir('/deposito/instrucciones?moneda=USD', { token: ana });
  comprobar(sinNada.estado === 404 && sinNada.datos.codigo === 'SIN_CORRESPONSAL',
    'sin corresponsal cargado NO se inventa una cuenta ni se enseña la de otra moneda',
    JSON.stringify(sinNada.datos));

  const carga = await pedir('/tesoreria/corresponsal', { metodo: 'POST', admin: ADMIN, cuerpo: {
    moneda: 'USD', banco: 'Banco de prueba', titular: 'AuCorp LLC',
    numero: '9999-0000-1111', swift: 'TESTUS33',
    instrucciones: 'Transferencia ACH o wire.' } });
  comprobar(carga.estado === 200, 'operaciones carga la cuenta de la plaza');

  const con = await pedir('/deposito/instrucciones?moneda=USD', { token: ana });
  comprobar(con.estado === 200 && con.datos.instrucciones?.banco === 'Banco de prueba',
    'y ahora sí se le dice a la gente a dónde mandar');
  comprobar(con.datos.referencia === 'gid-ana' && /referencia/.test(con.datos.aviso || ''),
    'con su Genesis ID como referencia — sin eso el depósito llega sin dueño');

  const otra = await pedir('/deposito/instrucciones?moneda=PYG', { token: ana });
  comprobar(otra.estado === 404,
    'que el sistema sepa contar guaraníes no quiere decir que haya dónde recibirlos');
}

decir('UN RETIRO SE PIDE, NO SE EJECUTA');
let solicitud;
{
  const antes = (await pedir('/cuentas', { token: ana })).datos.cuentas.find((c) => c.moneda === 'USD');

  const r = await pedir('/solicitudes/retiro', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'retiro-ana-0001', moneda: 'USD', monto: '100.00', beneficiario: benBanco } });
  comprobar(r.estado === 200 && r.datos.solicitud?.estado === 'pendiente',
    'Ana pide retirar 100.00 y queda pendiente', JSON.stringify(r.datos.solicitud?.estado || r.datos));
  solicitud = r.datos.solicitud?.id;

  const despues = (await pedir('/cuentas', { token: ana })).datos.cuentas.find((c) => c.moneda === 'USD');
  comprobar(Number(antes.saldo.texto) - Number(despues.saldo.texto) === 100,
    'y el dinero SALE de su saldo al pedirlo, no cuando se pague',
    `${antes.saldo.texto} → ${despues.saldo.texto}`);

  const otroMas = await pedir('/solicitudes/retiro', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'retiro-ana-imposible', moneda: 'USD', monto: '99999', beneficiario: benBanco } });
  comprobar(otroMas.datos.codigo === 'SALDO_INSUFICIENTE',
    'no se puede pedir dos veces el mismo dinero: lo apartado ya no está disponible');

  const otraMoneda = await pedir('/solicitudes/retiro', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'retiro-ana-hnl-0001', moneda: 'HNL', monto: '100', beneficiario: benBanco } });
  comprobar(otraMoneda.datos.codigo === 'MONEDA_DEL_DESTINO',
    'ni mandar lempiras a una cuenta de dólares');
}

decir('operaciones paga, y sin comprobante no paga');
{
  const cola = await pedir('/tesoreria/solicitudes?estado=pendiente', { admin: ADMIN });
  comprobar(cola.datos.solicitudes?.length === 1, 'la cola tiene el retiro esperando',
    String(cola.datos.solicitudes?.length));

  const sinComp = await pedir(`/tesoreria/solicitudes/${solicitud}/ejecutar`, {
    metodo: 'POST', admin: ADMIN, cuerpo: {} });
  comprobar(sinComp.estado === 400, 'sin comprobante del pago no se cierra');

  const paga = await pedir(`/tesoreria/solicitudes/${solicitud}/ejecutar`, {
    metodo: 'POST', admin: ADMIN, cuerpo: { comprobante: 'Wire 2026-08-17 #8812' } });
  comprobar(paga.datos.solicitud?.estado === 'ejecutada', 'con comprobante sí',
    JSON.stringify(paga.datos.solicitud?.estado || paga.datos));

  const otraVez = await pedir(`/tesoreria/solicitudes/${solicitud}/ejecutar`, {
    metodo: 'POST', admin: ADMIN, cuerpo: { comprobante: 'el mismo' } });
  comprobar(otraVez.estado === 409,
    'y el mismo retiro no se paga dos veces aunque dos personas lo intenten');
}

decir('un retiro rechazado devuelve TODO y libera el límite');
{
  const antes = (await pedir('/cuentas', { token: ana })).datos.cuentas.find((c) => c.moneda === 'USD');
  const r = await pedir('/solicitudes/retiro', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'retiro-ana-0002', moneda: 'USD', monto: '50.00', beneficiario: benBanco } });

  const sinNota = await pedir(`/tesoreria/solicitudes/${r.datos.solicitud.id}/rechazar`, {
    metodo: 'POST', admin: ADMIN, cuerpo: {} });
  comprobar(sinNota.estado === 400,
    'un rechazo sin motivo se rechaza: el cliente no podría corregir nada');

  const no = await pedir(`/tesoreria/solicitudes/${r.datos.solicitud.id}/rechazar`, {
    metodo: 'POST', admin: ADMIN, cuerpo: { nota: 'El titular de la cuenta no coincide.' } });
  comprobar(no.datos.solicitud?.estado === 'rechazada', 'operaciones lo rechaza con motivo');

  const despues = (await pedir('/cuentas', { token: ana })).datos.cuentas.find((c) => c.moneda === 'USD');
  comprobar(antes.saldo.texto === despues.saldo.texto,
    'y el dinero vuelve ENTERO — si no se pagó, no se cobra',
    `${antes.saldo.texto} → ${despues.saldo.texto}`);

  const mias = await pedir('/solicitudes', { token: ana });
  comprobar(mias.datos.solicitudes?.length === 2, 'Ana ve las dos en su historial');
  comprobar(mias.datos.solicitudes.every((s) => s.beneficiario?.numero === '···0123'),
    'con el destino congelado tal como estaba al pedirlo');
}

decir('LOS LÍMITES: el nivel 1 no mueve lo que mueve el nivel 3');
{
  const r = await pedir('/movimientos/transferir', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'transferencia-pasada-de-limite', para: 'gid-beto', moneda: 'USD', monto: '900' } });
  comprobar(r.estado === 400 && r.datos.codigo === 'LIMITE_DIARIO',
    'una transferencia que pasa el tope diario se corta', JSON.stringify(r.datos.codigo));
  comprobar(!!r.datos.limite?.usado && !!r.datos.limite?.tope,
    'y se le dice cuánto lleva usado y cuál es su tope, que son datos suyos',
    JSON.stringify(r.datos.limite));

  const sube = await pedir('/tesoreria/nivel', { metodo: 'POST', admin: ADMIN, cuerpo: {
    gid: 'gid-ana', nivel: 3, motivo: 'Expediente completo, prueba' } });
  comprobar(sube.datos.nivel === 3, 'operaciones le sube el nivel con motivo');

  const sinMotivo = await pedir('/tesoreria/nivel', { metodo: 'POST', admin: ADMIN, cuerpo: {
    gid: 'gid-ana', nivel: 2 } });
  comprobar(sinMotivo.estado === 400, 'y sin motivo no se cambia un límite');

  const ahora = await pedir('/movimientos/transferir', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'transferencia-con-nivel-3', para: 'gid-beto', moneda: 'USD', monto: '400' } });
  comprobar(ahora.estado === 200, 'y con el nivel arriba la misma cuenta ya puede mover más',
    JSON.stringify(ahora.datos.codigo || 'ok'));

  // Y ahora que el límite no estorba, la otra guarda: el saldo.
  const sinPlata = await pedir('/movimientos/transferir', { metodo: 'POST', token: ana, cuerpo: {
    ref: 'transferencia-sin-plata', para: 'gid-beto', moneda: 'USD', monto: '90000' } });
  comprobar(sinPlata.datos.codigo === 'SALDO_INSUFICIENTE',
    'subir el límite NO regala dinero: sigue sin poder mandar lo que no tiene',
    JSON.stringify(sinPlata.datos.codigo));
}

decir('el extracto y el cuadre');
{
  const ext = await pedir('/movimientos', { token: ana });
  comprobar(ext.datos.movimientos?.length >= 6, 'Ana ve sus movimientos', String(ext.datos.movimientos?.length));
  comprobar(ext.datos.movimientos.every((m) => m.lineas.some((l) => l.cuenta === 'yo')),
    'y en cada uno se ve cuál es su lado');

  const r = await pedir('/tesoreria/reconciliar', { admin: ADMIN });
  comprobar(r.estado === 200 && r.datos.problemas?.length === 0,
    'y el libro y los saldos cuadran al céntimo tras todo el recorrido',
    JSON.stringify(r.datos.problemas));
}

decir('/salud dice la verdad, incluido lo que esta casa NO es');
{
  const r = await pedir('/salud');
  comprobar(r.estado === 200 && r.datos.mongo === true, 'la base está y se dice');
  comprobar(/No es un banco/.test(r.datos.naturaleza || ''),
    'y el propio servicio aclara que no es un banco con licencia', r.datos.naturaleza);
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
await mongoose.disconnect();
await servidor.stop();
genesisFalso.close();
process.exit(fallos ? 1 : 0);
