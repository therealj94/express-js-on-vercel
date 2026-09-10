/* Cambiar la contraseña desde ajustes: verifica la actual, exige ocho, echa a
 * los demás y a vos no.
 *
 *   node pruebas/probar-cambio-clave.mjs
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * `POST /users/changePassword` existía desde el primer día y ninguna pantalla
 * la llamaba. Al conectarla desde la app y la web aparecieron tres huecos: no
 * comprobaba tipos, no tenía política de largo, y al subir `tokenVersion`
 * mataba también la sesión que pidió el cambio —«contraseña cambiada» y en la
 * pantalla siguiente «sesión vencida»—.
 *
 * Lo que se comprueba acá:
 *
 *  1. LA FUNCIÓN DE VERDAD, con dobles que son MÁS estrictos que lo real, no
 *     menos: el `bcrypt` fingido lanza con cualquier cosa que no sea texto
 *     (el de verdad también), y solo da por buena la contraseña que coincide
 *     letra por letra con la guardada.
 *  2. Que un cuerpo malformado —campos ausentes, un objeto de Mongo donde iba
 *     un texto— se rechace ANTES de tocar la base o bcrypt.
 *  3. Que la nueva tenga ocho o más, y sea distinta de la actual.
 *  4. Que con la actual equivocada NO se guarde nada: ni contraseña, ni
 *     versión, ni sesión.
 *  5. Que con todo bien: la contraseña queda hasheada, la versión sube UNO, se
 *     firma un par nuevo (acceso + refresco) con esa versión —para que quien
 *     cambió siga adentro— y la sesión guardada de administración pasa a ser
 *     la nueva.
 *  6. Y que la ruta siga detrás de la guardia de sesión y del limitador duro,
 *     que es lo que la hace inservible como oráculo para adivinar contraseñas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

const USUARIOS = leer("controller", "userController.js");
const RUTAS = leer("routes", "users.js");
const APP = leer("app.js");

let fallos = 0;
const comprobar = (ok, que, detalle = "") => {
  console.log(`  ${ok ? "ok   " : "FALLA"} ${que}${detalle ? "\n           " + detalle : ""}`);
  if (!ok) fallos++;
};
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── la función, sacada del archivo de verdad ─────────────────────────────────

/* Se toma `changePassword` entera y la constante de la política que usa. Si un
 * día la función cambia de forma y esto no la encuentra, la prueba se cae en
 * vez de pasar en silencio contra una copia vieja. */
function textoDe(re, que) {
  const m = USUARIOS.match(re);
  if (!m) throw new Error(`no encontré ${que} en controller/userController.js`);
  return m[0];
}
const CONSTANTE = textoDe(/const CLAVE_MINIMO\s*=\s*\d+;/, "CLAVE_MINIMO");
const FUNCION = textoDe(
  /export const changePassword\s*=\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/,
  "changePassword()"
).replace(/^export /, "");

const DIRECCION = "0xabc0000000000000000000000000000000000001";

/* Cada caso arma su propio mundo: la cuenta guardada, lo que llega en el
 * cuerpo, y devuelve lo que la función contestó más lo que dejó escrito. */
async function ejecutar({ cuerpo, cuenta }) {
  const firmados = [];
  const jwt = {
    verify: () => ({ userId: "u1", address: DIRECCION, tv: cuenta ? cuenta.tokenVersion : 0 }),
    sign: (carga, secreto, opciones) => {
      firmados.push({ carga, opciones });
      return `firmado:${JSON.stringify(carga)}`;
    },
  };
  /* bcrypt de mentira, MÁS estricto que el de verdad: el real lanza con
   * cualquier cosa que no sea texto, y este también. `compare` solo acepta la
   * contraseña cuya huella es exactamente la guardada. */
  const bcrypt = {
    compare: async (clave, hash) => {
      if (typeof clave !== "string" || typeof hash !== "string") throw new Error("data and hash must be strings");
      return hash === `hash:${clave}`;
    },
    hash: async (clave) => {
      if (typeof clave !== "string") throw new Error("data must be a string");
      return `hash:${clave}`;
    },
  };
  const consultas = [];
  const Users = { findOne: async (q) => { consultas.push(q); return cuenta; } };
  const cifrarConToken = (x) => `cifrado:${x}`;
  const entorno = { env: { PASS_TOKEN: "da-igual" } };
  const consola = { log: () => undefined };

  const fn = new Function(
    "jwt", "bcrypt", "Users", "cifrarConToken", "process", "console",
    `${CONSTANTE}\n${FUNCION}\nreturn changePassword;`
  )(jwt, bcrypt, Users, cifrarConToken, entorno, consola);

  return new Promise((resolve) => {
    const req = { headers: { authorization: "Bearer loquesea" }, body: cuerpo };
    const terminar = (codigo) => (salida) => resolve({ codigo, salida, firmados, consultas });
    const res = {
      status(codigo) { return { json: terminar(codigo), send: terminar(codigo) }; },
      json: terminar(200),
      send: terminar(200),
    };
    fn(req, res);
  });
}

