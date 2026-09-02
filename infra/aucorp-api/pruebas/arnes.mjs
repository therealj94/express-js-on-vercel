/* El arnés que comparten las pruebas del API.
 *
 * Levanta un Mongo en memoria, un Genesis FINGIDO —fingido sólo Genesis, que
 * es de otra casa; todo lo de AuCorp corre de verdad— y el app.js real
 * escuchando en un puerto libre. Devuelve `pedir()` para hablarle y
 * `cerrar()` para apagarlo todo.
 *
 * El Genesis fingido es exactamente igual de estricto que el real en lo que
 * importa: un token que empieza por `sinkyc` es una identidad SIN verificar,
 * y nada más que eso se inventa.
 */
import http from 'node:http';

export async function levantar() {
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import('mongodb-memory-server'));
  } catch {
    console.log('mongodb-memory-server no está instalado (falta npm install): esta prueba NO corrió y NO probó nada.');
    process.exit(0);
  }

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

  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.GENESIS_URL = `http://127.0.0.1:${genesisFalso.address().port}`;
  process.env.GENESIS_API_KEY = 'clave-de-prueba';
  process.env.AUCORP_TOKEN = 'secreto-largo-de-prueba-para-firmar-sesiones';
  process.env.AUCORP_ADMIN_KEY = 'clave-de-operaciones-de-prueba';
  process.env.CORS_ORIGENES = 'http://localhost';
  process.env.AUCORP_BARRIDO = 'no';
  process.env.PORT = '0';

  const { default: mongoose } = await import('mongoose');
  const { default: app } = await import('../app.js');
  await new Promise((ok) => setTimeout(ok, 400));

  const BASE = `http://127.0.0.1:${app.servidor.address().port}`;
  const ADMIN = process.env.AUCORP_ADMIN_KEY;

  const pedir = async (ruta, { metodo = 'GET', token, admin, cuerpo, crudo } = {}) => {
    const cab = { 'Content-Type': 'application/json' };
    if (token) cab.Authorization = `Bearer ${token}`;
    if (admin) cab['X-Admin-Key'] = admin;
    const r = await fetch(BASE + ruta, {
      method: metodo, headers: cab,
      body: crudo !== undefined ? crudo : (cuerpo === undefined ? undefined : JSON.stringify(cuerpo)),
    });
    const tipo = r.headers.get('content-type') || '';
    if (!tipo.includes('json')) return { estado: r.status, texto: await r.text(), cabeceras: r.headers, datos: {} };
    return { estado: r.status, datos: await r.json().catch(() => ({})), cabeceras: r.headers };
  };

  /** Entra con un token de SSO (= el gid, en el Genesis fingido). */
  const entrar = async (gid) => (await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token: gid } })).datos.token;

  const cerrar = async () => {
    await mongoose.disconnect();
    await mongo.stop();
    genesisFalso.close();
    app.servidor.close();
  };

  return { pedir, entrar, cerrar, ADMIN, BASE, mongoose, app };
}

/** El contador de fallos y los dos verbos de todas las suites. */
export function contador() {
  let fallos = 0;
  const comprobar = (ok, que, detalle = '') => {
    console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
    if (!ok) fallos++;
  };
  const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);
  const terminar = () => {
    console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
    return fallos;
  };
  return { comprobar, decir, terminar };
}
