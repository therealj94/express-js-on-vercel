"use strict";
/* SFSP-160 · SFSPDidRegistry: identificadores did:sfsp de ORGANIZACIONES.
   La Junta admite; el controlador de cada organización maneja sus llaves; nada
   se reutiliza; la baja es para siempre; y no hay forma de registrar personas. */
const assert = require("node:assert/strict");
const H = require("./helpers");

describe("SFSP-160 · SFSPDidRegistry", function () {
  let reg, board, ctrl, otro, attestor, nuevoCtrl;
  const ORG = H.b32("org_genesis_kyc");
  const K1 = H.b32("firma-1");
  const K2 = H.b32("firma-2");
  const KX = H.b32("acuerdo-1");
  const PUB = "0x" + "ab".repeat(32);
  const PUB2 = "0x" + "cd".repeat(32);
  const DOC = "0x" + "11".repeat(32);

  beforeEach(async function () {
    const acc = await H.accounts();
    [board, ctrl, otro, attestor, nuevoCtrl] = [acc[0], acc[1], acc[2], acc[3], acc[4]];
    reg = await H.deploy("SFSPDidRegistry", [board], board);
  });

  async function alta() {
    await reg.send("registerOrg", [ORG, ctrl, DOC], board);
  }

  it("positivo: la Junta da de alta y la lectura devuelve lo registrado", async function () {
    await alta();
    const o = await reg.call("orgInfo", [ORG]);
    assert.equal(o[0], true, "existe");
    assert.equal(o[1], true, "activa");
    assert.equal(String(o[2]).toLowerCase(), ctrl.toLowerCase());
    assert.equal(o[4], DOC);
    assert.equal(Number(o[5]), 0);
  });

  it("negativo: nadie más que la Junta da de alta, y un orgId no se repite", async function () {
    await H.expectRevert(reg.send("registerOrg", [ORG, ctrl, DOC], otro), "Unauthorized");
    await alta();
    await H.expectRevert(reg.send("registerOrg", [ORG, otro, DOC], board), "OrgExists");
  });

  it("positivo: el controlador agrega llaves; la de firma no cifra y la de cifrado no firma", async function () {
    await alta();
    await reg.send("addKey", [ORG, K1, 1, PUB, 3], ctrl); // Ed25519: aserción + autenticación
    await reg.send("addKey", [ORG, KX, 2, PUB2, 4], ctrl); // X25519: solo acuerdo
    const k = await reg.call("keyInfo", [ORG, K1]);
    assert.equal(Number(k[0]), 1);
    assert.equal(k[1], PUB);
    assert.equal(Number(k[2]), 3);
    assert.equal(k[3], false);
    assert.equal(Number((await reg.call("orgInfo", [ORG]))[5]), 2);
    assert.equal(await reg.call("keyIdAt", [ORG, 1]), KX);
    await H.expectRevert(reg.send("addKey", [ORG, K2, 1, PUB, 4], ctrl), "InvalidKey"); // Ed25519 con acuerdo
    await H.expectRevert(reg.send("addKey", [ORG, K2, 2, PUB, 1], ctrl), "InvalidKey"); // X25519 que firma
    await H.expectRevert(reg.send("addKey", [ORG, K2, 3, PUB, 1], ctrl), "InvalidKey"); // tipo desconocido
  });

  it("negativo: ni la Junta ni un tercero tocan las llaves de una organización", async function () {
    await alta();
    await H.expectRevert(reg.send("addKey", [ORG, K1, 1, PUB, 1], board), "NotController");
    await H.expectRevert(reg.send("addKey", [ORG, K1, 1, PUB, 1], otro), "NotController");
    await H.expectRevert(reg.send("setAttestor", [ORG, attestor, true], otro), "NotController");
  });

  it("negativo: un keyId no se reutiliza; rotar es agregar otra y revocar la vieja", async function () {
    await alta();
    await reg.send("addKey", [ORG, K1, 1, PUB, 1], ctrl);
    await reg.send("revokeKey", [ORG, K1], ctrl);
    await H.expectRevert(reg.send("addKey", [ORG, K1, 1, PUB2, 1], ctrl), "KeyExists");
    await reg.send("addKey", [ORG, K2, 1, PUB2, 1], ctrl);
    assert.equal((await reg.call("keyInfo", [ORG, K1]))[3], true, "la vieja queda revocada");
    assert.equal((await reg.call("keyInfo", [ORG, K2]))[3], false);
    await H.expectRevert(reg.send("revokeKey", [ORG, H.b32("no-existe")], ctrl), "KeyUnknown");
  });

  it("positivo: firmante de atestaciones; deja de valer si la organización se da de baja", async function () {
    await alta();
    await reg.send("setAttestor", [ORG, attestor, true], ctrl);
    assert.equal(await reg.call("isAttestor", [ORG, attestor]), true);
    await reg.send("deactivate", [ORG, H.b32("LICENCIA_REVOCADA")], board);
    assert.equal(await reg.call("isAttestor", [ORG, attestor]), false);
  });

  it("negativo: la baja es irreversible, exige motivo y la pide la Junta o el propio controlador", async function () {
    await alta();
    await H.expectRevert(reg.send("deactivate", [ORG, H.ZERO32], ctrl), "ReasonRequired");
    await H.expectRevert(reg.send("deactivate", [ORG, H.b32("X")], otro), "NotController");
    await reg.send("deactivate", [ORG, H.b32("CIERRE_VOLUNTARIO")], ctrl);
    await H.expectRevert(reg.send("addKey", [ORG, K1, 1, PUB, 1], ctrl), "OrgInactive");
    await H.expectRevert(reg.send("deactivate", [ORG, H.b32("OTRA")], board), "OrgInactive");
    await H.expectRevert(reg.send("registerOrg", [ORG, ctrl, DOC], board), "OrgExists");
  });

  it("positivo: recuperación del controlador por la Junta, con motivo; el viejo pierde el control", async function () {
    await alta();
    await H.expectRevert(reg.send("changeController", [ORG, nuevoCtrl, H.ZERO32], board), "ReasonRequired");
    await reg.send("changeController", [ORG, nuevoCtrl, H.b32("MULTIFIRMA_PERDIDA")], board);
    await H.expectRevert(reg.send("addKey", [ORG, K1, 1, PUB, 1], ctrl), "NotController");
    await reg.send("addKey", [ORG, K1, 1, PUB, 1], nuevoCtrl);
  });

  it("estructural: no existe ninguna función que registre personas ni reciba un sujeto", async function () {
    const nombres = reg.abi.filter((x) => x.type === "function").map((x) => x.name.toLowerCase());
    for (const n of nombres) assert.ok(!/person|persona|subject|sujeto|user|usuario|gid/.test(n), `función sospechosa: ${n}`);
  });
});
