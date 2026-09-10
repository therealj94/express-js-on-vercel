// ═══ LA VERSIÓN, IGUAL EN LOS TRES SITIOS ════════════════════════════════
// node pruebas/probar-version.cjs
//
// app.json decía 1.33.2, package.json 1.33.1 y src/version.js 1.33.1. Cada
// uno se sube a mano y en un sitio distinto, así que se desalinean solos y
// nadie lo nota hasta que Ajustes → Acerca de dice una cosa y la tienda otra.
// `npm run verificar` ya lo miraba, pero necesita node_modules instalado y por
// eso no corre en cualquier sitio. Esto no necesita nada.
//
// Lo que se exige:
//   · app.json (expo.version) === package.json (version) === VERSION
//   · la primera entrada del CHANGELOG es la versión actual, con su BUILD y
//     su fecha: subir VERSION sin contar qué cambió es media entrega
//   · BUILD sube de uno en uno: la entrada anterior lleva BUILD - 1
//   · en las novedades no hay promesas ni jerga que la Junta prohibió
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const app = JSON.parse(leer('app.json')).expo;
const pkg = JSON.parse(leer('package.json'));
const fuente = leer('src/version.js');

// version.js no tiene imports: se evalúa tal cual, sin transpilar, para leer
// VERSION, BUILD, RELEASED y CHANGELOG de verdad y no con expresiones regulares.
const modulo = new Function(fuente.replace(/^export /gm, '') + '\nreturn { VERSION, BUILD, RELEASED, CHANGELOG };')();

let pasan = 0;
const fallos = [];
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { pasan += 1; return; }
  fallos.push(nombre + (detalle ? `  (${detalle})` : ''));
};

prueba('app.json y package.json dicen la misma versión', app.version === pkg.version, `${app.version} vs ${pkg.version}`);
prueba('src/version.js dice la misma que app.json', modulo.VERSION === app.version, `${modulo.VERSION} vs ${app.version}`);
prueba('la versión tiene forma mayor.menor.parche', /^\d+\.\d+\.\d+$/.test(modulo.VERSION), modulo.VERSION);
prueba('BUILD es un entero positivo', Number.isInteger(modulo.BUILD) && modulo.BUILD > 0, String(modulo.BUILD));
prueba('RELEASED es una fecha AAAA-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(modulo.RELEASED), modulo.RELEASED);

const [actual, anterior] = modulo.CHANGELOG;
prueba('hay historial de novedades', Array.isArray(modulo.CHANGELOG) && modulo.CHANGELOG.length > 0);
prueba('la primera novedad es la versión actual', actual && actual.v === modulo.VERSION, `${actual && actual.v} vs ${modulo.VERSION}`);
prueba('con el BUILD actual', actual && actual.build === modulo.BUILD, `${actual && actual.build} vs ${modulo.BUILD}`);
prueba('con la fecha de salida', actual && actual.date === modulo.RELEASED, `${actual && actual.date} vs ${modulo.RELEASED}`);
prueba('BUILD sube de uno en uno', !anterior || anterior.build === modulo.BUILD - 1, `${anterior && anterior.build} → ${modulo.BUILD}`);
prueba('cada novedad va en español y en inglés',
  modulo.CHANGELOG.every((r) => Array.isArray(r.es) && Array.isArray(r.en) && r.es.length > 0 && r.en.length > 0));

// Lo que la Junta no deja escribir sobre ORIGEN, AUKA y AGKA: «respaldado»,
// «regulado», «registrado», ni promesas de rendimiento. Se mira la entrada
// actual, que es la que sale en el teléfono y en la tienda.
const PROHIBIDO = /respaldad[oa]s?\b|regulad[oa]s?\b|garantizad|rendimiento|ganancia asegurada/i;
const textos = actual ? [...actual.es, ...actual.en] : [];
prueba('las novedades actuales no dicen «respaldado», «regulado» ni prometen nada',
  !textos.some((l) => PROHIBIDO.test(l) && !/en vez de «respaldado»|instead of "backed"/.test(l)),
  textos.filter((l) => PROHIBIDO.test(l)).join(' | ').slice(0, 120));

for (const f of fallos) console.log('  FALLA ' + f);
console.log(fallos.length ? `\n${fallos.length} en rojo (${pasan} en verde)\n` : `\n✓ ${pasan} pruebas en verde · ${modulo.VERSION} build ${modulo.BUILD}\n`);
process.exit(fallos.length ? 1 : 0);
