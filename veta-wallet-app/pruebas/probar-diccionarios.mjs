/* LOS DICCIONARIOS: sin claves repetidas y sin claves cojas.
 *
 *   node pruebas/probar-diccionarios.mjs
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * En un objeto literal de JavaScript, definir la misma clave dos veces NO es
 * un error: gana la última y la primera desaparece en silencio. Eso convierte
 * un descuido de una línea en un texto equivocado en pantalla, sin aviso, sin
 * traza y sin forma de encontrarlo salvo mirando el sitio exacto.
 *
 * No es teórico. El 8-sep, revisando la venta de la tarjeta, aparecieron tres:
 *
 *   · `tar.claveP`   yo mismo la reusé para el pie del campo de contraseña del
 *                    pago, y ya existía para revelar el PAN. El campo enseñaba
 *                    «Escribí tu contraseña para mostrarlo» debajo de un cobro.
 *   · `set.privacy`  servía de título de grupo («PRIVACIDAD») y de fila
 *                    («Política de privacidad»). Ganaba la fila, así que el
 *                    título del grupo de Ajustes decía lo que no era.
 *   · `gen.docBack`  la explicación larga de dónde está el MRZ la pisaba una
 *                    etiqueta corta de una pantalla que ya no existe.
 *
 * Los tres se veían en pantalla y ninguno rompía nada, que es lo que los hace
 * durar meses. Esta prueba los encuentra en un segundo.
 *
 * Y de paso: una clave que solo está en un idioma deja media pantalla en el
 * otro, o peor, enseñando el nombre de la clave.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO = path.join(AQUI, "..", "src", "i18n.js");

let fallos = 0;
const ok = (c, que, detalle = "") => {
  console.log(`  ${c ? "ok   " : "FALLA"} ${que}${detalle && !c ? "\n           " + detalle : ""}`);
  if (!c) fallos++;
};

const fuente = fs.readFileSync(ARCHIVO, "utf8");

/* Se cuentan las claves con su LÍNEA, para poder decir dónde está la repetida
   en vez de dejar a alguien buscándola a ojo en dos mil líneas. */
const porClave = new Map();
fuente.split("\n").forEach((linea, i) => {
  for (const m of linea.matchAll(/'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'\s*:/g)) {
    if (!porClave.has(m[1])) porClave.set(m[1], []);
    porClave.get(m[1]).push(i + 1);
  }
});

console.log("\n── ninguna clave definida dos veces en el mismo idioma ─────");
{
  // Dos diccionarios (es y en) ⇒ cada clave sana aparece exactamente dos veces.
  const repes = [...porClave].filter(([, l]) => l.length > 2);
  ok(repes.length === 0,
    `${porClave.size} claves, ninguna repetida`,
    repes.map(([k, l]) => `${k} en las líneas ${l.join(", ")}`).join("\n           "));
}

console.log("\n── ninguna clave coja ──────────────────────────────────────");
{
  const cojas = [...porClave].filter(([, l]) => l.length < 2);
  ok(cojas.length === 0,
    "todas están en los dos idiomas",
    cojas.map(([k, l]) => `${k} solo en la línea ${l[0]}`).join("\n           "));
}

console.log("\n── las claves que se usan, existen ─────────────────────────");
{
  /* Una `t('x.y')` que no está en el diccionario enseña la clave pelada en la
     pantalla —«card.cuesta» en vez de «Emitir la tarjeta cuesta»—, que es de
     las cosas que más baratas son de evitar y peor se ven. */
  const src = path.join(AQUI, "..", "src");
  const usadas = new Set();
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith(".js") && e.name !== "i18n.js") {
        for (const m of fs.readFileSync(p, "utf8").matchAll(/\bt\(\s*'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g)) {
          usadas.add(m[1]);
        }
      }
    }
  };
  recorrer(src);
  const huerfanas = [...usadas].filter((k) => !porClave.has(k));
  ok(huerfanas.length === 0,
    `${usadas.size} claves usadas, todas con texto`,
    huerfanas.join(", "));
}

console.log(fallos ? `\n${fallos} en rojo.\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
