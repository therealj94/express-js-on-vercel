#!/usr/bin/env node
/**
 * Comprueba que el proyecto esté listo para construir el APK.
 *
 * El fallo más repetido al recibir una versión nueva es descomprimirla encima
 * de la carpeta anterior: queda un node_modules viejo, sin los paquetes que
 * la versión nueva necesita, y el build revienta con
 * "expo export:embed ... exited with non-zero code: 1", que no dice nada.
 * Esto lo detecta antes y explica cómo arreglarlo.
 *
 *   npm run verificar
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const leer = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));

const pkg = leer('package.json');
const app = leer('app.json').expo;

let errores = 0;
let avisos = 0;
const mal = (m) => { errores++; console.log('  ✗ ' + m); };
const ojo = (m) => { avisos++; console.log('  ! ' + m); };
const bien = (m) => console.log('  ✓ ' + m);

console.log(`\nVeta Wallet ${app.version} — revisión previa al build\n`);

// 1. ¿Están instaladas todas las dependencias declaradas?
console.log('Dependencias');
if (!fs.existsSync(path.join(raiz, 'node_modules'))) {
  mal('no existe node_modules. Ejecuta:  npm install');
} else {
  const faltan = [];
  const distintas = [];
  for (const [nombre, rango] of Object.entries(pkg.dependencies || {})) {
    const p = path.join(raiz, 'node_modules', nombre, 'package.json');
    if (!fs.existsSync(p)) { faltan.push(nombre); continue; }
    const instalada = JSON.parse(fs.readFileSync(p, 'utf8')).version;
    const base = rango.replace(/^[~^]/, '');
    if (!/^[\d.]+$/.test(base)) continue;
    // Se compara según lo que el rango permite de verdad: "^" deja subir la
    // menor, "~" solo el parche, y sin prefijo tiene que ser exacta.
    const partes = rango.startsWith('^') ? 1 : rango.startsWith('~') ? 2 : 3;
    const corta = (v) => v.split('.').slice(0, partes).join('.');
    if (corta(instalada) !== corta(base)) {
      distintas.push(`${nombre}: declarada ${rango}, instalada ${instalada}`);
    }
  }
  if (faltan.length) {
    mal(`faltan ${faltan.length} paquete(s) por instalar: ${faltan.join(', ')}`);
    console.log('     Casi seguro descomprimiste la versión nueva encima de la anterior.');
    console.log('     Arréglalo así:   rm -rf node_modules package-lock.json && npm install');
  } else bien(`las ${Object.keys(pkg.dependencies).length} dependencias están instaladas`);
  for (const d of distintas) ojo(d);
}

// 1b. Metro necesita estos paquetes para construir el bundle. Si están en
// devDependencies, una instalación de producción los omite y el build muere
// con "expo export:embed ... exited with non-zero code: 1" sin más pistas.
console.log('\nDependencias del build');
const dev = pkg.devDependencies || {};
const necesarias = ['@babel/core', 'expo', 'react', 'react-native'];
const malUbicadas = necesarias.filter((n) => dev[n]);
if (malUbicadas.length) {
  mal(`${malUbicadas.join(', ')} está(n) en devDependencies. Metro los necesita al construir: muévelos a "dependencies".`);
} else {
  const ausentes = necesarias.filter((n) => !(pkg.dependencies || {})[n]);
  if (ausentes.length) mal(`faltan en dependencies: ${ausentes.join(', ')}`);
  else bien('las que Metro necesita están en dependencies');
}

// 1c. Expo Go de la tienda solo abre proyectos del SDK más reciente. Si el
// proyecto se queda atrás, el teléfono responde con un error de versión y no
// hay forma de probar la app ahí.
console.log('\nSDK de Expo');
const sdk = (pkg.dependencies.expo || '').replace(/^[~^]/, '').split('.')[0];
try {
  const instalado = JSON.parse(fs.readFileSync(path.join(raiz, 'node_modules/expo/package.json'), 'utf8')).version;
  if (instalado.split('.')[0] !== sdk) mal(`package.json pide expo ${pkg.dependencies.expo} pero hay ${instalado} instalado`);
  else bien(`SDK ${sdk} (expo ${instalado})`);
  console.log(`     Expo Go tiene que ser la versión de SDK ${sdk}. Si tu Expo Go es más nuevo, actualiza el proyecto.`);
} catch (e) { mal('expo no está instalado'); }

// 2. La versión tiene que coincidir en los tres sitios.
console.log('\nVersión');
const version = fs.readFileSync(path.join(raiz, 'src/version.js'), 'utf8');
const enCodigo = (version.match(/VERSION = '([^']+)'/) || [])[1];
const build = (version.match(/BUILD = (\d+)/) || [])[1];
if (app.version !== pkg.version) mal(`app.json dice ${app.version} y package.json ${pkg.version}`);
else if (app.version !== enCodigo) mal(`app.json dice ${app.version} y src/version.js ${enCodigo}`);
else bien(`${enCodigo} · build ${build}, igual en app.json, package.json y src/version.js`);

// 3. Carpetas nativas: en flujo managed no deben venir en el paquete.
console.log('\nProyecto');
for (const dir of ['android', 'ios']) {
  if (fs.existsSync(path.join(raiz, dir))) {
    ojo(`existe la carpeta ${dir}/. En este proyecto la genera EAS: bórrala si no la editaste a mano (rm -rf ${dir})`);
  }
}
if (!fs.existsSync(path.join(raiz, 'index.js'))) mal('falta index.js (punto de entrada)');
else bien('punto de entrada index.js');

// 4. Cada plugin de app.json tiene que estar instalado.
console.log('\nPlugins de app.json');
for (const entrada of app.plugins || []) {
  const nombre = Array.isArray(entrada) ? entrada[0] : entrada;
  if (!fs.existsSync(path.join(raiz, 'node_modules', nombre))) mal(`el plugin "${nombre}" está en app.json pero no instalado`);
  else bien(nombre);
}

// 5. Que ningún archivo importe algo que no esté declarado.
console.log('\nImportaciones');
const archivos = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) archivos.push(p);
  }
})(path.join(raiz, 'src'));
archivos.push(path.join(raiz, 'App.js'), path.join(raiz, 'index.js'));

const declaradas = new Set(Object.keys(pkg.dependencies || {}));
const sinDeclarar = new Set();
for (const f of archivos) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/from\s+'([^']+)'/g)) {
    const mod = m[1];
    if (mod.startsWith('.') || mod.startsWith('/')) continue;
    const base = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];
    if (!declaradas.has(base) && !['react', 'react-native'].includes(base)) sinDeclarar.add(`${base}  (en ${path.relative(raiz, f)})`);
  }
}
if (sinDeclarar.size) for (const m of sinDeclarar) mal(`se importa "${m}" pero no está en package.json`);
else bien(`${archivos.length} archivos, todas las importaciones declaradas`);

console.log(`\n${errores ? `✗ ${errores} problema(s) que hay que arreglar antes de construir` : '✓ listo para construir'}${avisos ? ` · ${avisos} aviso(s)` : ''}\n`);
process.exit(errores ? 1 : 0);
