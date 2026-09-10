/* LA PELÍCULA DEL GÉNESIS, comprobada por dentro.
 *
 *   node pruebas/genesis-cine.mjs      (sirve la carpeta en 8886 él solo)
 *
 * Lo que se comprueba no es que «hay texto en pantalla»: es que la película
 * es una película.
 *
 *  1. NO ARRANCA SOLA. Llegar al Inicio no la dispara — quien viene a mandar
 *     plata viene a eso. Solo la piden el visor, AIR TOUCH o el botón.
 *  2. LA TINIEBLA ESTÁ OSCURA DE VERDAD: la noche llega a uno, y con ella se
 *     callan el nombre del sol, los rótulos de las casas y sus ciudades.
 *  3. LA CÁMARA SE MUEVE SIEMPRE. Dentro de un mismo acto la cámara viaja —
 *     eso es lo que separa el cine de las diapositivas.
 *  4. LA PALABRA Y LA LUZ llegan en su orden, y la luz apaga la noche.
 *  5. EL RETROCESO GRANDE enseña el universo: la cámara termina mucho más
 *     lejos que en cualquier momento anterior.
 *     estar acá, y la invitación a expandirlo.
 *  7. LA SALA SE APAGA mientras rueda y se enciende al terminar.
 *  8. SALTAR devuelve todo a su sitio en cualquier momento.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8886;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'k1', userId: 'k1', address: '0x' + '8'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, locale: 'es' });
const pag = await ctx.newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
/* La música apagada: esta prueba mira la imagen, y un <audio> en streaming
   dentro del arnés solo añade ruido al diagnóstico. */
