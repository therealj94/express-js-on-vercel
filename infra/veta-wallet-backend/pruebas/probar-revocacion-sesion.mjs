/* Una sesión revocada tiene que dejar de valer YA, no cuando venza sola.
 *
 *   node pruebas/probar-revocacion-sesion.mjs
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * `middleware/verifyToken.js` comprobaba dos cosas: que la firma cuadrara y que
 * la dirección del token fuera la del usuario. Ninguna de las dos mira si esa
 * sesión todavía tiene que existir. Se cuenta en una frase: alguien sospecha
 * que le robaron la contraseña, la cambia, y la sesión del ladrón sigue
 * moviendo su dinero.
 *
 * El mecanismo para cortarla ya estaba —`tokenVersion` en el modelo, que sube
 * al cambiar la contraseña y al borrar la cuenta— pero solo lo miraba la
 * renovación. O sea que subir la versión cerraba la puerta de renovar y dejaba
 * abierta la de usar: hasta 40 minutos más de acceso completo, que es justo el
 * rato que importa.
 *
 * Lo que se comprueba acá:
 *
 *  1. LA GUARDIA. Que rechace la ficha de una cuenta borrada y la de una
 *     versión vieja, y que siga dejando pasar la buena. La guardia se lee del
 *     archivo de verdad y se ejecuta con un `jwt` y un `Users` fingidos: sin
 *     Express y sin Mongo, que la decisión es lo único que interesa.
 *
 *  2. LAS CUATRO PUERTAS DE ENTRADA. La revocación se apoya en que el token de
 *     acceso lleve `tv` adentro. Si UNA sola puerta lo olvidara, esa puerta
 *     emitiría sesiones que la revocación no puede matar, y no habría manera de
 *     notarlo mirando el código de al lado. Se miran las cuatro.
 *
 *  3. QUE EXISTA UNA PUERTA DE SALIDA. No había ninguna: ni logout, ni salir,
 *     ni signout. Y que suba la versión, porque una salida que no sube la
 *     versión es la que había antes con otro nombre.
 *
 *  4. QUE TODO LO QUE CAMBIA LA CONTRASEÑA SUBA LA VERSIÓN. Incluido el camino
 *     de «olvidé mi contraseña», que es justamente el que usa quien ya no puede
 *     entrar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

const GUARDIA = leer("middleware", "verifyToken.js");
const AUTH = leer("controller", "authController.js");
const LLAVE = leer("controller", "llaveController.js");
const SOCIAL = leer("controller", "socialController.js");
const USUARIOS = leer("controller", "userController.js");
const RUTAS_AUTH = leer("routes", "auth.js");

let fallos = 0;
const comprobar = (ok, que, detalle = "") => {
  console.log(`  ${ok ? "ok   " : "FALLA"} ${que}${detalle ? "\n           " + detalle : ""}`);
  if (!ok) fallos++;
};

// Quita comentarios: casi todas las comprobaciones de texto de acá abajo miran
// si algo SE HACE, y la palabra suele aparecer también en el comentario que
// explica por qué se hace.
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── 1. la guardia ────────────────────────────────────────────────────────────

/* Se saca del archivo la función suelta y se ejecuta con las piezas fingidas.
 * El `jwt` finge que la firma siempre cuadra y devuelve el sobre que se le
 * pase: acá no se prueba la criptografía —eso ya lo hace
 * probar-rotacion-token.mjs— sino lo que la guardia decide CON el sobre ya
 * abierto, que es lo que estaba sin comprobar. */
function guardia() {
  const re = /const verifyTokenUser\s*=\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/;
  const trozo = GUARDIA.match(re);
  if (!trozo) throw new Error("no encontré verifyTokenUser en middleware/verifyToken.js");
  return trozo[0];
}

const TEXTO_GUARDIA = guardia();

function ejecutarGuardia({ ficha, cuenta }) {
  const jwt = { verify: () => ficha };
  const Users = { findOne: async () => cuenta };
  const entorno = { env: { PASS_TOKEN: "da-igual" } };
  const consola = { log: () => undefined };

  const fn = new Function(
    "jwt", "Users", "process", "console",
    `${TEXTO_GUARDIA}\nreturn verifyTokenUser;`
  )(jwt, Users, entorno, consola);

  return new Promise((resolve) => {
    const req = { headers: { authorization: "Bearer loquesea" } };
    const res = {
      status(codigo) {
        return { json: (cuerpo) => resolve({ paso: false, codigo, cuerpo }) };
      },
    };
    fn(req, res, () => resolve({ paso: true, codigo: 200 }));
  });
}

