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

titulo('lo que tuvo mudo el micrófono, que no vuelva');
{
  /* ── POR QUÉ ESTA PRUEBA EXISTE ────────────────────────────────────────────
     La 1.1.0 salió con el oído nativo escrito y probado, y en el teléfono de
     José seguía sin escuchar. La causa no estaba en el código del oído: desde
     Android 11 una app NO VE a las demás salvo que lo declare, y sin ese
     bloque `isRecognitionAvailable()` contesta «no hay reconocedor» aunque el
     teléfono lo tenga. Es una línea de XML que no se compila ni se ejecuta
     aquí: sin esta prueba, borrarla no rompe nada hasta que alguien intenta
     hablar. Que es exactamente lo que pasó.
     Aquí no hay emulador (no hay KVM), así que la app NUNCA se ejecuta en
     estas pruebas. Lo único que se puede vigilar es que las piezas estén. */
  const android = join(AQUI, '..', '..', 'ultron-android', 'app', 'src', 'main');
  const manifiesto = readFileSync(join(android, 'AndroidManifest.xml'), 'utf8');
  const oido = readFileSync(join(android, 'java', 'org', 'ordenglobal', 'ultron', 'Oido.java'), 'utf8');

  decir(/<queries>/.test(manifiesto) && /android\.speech\.RecognitionService/.test(manifiesto),
    'el manifiesto declara que quiere ver el reconocimiento de voz — SIN ESTO EL MICRÓFONO NO ESCUCHA',
    'Android 11+ esconde las demás apps a menos que se pidan por nombre');
  decir(/android\.intent\.action\.TTS_SERVICE/.test(manifiesto),
    'y el motor de texto a voz, por lo mismo');
  decir(/RECORD_AUDIO/.test(manifiesto), 'el permiso del micrófono sigue declarado');

  decir(/requestPermissions\([\s\S]{0,120}RECORD_AUDIO/.test(oido),
    'el oído nativo PIDE el permiso del micrófono él mismo',
    'antes solo lo pedía getUserMedia, que con el oído nativo no se llama nunca');
  decir(/permisoResuelto/.test(oido), 'y reanuda solo cuando la persona acepta, sin volver a tocar el botón');
  decir(/isOnDeviceRecognitionAvailable/.test(oido), 'con el reconocedor de dentro del teléfono como respaldo sin datos');

  const principal = readFileSync(join(android, 'java', 'org', 'ordenglobal', 'ultron', 'Principal.java'), 'utf8');
  decir(/PIDE_MICROFONO_NATIVO/.test(principal) && /oido\.permisoResuelto/.test(principal),
    'y la respuesta del permiso llega hasta el oído', 'son dos caminos al mismo micrófono y hay que distinguirlos');
  /* Sin los comentarios: el propio comentario que explica el fallo cita el
     código viejo, y una prueba que lee comentarios se pone roja por la
     explicación de lo que ya se arregló. */
  const soloCodigo = principal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  decir(!/CASA\.contains\(/.test(soloCodigo),
    'el host de la casa se compara entero, no por «contiene»',
    '«ultron.ordenglobal.lin» está contenido en la dirección de la casa');
  decir(/esDeLaCasa\(/.test(soloCodigo), 'y lo hace en un solo sitio, no copiado en cada comparación');
  decir(/AndroidVoz/.test(principal), 'la voz nativa de Android está enchufada como respaldo de ElevenLabs');

  const vozjs = readFileSync(join(AQUI, '..', 'public', 'js', 'voz.js'), 'utf8');
  decir(/AndroidOido/.test(vozjs) && /AndroidVoz/.test(vozjs), 'y el tablero prefiere los dos puentes cuando está dentro de la app');
  decir(/porQueNoOye/.test(vozjs), 'y sabe DECIR por qué no oye en vez de callarse');

  const osjs = readFileSync(join(AQUI, '..', 'public', 'js', 'os.js'), 'utf8');
  decir(!/En Chrome sí funciona/.test(osjs) || /porQueNoOye/.test(osjs),
    'y ya no le dice «use Chrome» a alguien que está dentro de la app de Android');
}

console.log(fallos ? `\n${fallos} en rojo.\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
