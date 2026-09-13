/* P0–P4: fuente en partes .cerebro.src.* (límite MCP). */
const fs = require('fs');
const path = require('path');
const src = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map((i) => fs.readFileSync(path.join(__dirname, `.cerebro.src.${i}`), 'utf8')).join('');
const Module = require('module');
const m = new Module(__filename);
m.filename = __filename;
m.paths = Module._nodeModulePaths(__dirname);
m._compile(src, __filename);
module.exports = m.exports;
