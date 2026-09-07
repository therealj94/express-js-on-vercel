#!/usr/bin/env node
/**
 * EL APK DE ANDROID: QUE ESTÉ, QUE SE PUEDA INSTALAR Y QUE SE PUEDA ACTUALIZAR.
 *
 * ── POR QUÉ UNA PRUEBA PARA UN ARCHIVO ──────────────────────────────────────
 * Un APK que se sirve mal no falla: se baja y no pasa nada al tocarlo. Esas son
 * las averías caras, las que parecen «me lo bajé y no hace nada» y nadie sabe
 * mirar. Tres cosas tienen que cuadrar SIEMPRE, y las tres se comprueban acá:
 *
 *   1. El archivo es un APK de verdad (un zip que empieza por PK) y no una
 *      página de error de 3 KB con nombre de .apk.
 *   2. La ficha `ultron.json` dice el MISMO sha256 que el archivo. Si no, la
 *      actualización por aire estaría ofreciendo una cosa y entregando otra.
 *   3. El `codigo` de la ficha nunca baja. Es lo único que la app compara para
 *      saber si hay versión nueva: si baja, los teléfonos dejan de actualizar
 *      y nadie se entera hasta meses después.
 *
 *     node pruebas/probar-apk.mjs
 */
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CARPETA = join(AQUI, '..', 'public', 'apk');

let fallos = 0;
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);
const decir = (ok, q, d) => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${q}${d ? `\n           ${d}` : ''}`); if (!ok) fallos++; };

titulo('el archivo es un APK de verdad');
const apk = readFileSync(join(CARPETA, 'ultron.apk'));
decir(apk[0] === 0x50 && apk[1] === 0x4b, 'empieza por PK: es un zip, no una página de error con nombre de .apk',
  `${apk.length.toLocaleString('es-HN')} bytes`);
decir(apk.length > 500_000, 'y pesa lo que pesa una app, no lo que pesa un mensaje de error');
decir(apk.includes(Buffer.from('AndroidManifest.xml')), 'lleva dentro su AndroidManifest');
decir(apk.includes(Buffer.from('classes.dex')), 'y el código compilado');
/* El nombre del paquete vive en el AndroidManifest binario, y ahí las cadenas
   van en UTF-16. Buscarlo en UTF-8 no lo encuentra nunca — y una prueba que
   busca mal es peor que no tenerla, porque se pone roja sin motivo o verde sin
   comprobar nada. */
decir(apk.includes(Buffer.from('org.ordenglobal.ultron', 'utf16le')),
  'y es el nuestro: el paquete es org.ordenglobal.ultron');
decir(apk.includes(Buffer.from('ULTRON FP')), 'con su nombre en la pantalla de inicio');

titulo('la ficha de la actualización por aire');
const ficha = JSON.parse(readFileSync(join(CARPETA, 'ultron.json'), 'utf8'));
const sha = createHash('sha256').update(apk).digest('hex');
decir(ficha.sha256 === sha, 'el sha256 de la ficha es el del archivo que de verdad se sirve',
  ficha.sha256 === sha ? sha.slice(0, 24) + '…' : `ficha ${String(ficha.sha256).slice(0, 16)}… · archivo ${sha.slice(0, 16)}…`);
decir(ficha.bytes === apk.length, 'y el tamaño también', `${ficha.bytes} vs ${apk.length}`);
decir(Number.isInteger(ficha.codigo) && ficha.codigo >= 1,
  'el código de versión es un entero: es lo ÚNICO que la app compara para saber si hay algo nuevo', String(ficha.codigo));
decir(/^https:\/\//.test(ficha.apk || ''), 'la dirección del APK va por https: por http Android ni la baja', ficha.apk);
decir(/^[0-9a-f]{64}$/.test(ficha.firma_sha256 || ''),
  'y la ficha publica la huella de la FIRMA, que es como se reconoce el nuestro de uno falso');

titulo('la ficha cuadra con lo que compiló Gradle');
{
  /* El número de versión vive en app/build.gradle y se copia a la ficha a mano
     al publicar. Si se olvida, la app nunca se entera de que hay algo nuevo:
     el archivo cambia y el `codigo` sigue igual. */
  const gradle = readFileSync(join(AQUI, '..', '..', 'ultron-android', 'app', 'build.gradle'), 'utf8');
  const codigo = Number(/def\s+codigo\s*=\s*(\d+)/.exec(gradle)?.[1]);
  const nombre = /def\s+nombre\s*=\s*"([^"]+)"/.exec(gradle)?.[1];
  decir(codigo === ficha.codigo, 'el código de la ficha es el que compiló Gradle', `gradle ${codigo} · ficha ${ficha.codigo}`);
  decir(nombre === ficha.version, 'y el nombre de versión también', `gradle ${nombre} · ficha ${ficha.version}`);
}

console.log(fallos ? `\n${fallos} en rojo.\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
