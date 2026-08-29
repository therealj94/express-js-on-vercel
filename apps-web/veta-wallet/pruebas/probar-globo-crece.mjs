/* LA RESPUESTA SE VE ESCRIBIR — y la voz no espera a que termine.
 *
 * Dos cosas que se pidieron y que parecían pelearse:
 *
 *   · «que aparezca que estoy teniendo una conversación» — o sea UNA
 *     burbuja por respuesta, no seis. Eso ya se había arreglado mandando la
 *     respuesta entera de una vez.
 *   · «que sea más fluido» — y con la respuesta entera de una vez quedaban
 *     cinco o seis segundos de puntitos y después un bloque de golpe.
 *
 * Se cumplen las dos con un globo que CRECE: el cerebro manda la primera
 * frase y va editando ese mismo mensaje. Acá se prueba el lado de la wallet,
 * que es donde se ve: que el globo se reescriba en vez de duplicarse, que la
 * voz arranque con la primera frase, y —lo que más fácil se rompe— que cada
 * frase se diga UNA sola vez.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ok  ' + nombre); }
  catch (e) { mal++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
};

console.log('\nlo que se dice en voz alta se cuenta por letras');

/* El repartidor del hilo se saca del propio archivo y se corre de verdad,
   dándole mensajes que crecen. Así se prueba el comportamiento —qué frases
   salen y en qué orden— y no la forma del texto. */
function repartir(vueltas) {
  const cuerpo = app.match(
    /const escrito = nuevas\.filter\([\s\S]*?if \(trozos\.length\) \{[\s\S]*?\n    \}/)[0];
  const yaSono = new Map();
  const dichos = [];
  /* Sin tocarle un `return`: el primero que aparece es el `if (listo <= ya)
     return;` de dentro del forEach, y quitarlo rompe la función entera. */
  const f = new Function('nuevas', 'auraYaSono', 'auraPorDecir',
                         'auraDecirLoSiguiente', cuerpo);
  for (const msgs of vueltas) {
    const nuevas = msgs.filter((m) => {
      const ya = yaSono.get(m.id) || 0;
      return (m.texto || '').trim().length > ya;
    });
    f(nuevas, yaSono, dichos, () => {});
  }
  return dichos;
}

prueba('no se dice nada mientras la está escribiendo', () => {
  /* Estuvo al revés —cada frase se decía apenas cerraba, para que el primer
     sonido llegara antes— y sonaba mal. Lo dijo el oído antes que ninguna
     medición: «hay un vacío entre voz, ruidos raros». Cada frase abría SU
     petición y SU contexto de audio, así que entre una y otra quedaba el
     silencio entero que el nodo tarda en arrancar la siguiente, y abrir y
     cerrar contextos deja chasquidos en los bordes. */
  const dicho = repartir([
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. ', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. Dos es dos. ', parcial: 1 }],
  ]).join(' ');
  assert.equal(dicho, '',
    'habló con la respuesta a medias: eso es una petición de voz por frase, ' +
    'y entre frase y frase quedan dos o tres segundos de silencio');
});

prueba('y al terminar se pide UNA vez, con la respuesta entera', () => {
  const dicho = repartir([
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. ', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. Dos es dos. ', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. Dos es dos. Y tres.' }],
  ]);
  assert.equal(dicho.length, 1,
    `se pidió ${dicho.length} veces: el nodo ya parte la respuesta por dentro ` +
    'y programa los trozos en UN reloj, pegados. Trocear desde afuera deshace eso');
  assert.ok(dicho[0].includes('Uno es uno.') && dicho[0].includes('Y tres.'),
    'no fue la respuesta entera: ' + JSON.stringify(dicho[0]));
});

prueba('y no se repite si vuelve a llegar igual', () => {
  const dicho = repartir([
    [{ id: 'a', de: 'aura', texto: 'Ya está completa.' }],
    [{ id: 'a', de: 'aura', texto: 'Ya está completa.' }],
    [{ id: 'a', de: 'aura', texto: 'Ya está completa.' }],
  ]);
  assert.equal(dicho.length, 1, `la dijo ${dicho.length} veces`);
});

console.log('\nla burbuja crece, no se duplica');

prueba('el panel reescribe SU globo en vez de empujar uno nuevo', () => {
  const i = app.indexOf('async function auraAlModelo');
  const cuerpo = app.slice(i, i + 5600);
  assert.ok(/auraCharla\[globo\]\.txt = txt;/.test(cuerpo),
    'no reescribe: cada trozo dejaría un globo más, que es lo que se vino a evitar');
  assert.ok(/if \(!m\.parcial\) \{[\s\S]{0,1800}return;/.test(cuerpo),
    'no espera a que termine: se queda con la primera frase como si fuera todo');
  assert.ok(/let globo = -1;/.test(cuerpo) && !/auraCharla\.length - 1\]\.txt/.test(cuerpo),
    'guarda el globo de una forma que la charla recortada a 40 puede invalidar');
});