const cuentaViva = () => {
  const c = {
    _id: "u1", address: DIRECCION, role: "user", isVerified: true,
    password: "hash:laVieja123", tokenVersion: 2, token: "sesion-vieja-cifrada",
    guardo: 0,
    save: async () => { c.guardo++; },
  };
  return c;
};

console.log("\n── un cuerpo malformado no llega ni a la base ──────────────────");
{
  const r = await ejecutar({ cuerpo: {}, cuenta: cuentaViva() });
  comprobar(r.codigo === 400, "sin campos: 400", `contestó ${r.codigo}`);
  comprobar(r.consultas.length === 0, "y no consultó la base");
}
{
  const r = await ejecutar({ cuerpo: { currentPassword: "laVieja123" }, cuenta: cuentaViva() });
  comprobar(r.codigo === 400, "sin la nueva: 400", `contestó ${r.codigo}`);
}
{
  /* El operador de Mongo donde iba un texto. Antes llegaba a bcrypt y salía un
     500 con un mensaje de biblioteca; ahora es un 400 y la base ni se entera. */
  const r = await ejecutar({
    cuerpo: { currentPassword: { $ne: null }, newPassword: "unaNuevaLarga1" },
    cuenta: cuentaViva(),
  });
  comprobar(r.codigo === 400, "un objeto donde iba la contraseña: 400, no 500", `contestó ${r.codigo}`);
  comprobar(r.consultas.length === 0, "y tampoco consultó la base");
}

console.log("\n── la política: ocho o más, y distinta de la actual ────────────");
{
  const r = await ejecutar({ cuerpo: { currentPassword: "laVieja123", newPassword: "corta7" }, cuenta: cuentaViva() });
  comprobar(r.codigo === 400 && r.salida.code === "CLAVE_CORTA", "siete caracteres: 400 CLAVE_CORTA",
    `contestó ${r.codigo} ${r.salida?.code || ""}`);
}
{
  const cuenta = cuentaViva();
  const r = await ejecutar({ cuerpo: { currentPassword: "laVieja123", newPassword: "ocho8888" }, cuenta });
  comprobar(r.codigo === 200, "ocho justos: pasa", `contestó ${r.codigo}`);
}
{
  const cuenta = cuentaViva();
  const r = await ejecutar({ cuerpo: { currentPassword: "laVieja123", newPassword: "laVieja123" }, cuenta });
  comprobar(r.codigo === 400 && r.salida.code === "MISMA_CLAVE", "la misma de siempre: 400 MISMA_CLAVE",
    `contestó ${r.codigo} ${r.salida?.code || ""}`);
  comprobar(cuenta.guardo === 0 && cuenta.tokenVersion === 2, "y no tocó la cuenta");
}

