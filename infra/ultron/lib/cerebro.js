/* Loader P0–P4: junta partes gzip+b64 y carga el módulo. */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const b64 = [0,1,2,3].map((i) => fs.readFileSync(path.join(__dirname, `cerebro.js.gz.b64.${i}`), 'utf8')).join('').replace(/\s+/g, '');
const src = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const Module = require('module');
const m = new Module(__filename);
m.filename = __filename;
m.paths = Module._nodeModulePaths(__dirname);
m._compile(src, __filename);
module.exports = m.exports;
