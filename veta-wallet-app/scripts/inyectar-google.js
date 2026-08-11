#!/usr/bin/env node
/**
 * inyectar-google.js
 *
 * Mete los tres identificadores de OAuth de Google en `eas.json` justo antes
 * de compilar o de publicar un update, leyéndolos del entorno.
 *
 * POR QUÉ NO ESTÁN ESCRITOS EN `eas.json` DIRECTAMENTE
 *
 * Podrían estarlo: no son secretos. Un identificador de cliente de OAuth viaja
 * dentro del paquete de la app y cualquiera puede leerlo — lo único que hace es
 * decir "este token va dirigido a tal aplicación", y sin la firma del proveedor
 * no sirve para entrar a ningún lado.
 *
 * La razón es otra, y es humana: editar JSON a mano, en tres sitios, con
 * cadenas de sesenta caracteres que se parecen entre sí, es exactamente donde
 * se cometen los errores que después cuestan una entrega entera. Pegándolos una
 * vez en la pantalla de GitHub (Settings → Secrets and variables → Actions →
 * Variables) quedan puestos para siempre y para los dos workflows.
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

const puestos = [];
const faltan = [];

for (const [envApp, envCI] of CLAVES) {
  const valor = process.env[envCI];
  if (!valido(valor)) { faltan.push(envCI); continue; }
  for (const perfil of Object.keys(eas.build || {})) {
    eas.build[perfil].env = eas.build[perfil].env || {};
    eas.build[perfil].env[envApp] = valor.trim();
  }
  puestos.push(envCI);
}

if (puestos.length) {
  fs.writeFileSync(ruta, JSON.stringify(eas, null, 2) + '\n');
}

// Lo que se imprime nunca es el valor: es su forma. Suficiente para ver de un
// vistazo si se pegó el identificador correcto o si se coló un espacio, sin
// dejar la cadena entera en un registro público.
console.log('Identificadores de Google');
for (const [, envCI, cual] of CLAVES) {
  const v = process.env[envCI];
  if (!valido(v)) { console.log(`  – ${cual.padEnd(8)} sin definir (${envCI})`); continue; }
  // Se muestra la parte que distingue a un identificador de otro, no la cola
  // `.apps.googleusercontent.com`, que es igual en los tres y no dice nada.
  const t = v.trim();
  const cuerpo = t.replace(/\.apps\.googleusercontent\.com$/, '');
  const forma = cuerpo.length > 26 ? `${cuerpo.slice(0, 17)}…${cuerpo.slice(-6)}` : cuerpo;
  const cola = t === cuerpo ? '  ⚠ no termina en .apps.googleusercontent.com' : '';
  console.log(`  ✓ ${cual.padEnd(8)} ${forma}${cola}`);
}

// El botón depende SÓLO del identificador web: es el que fija a quién va
// dirigido el token, y es el que comprueba el servidor. Los de Android e iOS
// hacen falta para que Google acepte abrir su ventana desde cada sistema, pero
// no son los que deciden si el botón se dibuja. Decir "falta uno, no aparece"
// sería mentira, y de las que hacen perder una tarde buscando lo que no es.
const hayWeb = valido(process.env.GOOGLE_WEB_CLIENT_ID);

if (faltan.length) {
  console.log('');
  console.log('Se definen en: Settings → Secrets and variables → Actions → Variables');
  console.log('Faltan: ' + faltan.join(', '));
}

if (!hayWeb) {
  console.log('');
  console.log('Sin el identificador WEB el botón de Google no se dibuja. La app sale ' +
              'con correo y contraseña, que es como funciona hoy.');
  if (valido(process.env.GOOGLE_ANDROID_CLIENT_ID) || valido(process.env.GOOGLE_IOS_CLIENT_ID)) {
    console.log('::warning::Están puestos los de Android o iOS pero falta el WEB, que es ' +
                'el que habilita todo. Así, los otros dos no sirven de nada.');
  }
} else if (!valido(process.env.GOOGLE_ANDROID_CLIENT_ID)) {
  console.log('');
  console.log('::warning::El botón va a aparecer, pero falta GOOGLE_ANDROID_CLIENT_ID: ' +
              'Google puede negarse a abrir su ventana desde el teléfono Android.');
}