prueba('el texto se ve crecer, pero la voz espera a que esté completa', () => {
  /* Son dos cosas distintas y no tienen por qué ir al mismo ritmo: se lee
     mucho más rápido de lo que se habla. El texto creciendo es lo que se
     pidió; la voz troceada era un invento que sonaba a hueco. */
  const i = app.indexOf('async function auraAlModelo');
  const cuerpo = app.slice(i, i + 5600);
  assert.ok(/auraCharla\[globo\]\.txt = txt;/.test(cuerpo), 'el texto no crece');
  assert.ok(/if \(!m\.parcial\) \{[\s\S]{0,1600}auraVozEncolar\(txt\)/.test(cuerpo),
    'pide la voz con la respuesta a medias: eso es una petición por frase, y ' +
    'entre frase y frase quedan dos o tres segundos de silencio');
  assert.ok(!/auraVozEncolar\(trozo\)/.test(cuerpo), 'quedó el troceo viejo');
});

prueba('habla UNO solo: la burbuja se calla si el hilo está en modo voz', () => {
  /* Dos caminos, dos motores, los mismos mensajes. Con la burbuja abierta
     sobre un hilo en modo voz los dos decían la misma respuesta encimada —
     «está como loco, escucha dos veces». */
  const i = app.indexOf('async function auraAlModelo');
  const cuerpo = app.slice(i, i + 5600);
  const m = cuerpo.match(/const puedeHablar = \(\) =>([\s\S]{0,180}?);/);
  assert.ok(m, 'no está puedeHablar');
  assert.ok(/auraCharlando/.test(m[1]),
    'la burbuja habla aunque el hilo esté en modo voz: se oyen las dos a la vez');
});

console.log('\nla cola no se pisa a sí misma');

prueba('una frase encolada no calla a la anterior', () => {
  const i = app.indexOf('async function auraVozDeLaCasa');
  const cuerpo = app.slice(i, i + 1200);
  assert.ok(/const seguido = !!opciones\.seguido;/.test(cuerpo), 'no distingue el caso');
  assert.ok(/if \(!seguido\) \{[\s\S]{0,220}auraCortarVozBurbuja\?\.\(\)/.test(cuerpo),
    'calla lo anterior siempre: cada frase cortaría a la de antes y solo se ' +
    'oiría la última');
});

prueba('el micrófono se reabre UNA vez, al final de toda la respuesta', () => {
  /* El único sitio que puede reabrirlo sin condición es quien vacía la cola:
     ahí la respuesta ya terminó de verdad. Todos los demás tienen que mirar
     `seguido`, o una frase del medio abriría el micrófono mientras ella sigue
     hablando — que es exactamente cómo se contestaba a sí misma. */
  const iCola = app.indexOf('async function auraVaciarColaBurbuja');
  const finCola = app.indexOf('\n  }', iCola);
  assert.ok(iCola > 0 && finCola > iCola, 'no está auraVaciarColaBurbuja');
  const sueltos = [];
  let i = app.indexOf('setTimeout(auraOirEnLaBurbuja, 250)');
  while (i > 0) {
    const dentroDeLaCola = i > iCola && i < finCola;
    const linea = app.slice(app.lastIndexOf('\n', i) + 1, i);
    if (!dentroDeLaCola && !linea.includes('!seguido')) sueltos.push(linea.trim());
    i = app.indexOf('setTimeout(auraOirEnLaBurbuja, 250)', i + 1);
  }
  assert.equal(sueltos.length, 0,
    'estos reabren el oído sin mirar si la respuesta sigue:\n        '
    + sueltos.join('\n        '));
  assert.ok(app.slice(iCola, finCola).includes('setTimeout(auraOirEnLaBurbuja, 250)'),
    'y quien vacía la cola NO lo reabre al final: la conversación se corta ahí');
});

prueba('una pregunta nueva tira lo que quedaba de la anterior', () => {
  const i = app.indexOf('async function auraAlModelo');
  assert.ok(/auraVozCallarCola\(\);/.test(app.slice(i, i + 1500)),
    'preguntás otra cosa y ella sigue terminando la de antes encima');
  const j = app.indexOf('function auraVozCallarCola');
  const cuerpo = app.slice(j, j + 400);
  assert.ok(/auraColaBurbuja\.length = 0;/.test(cuerpo), 'no vacía la cola');
  assert.ok(/auraCortarVozBurbuja\?\.\(\)/.test(cuerpo), 'no corta lo que suena ahora');
});

console.log('\ny la espera no se cierra con media respuesta');

prueba('auraLlego espera a que el mensaje deje de ser parcial', () => {
  const m = app.match(/if \(!igual && auraEsperando\(\)[\s\S]{0,220}auraLlego\(\);/);
  assert.ok(m, 'no está la condición');
  assert.ok(/!m\[m\.length - 1\]\.parcial/.test(m[0]),
    'cierra la ventana rápida con media respuesta: se volvería al sondeo ' +
    'tranquilo justo mientras la respuesta crece, y se vería crecer a saltos ' +
    'de cinco segundos');
});

console.log(mal ? `\n${mal} mal\n` : '\ntodo bien\n');
process.exit(mal ? 1 : 0);
