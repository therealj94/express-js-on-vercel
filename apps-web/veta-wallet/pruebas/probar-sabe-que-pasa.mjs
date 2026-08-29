/* QUE NUNCA SE QUEDE SIN SABER QUÉ PASA.
 *
 * «Me sale escuchando, no sé si me escuchó, si está pensando, tarda en
 * contestar.» El arreglo no es poner la palabra: es que la palabra CAMBIE.
 * Una etiqueta quieta durante seis segundos no se distingue de una app
 * muerta, y esa es exactamente la sensación que se reportó.
 *
 * Se prueban tres cosas:
 *   — que no quede NINGÚN momento de espera sin línea de estado;
 *   — que el «pensando» avance con el tiempo, en las dos pantallas;
 *   — que el reloj que lo hace avanzar se apague solo.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ok  ' + nombre); }
  catch (e) { mal++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
};

console.log('\nninguna espera sin línea');

/* La línea de estado se saca del propio archivo y se corre de verdad, con
   las banderas puestas a mano: así se prueba lo que se ve, no el texto. */
function lineaDeEstado(banderas) {
  const cuerpo = app.match(/const habla = !!auraCortarVozBurbuja \|\| auraGrabadaSonando;([\s\S]*?)return est \?/)[1];
  const T = {
    pensando: 'Pensando…', pensandoMas: 'Sigo en eso…',
    pensandoMucho: 'Está tardando más de lo normal. Sigo acá.',
    hablando: 'Hablando…', buscandoVoz: 'Preparando la voz…',
    teEscucho: 'Te escucho…', abriendoMic: 'Abriendo el micrófono…',
  };
  const f = new Function('T', 'auraCortarVozBurbuja', 'auraGrabadaSonando',
    'auraPensando', 'auraBuscandoVoz', 'auraConversando', 'auraOyendo',
    'auraTextoPensando', 'auraSegundosEsperando',
    'const habla = !!auraCortarVozBurbuja || auraGrabadaSonando;' + cuerpo + 'return est;');
  return f(T, banderas.cortar || null, !!banderas.grabada, !!banderas.pensando,
    !!banderas.buscandoVoz, !!banderas.conversando, () => !!banderas.oyendo,
    () => T.pensando, () => banderas.seg || 0);
}

const momentos = [
  ['piensa',                     { pensando: true }],
  ['prepara la voz',             { buscandoVoz: true }],
  ['habla en vivo',              { cortar: () => {} }],
  ['habla una frase grabada',    { grabada: true }],
  ['escucha',                    { conversando: true, oyendo: true }],
  ['abre el micrófono',          { conversando: true, oyendo: false }],
];

for (const [nombre, banderas] of momentos) {
  prueba('mientras ' + nombre + ', dice algo', () => {
    const est = lineaDeEstado(banderas);
    assert.ok(est && est.t, 'se queda muda: la persona no sabe si sigue viva');
  });
}

