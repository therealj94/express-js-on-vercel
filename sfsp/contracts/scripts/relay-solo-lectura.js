"use strict";
/* Relé JSON-RPC de SÓLO LECTURA hacia el RPC público de la 5550.
 *
 * Existe por dos razones:
 *   1. El motor de Hardhat (EDR, en Rust) no pasa por el proxy de salida del
 *      entorno ni confía en su CA. Este relé escucha en 127.0.0.1 y reenvía con
 *      `undici` (que sí usa HTTPS_PROXY y NODE_EXTRA_CA_CERTS).
 *   2. Es una barrera: SÓLO deja pasar métodos de lectura. Cualquier método que
 *      pueda escribir en la red real (eth_sendRawTransaction, eth_sendTransaction,
 *      personal_*, admin_*, miner_*, debug_setHead, …) se rechaza aquí, antes de
 *      salir de la máquina. El ensayo en la bifurcación no puede enviar nada a la
 *      5550 aunque un error de código lo intentara.
 */
const http = require("node:http");

const LECTURA = new Set([
  "eth_chainId",
  "net_version",
  "web3_clientVersion",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_call",
  "eth_gasPrice",
  "eth_feeHistory",
  "eth_getProof",
]);

function rechazo(id, metodo) {
  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: { code: -32601, message: `relay-solo-lectura: metodo bloqueado (${metodo}). Solo lectura hacia la 5550.` },
  };
}

/**
 * Arranca el relé. Devuelve { url, cerrar, contadores }.
 * @param {string} destino URL https del RPC público (sólo lectura).
 */
async function arrancarRelay(destino) {
  const { ProxyAgent, fetch } = require("undici");
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  const contadores = { reenviadas: 0, bloqueadas: 0, porMetodo: {} };

  async function reenviar(cuerpo) {
    for (let intento = 0; intento < 4; intento++) {
      try {
        const r = await fetch(destino, {
          method: "POST",
          dispatcher,
          headers: { "content-type": "application/json" },
          body: cuerpo,
        });
        return await r.text();
      } catch (e) {
        if (intento === 3) throw e;
        await new Promise((ok) => setTimeout(ok, 500 * (intento + 1)));
      }
    }
    return null;
  }

  const servidor = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let datos = "";
    req.on("data", (c) => (datos += c));
    req.on("end", async () => {
      let peticion;
      try {
        peticion = JSON.parse(datos);
      } catch {
        res.writeHead(400).end();
        return;
      }
      const lista = Array.isArray(peticion) ? peticion : [peticion];
      const bloqueadas = lista.filter((p) => !LECTURA.has(p.method));
      if (bloqueadas.length > 0) {
        contadores.bloqueadas += bloqueadas.length;
        const out = lista.map((p) => rechazo(p.id, p.method));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(Array.isArray(peticion) ? out : out[0]));
        return;
      }
      for (const p of lista) {
        contadores.reenviadas += 1;
        contadores.porMetodo[p.method] = (contadores.porMetodo[p.method] || 0) + 1;
      }
      try {
        const txt = await reenviar(datos);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(txt);
      } catch (e) {
        res.writeHead(502).end(String(e && e.message));
      }
    });
  });

  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${port}`,
    contadores,
    cerrar: () => new Promise((ok) => servidor.close(() => ok())),
  };
}

module.exports = { arrancarRelay, LECTURA };
