/* La rotacion de PASS_TOKEN no debe echar a nadie de su sesion.
 *
 *   node pruebas/probar-rotacion-token.mjs
 *
 * `lib/sesion.js` envuelve a jsonwebtoken para que, mientras dura la rotacion,
 * la aplicacion firme con el secreto NUEVO y acepte tambien los tokens que
 * siguen firmados con el VIEJO. Lo que se prueba aqui es exactamente eso, y
 * sobre todo lo que NO debe pasar:
 *
 *   - que un token firmado con un secreto de un tercero cuele por el reintento;
 *   - que un token VENCIDO reviva porque se reintenta con otro secreto;
 *   - que el reintento se dispare al verificar tokens de Apple o Google, que se
 *     comprueban con una clave publica y no con ningun secreto nuestro.
 *
 * El modulo esta escrito en ESM pero vive en un paquete CommonJS (lo transpila
 * Babel al arrancar), asi que aqui se carga desde una copia temporal .mjs. Es
 * el MISMO fichero, leido del disco: si alguien lo cambia, esta prueba lo ve.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORIGEN = path.join(AQUI, "..", "lib", "sesion.js");

const NUEVO = "un-secreto-largo-de-verdad-con-mas-de-treinta-y-dos-caracteres";
const VIEJO = "Abc1234"; // los siete caracteres de los que se viene huyendo

process.env.PASS_TOKEN = NUEVO;
process.env.PASS_TOKEN_VIEJO = VIEJO;

// La copia se deja JUNTO al original, dentro de lib/, y no en /tmp: desde ahi
// Node resuelve `jsonwebtoken` y `crypto-js` subiendo por node_modules igual
// que lo hace el modulo de verdad. En /tmp no encontraria ninguno.
const tmp = path.join(AQUI, "..", "lib", `sesion.prueba-${process.pid}.mjs`);
fs.copyFileSync(ORIGEN, tmp);
const sesion = await import(`file://${tmp}`);
const jwtReal = (await import("jsonwebtoken")).default;
const CryptoJS = (await import("crypto-js")).default;

let pasadas = 0;
// Se cuentan las corridas en vez de escribir el total a mano: el numero fijo se
// queda viejo en cuanto se agrega una prueba, y decia «15 de 13».
let corridas = 0;
const prueba = (nombre, fn) => {
  corridas++;
  try {
    fn();
    console.log(`  ✓ ${nombre}`);
    pasadas++;
  } catch (e) {
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

console.log("\nRotacion de PASS_TOKEN\n");

prueba("un token firmado con el secreto NUEVO se acepta", () => {
  const t = jwtReal.sign({ userId: "u1" }, NUEVO);
  assert.equal(sesion.verify(t, NUEVO).userId, "u1");
});

prueba("un token firmado con el secreto VIEJO tambien se acepta", () => {
  const t = jwtReal.sign({ userId: "u2" }, VIEJO);
  assert.equal(sesion.verify(t, NUEVO).userId, "u2");
});

prueba("la firma NUEVA es la que se usa al firmar", () => {
  const t = sesion.sign({ userId: "u3" }, NUEVO);
  assert.equal(jwtReal.verify(t, NUEVO).userId, "u3");
  assert.throws(() => jwtReal.verify(t, VIEJO));
});

prueba("un token de un tercero NO cuela por el reintento", () => {
  const t = jwtReal.sign({ userId: "intruso" }, "secreto-de-otra-persona");
  assert.throws(() => sesion.verify(t, NUEVO), /invalid signature/);
});

prueba("un token VENCIDO sigue vencido, no revive con el otro secreto", () => {
  const t = jwtReal.sign({ userId: "u4" }, VIEJO, { expiresIn: -60 });
  assert.throws(() => sesion.verify(t, NUEVO), (e) => e.name === "TokenExpiredError");
});

prueba("verificar con una clave ajena (Apple/Google) no dispara el reintento", () => {
  // Si el reintento se disparara aqui, un token firmado con nuestro secreto
  // viejo se aceptaria como si fuera de Apple. Eso seria un agujero.
  const t = jwtReal.sign({ sub: "apple" }, VIEJO);
  assert.throws(() => sesion.verify(t, "clave-publica-de-apple"));
});

prueba("descifrarConToken lee lo cifrado con el secreto VIEJO", () => {
  const guardado = CryptoJS.AES.encrypt("token-de-admin", VIEJO).toString();
  assert.equal(sesion.descifrarConToken(guardado), "token-de-admin");
});

prueba("descifrarConToken lee lo cifrado con el secreto NUEVO", () => {
  const guardado = CryptoJS.AES.encrypt("token-de-admin", NUEVO).toString();
  assert.equal(sesion.descifrarConToken(guardado), "token-de-admin");
});

prueba("descifrarConToken devuelve vacio si ninguno sirve, sin reventar", () => {
  assert.equal(sesion.descifrarConToken(null), "");
  assert.equal(sesion.descifrarConToken("no-es-cifrado"), "");
  assert.equal(sesion.descifrarConToken("v2.firmainventada.loquesea"), "");
});

// Esta se corre MIL veces a proposito. Antes del sello, un blob ajeno devolvia
// texto inventado cerca de 4 de cada 1000 veces —el relleno de AES cuadra por
// casualidad—, asi que una sola vuelta la habria dado por buena casi siempre y
// habria puesto la prueba en rojo de vez en cuando sin que nada cambiara.
prueba("un dato sellado con OTRA clave no se lee nunca, ni por casualidad", () => {
  for (let i = 0; i < 1000; i++) {
    const cuerpo = CryptoJS.AES.encrypt("token-de-admin", "ajena-" + i).toString();
    const firma = CryptoJS.HmacSHA256(cuerpo, "ajena-" + i)
      .toString(CryptoJS.enc.Hex)
      .slice(0, 32);
    assert.equal(sesion.descifrarConToken(`v2.${firma}.${cuerpo}`), "");
  }
});

// Y lo guardado del modo viejo se sigue leyendo, pero no puede devolver el
// secreto de otro: eso es lo que de verdad importa de esa rama.
prueba("lo guardado sin sello nunca entrega el token de otra clave", () => {
  for (let i = 0; i < 1000; i++) {
    const ajeno = CryptoJS.AES.encrypt("token-de-admin", "ajena-" + i).toString();
    assert.notEqual(sesion.descifrarConToken(ajeno), "token-de-admin");
  }
});

prueba("estadoRotacion dice la verdad", () => {
  const e = sesion.estadoRotacion();
  assert.equal(e.largo, NUEVO.length);
  assert.equal(e.quedaElViejo, true);
});

// ── Sesion unica por administrador ──────────────────────────────────────────
// `middleware/isAdmin.js` compara el token que llega con el que hay guardado
// en `user.token`. Lo que se prueba aqui es el mecanismo que lo sostiene: que
// guardar y leer sea reversible, y que un token distinto NO cuadre.

prueba("lo que se guarda cifrado se recupera igual", () => {
  const t = jwtReal.sign({ userId: "admin" }, NUEVO);
  const guardado = sesion.cifrarConToken(t);
  assert.notEqual(guardado, t, "no debe guardarse en claro");
  assert.equal(sesion.descifrarConToken(guardado), t);
});

prueba("otra sesion del mismo usuario NO cuadra con la guardada", () => {
  // Es exactamente lo que pasa cuando el administrador entra desde un segundo
  // dispositivo: el token guardado pasa a ser el nuevo y el anterior deja de
  // servir para las rutas de administracion.
  const primera = jwtReal.sign({ userId: "admin", n: 1 }, NUEVO);
  const segunda = jwtReal.sign({ userId: "admin", n: 2 }, NUEVO);
  const guardado = sesion.cifrarConToken(segunda);
  assert.notEqual(sesion.descifrarConToken(guardado), primera);
  assert.equal(sesion.descifrarConToken(guardado), segunda);
});

prueba("una sesion guardada ANTES de rotar se sigue leyendo", () => {
  // El caso que habria dejado a los administradores fuera para siempre: el
  // campo se cifro con el secreto viejo y hay que poder leerlo igual.
  const t = jwtReal.sign({ userId: "admin" }, VIEJO);
  const guardado = CryptoJS.AES.encrypt(t, VIEJO).toString();
  assert.equal(sesion.descifrarConToken(guardado), t);
});

fs.unlinkSync(tmp);
console.log(`\n${pasadas} de ${corridas} pruebas pasadas\n`);