prueba('preparar la voz NO se ve como pensar', () => {
  /* Lo encontró la prueba de navegador: `.aura-pensando` hacía dos trabajos
     —dibujaba los puntos Y quería decir «pensando»—, así que toda línea de
     estado heredaba el significado de una sola de ellas. Con la respuesta ya
     escrita en pantalla, debajo seguían los puntos de pensar, que es la señal
     de «todavía no llegó». La forma es `.aura-estado`; el significado, cada
     clase por su lado. */
  const marca = app.match(/return est \? `<div class="([^"]+)"/)[1];
  assert.ok(marca.includes('aura-estado'), 'la forma no tiene clase propia');
  assert.ok(!marca.includes('aura-pensando'),
    'toda línea de estado nace diciendo «pensando», diga lo que diga');
  assert.equal(lineaDeEstado({ buscandoVoz: true }).c, 'aura-preparando',
    'preparar la voz se pinta como otro estado, no con el suyo');
  assert.equal(lineaDeEstado({ pensando: true }).c, 'aura-pensando',
    'y pensar sí tiene que decir que piensa');
});

prueba('quieta no dice nada (el silencio también es información)', () => {
  assert.equal(lineaDeEstado({}), null,
    'una línea de estado permanente deja de ser una señal y pasa a ser adorno');
});

console.log('\nla espera avanza');

prueba('el pensando cambia con el tiempo, no se queda quieto', () => {
  const m = app.match(/function auraTextoPensando\(T\) \{([\s\S]*?)\n  \}/);
  assert.ok(m, 'no está auraTextoPensando');
  const f = new Function('T', 'auraSegundosEsperando', m[1]);
  const T = { pensando: 'a', pensandoMas: 'b', pensandoMucho: 'c' };
  const enSegundo = (s) => f(T, () => s);
  assert.equal(enSegundo(1), 'a', 'al segundo ya no dice lo primero');
  assert.equal(enSegundo(8), 'b',
    'a los ocho segundos sigue diciendo lo mismo que al primero: quieta');
  assert.equal(enSegundo(20), 'c',
    'a los veinte sigue tan tranquila como al principio, y ya no es normal');
  assert.notEqual(enSegundo(1), enSegundo(8), 'las tres son la misma frase');
});

prueba('las TRES pantallas usan la MISMA cuenta del mismo momento', () => {
  const donde = {
    'la burbuja': /t: auraTextoPensando\(T\)/,
    'la pantalla de voz': /pensando: auraTextoPensando\(aTxt\(\)\)/,
    'el hilo de PULSE2CHAT': /<i><\/i><i><\/i><i><\/i><span>\$\{esc\(auraTextoPensando\(aTxt\(\)\)\)\}/,
  };
  for (const [nombre, re] of Object.entries(donde)) {
    assert.ok(re.test(app), nombre + ' se quedó con la etiqueta fija: dos ' +
      'cuentas distintas del mismo momento terminan diciendo cosas distintas');
  }
});

prueba('el hilo sabe desde cuándo espera aunque nadie arranque su reloj', () => {
  /* El hilo no enciende `auraDesdeCuando` —espera por su ventana, no por la
     bandera de la burbuja—, así que sin esto su línea se quedaría clavada
     en la primera frase para siempre. */
  const m = app.match(/function auraSegundosEsperando\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(m, 'no está auraSegundosEsperando');
  assert.ok(/auraEsperandoHasta - AURA_VENTANA/.test(m[1]),
    'no deduce el arranque de la ventana del hilo');
  assert.ok(/Math\.max\(\.\.\.arranques\)/.test(m[1]),
    'no se queda con la espera en curso: una vieja dejaría la línea en «está ' +
    'tardando» desde el primer segundo de la siguiente');
  const f = new Function('auraDesdeCuando', 'auraEsperandoHasta', 'AURA_VENTANA', 'Date',
    m[1]);
  const ahora = 100000;
  const D = { now: () => ahora };
  assert.equal(f(0, 0, 60000, D), 0, 'sin espera devuelve algo distinto de cero');
  assert.equal(f(0, ahora - 3000 + 60000, 60000, D), 3,
    'el hilo solo: mal contado');
  assert.equal(f(ahora - 2000, ahora - 9000 + 60000, 60000, D), 2,
    'gana la espera vieja en vez de la que está en curso');
});

console.log('\nel reloj no se queda encendido');

prueba('late solo mientras hay espera, y se apaga', () => {
  const m = app.match(/function auraLatirSegunEstado\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(m, 'no está auraLatirSegunEstado');
  const c = m[1];
  assert.ok(/auraPensando \? 'pensando' : auraBuscandoVoz \? 'voz' : ''/.test(c),
    'no mira las dos esperas');
  assert.ok(/clearInterval\(auraLatido\)/.test(c),
    'nunca se apaga: un intervalo para siempre despierta el teléfono cada ' +
    'segundo sin que nadie lo esté mirando');
  assert.ok(/if \(fase && !auraLatido\)/.test(c),
    'no comprueba si ya está latiendo: cada repintado dejaría un reloj más');
});

prueba('pensar y preparar la voz son dos esperas, no una', () => {
  /* Son dos esperas seguidas. Sin poner el reloj a cero al pasar de una a la
     otra, la línea de la voz hereda los segundos de pensar y dice «está
     tardando» al primer instante, cuando todavía no tardó nada. */
  const m = app.match(/function auraLatirSegunEstado\(\) \{([\s\S]*?)\n  \}/);
  const c = m[1];
  assert.ok(/if \(fase !== auraFase\)/.test(c), 'no distingue una fase de la otra');
  assert.ok(/auraDesdeCuando = fase \? Date\.now\(\) : 0;/.test(c),
    'no pone el reloj a cero al cambiar de espera');
});

prueba('si la voz tarda, lo dice — y dice que el texto ya está', () => {
  const est = (seg) => {
    const cuerpo = app.match(/const habla = !!auraCortarVozBurbuja \|\| auraGrabadaSonando;([\s\S]*?)return est \?/)[1];
    const T = { buscandoVoz: 'preparando', buscandoVozTarda: 'tarda' };
    return new Function('T', 'auraCortarVozBurbuja', 'auraGrabadaSonando',
      'auraPensando', 'auraBuscandoVoz', 'auraConversando', 'auraOyendo',
      'auraTextoPensando', 'auraSegundosEsperando',
      'const habla = !!auraCortarVozBurbuja || auraGrabadaSonando;' + cuerpo + 'return est;')
      (T, null, false, false, true, false, () => false, () => '', () => seg);
  };
  assert.equal(est(2).t, 'preparando', 'a los dos segundos ya se queja');
  assert.equal(est(20).t, 'tarda',
    'a los veinte segundos sigue diciendo «preparando la voz», que a esa ' +
    'altura ya no informa de nada. La voz se genera de a una en la GPU: si ' +
    'hay otra respuesta hablando, esta hace cola y puede tardar de verdad');
});

prueba('lo arrancan los dos repintados', () => {
  assert.equal((app.match(/^\s*auraLatirSegunEstado\(\);$/gm) || []).length, 2,
    'tiene que llamarse desde pintarAura y pintarChat, ni más ni menos');
});

console.log('\nel hueco de la voz queda tapado en los dos finales');

prueba('la bandera de preparar la voz se baja también si falla', () => {
  const i = app.indexOf('async function auraVozDeLaCasa(');
  const cuerpo = app.slice(i, i + 6500);
  const bajadas = (cuerpo.match(/auraBuscandoVoz = false/g) || []).length;
  assert.ok(bajadas >= 3,
    'se baja en ' + bajadas + ' sitio(s). Hacen falta tres: al primer sonido, ' +
    'al terminar, y en el fallo — si no, la línea se queda «preparando la voz» ' +
    'para siempre sobre una voz que nunca va a llegar');
});

console.log(mal ? `\n${mal} mal\n` : '\ntodo bien\n');
process.exit(mal ? 1 : 0);
