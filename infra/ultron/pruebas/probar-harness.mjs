#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const h = require('../lib/harness.js');

function ok(cond, msg) { if (!cond) { console.error('FALLÓ:', msg); process.exit(1); } }

const a = h.planear('busque en internet el precio del oro hoy');
ok(a.cajas.includes('internet'), 'abre internet');
ok(a.forzar[0]?.name === 'buscar_web', 'fuerza buscar_web');
ok(/oro/.test(a.forzar[0].arguments.consulta), 'consulta afinada');

const b = h.planear('listame la bóveda de secretos');
ok(b.cajas.includes('boveda'), 'abre bóveda');
ok(b.forzar.some((x) => x.name === 'boveda_listar'), 'lista bóveda');

const c = h.planear('hola, cómo estás');
ok(!c.forzar.length, 'saludo no fuerza manos');

ok(h.esCatalogo('Puedo usar buscar_web, mas_herramientas y boveda_listar'), 'detecta catálogo');
ok(!h.esCatalogo('El oro cotiza a 2650 según las fuentes que acabo de leer.'), 'no marca una respuesta');

const d = h.planear('leé https://ordenglobal.org/ y decime qué hay');
ok(d.forzar[0]?.name === 'leer_pagina', 'URL fuerza leer_pagina');

console.log('harness ok');
