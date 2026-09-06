/* EL VIGÍA · que se entere aunque nadie esté mirando.
 *
 *   node infra/ultron/pruebas/probar-vigia.mjs
 *
 * Lo que se comprueba, con las casas simuladas —no se toca ninguna de verdad—:
 *   1. Una lectura mala NO declara una casa caída. Un pico de red no es una
 *      avería, y una alarma que suena por picos se acaba silenciando.
 *   2. Dos seguidas SÍ, y queda anotado DESDE CUÁNDO.
 *   3. Cuando vuelve, se anota también.
 *   4. Los avisos están APAGADOS mientras nadie los encienda: mandar un mensaje
 *      es una acción hacia fuera y no se hace sola.
 *   5. Encendidos, el aviso sale UNA vez por cambio y no en cada vuelta.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 160)}`);
};
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 56 - t.length))}`);

process.env.ULTRON_JUNTA = JSON.stringify([{ nombre: 'José', correo: 'jose@ordenglobal.org', clave: 'x', whatsapp: '+50499999999' }]);

/* Las casas se simulan reemplazando `vivo.leer`. Así se puede tirar una a
   propósito, que es lo único que este archivo necesita saber hacer. */
const vivo = require('../lib/vivo.js');
let caidas = new Set();
vivo.leer = async () => {
  const casa = (k) => ({ vivo: !caidas.has(k), http: caidas.has(k) ? 503 : 200, ms: 120, error: null });
  return {
    leidoEn: new Date().toISOString(),
    ordenex: { ...casa('ordenex'), mercados: [] }, aucorp: casa('aucorp'), wallet: casa('wallet'),
    genesis: casa('genesis'), ordenscan: casa('ordenscan'), ordenglobal: casa('ordenglobal'),
  };
};

const canales = require('../lib/canales.js');
const mandados = [];
canales.whatsapp = async (n, t) => { mandados.push({ via: 'whatsapp', n, t }); return { ok: true }; };
canales.correo = async (d, a, t) => { mandados.push({ via: 'correo', d, t }); return { ok: true }; };

const vigia = require('../lib/vigia.js');

titulo('con todo en pie');
await vigia.unaVuelta();
decir(vigia.estado().casas.ordenex?.viva === true, 'las seis casas se anotan como vivas');
decir(vigia.estado().avisa === 'apagado', 'y los avisos están APAGADOS mientras nadie los encienda', vigia.estado().avisa);

titulo('una lectura mala no es una avería');
caidas.add('ordenex');
let c = await vigia.unaVuelta();
decir(c.length === 0, 'la primera lectura fallida NO declara la casa caída', JSON.stringify(c));
decir(vigia.estado().casas.ordenex?.viva === true, 'y la casa sigue contando como viva');

titulo('dos seguidas sí');
c = await vigia.unaVuelta();
decir(c.length === 1 && /Ordenex dejó de contestar/.test(c[0]), 'a la segunda se declara caída, con el motivo', c[0]);
const desde = vigia.estado().casas.ordenex?.desde;
decir(!!desde, 'y queda anotado DESDE CUÁNDO — sin eso «está caída» no deja decidir nada', desde);

titulo('no se repite el aviso en cada vuelta');
c = await vigia.unaVuelta();
decir(c.length === 0, 'la tercera vuelta con la misma casa caída no vuelve a gritar', JSON.stringify(c));
decir(vigia.estado().casas.ordenex?.desde === desde, 'y el «desde cuándo» no se reinicia solo');

titulo('cuando vuelve, también se dice');
caidas.delete('ordenex');
c = await vigia.unaVuelta();
decir(c.length === 1 && /volvió a contestar/.test(c[0]), 'se anota que volvió, y cuánto estuvo fuera', c[0]);
decir(vigia.estado().casas.ordenex?.viva === true, 'y queda viva otra vez');

titulo('los avisos, solo si se encienden a propósito');
decir(mandados.length === 0, 'con los avisos apagados NO se mandó ni un mensaje', `${mandados.length} mensaje(s)`);

/* Encendidos: se recarga el módulo con la variable puesta, porque el modo se
   lee una sola vez al cargar —a propósito: que no se pueda encender a mitad de
   la marcha sin que quede en el arranque del registro—. */
titulo('encendidos, avisa una vez por cambio');
delete require.cache[require.resolve('../lib/vigia.js')];
process.env.ULTRON_AVISOS = 'whatsapp';
const vigia2 = require('../lib/vigia.js');
await vigia2.unaVuelta();
mandados.length = 0;
caidas.add('genesis');
await vigia2.unaVuelta(); await vigia2.unaVuelta();
decir(mandados.length === 1, 'un mensaje por la caída, no uno por vuelta', `${mandados.length}`);
decir(mandados[0]?.via === 'whatsapp' && /Genesis ID dejó de contestar/.test(mandados[0]?.t || ''),
  'y va por donde se pidió, con la casa y el motivo', mandados[0]?.t);
await vigia2.unaVuelta();
decir(mandados.length === 1, 'y no se repite mientras siga caída', `${mandados.length}`);
decir(!/clave|token|secreto|HRKU|sk-/i.test(mandados[0]?.t || ''), 'el mensaje no lleva ningún secreto dentro');

vigia.parar(); vigia2.parar();
console.log(malas ? `\n${malas} fallo(s).\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
