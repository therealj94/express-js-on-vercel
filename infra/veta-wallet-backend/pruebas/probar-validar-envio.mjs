// La validación del envío, ejecutada de verdad.
//
//   node --experimental-vm-modules pruebas/probar-validar-envio.mjs
//   (o `node pruebas/probar-validar-envio.mjs` si el proyecto ya resuelve ESM)
//
// Casi todas las pruebas de esta carpeta hacen grep sobre el código fuente:
// comprueban que un archivo CONTIENE un texto, no que hace algo. Ésta llama a
// la función con los mismos valores que un cliente puede mandar y mira qué
// devuelve. Si alguien afloja una regla, esto se pone rojo; un grep no.
import { validarEnvio, montoValido } from "../lib/validarEnvio.js";

let fallos = 0;
const ok = (q, c, x = "") => {
  console.log(`  ${c ? "ok   " : "FALLA"} ${q}${x ? "  · " + x : ""}`);
  if (!c) fallos++;
};

// En minúsculas a propósito: una dirección con mayúsculas mezcladas lleva
// checksum EIP-55 y si una letra está mal, `isAddress` la rechaza — que es
// lo correcto, y fue lo que le pasó a la primera versión de esta prueba.
const BIEN = "0x7462684046c9ca2ef0ac344f02b236db232c3ad8";
const YO = "0x0000000000000000000000000000000000000abc";

console.log("\n── lo que pasa ──");
ok("una dirección válida con monto válido pasa", validarEnvio({ recipientAddress: BIEN, amount: "1.5", from: YO }) === null);
ok("el monto con coma se acepta (teclado latino)", montoValido("2,5") === "2.5");
ok("18 decimales justos pasan", montoValido("0.000000000000000001") !== null);

console.log("\n── lo que NO pasa, cada uno con su código ──");
const casos = [
  ["dirección malformada", { recipientAddress: "0x123", amount: "1" }, "INVALID_ADDRESS"],
  ["dirección vacía", { recipientAddress: "", amount: "1" }, "INVALID_ADDRESS"],
  ["la dirección cero", { recipientAddress: "0x0000000000000000000000000000000000000000", amount: "1" }, "INVALID_ADDRESS"],
  ["mandarse a uno mismo", { recipientAddress: YO, amount: "1", from: YO.toUpperCase().replace("0X", "0x") }, "SELF_TRANSFER"],
  ["monto cero", { recipientAddress: BIEN, amount: "0" }, "INVALID_AMOUNT"],
  ["monto negativo", { recipientAddress: BIEN, amount: "-1" }, "INVALID_AMOUNT"],
  ["monto con letras", { recipientAddress: BIEN, amount: "1e3" }, "INVALID_AMOUNT"],
  ["monto Infinity", { recipientAddress: BIEN, amount: Infinity }, "INVALID_AMOUNT"],
  ["19 decimales", { recipientAddress: BIEN, amount: "0.0000000000000000001" }, "INVALID_AMOUNT"],
  ["monto ausente", { recipientAddress: BIEN }, "INVALID_AMOUNT"],
];
for (const [que, entrada, esperado] of casos) {
  const r = validarEnvio(entrada);
  ok(que, r && r.code === esperado, r ? r.code : "lo dejó pasar");
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
