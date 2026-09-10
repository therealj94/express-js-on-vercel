/* Los pagos de la tarjeta, como los devuelve CryptoMate de verdad.
 *
 *   node pruebas/probar-transacciones-tarjeta.mjs
 *
 * POR QUÉ EXISTE
 *
 * En el portal de CryptoMate los cobros se veían. En Veta Wallet no. La
 * pantalla decía «todavía no hay consumos» sobre una tarjeta que ya había
 * pagado. La causa no era el emisor: era la puerta y la forma. Se preguntaba
 * GET /cards/transactions/search-transactions con card_id, se leía
 * data.data || data.transactions || data, y CryptoMate contestaba
 * { movements: [...] } — un objeto, .map reventaba, 500, lista vacía.
 *
 * La puerta documentada es GET /cards/transactions/{cardId}/search con
 * operations repetido y from_date/to_date. La respuesta trae movements,
 * bill_amount, merchant_name, datetime.
 *
 * Acá se lee EL archivo y se ejecutan las funciones de verdad, con dobles:
 * sin Express, sin Mongo y sin red.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const TARJETAS = fs.readFileSync(path.join(RAIZ, "controller", "cardController.js"), "utf8");

let fallos = 0;
const ok = (c, que, detalle = "") => {
  console.log(`  ${c ? "ok   " : "FALLA"} ${que}${detalle && !c ? "\n           " + detalle : ""}`);
  if (!c) fallos++;
};
const titulo = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(2, 58 - t.length))}`);

function funciones() {
  const nombres = [
    "listaDeMovimientos",
    "usdDeMovimiento",
    "comercioDeMovimiento",
    "fechaDeMovimiento",
    "movimientoAVeta",
    "consultaDeMovimientos",
    "rangoDeCiclo",
    "esCicloDeCompra",
    "claveDeCompra",
    "sinDuplicados",
    "tipoDeMovimiento",
    "esFueraDelGrupo",
  ];
  const ops = TARJETAS.match(/const OPERACIONES_BUSQUEDA = \[[\s\S]*?\];/)?.[0] || "";
  const cuerpos = nombres.map((n) => {
    const re = new RegExp(`^function ${n}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}`, "m");
    const trozo = TARJETAS.match(re);
    if (!trozo) throw new Error(`no encontré function ${n}()`);
    return trozo[0];
  });
  return new Function(`${ops}\n${cuerpos.join("\n")}\nreturn { ${nombres.join(", ")} };`)();
}

const {
  listaDeMovimientos,
  usdDeMovimiento,
  comercioDeMovimiento,
  fechaDeMovimiento,
  movimientoAVeta,
  consultaDeMovimientos,
  rangoDeCiclo,
  esCicloDeCompra,
  claveDeCompra,
  sinDuplicados,
  tipoDeMovimiento,
  esFueraDelGrupo,
} = funciones();
titulo("la puerta, la documentada");

ok(!/`\/cards\/transactions\/search-transactions`/.test(TARJETAS),
  "ya no se llama /cards/transactions/search-transactions");
ok(TARJETAS.includes("/cards/transactions/${encodeURIComponent(cardId)}/search"),
  "se llama /cards/transactions/{cardId}/search");
ok(TARJETAS.includes("operations"), "manda operations, que el emisor exige");
ok(TARJETAS.includes("from_date"), "manda from_date, si no el emisor recorta a 7 días");
ok(TARJETAS.includes("listaDeMovimientos"), "lee movements, no data.data");

const q = consultaDeMovimientos({ cardId: "card_abc", page: 2, limit: 20 });
ok(q.path === "/cards/transactions/card_abc/search", "la ruta lleva el id de la tarjeta", q.path);
ok(q.qs.includes("operations=TRANSACTION_CLEARED"), "pide TRANSACTION_CLEARED");
ok(q.qs.includes("operations=TRANSACTION_APPROVED"), "pide TRANSACTION_APPROVED");
ok(q.qs.includes("operations=TRANSACTION_AUTHORIZATION"), "pide TRANSACTION_AUTHORIZATION");
ok(q.qs.includes("from_date="), "trae from_date");
ok(q.qs.includes("to_date="), "trae to_date");
ok(q.qs.includes("size=20"), "size es el límite pedido");
ok(q.qs.includes("page_number=2"), "page_number es la página");
ok(!q.qs.includes("card_id="), "ya no manda card_id como query");
ok(!q.qs.includes("page_size="), "ya no manda page_size");

titulo("la respuesta, como la manda el emisor");

const cryptoMate = {
  number_of_elements: 1,
  total_elements: 1,
  movements: [{
    id: "tx-1",
    datetime: "2026-09-08T18:40:00",
    operation: "TRANSACTION_CLEARED",
    bill_amount: 12.5,
    bill_currency: "USD",
    merchant_name: "Café Central",
    status: "SUCCESS",
  }],
};

ok(listaDeMovimientos(cryptoMate).length === 1, "lee .movements");
ok(listaDeMovimientos({ data: [{ id: 1 }] }).length === 1, "también lee .data si viniera");
ok(listaDeMovimientos({ transactions: [{ id: 1 }] }).length === 1, "también lee .transactions");
ok(listaDeMovimientos(cryptoMate).length === 1
  && listaDeMovimientos({ foo: 1 }).length === 0,
  "un objeto sin lista no se intenta mapear — eso era el 500");

const mov = movimientoAVeta(cryptoMate.movements[0], 2.5);
ok(mov.merchant === "Café Central", "el comercio sale de merchant_name", mov.merchant);
ok(mov.amount === 12.5, "el dólar sale de bill_amount", String(mov.amount));
ok(mov.origenAmount === 5, "ORIGEN = bill_amount / precio", String(mov.origenAmount));
ok(mov.date === "2026-09-08T18:40:00", "la fecha sale de datetime");
ok(mov.currency === "ORIGEN", "la moneda que se enseña es ORIGEN");

ok(usdDeMovimiento({ amount: 3 }) === 3, "si no hay bill_amount, cae a amount");
ok(comercioDeMovimiento({ description: "POS" }) === "POS", "si no hay merchant_name, cae a description");
ok(fechaDeMovimiento({ created_at: "ayer" }) === "ayer", "si no hay datetime, cae a created_at");

titulo("el recorte de 7 días no se hereda");

const qDefault = consultaDeMovimientos({ cardId: "x" });
const from = qDefault.fromDate;
const to = qDefault.toDate;
const dias = (Date.parse(to) - Date.parse(from)) / 86400000;
ok(dias > 300, `el rango por omisión cubre un año, no 7 días (${dias.toFixed(0)} días)`);
ok(consultaDeMovimientos({ cardId: "x", from: "2026-01-01", to: "2026-01-31" }).fromDate === "2026-01-01",
  "from/to del pedido mandan sobre el omisión");

titulo("una compra no se lista dos veces");

ok(rangoDeCiclo("TRANSACTION_CLEARED") > rangoDeCiclo("TRANSACTION_APPROVED"),
  "CLEARED gana a APPROVED");
ok(esCicloDeCompra("TRANSACTION_APPROVED") && esCicloDeCompra("TRANSACTION_CLEARED")
  && !esCicloDeCompra("TRANSACTION_REFUND"),
  "solo el ciclo de compra se junta; una devolución no");
ok(claveDeCompra({ merchant: "Abarroteria  Ramos", amount: 1.1268 })
  === claveDeCompra({ merchant: "ABARROTERIA RAMOS", amount: 1.1268 }),
  "el comercio se compara sin mayúsculas ni espacios de más");

const ramosAprobada = {
  id: "tx-ap", merchant: "ABARROTERIA RAMOS", amount: 1.1268,
  date: "2026-09-08T18:00:00Z", type: "TRANSACTION_APPROVED", status: "SUCCESS",
};
const ramosLiquidada = {
  id: "tx-cl", merchant: "ABARROTERIA RAMOS", amount: 1.1268,
  date: "2026-09-09T10:00:00Z", type: "TRANSACTION_CLEARED", status: "SUCCESS",
};
const ramos = sinDuplicados([ramosLiquidada, ramosAprobada]);
ok(ramos.length === 1, "Ramos 0.45 ORIGEN no se lista dos veces", String(ramos.length));
ok(ramos[0].type === "TRANSACTION_CLEARED", "se queda el liquidado");
ok(ramos[0].date === ramosAprobada.date, "la fecha es la del datáfono, la que la gente recuerda");
ok(ramos[0].id === "tx-cl", "el id que queda es el del liquidado");

const gas2 = { merchant: "UNO MONTECARLO", amount: 1.13, date: "2026-07-02T12:00:00Z", type: "TRANSACTION_CLEARED" };
const gas8 = { merchant: "UNO MONTECARLO", amount: 1.13, date: "2026-07-08T12:00:00Z", type: "TRANSACTION_APPROVED" };
ok(sinDuplicados([gas2, gas8]).length === 2,
  "dos compras iguales a más de cinco días no se juntan");

const compra = { merchant: "X", amount: 5, date: "2026-09-01T00:00:00Z", type: "TRANSACTION_CLEARED" };
const devolucion = { merchant: "X", amount: 5, date: "2026-09-02T00:00:00Z", type: "TRANSACTION_REFUND" };
ok(sinDuplicados([compra, devolucion]).length === 2,
  "una devolución no se come la compra");

const recarga = { merchant: "WALLET", amount: 10, date: "2026-09-01T00:00:00Z", type: "WALLET_DEPOSIT" };
ok(sinDuplicados([ramosAprobada, ramosLiquidada, recarga]).length === 2,
  "una recarga no entra al grupo de la compra");

const ramosCompra = {
  id: "tx-p1", merchant: "ABARROTERIA RAMOS", amount: 1.1268, origenAmount: 0.4507,
  date: "2026-09-09T18:00:00Z", type: "purchase",
};
const ramosCompra2 = {
  id: "tx-p2", merchant: "ABARROTERIA RAMOS", amount: 1.1268, origenAmount: 0.4507,
  date: "2026-09-09T18:00:00Z", type: "purchase",
};
ok(sinDuplicados([ramosCompra, ramosCompra2]).length === 1,
  "dos filas type=purchase del mismo comercio y monto son un solo pago");

const ramosOtra = {
  id: "tx-p3", merchant: "ABARROTERIA RAMOS", amount: 1.6658, origenAmount: 0.6663,
  date: "2026-09-09T12:00:00Z", type: "purchase",
};
ok(sinDuplicados([ramosCompra, ramosCompra2, ramosOtra]).length === 2,
  "0.4507 y 0.6663 en Ramos son dos compras distintas");

ok(esFueraDelGrupo("TRANSACTION_REFUND") && !esFueraDelGrupo("purchase"),
  "una devolución no se junta; un purchase sí");
ok(tipoDeMovimiento({ operation: "TRANSACTION_CLEARED" }) === "TRANSACTION_CLEARED",
  "si type falta, se lee operation");

console.log("");
if (fallos) {
  console.log(`FALLÓ · ${fallos} comprobación${fallos === 1 ? "" : "es"}`);
  process.exit(1);
}
console.log("ok · los pagos de CryptoMate llegan a Veta");
