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
    /const escrito = nuevas\.filter[\s\S]*?if \(trozos\.length\) \{[\s\S]*?\n    \}/)[0];
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

prueba('un mensaje que crece se dice entero, no solo su primera frase', () => {
  const dicho = repartir([
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. ', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. Dos es dos. ', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. Dos es dos. Y tres.' }],
  ]).join(' | ');
  assert.ok(dicho.includes('Uno es uno.'), 'no dijo la primera');
  assert.ok(dicho.includes('Dos es dos.'),
    'se comió la segunda: con la cuenta por mensaje, el id quedaba marcado al ' +
    'oír la primera frase y el resto no se decía nunca');
  assert.ok(dicho.includes('Y tres.'), 'se comió el final');
});

prueba('y cada frase se dice UNA sola vez', () => {
  const dicho = repartir([
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. ', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. ', parcial: 1 }],   // sin cambios
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. Dos es dos. ', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Uno es uno. Dos es dos.' }],
  ]).join(' ');
  const veces = (t) => dicho.split(t).length - 1;
  assert.equal(veces('Uno es uno.'), 1, `«Uno es uno.» se dijo ${veces('Uno es uno.')} veces`);
  assert.equal(veces('Dos es dos.'), 1, `«Dos es dos.» se dijo ${veces('Dos es dos.')} veces`);
});

prueba('de un mensaje a medias no se dice media frase', () => {
  const dicho = repartir([
    [{ id: 'a', de: 'aura', texto: 'Esto está a medio escr', parcial: 1 }],
  ]).join(' ');
  assert.equal(dicho, '',
    'dijo media frase: leer «Esto está a medio escr» y completarlo en la ' +
    'vuelta siguiente suena a tartamudeo');
});

prueba('pero cuando ya no es parcial, se dice aunque no termine en punto', () => {
  const dicho = repartir([
    [{ id: 'a', de: 'aura', texto: 'Sin punto final', parcial: 1 }],
    [{ id: 'a', de: 'aura', texto: 'Sin punto final' }],
  ]).join(' ');
  assert.ok(dicho.includes('Sin punto final'),
    'la respuesta terminó y se quedó muda esperando un punto que no viene');
});

console.log('\nla burbuja crece, no se duplica');

prueba('el panel reescribe SU globo en vez de empujar uno nuevo', () => {
  const i = app.indexOf('async function auraAlModelo');
  const cuerpo = app.slice(i, i + 4200);
  assert.ok(/auraCharla\[globo\]\.txt = txt;/.test(cuerpo),
    'no reescribe: cada trozo dejaría un globo más, que es lo que se vino a evitar');
  assert.ok(/if \(!m\.parcial\) return;/.test(cuerpo),
    'no espera a que termine: se queda con la primera frase como si fuera todo');
  assert.ok(/let globo = -1;/.test(cuerpo) && !/auraCharla\.length - 1\]\.txt/.test(cuerpo),
    'guarda el globo de una forma que la charla recortada a 40 puede invalidar');
});

prueba('la voz arranca antes de que termine el texto', () => {
  const i = app.indexOf('async function auraAlModelo');
  const cuerpo = app.slice(i, i + 4200);
  assert.ok(/auraVozEncolar\(trozo\)/.test(cuerpo), 'no encola nada');
  const iVoz = cuerpo.indexOf('auraVozEncolar');
  const iFin = cuerpo.indexOf('if (!m.parcial) return;');
  assert.ok(iVoz > 0 && iFin > iVoz,
    'pide la voz DESPUÉS de cerrar el turno: eso es esperar la respuesta entera, ' +
    'que es justo lo que hacía que el primer sonido llegara a los ~10 s');
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
