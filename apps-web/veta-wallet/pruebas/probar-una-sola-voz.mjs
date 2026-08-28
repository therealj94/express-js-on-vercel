/* UNA SOLA VOZ, EN TODAS PARTES.
 *
 * El fallo que vino a arreglar, dicho como se vive: entrás, AU-RA te saluda
 * con su voz, y dos frases después contesta con una voz de robot distinta.
 *
 * La causa eran dos puertas. La burbuja y el hilo pedían la voz en vivo —la
 * nuestra—; la bienvenida, la galaxia y el recorrido llamaban a `AURA.hablar`,
 * que solo sabe de dos cosas: si la frase EXACTA está entre las grabadas suena
 * el fichero, y si no está la dice el navegador. Bastaba una frase con tu
 * nombre —que por ser tuya nunca va a estar grabada— para cambiar de voz a
 * mitad del saludo.
 *
 * Ahora hay una puerta y tres escalones: grabada → en vivo → navegador.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const aura = readFileSync(new URL('../aura.js', import.meta.url), 'utf8');

let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ok  ' + nombre); }
  catch (e) { mal++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
};

/* El cuerpo de la puerta, para preguntarle cosas sin arrastrar el resto. */
const iPuerta = app.indexOf('async function auraVozDeLaCasa(');
const puerta = app.slice(iPuerta, app.indexOf('\n  /* ──', iPuerta + 10));

console.log('\nla puerta es una sola');

prueba('nadie habla por fuera de la puerta', () => {
  const fuera = app.split('\n')
    .map((l, n) => [n + 1, l])
    .filter(([n, l]) => /AURA\.hablar\(/.test(l))
    .filter(([n]) => {
      const pos = app.split('\n').slice(0, n - 1).join('\n').length;
      return pos < iPuerta || pos > iPuerta + puerta.length;
    });
  assert.equal(fuera.length, 0,
    'estos hablan sin pasar por auraVozDeLaCasa, y por ahí se cuela la voz ' +
    'del navegador:\n        ' + fuera.map(([n, l]) => n + ': ' + l.trim()).join('\n        '));
});

prueba('los tres escalones están, y en ese orden', () => {
  const grabada = puerta.indexOf('AURA.tieneGrabada');
  const vivo = puerta.indexOf('auraSonarEnVivo');
  const navegador = puerta.lastIndexOf('AURA.hablar(');
  assert.ok(grabada > 0, 'no mira el banco grabado: toda frase iría al nodo');
  assert.ok(vivo > 0, 'no pide la voz en vivo');
  assert.ok(grabada < vivo,
    'pregunta por la grabada DESPUÉS de pedirla al nodo: se paga red y GPU ' +
    'por una frase que ya estaba en el teléfono');
  assert.ok(vivo < navegador,
    'el navegador queda antes que la voz en vivo: vuelve la voz robótica');
});

prueba('aura.js sabe decir si tiene la frase grabada', () => {
  assert.ok(/tieneGrabada:/.test(aura), 'AURA no expone tieneGrabada');
  assert.ok(/tieneGrabada: \(texto, lang = 'es'\) => !!VOZ_MAPA\[claveVoz\(texto, lang\)\]/.test(aura),
    'tieneGrabada no consulta el mismo mapa con la misma clave que hablar(): ' +
    'dos cuentas distintas del mismo hecho terminan discrepando');
});

console.log('\nla voz dice tu nombre');

prueba('la bienvenida dice la línea que se lee, no una neutra', () => {
  const i = app.indexOf('async function auraBienHablar()');
  assert.ok(i > 0, 'no está auraBienHablar');
  const cuerpo = app.slice(i, i + 1800);
  assert.ok(/auraVozDeLaCasa\(nombre \? linea1 : T\.bienv1Voz\)/.test(cuerpo),
    'con nombre sigue diciendo la frase neutra: se lee «Hola, José» y se ' +
    'oye «Hola» a secas');
  assert.ok(/if \(sub\) sub\.textContent = linea1;/.test(cuerpo),
    'lo escrito y lo dicho salen de sitios distintos y pueden separarse otra vez');
});

prueba('la galaxia también, y sale de la misma frase', () => {
  const i = app.indexOf('async function auraBienvenidaGalaxia(');
  const cuerpo = app.slice(i, i + 1600);
  assert.ok(/const voces = \[nombre \? frases\[0\] : T\.bienv1Voz/.test(cuerpo),
    'la galaxia sigue diciendo la neutra sobre un texto con nombre');
  assert.ok(!/AURA\.hablar\(/.test(cuerpo), 'la galaxia habla por la puerta vieja');
});

console.log('\ny la música se entera de todas');

prueba('la frase grabada también calla la música', () => {
  assert.ok(/auraGrabadaSonando/.test(app), 'no hay bandera para el banco grabado');
  const m = app.match(/const auraVozEnCurso = \(\) =>\s*([^;]+);/);
  assert.ok(m[1].includes('auraGrabadaSonando'),
    'auraVozEnCurso no ve las frases grabadas: son justo las de la ' +
    'bienvenida, que es cuando la música está sonando');
  assert.ok(/auraGrabadaSonando = false; auraMusicaAlDia\(\);/.test(puerta),
    'la bandera se levanta y no se baja: la música quedaría muda para siempre');
  assert.ok(/finally \{ auraGrabadaSonando = false/.test(puerta),
    'se baja fuera de un finally: si la voz falla, la música no vuelve nunca');
});

prueba('la frase grabada cierra el mismo ciclo que la voz en vivo', () => {
  const rama = puerta.slice(puerta.indexOf('AURA.tieneGrabada'));
  const corte = rama.indexOf('return;');
  assert.ok(/auraConversando && auraAbierta.*auraOirEnLaBurbuja/s.test(rama.slice(0, corte)),
    'termina la frase grabada y NO vuelve a escuchar: en medio de una ' +
    'conversación, una frase del banco la deja muerta');
});

console.log(mal ? `\n${mal} mal\n` : '\ntodo bien\n');
process.exit(mal ? 1 : 0);
