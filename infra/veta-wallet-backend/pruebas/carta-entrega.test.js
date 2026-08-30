/* La carta de entrega: el recibo.
 *
 * POR QUE ESTAS PRUEBAS EXISTEN
 *
 * Un recibo falla de dos formas, y las dos se ven bien impresas:
 *
 *   1. NO SE PUEDE COMPROBAR. Un hash recortado con puntos suspensivos no se
 *      pega en el explorador. Ahí el recibo deja de ser una prueba y pasa a
 *      ser decoración con forma de dato.
 *
 *   2. DICE DE MAS. ONDK es un valor negociable y la preventa dice que no se
 *      mercadea en Estados Unidos. Una palabra sobre precio, rendimiento o
 *      fecha de listado convierte un comprobante de entrega en una oferta de
 *      valores por correo.
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { cartaEntrega } from "../lib/cartaEntrega.js";

const REAL = {
  nombre: "Alberto Morales",
  cantidad: "20.000",
  token: "ONDK",
  direccion: "0x8eba36b38e8e6ec80e56bb77a595627becd113e4",
  hash: "0x0a39b33aaff7d8c904f38e63d38dbc0bf66332fcbb9deb1abedd96b0765a25c4",
  bloque: 40591,
  fecha: "30 de agosto de 2026, 16:25 UTC",
};

test("el hash va COMPLETO: si no, no se puede comprobar nada", () => {
  const { html, texto } = cartaEntrega(REAL);
  // En el texto plano, entero y de una pieza.
  assert.ok(texto.includes(REAL.hash), "el texto plano no lleva el hash entero");
  // En el HTML va partido en dos líneas para que no se desborde en el teléfono,
  // así que se comprueba que estén las dos mitades y que sumen el hash.
  const mitades = [REAL.hash.slice(0, 34), REAL.hash.slice(34)];
  for (const m of mitades) assert.ok(html.includes(m), `falta la mitad ${m}`);
  assert.equal(mitades.join(""), REAL.hash);
  assert.ok(!html.includes("…") && !html.includes("..."), "recortó el hash");
});

test("los datos del recibo son los que se le pasaron, no otros", () => {
  const { html, texto } = cartaEntrega(REAL);
  for (const d of [REAL.direccion, String(REAL.bloque), REAL.fecha, "20.000"]) {
    assert.ok(html.includes(d), `al HTML le falta ${d}`);
    assert.ok(texto.includes(d), `al texto le falta ${d}`);
  }
  assert.ok(html.includes("5550"), "no dice en qué cadena");
});

/* El aviso legal SI nombra «rentabilidad» —«no es una promesa de
   rentabilidad»— y tiene que hacerlo. Lo que no puede aparecer es en el
   cuerpo, que es donde una palabra así vende. Por eso se recorta el aviso
   antes de buscar: si no, la propia advertencia haría fallar la prueba y la
   tentación sería quitar la advertencia. */
const AVISO = /es un valor negociable[\s\S]*?promesa de rentabilidad\./gi;
const sinAviso = (t) => t.replace(AVISO, " ").replace(/\s+/g, " ").toLowerCase();
const plano = (t) => t.replace(/\s+/g, " ");

test("NO dice ni una palabra de precio, rendimiento o fecha de listado", () => {
  const { html, texto, asunto } = cartaEntrega(REAL);
  const todo = sinAviso(asunto + " " + html + " " + texto);
  for (const p of [
    "precio", "cotiza", "rendimiento", "rentabilidad", "ganancia", "revaloriz",
    "va a subir", "usd", "dólar", "dolar", "invertí", "invertir",
    "comprá", "compra más", "oportunidad", "listado el", "sale al mercado el",
  ]) {
    assert.ok(!todo.includes(p), `dice «${p}» — eso lo vuelve una oferta`);
  }
});

test("lleva el aviso de que no es una oferta", () => {
  const { html, texto } = cartaEntrega(REAL);
  for (const t of [plano(html), plano(texto)]) {
    assert.ok(/valor negociable/i.test(t), "no dice que es un valor negociable");
    assert.ok(/no es una oferta/i.test(t), "no aclara que no es una oferta");
    assert.ok(/promesa de rentabilidad/i.test(t), "no niega la promesa de rendimiento");
  }
});

test("no pide NADA: ni frase, ni contraseña, ni un botón que apure", () => {
  const { html, texto } = cartaEntrega(REAL);
  const todo = (html + texto).toLowerCase();
  for (const p of ["frase de respaldo, ", "mandanos tu contraseña", "tu clave"]) {
    assert.ok(!todo.includes(p), `pide «${p}»`);
  }
  // El aviso de seguridad del pie SI tiene que estar: es el momento en que
  // aparecen los estafadores.
  assert.ok(/nunca te vamos a pedir/i.test(html));
});

test("el asunto dice que ya llegaron, no que están esperando", () => {
  const { asunto } = cartaEntrega(REAL);
  assert.ok(asunto.includes("Alberto"), "no lo llama por su nombre");
  assert.ok(/ya están/.test(asunto), `el asunto no cierra: «${asunto}»`);
  assert.ok(!/esperando/.test(asunto), "repite el asunto de la invitación");
});

test("usa solo el primer nombre, como quien escribe a una persona", () => {
  const { asunto } = cartaEntrega({ ...REAL, nombre: "Alberto Morales" });
  assert.ok(asunto.includes("Alberto:"), asunto);
  assert.ok(!asunto.includes("Morales"), "lo trata de apellido");
});

test("escapa lo que le pasen: un nombre no puede romper el HTML", () => {
  const { html } = cartaEntrega({ ...REAL, nombre: '<script>alert(1)</script>' });
  assert.ok(!html.includes("<script>alert"), "metió una etiqueta cruda");
});