console.log("\n── con la actual equivocada no se guarda nada ──────────────────");
{
  const cuenta = cuentaViva();
  const r = await ejecutar({ cuerpo: { currentPassword: "noEsEsta99", newPassword: "unaNuevaLarga1" }, cuenta });
  comprobar(r.codigo === 401 && r.salida.code === "CLAVE_ACTUAL", "401 CLAVE_ACTUAL",
    `contestó ${r.codigo} ${r.salida?.code || ""}`);
  comprobar(cuenta.password === "hash:laVieja123", "la contraseña sigue siendo la de antes");
  comprobar(cuenta.tokenVersion === 2, "la versión de sesión no subió");
  comprobar(cuenta.guardo === 0, "no se guardó nada");
  comprobar(r.firmados.length === 0, "y no se firmó ninguna sesión");
}
{
  /* La contraseña actual se compara con bcrypt, no con ===: el doble solo da
     por buena la que cuadra con la huella guardada, letra por letra. */
  const cuenta = cuentaViva();
  const r = await ejecutar({ cuerpo: { currentPassword: "LaVieja123", newPassword: "unaNuevaLarga1" }, cuenta });
  comprobar(r.codigo === 401, "una mayúscula de diferencia en la actual tampoco entra", `contestó ${r.codigo}`);
}

console.log("\n── con todo bien: los demás afuera, vos adentro ────────────────");
{
  const cuenta = cuentaViva();
  const r = await ejecutar({ cuerpo: { currentPassword: "laVieja123", newPassword: "unaNuevaLarga1" }, cuenta });
  comprobar(r.codigo === 200, "contesta 200", `contestó ${r.codigo}`);
  comprobar(cuenta.password === "hash:unaNuevaLarga1", "la contraseña queda hasheada, nunca en claro");
  comprobar(cuenta.tokenVersion === 3, "la versión de sesión sube exactamente uno", `quedó en ${cuenta.tokenVersion}`);
  comprobar(cuenta.guardo === 1, "y se guarda una sola vez");

  const acceso = r.firmados.find((f) => f.carga.address);
  const refresco = r.firmados.find((f) => f.carga.type === "refresh");
  comprobar(Boolean(acceso) && Boolean(refresco), "se firman un token de acceso y uno de refresco");
  comprobar(acceso?.carga.tv === 3 && refresco?.carga.tv === 3,
    "los dos llevan la versión NUEVA adentro: son los únicos que la guardia deja pasar");
  comprobar(acceso?.carga.address === DIRECCION && acceso?.carga.userId === "u1",
    "el de acceso lleva la dirección y el usuario, como el del login");
  comprobar(r.salida.token === `firmado:${JSON.stringify(acceso.carga)}` &&
            r.salida.refreshToken === `firmado:${JSON.stringify(refresco.carga)}`,
    "y los dos viajan en la respuesta, para que la sesión que cambió siga viva");
  comprobar(cuenta.token === `cifrado:${r.salida.token}`,
    "la sesión guardada que compara isAdmin.js es la nueva, no la vieja");
  comprobar(!JSON.stringify(r.salida).includes("unaNuevaLarga1") && !JSON.stringify(r.salida).includes("laVieja123"),
    "ninguna contraseña vuelve en la respuesta");
}

console.log("\n── la ruta: detrás de la guardia y del limitador duro ──────────");
{
  const rutas = sinComentarios(RUTAS);
  comprobar(/router\.post\(\s*["']\/changePassword["']\s*,\s*verifyTokenUser\s*,\s*changePassword/.test(rutas),
    "POST /users/changePassword va detrás de verifyTokenUser");
  /* Pide la contraseña y contesta si acertaste: es un oráculo. Tiene que
     estar en el limitador de cinco cada quince minutos, el mismo que la
     semilla, y no en el general de cien por minuto. */
  const app = sinComentarios(APP);
  comprobar(/app\.use\(\s*["']\/users\/changePassword["']\s*,\s*secretLimiter\s*\)/.test(app),
    "y en app.js cuelga del limitador de secretos (5 cada 15 min)");
  const cuerpo = sinComentarios(FUNCION);
  comprobar(/tokenVersion\s*=\s*\(\s*user\.tokenVersion\s*\|\|\s*0\s*\)\s*\+\s*1/.test(cuerpo),
    "sube la versión con la misma línea que vigila probar-revocacion-sesion");
  comprobar(!/res\.send\(\s*["']/.test(cuerpo),
    "ya no contesta texto suelto: la app y la web esperan JSON");
}

console.log(fallos ? `\n${fallos} comprobación(es) en rojo\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