const DIRECCION = "0xabc0000000000000000000000000000000000001";
const cuentaViva = (extra = {}) => ({
  _id: "u1",
  address: DIRECCION,
  tokenVersion: 0,
  deletedAt: undefined,
  ...extra,
});
const fichaDe = (extra = {}) => ({ userId: "u1", address: DIRECCION, tv: 0, ...extra });

console.log("\n── la guardia de cada petición ─────────────────────────────────");

{
  const r = await ejecutarGuardia({ ficha: fichaDe(), cuenta: cuentaViva() });
  comprobar(r.paso === true, "una sesión buena entra");
}
{
  // El caso del enunciado: cambió la contraseña, la cuenta va por la versión 1,
  // y el ladrón tiene una ficha de la versión 0 todavía sin vencer.
  const r = await ejecutarGuardia({
    ficha: fichaDe({ tv: 0 }),
    cuenta: cuentaViva({ tokenVersion: 1 }),
  });
  comprobar(r.paso === false, "una ficha de una versión anterior NO entra");
  comprobar(r.codigo === 401, "y contesta 401", `contestó ${r.codigo}`);
}
{
  // Las fichas emitidas antes de este cambio no llevan `tv`. Para quien nunca
  // subió de versión no cambia nada; para quien sí, la ficha vieja cae, que es
  // exactamente lo que se buscaba.
  const conVersionCero = await ejecutarGuardia({
    ficha: { userId: "u1", address: DIRECCION },
    cuenta: cuentaViva({ tokenVersion: 0 }),
  });
  comprobar(conVersionCero.paso === true, "una ficha vieja sin `tv` vale mientras la cuenta siga en la versión 0");

  const conVersionSubida = await ejecutarGuardia({
    ficha: { userId: "u1", address: DIRECCION },
    cuenta: cuentaViva({ tokenVersion: 3 }),
  });
  comprobar(conVersionSubida.paso === false, "y NO vale si la cuenta ya subió de versión");
}
{
  /* El borrado de esta casa es marcado y anonimizante, no destructivo: la fila
     sigue existiendo con su dirección y su material cifrado para que los fondos
     sigan siendo recuperables con la semilla. Por eso `deletedAt` HAY que
     mirarlo: la cuenta borrada no desaparece de la base. */
  const r = await ejecutarGuardia({
    ficha: fichaDe(),
    cuenta: cuentaViva({ deletedAt: new Date() }),
  });
  comprobar(r.paso === false, "la sesión de una cuenta eliminada NO entra");
}
{
  const r = await ejecutarGuardia({ ficha: fichaDe(), cuenta: null });
  comprobar(r.paso === false, "sin cuenta en la base no se entra");
  comprobar(r.codigo === 401, "y con un 401, no con un 500 por accidente",
    `contestó ${r.codigo}`);
}
{
  // La comprobación que ya existía, que no se puede haber perdido por el camino.
  const r = await ejecutarGuardia({
    ficha: fichaDe({ address: "0x9999999999999999999999999999999999999999" }),
    cuenta: cuentaViva(),
  });
  comprobar(r.paso === false, "una dirección que no es la de la cuenta sigue sin entrar");
}

console.log("\n── y la guardia de administración, que tenía el mismo hueco ────");
{
  /* `isAdmin.js` compara el token que llega con el que hay guardado en
     `user.token`, y eso impone UNA sesión a la vez — que no es lo mismo que
     revocar. Si el ladrón fue el último en entrar, el token guardado es el SUYO
     y la comparación le da la razón. Sin las mismas dos comprobaciones que la
     otra guardia, las rutas de administración serían el único sitio del backend
     donde cambiar la contraseña no echa a nadie. */
  const ADMIN = leer("middleware", "isAdmin.js");
  const limpio = sinComentarios(ADMIN);
  comprobar(/decodedToken\.tv\s*\|\|\s*0\)\s*!==\s*\(user\.tokenVersion/.test(limpio),
    "isAdmin.js también compara la versión de sesión");
  comprobar(/if\s*\(user\.deletedAt\)/.test(limpio),
    "y también mira si la cuenta está eliminada");
  comprobar(/if\s*\(!user\)/.test(limpio),
    "y que la cuenta exista, antes de tocarle ningún campo");
}

// ── 2. las cuatro puertas de entrada ─────────────────────────────────────────

console.log("\n── el `tv` viaja en TODAS las sesiones que se emiten ────────────");

/* Se busca cada firma de token de ACCESO —la que lleva `address`, a diferencia
 * de la de refresco que lleva `type: "refresh"`— y se mira que dentro esté el
 * `tv`. Sin él, la guardia de arriba no tiene con qué comparar. */
