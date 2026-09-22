"use strict";
// Utilidades de prueba sin plugins: sólo hardhat + @ethersproject ya presentes.
// No se usan claves reales ni redes externas; todo son fixtures sintéticos.
const hre = require("hardhat");
const { Interface, defaultAbiCoder } = require("@ethersproject/abi");
const { keccak256 } = require("@ethersproject/keccak256");
const { concat, hexlify, zeroPad, toUtf8Bytes } = (() => {
  const bytes = require("@ethersproject/bytes");
  const strings = require("@ethersproject/strings");
  return { concat: bytes.concat, hexlify: bytes.hexlify, zeroPad: bytes.zeroPad, toUtf8Bytes: strings.toUtf8Bytes };
})();

const provider = hre.network.provider;

/** bytes32("TEXTO") igual que en Solidity: relleno a la derecha. */
function b32(text) {
  const raw = toUtf8Bytes(text);
  if (raw.length > 32) throw new Error("bytes32 demasiado largo: " + text);
  const out = new Uint8Array(32);
  out.set(raw, 0);
  return hexlify(out);
}

function b32num(n) {
  return hexlify(zeroPad(hexlify(BigInt(n)), 32));
}

const ZERO32 = "0x" + "00".repeat(32);
const ZERO_ADDR = "0x" + "00".repeat(20);

async function accounts() {
  return await provider.send("eth_accounts", []);
}

async function chainId() {
  return Number(await provider.send("eth_chainId", []));
}

async function now() {
  const b = await provider.send("eth_getBlockByNumber", ["latest", false]);
  return Number(b.timestamp);
}

async function increaseTime(seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

class Contract {
  constructor(address, abi) {
    this.address = address;
    this.abi = abi;
    this.iface = new Interface(abi);
  }
  async call(fn, args = [], from) {
    const data = this.iface.encodeFunctionData(fn, args);
    const tx = { to: this.address, data };
    if (from) tx.from = from;
    const ret = await provider.send("eth_call", [tx, "latest"]);
    const decoded = this.iface.decodeFunctionResult(fn, ret);
    return decoded.length === 1 ? decoded[0] : decoded;
  }
  async send(fn, args = [], from) {
    const data = this.iface.encodeFunctionData(fn, args);
    const tx = { to: this.address, data, from, gas: "0x" + (8_000_000).toString(16) };
    const hash = await provider.send("eth_sendTransaction", [tx]);
    const receipt = await provider.send("eth_getTransactionReceipt", [hash]);
    if (!receipt || receipt.status !== "0x1") throw new Error("transaccion revertida: " + fn);
    return receipt;
  }
  async sendValue(fn, args, from, valueWei) {
    const data = this.iface.encodeFunctionData(fn, args);
    const tx = {
      to: this.address,
      data,
      from,
      value: "0x" + BigInt(valueWei).toString(16),
      gas: "0x" + (8_000_000).toString(16),
    };
    const hash = await provider.send("eth_sendTransaction", [tx]);
    const receipt = await provider.send("eth_getTransactionReceipt", [hash]);
    if (!receipt || receipt.status !== "0x1") throw new Error("transaccion revertida: " + fn);
    return receipt;
  }
}

async function deploy(name, args, from) {
  const art = await hre.artifacts.readArtifact(name);
  const iface = new Interface(art.abi);
  const data = art.bytecode + iface.encodeDeploy(args).slice(2);
  const hash = await provider.send("eth_sendTransaction", [
    { from, data, gas: "0x" + (12_000_000).toString(16) },
  ]);
  const receipt = await provider.send("eth_getTransactionReceipt", [hash]);
  if (!receipt || receipt.status !== "0x1") throw new Error("despliegue fallido: " + name);
  return new Contract(receipt.contractAddress, art.abi);
}

/** Espera un fallo y comprueba que el motivo contiene `fragment`. */
async function expectRevert(promise, fragment) {
  let failed = false;
  let message = "";
  try {
    await promise;
  } catch (err) {
    failed = true;
    message = String((err && err.message) || err);
  }
  if (!failed) throw new Error("se esperaba un revert y no lo hubo (" + fragment + ")");
  if (fragment && !message.includes(fragment)) {
    throw new Error("revert con motivo inesperado.\n  esperado: " + fragment + "\n  obtenido: " + message);
  }
  return message;
}

async function signTypedData(signer, domain, types, primaryType, message) {
  const payload = {
    types: Object.assign({
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    }, types),
    primaryType,
    domain,
    message,
  };
  return await provider.send("eth_signTypedData_v4", [signer, JSON.stringify(payload)]);
}

// ---------------------------------------------------------------- merkle
function hashPair(a, b) {
  const [x, y] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
  return keccak256(concat([x, y]));
}

function merkleLeaf(migrationId, beneficiary, oldUnits) {
  return keccak256(defaultAbiCoder.encode(["bytes32", "address", "uint256"], [migrationId, beneficiary, oldUnits]));
}

/** Árbol mínimo de pares ordenados; suficiente para fixtures sintéticos. */
function merkleTree(leaves) {
  if (leaves.length === 0) throw new Error("arbol vacio");
  let level = leaves.slice();
  const layers = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    }
    level = next;
    layers.push(level);
  }
  return { root: level[0], layers };
}

function merkleProof(tree, index) {
  const proof = [];
  let idx = index;
  for (let l = 0; l < tree.layers.length - 1; l++) {
    const layer = tree.layers[l];
    const pair = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (pair < layer.length) proof.push(layer[pair]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

module.exports = {
  provider,
  Contract,
  deploy,
  accounts,
  chainId,
  now,
  increaseTime,
  expectRevert,
  signTypedData,
  b32,
  b32num,
  ZERO32,
  ZERO_ADDR,
  merkleLeaf,
  merkleTree,
  merkleProof,
  keccak256,
  defaultAbiCoder,
};
