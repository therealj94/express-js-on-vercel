/* /salud dice si el correo está saliendo.
 *
 *   node --test pruebas/probar-estado-correo.mjs
 *
 * El 27-sep-2026 SES rechazaba la llave de Veta y nadie lo sabía: enviarCorreo
 * no lanza (a propósito) y el fallo solo quedaba en el registro. Se comprueba
 * que el estado cambie a «fallando» tras tres fallos seguidos, que vuelva a
 * «ok» con un envío bueno, que no filtre direcciones y que /salud lo muestre
 * sin tumbar el `ok`. También la página de confirmación.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.SES_LLAVE = "AKIAPRUEBA";
process.env.SES_SECRETO = "secreto-de-prueba";
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { enviarCorreo, estadoCorreo, _reiniciarEstadoCorreo } = await import("../lib/correo.js");
const { paginaConfirmacion } = await import("../lib/paginaConfirmacion.js");

const realFetch = globalThis.fetch;
const conSes = async (status, f) => {
  globalThis.fetch = async () => new Response(status === 200 ? '{"MessageId":"m1"}' : '{"message":"x"}', { status });
  try { return await f(); } finally { globalThis.fetch = realFetch; }
};
const carta = { para: "alguien@ejemplo.test", asunto: "a", texto: "b" };

test("sin envíos todavía: sin_envios", () => {
  _reiniciarEstadoCorreo();
  assert.equal(estadoCorreo().estado, "sin_envios");
});

test("tres fallos seguidos: fallando, con el motivo y sin la dirección", async () => {
  _reiniciarEstadoCorreo();
  await conSes(403, async () => { for (let i = 0; i < 3; i++) await enviarCorreo(carta); });
  const e = estadoCorreo();
  assert.equal(e.estado, "fallando");
  assert.equal(e.fallosSeguidos, 3);
  assert.equal(e.motivo, "SES 403");
  assert.doesNotMatch(JSON.stringify(e), /alguien@/);
});

test("un envío bueno lo devuelve a ok", async () => {
  await conSes(200, () => enviarCorreo(carta));
  assert.equal(estadoCorreo().estado, "ok");
  assert.equal(estadoCorreo().fallosSeguidos, 0);
});

test("una carta sin destinatario no cuenta como fallo de SES", async () => {
  _reiniciarEstadoCorreo();
  await enviarCorreo({ ...carta, para: "" });
  assert.equal(estadoCorreo().estado, "sin_envios");
});

test("/salud lleva el correo y no lo mete en el `ok`", () => {
  const app = fs.readFileSync(path.join(RAIZ, "app.js"), "utf8");
  assert.match(app, /const ok = mongo && cadena;/);
  assert.match(app, /correo: estadoCorreo\(\)/);
});

test("la página de confirmación: en español, sin scripts, con vuelta a la app", () => {
  for (const e of ["ok", "vencido", "invalido", "error"]) {
    const h = paginaConfirmacion(e);
    assert.match(h, /<html lang="es">/, e);
    assert.doesNotMatch(h, /<script/i, e);
  }
  assert.match(paginaConfirmacion("ok"), /quedó confirmado/);
  assert.match(paginaConfirmacion("ok"), /href="vetawallet:\/\/"/);
  assert.match(paginaConfirmacion("vencido"), /7 días/);
  assert.match(paginaConfirmacion("cualquier-cosa"), /Algo falló/);
});