const PUERTAS = [
  ["authController · login y refresh", AUTH, 2],
  ["llaveController · entrar con la llave", LLAVE, 1],
  ["socialController · Google y Apple", SOCIAL, 1],
];

for (const [nombre, fuente, cuantas] of PUERTAS) {
  const limpio = sinComentarios(fuente);
  const firmas = limpio.match(/jwt\.sign\(\s*\{[\s\S]*?\}/g) || [];
  const deAcceso = firmas.filter((f) => /address:/.test(f));
  comprobar(deAcceso.length === cuantas,
    `${nombre}: se encontraron las ${cuantas} sesión(es) de acceso que emite`,
    `encontradas ${deAcceso.length}`);
  comprobar(deAcceso.length > 0 && deAcceso.every((f) => /\btv:/.test(f)),
    `${nombre}: todas llevan \`tv\` adentro`);
}

// ── 3. la puerta de salida ───────────────────────────────────────────────────

console.log("\n── cerrar sesión existe y de verdad cierra ─────────────────────");

const RUTAS_LIMPIAS = sinComentarios(RUTAS_AUTH);
comprobar(/router\.post\(\s*['"]\/(logout|cerrar-sesion)['"]/.test(RUTAS_LIMPIAS),
  "hay una ruta para cerrar sesión");
comprobar(/\/logout['"]\s*,\s*verifyTokenUser/.test(RUTAS_LIMPIAS) ||
  /\/cerrar-sesion['"]\s*,\s*verifyTokenUser/.test(RUTAS_LIMPIAS),
  "y va detrás de la guardia de sesión: solo cierra la suya quien tiene una");

{
  /* La ruta se ejecuta de verdad, con un `Users` fingido, para comprobar que
     SUBE la versión. Una salida que no sube la versión es la de antes con otro
     nombre: el cliente tira su token y el servidor lo sigue aceptando. */
  const re = /export const cerrarSesion\s*=\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/;
  const trozo = AUTH.match(re);
  comprobar(Boolean(trozo), "cerrarSesion está en authController.js");

  if (trozo) {
    const guardado = { tokenVersion: 4, token: "sesion-de-admin-cifrada", save: async () => { guardado.guardo = true; } };
    const User = { findById: async () => guardado };
    const jwt = { verify: () => ({ userId: "u1" }) };
    const entorno = { env: { PASS_TOKEN: "da-igual" } };
    const consola = { log: () => undefined };

    const fn = new Function(
      "User", "jwt", "process", "console",
      `${trozo[0].replace(/^export /, "")}\nreturn cerrarSesion;`
    )(User, jwt, entorno, consola);

    let salida = null;
    const res = { status: () => ({ json: (c) => { salida = c; } }) };
    await fn({ headers: { authorization: "Bearer loquesea" } }, res);

    comprobar(guardado.tokenVersion === 5, "cerrar sesión SUBE la versión",
      `tokenVersion quedó en ${guardado.tokenVersion}`);
    comprobar(guardado.guardo === true, "y lo guarda");
    comprobar(guardado.token === undefined,
      "y borra la sesión guardada que compara isAdmin.js");
    comprobar(salida !== null, "y le contesta algo a quien llamó");
  }
}

// ── 4. todo lo que cambia la contraseña ──────────────────────────────────────

console.log("\n── cambiar la contraseña corta lo que hubiera abierto ──────────");

/* Saca el cuerpo de una función exportada, para poder mirar dentro de ESA y no
 * de todo el archivo: `tokenVersion` aparece en varios sitios del mismo fichero
 * y encontrarlo «en alguna parte» no dice nada. */
function cuerpoDe(fuente, nombre) {
  const re = new RegExp(`export const ${nombre}\\s*=\\s*async[\\s\\S]*?\\n\\};`);
  const t = fuente.match(re);
  return t ? sinComentarios(t[0]) : null;
}

const SUBE = /tokenVersion\s*=\s*\(\s*user\.tokenVersion\s*\|\|\s*0\s*\)\s*\+\s*1/;

for (const [nombre, fuente, funcion] of [
  ["cambiar la contraseña desde ajustes", USUARIOS, "changePassword"],
  ["«olvidé mi contraseña»", AUTH, "resetPassword"],
  ["eliminar la cuenta", USUARIOS, "deleteAccount"],
]) {
  const cuerpo = cuerpoDe(fuente, funcion);
  comprobar(Boolean(cuerpo), `se encuentra ${funcion}()`);
  if (cuerpo) comprobar(SUBE.test(cuerpo), `${nombre} sube la versión de sesión`);
}

console.log(fallos ? `\n${fallos} comprobación(es) en rojo\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
