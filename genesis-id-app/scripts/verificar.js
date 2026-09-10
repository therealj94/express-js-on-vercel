// Revisión previa a compilar o publicar: caza errores de sintaxis y de
// configuración ANTES de gastar una build de EAS entera en descubrirlos.
//
// Se corre con `npm run verificar` y en los workflows.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let fallos = 0;
const mal = (msg) => { console.error('  ✗ ' + msg); fallos++; };
const bien = (msg) => console.log('  ✓ ' + msg);

// 1. Todos los .js de src/ + App.js + index.js tienen que parsear como JSX.
const parser = require('@babel/core');
const archivos = ['App.js', 'index.js'];
const recorrer = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const ruta = path.join(dir, f);
    if (fs.statSync(ruta).isDirectory()) recorrer(ruta);
    else if (f.endsWith('.js')) archivos.push(ruta);
  }
};
recorrer('src');

for (const f of archivos) {
  try {
    parser.parseSync(fs.readFileSync(f, 'utf8'), {
      filename: f, presets: [require.resolve('babel-preset-expo')],
    });
  } catch (e) {
    mal(`${f}: ${e.message.split('\n')[0]}`);
  }
}
if (!fallos) bien(`${archivos.length} archivos parsean bien`);

// 2. Los assets que app.json referencia tienen que existir.
const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
for (const ruta of [app.icon, app.splash?.image, app.android?.adaptiveIcon?.foregroundImage]) {
  if (!ruta) continue;
  if (!fs.existsSync(ruta)) mal(`Falta el asset ${ruta}`);
}
if (!fallos) bien('assets de app.json presentes');

/* 3. Desfases de dependencias contra el SDK de Expo.

   Un desfase de PARCHE dentro del mismo SDK avisa, no bloquea. Y no es
   relajar el listón: es que subirlo cuesta más de lo que arregla.

   El caso real que lo enseñó: `expo@54.0.36` contra `~54.0.37`, y dos
   paquetes más igual. Correr `expo install --fix` los alinea, sí — y CAMBIA
   LA HUELLA DE RUNTIME, medido: 94c7667c → 049f6a49. Con la huella cambiada,
   un update por aire ya no llega a ningún APK instalado y hay que compilar
   uno nuevo y que la gente lo instale. Bloquear una publicación por tres
   parches, y forzar así una reinstalación, es cambiar un problema pequeño por
   uno grande.

   Un desfase de MAYOR o de MENOR sí bloquea: ahí ya no son parches del mismo
   SDK, es otro SDK, y eso sí rompe. */
const versionesDe = (linea) => {
  // «  expo@54.0.36 - expected version: ~54.0.37»
  const m = linea.match(/^\s*(\S+)@(\d+\.\d+\.\d+\S*)\s*-\s*expected version:\s*[~^]?(\d+\.\d+\.\d+\S*)/);
  if (!m) return null;
  return { paquete: m[1], hay: m[2], espera: m[3] };
};
const soloParche = (v) => {
  const a = v.hay.split('.'), b = v.espera.split('.');
  return a[0] === b[0] && a[1] === b[1];
};

try {
  execSync('npx expo install --check', { stdio: 'pipe' });
  bien('dependencias alineadas con el SDK');
} catch (e) {
  /* Se leen LAS DOS salidas, y ese fue el otro fallo: `expo install --check`
     escribe qué dependencia está desfasada en STDERR, no en stdout. Leyendo
     solo `stdout`, el aviso salía así:

         ✗ dependencias fuera del SDK esperado:
         (nada)
         1 problema(s). No compilar hasta arreglarlos.

     Un guion que dice «hay un problema» y no dice cuál es peor que no
     tenerlo: bloquea y no deja avanzar a quien lo lee. Costó una publicación
     por aire que nunca salió. */
  const salida = [e.stdout, e.stderr, e.message]
    .map((x) => String(x || '').trim()).filter(Boolean).join('\n');

  // Sin duplicados: el mismo listado llega por stdout y por stderr, y sin esto
  // cada paquete se anunciaba dos veces.
  const porPaquete = new Map();
  for (const v of salida.split('\n').map(versionesDe).filter(Boolean)) {
    if (!porPaquete.has(v.paquete)) porPaquete.set(v.paquete, v);
  }
  const desfases = [...porPaquete.values()];
  const graves = desfases.filter((v) => !soloParche(v));
  const parches = desfases.filter(soloParche);

  if (graves.length) {
    mal('dependencias de otro SDK — hay que alinearlas antes de compilar:\n' +
      graves.map((v) => `      ${v.paquete}: hay ${v.hay}, se espera ${v.espera}`).join('\n'));
  } else if (parches.length) {
    console.log('  ⚠ desfase de parche dentro del mismo SDK (avisa, no bloquea):');
    for (const v of parches) console.log(`      ${v.paquete}: hay ${v.hay}, se espera ${v.espera}`);
    console.log('      Alinearlos cambia la huella de runtime y obliga a un APK nuevo:');
    console.log('      hacerlo junto con la próxima compilación, no antes.');
  } else {
    // No se pudo entender la salida: se bloquea, que es lo prudente cuando no
    // se sabe qué pasa. Pero se enseña ENTERA, para poder decidir a mano.
    mal('no se pudo interpretar la comprobación de dependencias:\n' + salida.slice(0, 1500));
  }
}

if (fallos) {
  console.error(`\n${fallos} problema(s). No compilar hasta arreglarlos.`);
  process.exit(1);
}
console.log('\nTodo en orden.');
