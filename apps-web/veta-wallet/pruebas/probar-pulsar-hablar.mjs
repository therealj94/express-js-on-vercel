/* PULSAR PARA HABLAR: mientras apretás te escucha, al soltar contesta.
 *
 * Por qué se cambió, con las palabras de quien lo sufrió: «sigue crashing,
 * pésimo de escucha, dos veces, está como loco». Y el dato que decide:
 * pasaba con UNA sola persona usándolo. Eso no es capacidad — es demasiado
 * automatismo.
 *
 * El micrófono automático tenía cinco piezas que podían fallar y ninguna
 * forma de saber cuál falló: se abría solo, se cerraba a los 900 ms de
 * silencio, un vigía la interrumpía a los 450 ms de voz, se reenganchaba al
 * terminar de hablar, y donde el navegador cancelaba mal el eco se
 * transcribía a sí misma. Encima el reenganche era `onend` llamando a
 * `start()` en el acto: la receta del InvalidStateError en cadena que tumba
 * la pestaña en el teléfono.
 *
 * El dedo ya sabe cuándo empezaste y cuándo terminaste. Adivinarlo con un
 * medidor de volumen era resolver un problema que no hacía falta tener.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ok  ' + nombre); }
  catch (e) { mal++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
};

console.log('\nel micrófono vive lo que dura el dedo');

/* Las dos funciones se sacan del archivo y se corren de verdad, con un
   reconocedor de mentira, para probar QUÉ HACEN y no cómo están escritas. */
function conElDedo() {
  const cuerpoIni = app.match(/function auraPulsarEmpezar\(\) \{([\s\S]*?)\n  \}/)[1];
  const cuerpoFin = app.match(/function auraPulsarSoltar\(\) \{([\s\S]*?)\n  \}/)[1];
  const hechos = [];
  const est = { auraPulsando: false, dictando: null, auraConversando: false };
  const rec = { stop: () => hechos.push('stop'), abort: () => hechos.push('abort') };
  const ctx = {
    auraVozCallarCola: () => hechos.push('callar-cola'),
    auraCallar: () => hechos.push('callar-voz'),
    auraDictar: () => { hechos.push('abrir-micro'); },
    auraApuntarOidoALaBurbuja: () => hechos.push('apuntar-burbuja'),
    auraSoltarOido: () => hechos.push('apuntar-hilo'),
    pintarAura: () => {}, pintarChat: () => {}, auraAbierta: true,
    __rec: rec,
  };
  /* `dictando` es estado COMPARTIDO entre las dos funciones —en el archivo de
     verdad es una variable del módulo— así que el arnés tiene que devolvérselo
     tal como quedó. Copiarlo dentro y perderlo al salir hacía que soltar no
     encontrara ningún micrófono que cerrar. */
  const correr = (cuerpo) => {
    const f = new Function('estado', 'ctx', `
      let { auraPulsando, dictando, auraConversando } = estado;
      const { auraVozCallarCola, auraCallar, pintarAura, pintarChat,
              auraAbierta, auraApuntarOidoALaBurbuja, auraSoltarOido } = ctx;
      const auraDictar = () => { ctx.auraDictar(); dictando = ctx.__rec; };
      ${cuerpo}
      return { auraPulsando, dictando, auraConversando };
    `);
    Object.assign(est, f(est, ctx));
  };
  return { est, hechos, rec, ctx, apretar: () => correr(cuerpoIni), soltar: () => correr(cuerpoFin) };
}

prueba('apretar abre el micrófono', () => {
  const d = conElDedo();
  d.apretar();
  assert.ok(d.hechos.includes('abrir-micro'), 'no abrió nada: ' + d.hechos.join(','));
  assert.equal(d.est.auraPulsando, true, 'no queda marcado como apretado');
});

prueba('y apretar la CALLA: eso es interrumpirla', () => {
  const d = conElDedo();
  d.apretar();
  assert.ok(d.hechos.includes('callar-cola'),
    'sigue diciendo la respuesta anterior encima de lo que estás diciendo vos');
  assert.ok(d.hechos.indexOf('callar-cola') < d.hechos.indexOf('abrir-micro'),
    'abre el micrófono ANTES de callarla: se oye a sí misma y transcribe su ' +
    'propia voz, que era justo el enredo que se vino a quitar');
});

prueba('y apunta el oído ANTES de abrirlo', () => {
  /* Casi se me va: al quitar el modo automático nadie apuntaba el oído a la
     burbuja, así que lo que decías ahí no llegaba a ninguna parte. La burbuja
     y el hilo son dos destinos distintos, y sin apuntar lo dicho cae en el de
     la vez anterior — o en ninguno. Lo cazó la prueba de navegador. */
  const d = conElDedo();
  d.apretar();
  assert.ok(d.hechos.includes('apuntar-burbuja'),
    'no apuntó el oído: lo que digas no llega a ningún lado');
  assert.ok(d.hechos.indexOf('apuntar-burbuja') < d.hechos.indexOf('abrir-micro'),
    'apunta DESPUÉS de abrir el micrófono: lo primero que digas se pierde');
});