await pag.addInitScript(`localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'k@x.com', name: 'José' } } }));
await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'k@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });
await pag.waitForFunction(() => !!window.__AE_GENESIS, null, { timeout: 45000 });

console.log('\n── llegar al Inicio NO es pedir la película ─────────────────');
{
  await pag.waitForTimeout(6000);
  ok('nadie interrumpe a quien acaba de entrar', await pag.evaluate(() =>
    !window.__AE_GENESIS.vivo() && !document.getElementById('gen-letra')));
  ok('y la casa sigue entera', await pag.evaluate(() =>
    !document.body.classList.contains('en-cine')));
}

console.log('\n── pero vive en Ajustes, para quien la quiera ───────────────');
{
  /* Que no arranque sola no puede significar que no se encuentre: si la
     película no tiene puerta, es como si no existiera. */
  await pag.evaluate(() => VETA.vista('ajustes'));
  await pag.waitForTimeout(500);
  ok('su fila está en Ajustes', await pag.evaluate(() =>
    [...document.querySelectorAll('#lienzo [onclick]')]
      .some((el) => (el.getAttribute('onclick') || '').includes('tourGenesis'))));
  ok('y la de la música, al lado', await pag.evaluate(() =>
    [...document.querySelectorAll('#lienzo [onclick]')]
      .some((el) => (el.getAttribute('onclick') || '').includes('musicaAlterna'))));
  await pag.evaluate(() => VETA.vista('nucleo'));
  await pag.waitForTimeout(1600);
}

console.log('\n── la tiniebla: oscura de verdad ────────────────────────────');
{
  await pag.evaluate(() => VETA.tourGenesis('prueba'));
  await pag.waitForFunction(() => window.__AE_GENESIS.vivo(), null, { timeout: 9000 });
  ok('la película arranca cuando se la pide', true);
  ok('y la sala se apaga', await pag.evaluate(() =>
    document.body.classList.contains('en-cine')));
  /* Las barras ENTRAN animadas: se espera a que estén, no se mira en el
     instante cero, que es justo cuando todavía miden nada. */
  const barras = await pag.waitForFunction(() => {
    const el = document.getElementById('gen-letra');
    if (!el) return false;
    const h = parseFloat(getComputedStyle(el, '::before').height);
    return h > 4;
  }, null, { timeout: 6000 }).then(() => true).catch(() => false);
  ok('con las barras de cine puestas', barras);

  /* EL TÍTULO. Una palabra sola sobre el negro, antes de que pase nada más.
     Se comprueba AQUÍ y no en el bucle grande de más abajo, porque para
     entonces ya pasó: un título que dura cuatro segundos no espera a nadie. */
  const titulo = await pag.waitForFunction(() =>
    /^EL ORIGEN DE TODO$/.test((document.querySelector('#gen-letra .gen-centro')?.textContent || '').trim()),
    null, { timeout: 14000 }).then(() => true).catch(() => false);
  ok('la película se presenta con su título', titulo);
  ok('y el título llega sobre el negro, sin nada encendido detrás',
     await pag.evaluate(() => window.__AE_NOCHE() > 0.9));
  /* Y SE VE COMO UN TÍTULO, no como la primera frase del relato: caja alta,
     oro, sus reglas arriba y abajo, en el medio de la pantalla. */
  ok('y se ve como un título, no como una frase más',
     await pag.evaluate(() => !!document.querySelector('#gen-letra .gen-centro.titulo')));

  // la noche tiene que LLEGAR a uno, no quedarse a medias
  await pag.waitForFunction(() => window.__AE_NOCHE() > 0.95, null, { timeout: 9000 });
  ok('la tiniebla es tiniebla', true);
  const callados = await pag.evaluate(() => window.__AE_ROTULOS?.() ?? null);
  ok('y con ella se callan los nombres de las casas',
     callados === null || callados.every((o) => o < 0.02),
     callados === null ? 'sin sonda' : `máx ${Math.max(...callados).toFixed(3)}`);
}

console.log('\n── la palabra, y con ella la luz ────────────────────────────');
{
  await pag.waitForFunction(() =>
    /Sea la luz/.test(document.querySelector('#gen-letra .gen-centro')?.textContent || ''),
    null, { timeout: 14000 });
  ok('«Y dijo: Sea la luz» — en letra grande', await pag.evaluate(() =>
    document.querySelector('#gen-letra .gen-centro').classList.contains('grande')));
  /* Ya NO es de noche cuando se lee la frase, y es a propósito: el fogonazo y
     el amanecer ocurren al empezar el acto, y el rótulo entra dos segundos
     después — cuando la luz se está asentando. Escribirlo sobre el blanco del
     fogonazo sería no poder leerlo y encima robarle el momento a la imagen.
     Lo que se comprueba es lo contrario que antes: que la luz YA llegó. */
  /* Y AHORA AL REVÉS QUE ANTES: cuando la ORDEN está en pantalla todavía no
     pasó nada. La luz llega tres segundos y medio después, que es el orden en
     que lo dice el versículo. */
  ok('la orden se lee antes de que pase nada',
     await pag.evaluate(() => window.__AE_NOCHE() > 0.9));

  /* LA CÁMARA NO SE QUEDA QUIETA. Dentro del mismo acto tiene que viajar: es
     la diferencia entre una película y una presentación con transiciones. */
  const r0 = await pag.evaluate(() => window.__aeCamera.position.length());
  await pag.waitForTimeout(2600);
  const r1 = await pag.evaluate(() => window.__aeCamera.position.length());
  ok('la cámara viaja DENTRO del acto', Math.abs(r1 - r0) > 1.4,
     `${r0.toFixed(1)} → ${r1.toFixed(1)}`);

  await pag.waitForFunction(() => window.__AE_NOCHE() < 0.05, null, { timeout: 14000 });
  ok('y fue la luz: la noche se acaba', true);
}

console.log('\n── el retroceso que enseña el universo ──────────────────────');
{
  let masLejos = 0;
  let masCerca = 999;
  /* La película creció: el arranque se alargó a propósito —empezaba antes de
     que nadie hubiera terminado de sentarse— y se le sumaron los actos de
     ORIGEN y de la misión. La ventana la acompaña. */
  /* ══ EL MEDIDOR DEL FOGONAZO VA DENTRO DE LA PÁGINA ══════════════════════
     Muestrear desde aquí afuera cada trescientos milisegundos es perderse el
     pico: el destello arranca en uno y baja, así que la primera lectura ya lo
     agarra a mitad de camino y la prueba «descubre» que no destella. Un
     medidor que corre en CADA CUADRO no se pierde nada — y de paso cuenta los
     flancos, que es como se sabe si destelló una vez o varias. */
  await pag.evaluate(() => {
    window.__fog = { max: 0, veces: 0, muestras: 0, pulsoMin: 9, pulsoMax: -9 };
    let antes = 0;
    const mirar = () => {
      const d = window.__AE_DESTELLO?.() ?? 0;
      const p = window.__AE_PULSO?.() ?? 0;
      const f = window.__fog;
      if (d > f.max) f.max = d;
      if (d > 0.15 && antes <= 0.15) f.veces++;
      if (d > 0.02) f.muestras++;
      antes = d;
      if (p < f.pulsoMin) f.pulsoMin = p;
      if (p > f.pulsoMax) f.pulsoMax = p;
      requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
  });

  const hasta = Date.now() + 275000;
  let vioUniverso = false;
  let vioProposito = false;
  let vioInvitacion = false;
  /* LO QUE LA HISTORIA TIENE QUE DECIR SÍ O SÍ. No es adorno: son las cuatro
     ideas por las que existe la película. Si una se cae de la película por un
     cambio de guion, esto lo dice en vez de que se descubra en el escenario. */
  let vioOrigen = false;
  let vioRespaldo = false;
  let vioFondos = false;
  let vioUnion = false;
  let dijoBanca = false;
  let vioCadena = false;
  let vioFuerza = false;
  let vioCreciendo = false;
  /* EL PROTAGONISMO. Presentar una casa tiene que APAGAR a las demás: es lo
     que separa un plano de presentación de «once mundos con uno un poco más
     grande», que es como se veía y por lo que no se leía nada. */
  let protagonistas = new Set();
  let acompanantesApagados = null;
  /* Y LA LLUVIA: el plano del cielo abre el caudal de estrellas fugaces. */
  let vioLluvia = false;
  let masFuera = 0;
  /* EL ORDEN DEL RELATO. Que las frases aparezcan no basta: lo que se
     rediseñó es CUÁNDO. ORIGEN tiene que llegar después de haber visto los
     mundos y el universo —cuando quien mira ya se está preguntando qué lo
     mantiene unido— y no antes, cortando el cuento para explicar producto. */
  const cuando = {};
  const marcar = (k) => { if (cuando[k] === undefined) cuando[k] = Date.now(); };
  let vioProposito2 = false;
  /* EL FOGONAZO. «Y fue la luz» tiene que OCURRIR, no desvanecerse. Y una vez
     sola en toda la película: si algo más destella, este deja de significar
     «acaba de nacer una estrella» y pasa a ser un efecto. */
  let destelloMax = 0;
  let destellosVistos = 0;
  let destelloAntes = 0;
  /* LA RESPIRACIÓN del sol: una crecida de luz cada cuatro segundos. */
  let pulsoMin = 9; let pulsoMax = -9;
  /* Y los dos que no son apps, que se dicen con una frase y no con un lema. */
  let dijoMinas = false; let dijoDbnx = false;
  /* ══ NUNCA UNA PALABRA QUE NO SE ESCRIBIÓ ════════════════════════════════
     `null` y `undefined` flotando sobre la galaxia no se leen como un fallo:
     se leen como que la casa está rota. Y aparecen solos, sin que nadie los
     escriba — basta una clave mal puesta, un acto sin texto o un idioma al
     que le falte una frase. Se vigila TODO el recorrido, rótulo por rótulo. */
  const basura = new Set();
  /* EL ROTULO NO SE EVAPORA. En MINAS y DBNX el nombre del mundo tiene que
     seguir puesto cuando entra su frase: no es un titulo que ya cumplio, es
     el mundo que se esta mirando, y sacarlo deja la frase huerfana. */
  let pieYFraseJuntos = false;
  /* Y LA ONDA CRECE. El destello ya no es un velo plano: sale del centro —de
     AU-RA— y se expande. Se mide que el radio de la onda AVANCE. */
  let ondaVista = [];
  while (Date.now() < hasta) {
    const st = await pag.evaluate(() => ({
      r: window.__aeCamera.position.length(),
      txt: document.querySelector('#gen-letra .gen-centro')?.textContent || '',
      vivo: window.__AE_GENESIS.vivo(),
      prota: window.__AE_PROTA?.() || null,
      opac: window.__AE_CASA_OP || null,
      lluvia: window.__AE_LLUVIA?.() || 1,
      destello: window.__AE_DESTELLO?.() || 0,
      pulso: window.__AE_PULSO?.() ?? 0,
      /* ¿El rotulo del mundo sigue puesto? */
      pieVe: !!document.querySelector('#gen-letra .gen-pie.ve'),
      pieTxt: document.querySelector('#gen-letra .gen-pie b')?.textContent || '',
      /* ¿El titulo lleva su propia letra, o es una frase mas? */
      esTitulo: !!document.querySelector('#gen-letra .gen-centro.titulo'),
      /* Cuánto se aparta la cámara del centro de la galaxia. Mirando al
         centro es cero; mirando a otra cosa —un agujero negro— es grande.
         Es la forma de comprobar que el plano del cielo enseña ALGO y no un
         sistema pequeñito en medio de un vacío negro. */
      fuera: (() => {
        const c = window.__aeCamera;
        if (!c?.quaternion) return 0;
        /* El frente de la cámara, a mano: (0,0,-1) rotado por el cuaternión.
           Se hace aquí y no con THREE porque la escena no exporta la librería
           —y no tiene por qué—, y esto son cuatro multiplicaciones. */
        const { x: qx, y: qy, z: qz, w: qw } = c.quaternion;
        const fx = 2 * (qx * qz + qw * qy) * -1 + 0;
        const fy = 2 * (qy * qz - qw * qx) * -1 + 0;
        const fz = (1 - 2 * (qx * qx + qy * qy)) * -1;
        const fl = Math.hypot(fx, fy, fz) || 1;
        const p = c.position;
        const pl = Math.hypot(p.x, p.y, p.z) || 1;
        /* hacia el centro = -posición, normalizada */
        const dot = (fx / fl) * (-p.x / pl) + (fy / fl) * (-p.y / pl) + (fz / fl) * (-p.z / pl);
        return Math.round(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
      })(),
    }));
    masLejos = Math.max(masLejos, st.r);
    /* El plano del cielo no lleva texto: se reconoce por la lluvia. */
    if (st.lluvia > 1) marcar('universo');
    if (st.lluvia > 1) vioUniverso = true;
    if (st.prota) marcar('mundos');
    if (/tu lugar acá|ser parte/i.test(st.txt)) vioProposito2 = true;
    if (/FUTURO ES ORDEN/i.test(st.txt)) marcar('rincon');
    if (/expandirlo|futuro es orden|falta con vos/i.test(st.txt)) vioInvitacion = true;
    if (/separar algo|Eso es ORIGEN/i.test(st.txt)) { vioOrigen = true; marcar('origen'); }
    if (/palabra de un gobierno|oro detrás/i.test(st.txt)) vioRespaldo = true;
    if (/donde nunca llegó|nunca lo tuvo cerca/i.test(st.txt)) vioFondos = true;
    if (/unir las economías|América Latina/i.test(st.txt)) vioUnion = true;
    /* La palabra que se quitó a propósito: nombrar «banca» algo que no es un
       banco licenciado no es solo impreciso, es un riesgo. */
    if (/\bbanca\b/i.test(st.txt)) dijoBanca = true;
    if (st.r > 0) masCerca = Math.min(masCerca, st.r);
    if (/cadena propia|No alquilada/i.test(st.txt)) vioCadena = true;
    if (/era bueno en gran manera/i.test(st.txt)) vioFuerza = true;
    if (/Fructificad y multiplicaos/i.test(st.txt)) vioCreciendo = true;
    if (st.prota) {
      protagonistas.add(st.prota);
      /* ¿LLEGAN A APARTARSE? Se guarda lo MEJOR que se logró, no el primer
         cuadro: el apagado es un fundido de medio segundo a propósito —un
         corte seco se vería como un fallo— así que medir al empezar es medir
         el principio del fundido y no su resultado. */
      if (st.opac) {
        const otras = Object.entries(st.opac).filter(([k]) => k !== st.prota).map(([, v]) => v);
        if (otras.length) {
          const peor = Math.max(...otras);
          if (acompanantesApagados === null || peor < acompanantesApagados) acompanantesApagados = peor;
        }
      }
    }
    if (st.lluvia > 1) { vioLluvia = true; masFuera = Math.max(masFuera, st.fuera); }
    if (st.destello > destelloMax) destelloMax = st.destello;
    /* Se cuentan los FLANCOS, no las lecturas: un destello dura casi un
       segundo y aparecería en varias muestras seguidas. */
    if (st.destello > 0.15 && destelloAntes <= 0.15) destellosVistos++;
    destelloAntes = st.destello;
    if (st.pulso < pulsoMin) pulsoMin = st.pulso;
    if (st.pulso > pulsoMax) pulsoMax = st.pulso;
    if (/^\s*(null|undefined|NaN)\s*$/i.test(st.txt)) basura.add(st.txt.trim());
    if (st.pieTxt && /^\s*(null|undefined|NaN)\s*$/i.test(st.pieTxt)) basura.add(st.pieTxt.trim());
    if (/no es una promesa|en minas nuestras/i.test(st.txt)) dijoMinas = true;
    if (/nace auditado/i.test(st.txt)) dijoDbnx = true;
    if (st.pieVe && /no es una promesa|nace auditado/i.test(st.txt)) pieYFraseJuntos = true;
    if (st.destello > 0.02) ondaVista.push(st.destello);
    if (!st.vivo) break;
    await pag.waitForTimeout(700);
  }
  ok('la cámara se va MUY lejos a enseñar el universo', masLejos > 70,
     `${masLejos.toFixed(0)} unidades`);
  ok('y lo dice con todas las letras', vioUniverso);
  ok('y la invitación a expandirlo, también', vioInvitacion);
  /* ORIGEN es el centro del relato y del sistema: la cámara BAJA hasta el sol
     —que es la moneda— y ahí se para a decir qué es y qué la sostiene. */
  ok('ORIGEN se presenta como lo que es', vioOrigen);
  ok('y se dice qué la respalda', vioRespaldo);
  ok('la cámara baja de verdad hasta el centro', masCerca < 18,
     `lo más cerca: ${masCerca.toFixed(1)} unidades`);
  ok('se dice a quién se le llevan los fondos', vioFondos);
  ok('y nunca se dice «banca»', !dijoBanca);
  ok('se cuenta que corre sobre cadena propia', vioCadena);
  ok('y qué es la fuerza que lo sostiene unido', vioFuerza);
  ok('y que va a seguir uniendo cosas', vioCreciendo);
  /* PROTAGONISMO: cada casa manda en su plano, y las demás se apartan. */
  /* LOS DIEZ MUNDOS. Ocho en la fila —el camino que hace una persona por el
     ecosistema— más MINAS y DBNX, que aparecen dentro del bloque de ORIGEN
     porque no son sitios adonde se entra: son la respuesta a una pregunta que
     el relato acaba de abrir. */
  ok('se presentan los diez mundos', protagonistas.size >= 10,
     `${protagonistas.size}: ${[...protagonistas].join(' ')}`);
  ok('entre ellos AuCorp, Ordenex y Ordenscan',
     ['aucorp', 'oxch', 'scan'].every((k) => protagonistas.has(k)));
  ok('y MINAS y DBNX, cada uno con lo suyo dicho', dijoMinas && dijoDbnx,
     `minas ${dijoMinas ? 'sí' : 'NO'} · dbnx ${dijoDbnx ? 'sí' : 'NO'}`);
  ok('con su nombre todavía puesto cuando entra la frase', pieYFraseJuntos);
  ok('y en toda la película no se escribe «null» ni «undefined»',
     basura.size === 0, [...basura].join(' '));
  ok('y las demás se apagan de verdad',
     acompanantesApagados !== null && acompanantesApagados < 0.25,
     acompanantesApagados === null ? 'no se midió' : `la más visible al ${Math.round(acompanantesApagados * 100)}%`);
  ok('el plano del cielo abre la lluvia de estrellas', vioLluvia);
  /* Y LA CÁMARA SE DA VUELTA A MIRAR. Los agujeros negros orbitan a setenta y
     a cien unidades: durante toda la película quedan detrás de uno y no se ven
     nunca. En el plano cuyo tema ES el cielo, la cámara los busca. */
  ok('y la cámara se da vuelta a mirar el cielo', masFuera > 25,
     `${masFuera}° apartada del centro de la galaxia`);

  /* EL ARCO, EN ORDEN. Es lo que se rediseñó y es lo único que una lista de
     frases sueltas no comprueba. */
  ok('los mundos se presentan antes que el universo',
     cuando.mundos !== undefined && cuando.universo !== undefined
     && cuando.mundos < cuando.universo);
  ok('y ORIGEN llega DESPUÉS de todo eso, no antes',
     cuando.origen !== undefined && cuando.universo !== undefined
     && cuando.origen > cuando.universo,
     cuando.origen === undefined ? 'no se dijo' : 'en su sitio');
  /* EL FOGONAZO, UNA SOLA VEZ Y FUERTE. */
  const fog = await pag.evaluate(() => window.__fog);
  /* ══ CUÁNTO DESTELLA SE MIDE EN OTRO SITIO ═══════════════════════════════
     El PICO del fogonazo no es medible acá y no por un fallo del producto:
     esta prueba proyecta la película entera —tres minutos de galaxia— y el
     navegador sin pantalla no le da cuadros suficientes; el destello dura
     segundo y medio y pasa entre dos fotogramas. Medirlo igual daría un número
     que habla del banco de pruebas y no de la película, que es la peor clase
     de prueba: la que falla cuando todo está bien.
     Su sitio es `apertura.mjs`, que proyecta SOLO el arranque, con los cuadros
     sin estrangular, y encima lo comprueba mirando los píxeles.
     Lo que sí se puede afirmar desde aquí, y es lo que importa del conjunto:
     que en toda la película haya UN destello y no dos. Si algo más destellara,
     este dejaría de significar «acaba de nacer una estrella» y sería un
     efecto. Eso se cuenta por flancos y no depende de la velocidad. */
  ok('destella UNA sola vez en toda la película', fog.veces === 1,
     `${fog.veces} veces · el pico lo mide apertura.mjs`);
  /* Y EL SOL RESPIRA: no es una luz fija ni un parpadeo, es una crecida cada
     cuatro segundos. Se comprueba que el valor RECORRA su rango — una luz
     clavada daría siempre lo mismo. */
  ok('el sol respira cada cuatro segundos', fog.pulsoMin < 0.25 && fog.pulsoMax > 0.75,
     `entre ${fog.pulsoMin.toFixed(2)} y ${fog.pulsoMax.toFixed(2)}`);
  /* Y EL DESTELLO ES UNA ONDA, no un parpadeo: dura lo suficiente para verse
     salir del centro y cruzar la escena. Un velo plano se apagaría en dos
     muestras; esto tiene que verse en varias seguidas y ARRANCAR fuerte. */
  /* Y que la onda VIVA varios cuadros, no uno: aunque el banco de pruebas dé
     pocos, si el destello fuera un parpadeo de un fotograma esto lo cazaría. */
  ok('y la onda vive, no parpadea', fog.muestras >= 5,
     `${fog.muestras} cuadros con la onda viva`);

  ok('la historia termina dando un propósito', vioProposito2);
  ok('y pidiendo llevarlo a cada rincón', cuando.rincon !== undefined);
}

console.log('\n── al terminar, la casa vuelve entera ───────────────────────');
{
  await pag.waitForFunction(() => !window.__AE_GENESIS.vivo(), null, { timeout: 45000 });
  await pag.waitForFunction(() => !document.getElementById('gen-letra'), null, { timeout: 6000 });
  ok('las palabras se retiran', true);
  ok('la sala se enciende', await pag.evaluate(() =>
    !document.body.classList.contains('en-cine')));
  ok('sin noche colgada', await pag.evaluate(() => window.__AE_NOCHE() < 0.02));
  ok('y el sistema queda en formación', await pag.evaluate(() =>
    window.AETHERION.acomodo() < 0.06));
}

console.log('\n── saltar corta en cualquier momento ────────────────────────');
{
  await pag.evaluate(() => VETA.tourGenesis('prueba'));
  await pag.waitForFunction(() => window.__AE_GENESIS.vivo(), null, { timeout: 9000 });
  await pag.waitForTimeout(2500);
  await pag.click('#gen-letra .gen-saltar');
  await pag.waitForFunction(() => !window.__AE_GENESIS.vivo(), null, { timeout: 6000 });
  ok('saltar apaga la película', true);
  await pag.waitForFunction(() => window.__AE_NOCHE() < 0.05
    && !document.body.classList.contains('en-cine'), null, { timeout: 8000 });
  ok('y devuelve la luz y la casa', true);
}

ok('sin errores de página en toda la proyección', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
