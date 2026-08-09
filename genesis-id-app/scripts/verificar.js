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

// 3. Desfases de dependencias contra el SDK de Expo.
try {
  execSync('npx expo install --check', { stdio: 'pipe' });
  bien('dependencias alineadas con el SDK');
} catch (e) {
  const salida = String(e.stdout || e.message);
  // `expo install --check` sale con código 1 cuando hay desfases.
  mal('dependencias fuera del SDK esperado:\n' + salida.slice(0, 1200));
}

if (fallos) {
  console.error(`\n${fallos} problema(s). No compilar hasta arreglarlos.`);
  process.exit(1);
}
console.log('\nTodo en orden.');
