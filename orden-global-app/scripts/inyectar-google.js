#!/usr/bin/env node
/**
 * inyectar-google.js
 *
 * Resuelve los tres identificadores de OAuth de Google y los deja donde cada
 * parte del proceso sabe buscarlos, justo antes de compilar o de publicar un
 * update.
 *
 * NINGUNO DE ESTOS VALORES ES SECRETO
 *
 * Un identificador de cliente de OAuth viaja dentro del paquete de la app y
 * cualquiera puede leerlo del archivo instalado. Lo único que hace es decir
 * "este token va dirigido a tal aplicación", y sin la firma del proveedor no
 * sirve para entrar a ningún lado. Por eso van como variables y no como
 * secretos, y por eso pueden estar escritos en el repositorio.
 *
 * DE DÓNDE SALEN: DOS CAMINOS, Y LOS DOS VALEN
 *
 *   1. Variables del repositorio en GitHub. Se pegan una vez en una pantalla y
 *      no hay que tocar código.
 *   2. Escritos en `eas.json`. Es lo que hace el operador automático cuando se
 *      le pasan los valores por mensaje: no tiene permiso para escribir
 *      variables en GitHub, pero sí para empujar código.
 *
 * La variable de GitHub gana sobre lo escrito, para que corregir un
 * identificador no dependa de nadie ni de un despliegue.
 *
 * SE INYECTAN EN TODOS LOS PERFILES, Y ESO ES A PROPÓSITO
 *
 * `preview` es donde se prueba que entrar con Google funciona. Si sólo se
 * inyectaran en `production`, la prueba se haría sobre una app que no lleva la
 * configuración y no probaría nada — y el fallo aparecería recién en la tienda.
 *
 * SI NO ESTÁN, NO PASA NADA
 *
 * Sale un aviso y sigue. La app esconde los botones cuando falta la
 * configuración, así que compila y funciona con correo y contraseña. Es
 * preferible una app sin el botón que un botón que no lleva a ningún lado.
 */

const fs = require('fs');
const path = require('path');

const CLAVES = [
  ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'GOOGLE_WEB_CLIENT_ID', 'web'],
  ['EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID', 'GOOGLE_ANDROID_CLIENT_ID', 'android'],
  ['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', 'GOOGLE_IOS_CLIENT_ID', 'ios'],
];

// El mismo criterio que usa la app en `src/social.js`: un identificador sólo
// cuenta si es un texto con forma de identificador. Una variable vacía o sin
// definir en GitHub llega como cadena vacía, no como ausente.
const valido = (v) => typeof v === 'string' && v.trim().length > 10;

const ruta = path.join(__dirname, '..', 'eas.json');
const eas = JSON.parse(fs.readFileSync(ruta, 'utf8'));

// Hay dos formas de poner un identificador y las dos valen:
//
//   1. Como variable del repositorio en GitHub. Se pega una vez en una pantalla
//      y no hay que tocar código.
//   2. Escrito en `eas.json` y confirmado en el repositorio. Es lo que hace el
//      operador automático cuando se le pasan los valores por mensaje, porque
//      no tiene permiso para escribir variables en GitHub pero sí para empujar
//      código.
//
// La variable de GitHub gana. Así, si algún día hay que corregir un
// identificador sin esperar a nadie, se cambia en la pantalla y manda esa.
function resuelto(envApp, envCI) {
  const deGitHub = process.env[envCI];
  if (valido(deGitHub)) return { valor: deGitHub.trim(), origen: 'GitHub' };
  for (const perfil of Object.keys(eas.build || {})) {
    const v = eas.build[perfil].env && eas.build[perfil].env[envApp];
    if (valido(v)) return { valor: v.trim(), origen: 'eas.json' };
  }
  return null;
}

const resueltos = {};
const puestos = [];
const faltan = [];

for (const [envApp, envCI] of CLAVES) {
  const r = resuelto(envApp, envCI);
  if (!r) { faltan.push(envCI); continue; }
  resueltos[envApp] = r;
  if (r.origen === 'GitHub') {
    for (const perfil of Object.keys(eas.build || {})) {
      eas.build[perfil].env = eas.build[perfil].env || {};
      eas.build[perfil].env[envApp] = r.valor;
    }
    puestos.push(envCI);
  }
}

if (puestos.length) {
  fs.writeFileSync(ruta, JSON.stringify(eas, null, 2) + '\n');
}

// El paquete de JavaScript de una actualización por aire se arma en esta misma
// máquina —no en los servidores de Expo, como sí pasa al compilar—, y Metro lee
// las EXPO_PUBLIC_* del entorno del proceso, no de `eas.json`. Se dejan puestas
// aquí para que el paso que publica las herede venga el valor de donde venga.
// Sin esto, un identificador escrito sólo en `eas.json` compilaría bien pero
// saldría ausente en cada update, y el botón desaparecería sin motivo visible.
if (process.env.GITHUB_ENV) {
  const lineas = Object.entries(resueltos)
    .map(([envApp, r]) => `${envApp}=${r.valor}`)
    .join('\n');
  if (lineas) fs.appendFileSync(process.env.GITHUB_ENV, lineas + '\n');
}

// Lo que se imprime nunca es el valor: es su forma. Suficiente para ver de un
// vistazo si se pegó el identificador correcto o si se coló un espacio, sin
// dejar la cadena entera en un registro público.
console.log('Identificadores de Google');
for (const [envApp, envCI, cual] of CLAVES) {
  const r = resueltos[envApp];
  if (!r) { console.log(`  – ${cual.padEnd(8)} sin definir (${envCI})`); continue; }
  // Se muestra la parte que distingue a un identificador de otro, no la cola
  // `.apps.googleusercontent.com`, que es igual en los tres y no dice nada.
  const cuerpo = r.valor.replace(/\.apps\.googleusercontent\.com$/, '');
  const forma = cuerpo.length > 26 ? `${cuerpo.slice(0, 17)}…${cuerpo.slice(-6)}` : cuerpo;
  const cola = r.valor === cuerpo ? '  ⚠ no termina en .apps.googleusercontent.com' : '';
  console.log(`  ✓ ${cual.padEnd(8)} ${forma}   [${r.origen}]${cola}`);
}

// El botón depende SÓLO del identificador web: es el que fija a quién va
// dirigido el token, y es el que comprueba el servidor. Los de Android e iOS
// hacen falta para que Google acepte abrir su ventana desde cada sistema, pero
// no son los que deciden si el botón se dibuja. Decir "falta uno, no aparece"
// sería mentira, y de las que hacen perder una tarde buscando lo que no es.
const hayWeb = !!resueltos.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

if (faltan.length) {
  console.log('');
  console.log('Se definen en: Settings → Secrets and variables → Actions → Variables');
  console.log('Faltan: ' + faltan.join(', '));
}

if (!hayWeb) {
  console.log('');
  console.log('Sin el identificador WEB el botón de Google no se dibuja. La app sale ' +
              'con correo y contraseña, que es como funciona hoy.');
  if (resueltos.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || resueltos.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) {
    console.log('::warning::Están puestos los de Android o iOS pero falta el WEB, que es ' +
                'el que habilita todo. Así, los otros dos no sirven de nada.');
  }
} else if (!resueltos.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
  console.log('');
  console.log('::warning::El botón va a aparecer, pero falta GOOGLE_ANDROID_CLIENT_ID: ' +
              'Google puede negarse a abrir su ventana desde el teléfono Android.');
}
