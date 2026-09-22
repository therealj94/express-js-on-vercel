"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");

describe("fixture", function () {
  it("despliega el núcleo P4 completo", async function () {
    const f = await F.deployAll();
    assert.equal(await f.registry.call("isRegistered", [f.ASSET_NEW]), true);
    assert.equal((await f.governance.call("quorumThreshold")).toString(), "2");
  });
});
