/* Volver a pedir el correo de confirmación.
 *
 *   node --test pruebas/probar-reenvio-confirmacion.mjs
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * El 27-sep-2026, 477 de 481 cuentas de Veta estaban sin confirmar. El alta
 * prometía que el correo «se puede volver a pedir» y no había ruta para eso.
 * Se comprueba:
 *
 *  1. LA REGLA (lib/reenvioConfirmacion.js): ya confirmada no manda nada; uno
 *     cada dos minutos; cinco por día; el token válido se reutiliza para que
 *     los enlaces viejos sigan sirviendo, y uno gastado se cambia.
 *  2. LA RUTA: existe, va con sesión y con limitador, y el correo sale SOLO
 *     a la dirección guardada en la cuenta, nunca a una que llegue en el cuerpo.
 *  3. EL ALTA Y EL REENVÍO mandan el mismo correo, con el enlace dentro.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");
const { decidirReenvio, correoTapado, correoConfirmacion, ESPERA_MS, MAX_POR_DIA } =
  await import("../lib/reenvioConfirmacion.js");

const AHORA = new Date("2026-09-27T12:00:00Z");
const TOKEN = "3f2b8a1c-9d4e-4f6a-8b7c-1a2b3c4d5e6f";

test("una cuenta ya confirmada no recibe nada", () => {
  assert.deepEqual(decidirReenvio({ isVerified: true, verificationToken: "*" }, AHORA), { estado: "ya_confirmado" });
});

test("la primera vez se manda y reutiliza el token válido", () => {
  const d = decidirReenvio({ isVerified: false, verificationToken: TOKEN }, AHORA);
  assert.equal(d.estado, "enviar");
  assert.equal(d.tokenNuevo, false);
  assert.deepEqual(d.cambios, { confirmacionEnviadaEn: AHORA, confirmacionEnviosDia: "2026-09-27", confirmacionEnviosCuenta: 1 });
});

test("un token gastado o ausente se cambia por uno nuevo", () => {
  for (const verificationToken of ["*", "", undefined, "no-es-uuid"]) {
    assert.equal(decidirReenvio({ isVerified: false, verificationToken }, AHORA).tokenNuevo, true, String(verificationToken));
  }
});

test("antes de dos minutos toca esperar, y se dice cuánto", () => {
  const hace30s = new Date(AHORA.getTime() - 30_000);
  const d = decidirReenvio({ isVerified: false, verificationToken: TOKEN, confirmacionEnviadaEn: hace30s }, AHORA);
  assert.equal(d.estado, "espera");
  assert.equal(d.reintentarEn, (ESPERA_MS - 30_000) / 1000);
  const pasado = new Date(AHORA.getTime() - ESPERA_MS);
  assert.equal(decidirReenvio({ isVerified: false, verificationToken: TOKEN, confirmacionEnviadaEn: pasado }, AHORA).estado, "enviar");
});

test("tope diario: el sexto del día no sale, al día siguiente sí", () => {
  const base = {
    isVerified: false, verificationToken: TOKEN,
    confirmacionEnviadaEn: new Date(AHORA.getTime() - ESPERA_MS - 1),
    confirmacionEnviosDia: "2026-09-27",
  };
  assert.equal(decidirReenvio({ ...base, confirmacionEnviosCuenta: MAX_POR_DIA - 1 }, AHORA).cambios.confirmacionEnviosCuenta, MAX_POR_DIA);
  assert.deepEqual(decidirReenvio({ ...base, confirmacionEnviosCuenta: MAX_POR_DIA }, AHORA), { estado: "tope_diario" });
  const d = decidirReenvio({ ...base, confirmacionEnviosDia: "2026-09-26", confirmacionEnviosCuenta: MAX_POR_DIA }, AHORA);
  assert.equal(d.estado, "enviar");
  assert.equal(d.cambios.confirmacionEnviosCuenta, 1);
});

test("el correo tapado no enseña la dirección entera", () => {
  assert.equal(correoTapado("jose@gmail.com"), "jo***@gmail.com");
  assert.equal(correoTapado("a@b.co"), "a***@b.co");
  assert.equal(correoTapado("sin-arroba"), "");
});

test("el correo lleva el enlace, en el texto y en el botón", () => {
  const enlace = "https://ejemplo.test/auth/verifyMail?token=" + TOKEN;
  const c = correoConfirmacion(enlace, { marco: (_t, cuerpo) => cuerpo, botonCorreo: (txt, url) => `<a href="${url}">${txt}</a>` });
  assert.match(c.texto, new RegExp(enlace.replace(/[?.]/g, "\\$&")));
  assert.match(c.html, new RegExp(`href="${enlace.replace(/[?.]/g, "\\$&")}"`));
  assert.ok(c.asunto);
});

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("la ruta existe, con sesión y con limitador", () => {
  assert.match(sinComentarios(leer("routes", "auth.js")), /router\.post\('\/reenviarConfirmacion',\s*verifyTokenUser,\s*reenviarConfirmacion\)/);
  assert.match(sinComentarios(leer("app.js")), /app\.use\("\/auth\/reenviarConfirmacion",\s*authLimiter\)/);
});

test("el reenvío va a la dirección de la cuenta, nunca a una del cuerpo", () => {
  const auth = sinComentarios(leer("controller", "authController.js"));
  const trozo = auth.match(/export const reenviarConfirmacion[\s\S]*?\n};/)?.[0];
  assert.ok(trozo, "no encontré reenviarConfirmacion");
  assert.doesNotMatch(trozo, /req\.body/);
  assert.match(trozo, /para:\s*user\.email/);
  // el intento se guarda antes de mandar
  assert.ok(trozo.indexOf("user.save()") < trozo.indexOf("enviarCorreo("));
});

test("el alta usa el mismo correo", () => {
  const auth = sinComentarios(leer("controller", "authController.js"));
  const alta = auth.match(/export const registerUserWallet[\s\S]*?\n};/)?.[0];
  assert.match(alta, /correoConfirmacion\(verificationLink/);
});