prueba('soltar entrega lo dicho, no lo tira', () => {
  const d = conElDedo();
  d.apretar();
  d.soltar();
  assert.ok(d.hechos.includes('stop'),
    'no cerró el micrófono al soltar: queda abierto para siempre');
  assert.ok(!d.hechos.includes('abort'),
    'usó abort(), que cierra TIRANDO lo capturado: se pierde la frase que la ' +
    'persona acaba de decir. stop() cierra entregándola');
  assert.equal(d.est.auraPulsando, false, 'sigue creyendo que está apretado');
});

prueba('soltar dos veces no rompe nada', () => {
  const d = conElDedo();
  d.apretar(); d.soltar(); d.soltar();
  assert.equal(d.hechos.filter((x) => x === 'stop').length, 1,
    'cerró dos veces: pointerup y pointerleave llegan los dos al soltar fuera ' +
    'del botón, así que pasa siempre');
});

prueba('apretar dos veces no abre dos micrófonos', () => {
  const d = conElDedo();
  d.apretar(); d.apretar();
  assert.equal(d.hechos.filter((x) => x === 'abrir-micro').length, 1,
    'dos reconocedores a la vez: uno queda huérfano y sigue escuchando');
});

console.log('\nnada se abre ni se cierra solo');

prueba('no queda ningún reenganche automático del micrófono', () => {
  assert.equal((app.match(/setTimeout\(auraOirEnLaBurbuja/g) || []).length, 0,
    'sigue reabriendo el oído al terminar de hablar: se abre mientras ella ' +
    'todavía suena en el altavoz');
});

prueba('el onend solo reabre si el dedo SIGUE apretado', () => {
  const m = app.match(/r\.onend = \(\) => \{([\s\S]*?)\n    \};/);
  assert.ok(m, 'no está el onend');
  assert.ok(/auraPulsando/.test(m[1]),
    'reabre sin mirar el dedo: `onend` llamando a `start()` en cadena es lo ' +
    'que encadena InvalidStateError hasta tumbar la pestaña');
  assert.ok(/if \(auraPulsando\)/.test(m[1]),
    'no vuelve a comprobar el dedo DENTRO del temporizador: en esos 250 ms se ' +
    'puede haber soltado');
});

console.log('\nel botón está donde tiene que estar');

prueba('los dos botones son de mantener, no de tocar', () => {
  for (const [nombre, marca] of [
    ['la burbuja', 'class="aura-mic'],
    ['la pantalla de voz', 'class="aura-pelota'],
  ]) {
    const i = app.indexOf(marca);
    assert.ok(i > 0, 'no está el botón de ' + nombre);
    const boton = app.slice(i, app.indexOf('</button>', i));
    assert.ok(/onpointerdown="VETA\.auraPulsarEmpezar/.test(boton),
      nombre + ': no escucha al apretar');
    assert.ok(/onpointerup="VETA\.auraPulsarSoltar/.test(boton),
      nombre + ': no suelta al levantar el dedo');
    assert.ok(!/onclick=/.test(boton),
      nombre + ': quedó un onclick — click llega al SOLTAR, así que con click ' +
      'no existe el «mientras apretás»');
  }
});

prueba('y se cierra si el gesto se pierde', () => {
  /* Se suelta fuera del botón, entra una llamada, o el sistema se lleva el
     gesto para volver atrás. Sin esto el micrófono queda abierto sin que
     nadie lo haya dejado así. */
  for (const marca of ['class="aura-mic', 'class="aura-pelota']) {
    const i = app.indexOf(marca);
    const boton = app.slice(i, app.indexOf('</button>', i));
    for (const ev of ['onpointercancel', 'onpointerleave']) {
      assert.ok(new RegExp(ev + '="VETA\\.auraPulsarSoltar').test(boton),
        `falta ${ev}: el micrófono queda abierto si el gesto se pierde`);
    }
    assert.ok(/touch-action:none/.test(boton),
      'sin touch-action:none el navegador se queda el gesto creyendo que vas ' +
      'a desplazar la pantalla, y el botón no responde en el teléfono');
  }
});

prueba('y dice qué hacer, en los dos idiomas', () => {
  for (const clave of ['pulsaHabla', 'pulsaSuelta']) {
    const veces = (app.match(new RegExp(clave + ':', 'g')) || []).length;
    assert.ok(veces >= 2, `«${clave}» está ${veces} vez/veces: falta un idioma`);
  }
  assert.ok(/pulsaHabla: 'Mantené apretado para hablar'/.test(app),
    'el texto no explica que hay que MANTENER: «hablar» a secas se lee como ' +
    'tocar una vez, y tocando una vez no pasa nada');
});

console.log(mal ? `\n${mal} mal\n` : '\ntodo bien\n');
process.exit(mal ? 1 : 0);
