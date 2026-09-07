// EL CEREBRO DEL NODO: ULTRON pensando con el modelo de AU-RA, en nuestra tarjeta.
//
// ── LO QUE CAMBIA RESPECTO A CLAUDE, Y POR QUÉ ──────────────────────────────
//
// El modelo es el MISMO que atiende a los clientes de AU-RA (qwen3.8:27b), con
// el mismo contexto de 12 288 fichas, y eso no es una limitación que se pueda
// negociar desde aquí: la tarjeta carga un modelo a la vez, y un pedido con
// otro tamaño lo desaloja. El motor del nodo lo fija de todas formas; este
// archivo está escrito SABIENDO que es así, y por eso:
//
//   · el prompt tiene PRESUPUESTO: unas 30 mil letras entre identidad, saber,
//     memoria, estado vivo, hilo y resultados de herramientas. Lo que no cabe
//     se recorta con criterio (primero lo viejo del hilo, después las
//     secciones sobrantes), nunca al azar por el final.
//   · las herramientas llegan como `tool_calls` de Ollama. Un modelo de 14 mil
//     millones a veces las escribe como texto (<tool_call>…</tool_call>) en
//     vez de como llamada; se leen igual. Y si manda argumentos rotos, la
//     herramienta contesta con texto diciendo qué faltó, y el modelo corrige.
//   · no hay búsqueda web del proveedor: buscar_web y leer_pagina son nuestras.
//
// Lo que NO cambia: las manos (lib/herramientas.js), la memoria, el panel, las
// reglas. Cambia el cerebro, no la casa.

const https = require('node:https');
const http = require('node:http');
const saber = require('../saber');
const vivo = require('../vivo');
const memoria = require('../memoria');
const herramientas = require('../herramientas');
const correrLote = herramientas.correrLote;

const URL_NODO = (process.env.ULTRON_NODO_URL || '').replace(/\/$/, '');
const SECRETO = (process.env.ULTRON_NODO_SECRETO || '').trim();
const CERT = (process.env.ULTRON_NODO_CERT || '').trim();
/* OJO: EL MOTOR DEL NODO PISA ESTE VALOR.
   `ultron-motor.py` reescribe `model` en cada pedido con su propia
   ULTRON_MOTOR_MODELO —lo hace a propósito, para que un pedido de acá no
   pueda desalojar el modelo que AU-RA tiene cargado—. O sea que esta
   constante NO decide con qué se piensa: decide lo que ULTRON CREE que
   está usando, y sale en /salud. El 5-sep las dos discreparon durante una
   hora (acá qwen3.8:27b, el motor sirviendo qwen2.5:14b) y todas las
   pruebas «del modelo nuevo» corrieron contra el viejo sin que nada
   avisara. Cambiar de modelo son LAS DOS: esta variable en Heroku y
   ULTRON_MOTOR_MODELO en /etc/ultron-motor.env del nodo. */
/* El motor FIJA el modelo del lado del nodo (ultron-motor.py: pedido['model']
   = MODELO), asi que esto no elige nada: es el nombre con el que se anota el
   gasto y el que sale en el registro. Tiene que cuadrar con
   /etc/ogb-tarjeta.env o los turnos quedan anotados a nombre de otro. */
const MODELO = process.env.ULTRON_NODO_MODELO || 'orcarouter/Qwen3.8-27B-Uncensored';
const MAX_VUELTAS = 6;
const PLAZO_MS = 170_000;
/* ── EL PRESUPUESTO DE TIEMPO DEL TURNO ──────────────────────────────────────
 *
 * 7-sep, del registro de producción, la noche en que José escribió «no logramos
 * arreglarlo, se queda pensando»:
 *
 *     total 17 359 · 9 347 · 10 501 · 17 094 · 46 535 · 50 563 · 97 120 ms
 *
 * Noventa y siete segundos. Y no por UNA cosa lenta: por la SUMA de cosas
 * razonables. El vector agotando sus ocho segundos, tres vueltas de
 * herramientas, y una guarda que se dispara y vuelve a preguntarle al modelo
 * dos veces más — cada llamada con las 64 herramientas dentro, o sea 33 000
 * fichas en el turno.
 *
 * Cada una de esas piezas se añadió con un buen motivo y ninguna miraba el
 * reloj. Ese es el fallo de fondo: el turno no tenía un techo, así que su
 * duración era la suma de todo lo que a alguien le pareció buena idea.
 *
 * Ahora sí lo tiene. Lo que es OBLIGATORIO —pensar y contestar— siempre corre.
 * Lo que es una MEJORA —el vector, las vueltas de más, las guardas que vuelven
 * a preguntar— solo corre si queda tiempo, y se salta sin drama si no. Un
 * turno bueno de treinta segundos vale más que uno perfecto de noventa que
 * nadie espera. */
/* Se lee en cada turno, no una vez al arrancar: así se puede subir o bajar
   en Heroku sin desplegar, y las pruebas pueden ponerlo en cero. */
const presupuestoMs = () => Number(process.env.ULTRON_PRESUPUESTO_MS || 40_000);
/* Una guarda cuesta dos llamadas al modelo; con menos de esto no se empieza. */
const GUARDA_NECESITA_MS = 14_000;

/* EL PRESUPUESTO, EN FICHAS Y NO EN LETRAS.
   5-sep, segunda prueba real: una sola llamada midió 13 421 fichas de entrada
   con un contexto de 12 288. Cuando el pedido no cabe, Ollama recorta POR EL
   PRINCIPIO —o sea la identidad y las reglas— y no avisa. El presupuesto en
   letras se quedaba corto porque las secciones del saber traen tablas, JSON y
   direcciones, que salen a menos de dos letras por ficha, no a tres.

   Así que: se cuenta en fichas con una estimación CONSERVADORA (2,4 letras
   por ficha), se mide primero la base (identidad, voz, memoria, pendientes,
   estado vivo) y el saber recibe lo que sobra, no un tope fijo. Y cada
   llamada real devuelve cuántas fichas evaluó: si se acerca al techo, se
   escribe en el registro con todas las letras. */
/* ── LA VENTANA QUE DE VERDAD HAY ────────────────────────────────────────────
   Estaba en 12 288 desde que esa era la ventana del nodo. El 7-sep la ventana
   de la tarjeta pasó a 24 576 —la eligió el tráfico real: siete días de
   registro, con un pico de 21 868 fichas en los turnos largos de herramientas—
   y este número se quedó atrás. Un presupuesto calculado sobre una ventana que
   ya no existe no es prudencia: es recortar el saber por una cuenta vieja, y
   se vio en el registro («sin sitio para el saber: la base ya ocupa 6 037
   fichas de 8 188») justo cuando la cabecera de la casa entró al prompt.
   Se pone en 16 384 y no en los 24 576 completos a propósito: lo que sobra de
   ahí para arriba es el aire de las VUELTAS de herramientas, que se van
   sumando al hilo, no permiso para escribir prompts más largos. */
const CTX = Number(process.env.ULTRON_NODO_CTX || 16_384);
const RESERVA_SALIDA = 1_500;
/* Las herramientas van en la plantilla de Ollama y cuestan fichas que no se
   ven desde aquí, así que se reservan aparte de la salida.
   ── LO QUE ESTA CIFRA SE COMIÓ CALLADA ───────────────────────────────────
   Estos 2 000 se calcularon cuando había 21 herramientas. Llegaron a ser 64 y
   nadie volvió aquí: costaban 6 622 fichas, o sea que el prompt real se pasaba
   del contexto en unas 4 600 y el «presupuesto» de 8 188 era una cuenta que no
   cuadraba con la realidad. Desde que ULTRON lleva doce a la mano y pide el
   resto en cajas, vuelven a ser ~1 900 y la reserva es verdad otra vez.
   Si algún día se suben las de siempre, este número sube con ellas. */
const RESERVA_HERRAMIENTAS = 2_000;
const PRESUPUESTO_FICHAS = Number(process.env.ULTRON_NODO_PRESUPUESTO_FICHAS || (CTX - RESERVA_SALIDA - RESERVA_HERRAMIENTAS - 600));   // 8 188
const LETRAS_POR_FICHA = 2.4;
const fichas = (t) => Math.ceil(String(t || '').length / LETRAS_POR_FICHA);
const PRESUPUESTO = Math.floor(PRESUPUESTO_FICHAS * LETRAS_POR_FICHA);   // en letras, para el hilo y los resultados
/* CUÁNTOS TURNOS VIAJAN ENTEROS. Lo de más atrás no se pierde: se resume
   (ver `resumirHilo`). Estos dos números son los que usan tanto el prompt como
   el resumidor, y tienen que ser LOS MISMOS o quedaría un hueco de turnos que
   no están ni en la ventana ni en el resumen. */
const VENTANA_HILO = 8;
const VENTANA_HILO_VOZ = 4;
/* ── LO QUE CUESTA UN RESUMEN, Y POR QUÉ ES CHICO ────────────────────────
   Primera versión, medida en producción: 1 400 letras de tope, o sea 466
   fichas de salida, o sea VEINTE SEGUNDOS de tarjeta. Y como la tarjeta tiene
   UNA ranura, esos veinte segundos se los quitaba al turno siguiente: los
   turnos pasaron de 13 s a 33 s. El resumen arreglaba la memoria y rompia la
   fluidez, que era justo lo que habia que arreglar.
   Se recorta —y se le pide menos— porque un resumen de mil letras con los
   nombres y las cifras vale igual que uno de mil cuatrocientas con adjetivos.
   Y se limita cuanto se resume DE UNA VEZ: si salieron veinte turnos de golpe,
   se hacen ocho ahora y el resto en el turno siguiente, que no corre prisa. */
const TOPE_RESUMEN = 1_000;       // el resumen del hilo, como mucho
const RESUMIR_DE_UNA_VEZ = 8;     // turnos por pasada, para que ninguna sea larga
const TOPE_HILO = 5_000;          // el hilo anterior, como mucho
const TOPE_TURNO = 1_200;         // cada turno viejo, como mucho
/* ── HABLANDO, EL PROMPT ES OTRO ────────────────────────────────────────────
   Escribiendo, la espera se llena leyendo lo que ya salió. Hablando no: entre
   la pregunta y la primera palabra hay SILENCIO, y el silencio se mide en
   fichas de prompt —el modelo evalúa las 8 188 antes de decir «buenos».
   Lo que se recorta para hablar es lo que en una conversación hablada nadie
   tiene en la cabeza: el hilo largo, las treinta memorias, los veinticinco
   pendientes y ocho secciones del saber. Con eso el prompt de voz baja a
   ~3 000 fichas y la primera palabra sale en un tercio del tiempo. No es un
   modelo distinto ni una respuesta peor: es la misma cabeza con la mesa
   despejada. */
const TOPE_HILO_VOZ = 1_800;
const TOPE_TURNO_VOZ = 500;
const MEMORIAS_VOZ = 10;
const PENDIENTES_VOZ = 6;
const SABER_VOZ = 3;              // secciones, en vez de ocho
const TOPE_SABER_VOZ = 3_000;     // letras, en vez de lo que sobre
const TOPE_RESULTADO = 2_800;     // cada resultado de herramienta
/* Por debajo de esto no vale la pena traer secciones del saber. Bajó de 2 500
   a 2 300 el 6-sep para hacerle sitio a la regla de las cajas: cuatro renglones
   que le dicen a ULTRON que tiene cincuenta herramientas guardadas y que las
   pida antes de decir que no puede. Doscientas fichas de saber a cambio de que
   no niegue lo que sí sabe hacer es un cambio bueno. */
const SABER_MINIMO = 2_300;

function encendido() { return !!(URL_NODO && SECRETO); }

// ── Hablar con el motor ─────────────────────────────────────────────────────

/**
 * Un pedido a /api/chat en streaming. `alTrozo(contenido)` recibe el texto a
 * medida que sale. Devuelve el mensaje final armado: { content, tool_calls,
 * uso }. Lanza con `codigo` si el motor no contesta o dice que no.
 */
/* `senalCorte` es un AbortSignal. Cuando la persona interrumpe, la consola
   corta el SSE, el servidor se entera por `res.on('close')` y esa señal llega
   hasta acá: se cierra la conexión con el motor Y —esto es lo que importa— el
   motor deja de generar. Sin esto, interrumpir solo callaba la bocina: el
   modelo seguía escribiendo una respuesta que ya nadie iba a leer, con la
   ÚNICA ranura del nodo ocupada (`OLLAMA_NUM_PARALLEL=1`), así que la pregunta
   siguiente se ponía en fila detrás de la respuesta abandonada. Ese era el
   «súper lento» de después de interrumpir. */
function pedir(cuerpo, { alTrozo = () => {}, plazo = PLAZO_MS, senalCorte = null } = {}) {
  return new Promise((resolver, fallar) => {
    if (senalCorte?.aborted) return fallar(conCodigo('CORTADO', 'el turno se canceló antes de empezar'));
    let u;
    try { u = new URL(URL_NODO + '/api/chat'); } catch { return fallar(conCodigo('NODO_APAGADO', 'ULTRON_NODO_URL no es una URL.')); }
    const seguro = u.protocol === 'https:';
    /* SIN PENSAR EN VOZ ALTA.
     *
     * Los modelos de la generación Qwen3 traen el «pensamiento» ENCENDIDO por
     * omisión: antes de contestar escriben su borrador —«el usuario pregunta
     * X, debería mirar Y…»— y eso es lo que vería la junta en pantalla, además
     * de pagarse en fichas y en segundos de espera.
     *
     * Se apaga acá, en el único sitio por el que pasan TODOS los pedidos, y no
     * en cada llamada: son siete y la que se olvide es la que un día enseña el
     * borrador. Va antes del `...cuerpo` a propósito, para que una llamada que
     * algún día quiera el pensamiento pueda pedirlo y ganarle a este valor.
     *
     * Un modelo que no sabe pensar en voz alta —qwen2.5, el de hasta hoy— lo
     * ignora sin quejarse: está comprobado contra el motor de verdad, no
     * supuesto. */
    const datos = JSON.stringify({ think: false, ...cuerpo });
    const opciones = {
      method: 'POST', hostname: u.hostname, port: u.port || (seguro ? 443 : 80), path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos), 'x-ultron-secreto': SECRETO },
      timeout: plazo,
    };
    // El certificado propio del motor: se confía en ESE y en ningún otro. Sin
    // CERT (pruebas por http) no aplica.
    if (seguro && CERT) { opciones.ca = CERT; }
    const req = (seguro ? https : http).request(opciones, (res) => {
      if (res.statusCode !== 200) {
        let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => {
          const codigo = res.statusCode === 401 ? 'NODO_NO' : res.statusCode === 503 ? 'MODELO_MUDO' : res.statusCode === 502 ? 'MODELO' : 'NODO_ERROR';
          fallar(conCodigo(codigo, `el motor contestó ${res.statusCode}: ${t.slice(0, 200)}`, res.statusCode));
        });
        return;
      }
      let resto = ''; let content = ''; const tool_calls = []; let final = null;
      res.setEncoding('utf8');
      let cortado = false, resuelto = false;
      const terminar = () => { if (resuelto) return; resuelto = true; resolver({ content, tool_calls, uso: { entrada: final?.prompt_eval_count || 0, salida: final?.eval_count || 0 }, final, cortado }); };
      res.on('data', (d) => {
        if (cortado) return;
        resto += d;
        const lineas = resto.split('\n'); resto = lineas.pop();
        for (const l of lineas) {
          if (!l.trim()) continue;
          let j; try { j = JSON.parse(l); } catch { continue; }
          const m = j.message || {};
          if (m.content) {
            /* `alTrozo` puede devolver el trozo RECORTADO (una cadena) o false
               para cortar la respuesta aquí mismo: es lo que ataja una deriva
               a otro idioma sin esperar a que termine de escribirla. */
            const r = alTrozo(m.content);
            if (r === false) { cortado = true; req.destroy(); terminar(); return; }
            content += typeof r === 'string' ? r : m.content;
            if (typeof r === 'string' && r.length < m.content.length) { cortado = true; req.destroy(); terminar(); return; }
          }
          for (const tc of m.tool_calls || []) tool_calls.push(tc);
          if (j.done) final = j;
        }
      });
      res.on('end', () => {
        if (resto.trim() && !cortado) { try { const j = JSON.parse(resto); if (j.message?.content) { content += j.message.content; alTrozo(j.message.content); } for (const tc of j.message?.tool_calls || []) tool_calls.push(tc); if (j.done) final = j; } catch { /* trozo roto */ } }
        terminar();
      });
      res.on('close', terminar);
      res.on('error', (e) => { if (!cortado) fallar(conCodigo('NODO_MUDO', e.message)); });
    });
    req.on('timeout', () => { req.destroy(conCodigo('NODO_LENTO', `el nodo no terminó en ${Math.round(plazo / 1000)} s`)); });
    req.on('error', (e) => { if (!/aborted|destroyed|ECONNRESET/i.test(String(e.message)) || !e.codigo) fallar(e.codigo ? e : conCodigo('NODO_MUDO', e.message)); });
    if (senalCorte) {
      const cortar = () => req.destroy(conCodigo('CORTADO', 'lo cortó quien preguntaba'));
      senalCorte.addEventListener('abort', cortar, { once: true });
      // Y se suelta al terminar: un turno largo con muchas vueltas dejaría
      // ocho oyentes colgados de la misma señal.
      req.on('close', () => senalCorte.removeEventListener('abort', cortar));
    }
    req.end(datos);
  });
}

function conCodigo(codigo, mensaje, status) { const e = new Error(mensaje); e.codigo = codigo; if (status) e.status = status; return e; }

// ── Las llamadas a herramientas escritas como texto ─────────────────────────

/* Un modelo chico a veces escribe la llamada en vez de hacerla:
   <tool_call>{"name":"estado_vivo","arguments":{}}</tool_call>. Ollama suele
   atraparlo, pero no siempre. Se lee igual y se quita del texto que ve la
   persona: una etiqueta XML en medio de la respuesta no es una respuesta. */
function llamadasEnTexto(texto) {
  const salida = []; let limpio = texto;
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g; let m;
  while ((m = re.exec(texto))) {
    try { const j = JSON.parse(m[1]); if (j && j.name) salida.push({ function: { name: j.name, arguments: j.arguments || j.parameters || {} } }); } catch { /* no era JSON */ }
    limpio = limpio.replace(m[0], '');
  }
  return { llamadas: salida, limpio: limpio.trim() };
}

// ── La deriva a otro idioma ─────────────────────────────────────────────────

/* 4-sep, en el panel de José: «El entorno regulatorio puede cambiar rápid嫂，
   总结一下FilterWhere助手的主要功能…». qwen se va al chino a media frase, y no
   es raro: es lo que hace un modelo chico cuando la penalización por repetir
   lo empuja fuera del español. Se ataja EN VIVO: al primer carácter de otro
   alfabeto se corta el stream ahí mismo, se conserva lo escrito hasta ese
   punto, y se le pide UNA vez que siga en español desde donde quedó. Si
   vuelve a irse, se queda lo que hay. La penalización por repetir baja a
   1,05, que es donde deja de pasar tanto. */
const OTRO_ALFABETO = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/;
function hastaOtroAlfabeto(t) { const m = OTRO_ALFABETO.exec(t); return m ? t.slice(0, m.index) : t; }

/* ── LA GUARDA DEL BUCLE ──────────────────────────────────────────────────────
 *
 * El 5 de septiembre, con una pregunta sobre Orden Global, el modelo se atascó
 * y escribió «sourceMappingError:» cientos de veces seguidas hasta agotar el
 * cupo de salida. Ni las herramientas ni la búsqueda tenían esa palabra: fue
 * el modelo. Un modelo chico se engancha en un token y ya no sale solo, y
 * ninguna penalización por repetir lo garantiza —subirla, además, lo manda al
 * chino: ver la deriva de arriba—, así que la única cura es una guarda que
 * MIRE lo escrito y corte.
 *
 * Qué se considera un bucle: que la cola del texto sea una misma tira corta
 * repetida cuatro veces o más, seguidas. Cuatro y no dos porque en español hay
 * repeticiones legítimas («muy, muy grande», una tabla con celdas iguales);
 * cuatro veces la misma tira de más de dos caracteres no es prosa.
 *
 * Devuelve el texto cortado ANTES de la primera repetición, o null si no hay
 * bucle. Se mira solo la cola: un bucle siempre está al final de lo escrito.
 */
const COLA_BUCLE = 1200;        // cuánto se mira hacia atrás
const VECES_BUCLE = 4;          // repeticiones seguidas para llamarlo bucle
const LARGO_BUCLE = 60;         // y cuánto tiene que ocupar lo repetido, en total
function dondeEmpiezaElBucle(texto) {
  const t = String(texto || '');
  if (t.length < LARGO_BUCLE) return null;
  const cola = t.slice(-COLA_BUCLE);
  /* De la tira MÁS CORTA a la más larga, para dar con la unidad que se repite
     —«sourceMappingError: »— y no con un múltiplo suyo; si se busca al revés,
     el corte deja dentro un par de repeticiones.
     Y se exige que lo repetido ocupe sesenta caracteres además de repetirse
     cuatro veces: una tabla con cuatro celdas «— | » es legítima y no llega;
     un modelo enganchado escribe cientos. */
  for (let n = 3; n <= Math.floor(cola.length / VECES_BUCLE); n++) {
    const patron = cola.slice(-n);
    if (!patron.trim()) continue;
    let veces = 1;
    while (cola.length >= n * (veces + 1) && cola.slice(-n * (veces + 1), -n * veces) === patron) veces++;
    if (veces >= VECES_BUCLE && n * veces >= LARGO_BUCLE) return t.length - n * veces;
  }
  return null;
}

// ── El prompt, con presupuesto ──────────────────────────────────────────────

function recortar(t, n) { t = String(t || ''); return t.length <= n ? t : t.slice(0, n - 12) + '\n[…recortado]'; }

function armarMensajes({ system, previa, texto, voz = false }) {
  const mensajes = [{ role: 'system', content: system }];
  /* ── LO QUE YA SE HABLÓ Y NO CABE ENTERO ────────────────────────────────
     Va ANTES del hilo y como turno del sistema, no dentro del `system`: el
     `system` es lo que la caché del motor tiene ya evaluado, y meterle algo
     que cambia cada turno lo invalidaría entero. Acá cuesta lo que pesa y
     nada más. */
  const resumen = String(previa?.resumen || '').trim();
  if (resumen) mensajes.push({ role: 'user', content: `[sistema] Lo que ya se habló en esta misma conversación, resumido:\n${recortar(resumen, TOPE_RESUMEN)}` });
  // El hilo: lo último primero en importancia. Se toman los últimos ocho
  // turnos, cada uno recortado, y si aun así no cabe se van soltando los
  // más viejos. Hablando son cuatro: en una conversación de voz lo de hace
  // seis turnos ya no lo tiene nadie en la cabeza, y cada turno viejo son
  // fichas que el modelo evalúa antes de decir la primera palabra.
  const cuantos = voz ? VENTANA_HILO_VOZ : VENTANA_HILO;
  const tope = voz ? TOPE_HILO_VOZ : TOPE_HILO;
  let hilo = (previa?.turnos || []).slice(-cuantos).map((t) => ({ role: t.rol === 'miembro' ? 'user' : 'assistant', content: recortar(t.texto, voz ? TOPE_TURNO_VOZ : TOPE_TURNO) }));
  let largo = hilo.reduce((a, m) => a + m.content.length, 0);
  while (hilo.length && largo > tope) { largo -= hilo[0].content.length; hilo = hilo.slice(1); }
  const disponible = PRESUPUESTO - system.length - texto.length - resumen.length;
  while (hilo.length && largo > disponible) { largo -= hilo[0].content.length; hilo = hilo.slice(1); }
  mensajes.push(...hilo, { role: 'user', content: texto });
  return mensajes;
}

/* Un modelo chico a veces cierra diciendo lo mismo dos veces con otras
   palabras, o exactamente igual. Lo exactamente igual se quita; lo parecido
   se deja, que no es asunto de una regex decidir qué es redundante. */
function sinRepetidos(texto) {
  const vistos = new Set(); const salida = [];
  for (const p of String(texto).split(/\n{2,}/)) {
    const clave = p.trim().toLowerCase().replace(/[`*_"'«».,:;!?]/g, '').replace(/\s+/g, ' ');
    if (clave && vistos.has(clave)) continue;
    if (clave) vistos.add(clave);
    salida.push(p);
  }
  return salida.join('\n\n');
}

/* Y a veces arranca escupiendo el resto de una herramienta que quiso llamar y
   no le salió: «_icallculator_» antes de la primera frase. No es cursiva ni es
   una palabra: es una sola pieza sin espacios, entre guiones bajos o entre
   ángulos, en la línea de arriba de todo. Se quita solo ahí —una cursiva de
   verdad lleva espacios o acompaña a una frase— y solo si abajo queda algo. */
function sinElRestoDeUnaHerramienta(texto) {
  return String(texto).replace(/^\s*(?:_{1,2}[a-z][a-z0-9_]{2,30}_{1,2}|<\|?[a-z_]{3,30}\|?>)\s*(?=\S)/i, '');
}

/* EL VECTOR DE LA PREGUNTA, para buscar en el saber por significado.
 *
 * El modelo de vectores vive en el nodo, detrás del mismo motor y el mismo
 * secreto que el que piensa; acá solo se le pide el vector de lo que preguntó
 * la junta, y `saber.buscar` hace el resto.
 *
 * NUNCA TRUENA, y es a propósito: si el nodo no contesta, si el modelo de
 * vectores no está, o si el saber no trae vectores, se devuelve null y la
 * búsqueda vuelve a ser la de palabras — que es la que ha funcionado desde el
 * primer día. Una mejora de la búsqueda no puede ser una forma nueva de
 * quedarse sin saber.
 *
 * El plazo es corto (8 s) por la misma razón: esto ocurre ANTES de armar el
 * prompt, o sea con la junta esperando. Vale la pena unos milisegundos por una
 * mejor recuperación; no vale la pena medio minuto. */
async function vectorDe(texto) {
  if (!saber.hayVectores()) return null;
  try {
    /* ── EL VECTOR SE SACA EN EL PROCESADOR, NO EN LA TARJETA ──────────────
     * `embeddinggemma:300m` ocupa 700 MB, y en esta tarjeta no hay 700 MB
     * libres al lado del modelo grande. Medido el 6-sep: pedir UN vector
     * expulsaba el modelo de 17 GB de la tarjeta —la memoria bajaba de 19 GB a
     * 955 MB—, y la siguiente pregunta tardaba CUATRO MINUTOS en volver a
     * cargarlo. Buscar mejor salía a cuatro minutos por búsqueda.
     * `num_gpu: 0` lo manda al procesador. Son trescientos millones de
     * parámetros para una frase: en el procesador tarda unas décimas y no toca
     * la tarjeta, así que el modelo grande no se mueve de su sitio. */
    /* MIL QUINIENTOS, no ocho mil. Esto es una llamada al MISMO motor que está
       a punto de pensar, así que cuando el motor está ocupado —que es cuando
       más importa— se come sus ocho segundos enteros ANTES de que empiece a
       pensar. Se vio en producción: «contexto 8006 ms» seguido de «sin vector
       para la pregunta: se busca por palabras». O sea: ocho segundos para
       terminar usando el respaldo igual. El respaldo por palabras es bueno;
       ocho segundos de silencio, no. */
    const r = await pedirJson('/api/embed', { input: String(texto || '').slice(0, 2000), options: { num_gpu: 0 }, keep_alive: '30m' }, 1500);
    const v = r?.embeddings?.[0];
    if (!Array.isArray(v) || !v.length) return null;
    // Normalizado acá para que el coseno sea un producto escalar y punto.
    let n = 0; for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    return Float32Array.from(v, (x) => x / n);
  } catch (e) {
    console.warn(`[nodo] sin vector para la pregunta (${e.message}): se busca por palabras`);
    return null;
  }
}

/** Un POST JSON simple al motor, sin streaming. Para /api/embed. */
function pedirJson(ruta, cuerpo, plazo) {
  return new Promise((resolver, fallar) => {
    let u;
    try { u = new URL(URL_NODO + ruta); } catch { return fallar(new Error('URL del nodo mala')); }
    const seguro = u.protocol === 'https:';
    const datos = JSON.stringify(cuerpo);
    const op = { method: 'POST', hostname: u.hostname, port: u.port || (seguro ? 443 : 80), path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos), 'x-ultron-secreto': SECRETO },
      timeout: plazo };
    if (seguro && CERT) op.ca = CERT;
    const req = (seguro ? https : http).request(op, (res) => {
      let t = ''; res.setEncoding('utf8');
      res.on('data', (d) => { t += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return fallar(new Error(`el motor contestó ${res.statusCode}`));
        try { resolver(JSON.parse(t)); } catch { fallar(new Error('respuesta que no es JSON')); }
      });
    });
    req.on('timeout', () => { req.destroy(); fallar(new Error('sin respuesta a tiempo')); });
    req.on('error', (e) => fallar(e));
    req.end(datos);
  });
}

/* ── EL «sourceMapping: sourceMapping» DE LA CABECERA ─────────────────────────
 *
 * Con los parámetros del fabricante puestos, la repetición sin fin se apagó:
 * de cientos de líneas idénticas quedó UNA, y detrás la respuesta buena y
 * completa en español. Lo que sobrevive no es un bucle: es un PREFIJO. El
 * modelo, en el mismo turno en que llama a una herramienta, a veces escupe
 * además un pedazo de código; `llamadasEnTexto` se lleva lo que reconoce como
 * llamada, y este resto se queda pegado arriba de la respuesta.
 *
 * La firma que se limpia es deliberadamente estrecha: una línea cuyo lado
 * izquierdo y derecho son EL MISMO identificador —«sourceMapping:
 * sourceMapping»—. En español eso no ocurre nunca; un dato de verdad
 * («ORIGEN: 2,59», «Ordenex: VIVA») tiene distinto a cada lado, así que no
 * puede caer por accidente. Y solo se mira la CABECERA: en cuanto aparece una
 * línea que no encaja, se para — lo que venga después es la respuesta y no se
 * toca. Si al final no quedara nada, se devuelve el texto tal cual: más vale
 * enseñar basura que tragarse una respuesta buena. */
/* Dos formas, las dos vistas en vivo el 5-sep contra el modelo de producción:
 *
 *   sourceMapping: sourceMapping                       ← el mismo a los dos lados
 *   sourceMapping: {pregunta: 'a cuánto está…'}}>      ← una LLAMADA malformada
 *
 * La segunda destapó qué era todo esto: `pregunta` es el parámetro de
 * buscar_saber, y los `}}>` del final son la cola de una etiqueta de llamada
 * que no cerró. O sea que nunca fue prosa repetida: es una herramienta que el
 * modelo quiso llamar y escribió mal, igual que el «_icallculator_» — con otra
 * cara. Se limpian las dos, y con las mismas tres cautelas: solo en la
 * CABECERA, se para en la primera línea que no encaje, y si debajo no queda
 * nada se devuelve el texto tal cual. */
const CODIGO_SUELTO = [
  // «algo: algo» — el mismo identificador a los dos lados. En español no pasa.
  /^([A-Za-z_][A-Za-z0-9_]{2,40})\s*[:=]\s*\1\s*[,;.]?$/,
  // «algo: {…}» con la cola de cierres que deja una etiqueta rota: } ] > )
  /^[A-Za-z_][A-Za-z0-9_]{2,40}\s*[:=]\s*[{[][^\n]*[}\]][}\]>)]*\s*[,;]?$/,
];
function sinCodigoPegadoArriba(texto) {
  const lineas = String(texto).split('\n');
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i].trim();
    if (!l) { i++; continue; }
    if (!CODIGO_SUELTO.some((re) => re.test(l))) break;
    i++;
  }
  if (!i) return String(texto);
  const resto = lineas.slice(i).join('\n').replace(/^\s+/, '');
  return resto.trim() ? resto : String(texto);
}

function largoDe(mensajes) { return mensajes.reduce((a, m) => a + String(m.content || '').length + JSON.stringify(m.tool_calls || '').length, 0); }

// ── Pensar ──────────────────────────────────────────────────────────────────

async function pensar({ miembro, junta, texto, conversacionId, previa: previaDada = null, emitir = () => {}, sistema, modo = 'texto', alias = null, pensar: pensarDeArriba = null, senalCorte = null }) {
  /* Todos los pedidos de ESTE turno llevan la misma señal de corte. */
  const pedirDelTurno = (cuerpo, opciones = {}) => pedir(cuerpo, { ...opciones, senalCorte });
  if (!encendido()) throw conCodigo('NODO_APAGADO', 'Faltan ULTRON_NODO_URL o ULTRON_NODO_SECRETO.');
  const ctx = { miembro, junta, conversacionId, fuentes: [], memorias: [], documentos: [], envios: [], pendientes: [], acciones: [], chico: true , pensar: pensarDeArriba };

  const tArranque = Date.now();
  /* ── TODO LO QUE SE PUEDE PEDIR A LA VEZ, SE PIDE A LA VEZ ───────────────
     El vector de la pregunta iba en fila DESPUÉS de armar la base, y es una
     llamada de red al nodo con plazo de ocho segundos: se sumaba entera al
     silencio. Solo depende del texto de la pregunta, así que sale con las
     demás. Si al final resulta que no hay sitio para el saber, se tira; haber
     pedido de más cuesta cero segundos, y haberlo pedido tarde costaba todos. */
  const hablando = modo === 'voz';
  const [memorias, estadoVivo, abiertos, previaLeida, vector] = await Promise.all([
    memoria.memoriasDe(miembro.correo, { limite: hablando ? MEMORIAS_VOZ : 30 }),
    vivo.leerRapido(),
    memoria.pendientes({ limite: hablando ? PENDIENTES_VOZ : 25 }),
    previaDada ? Promise.resolve(previaDada) : (conversacionId ? memoria.conversacion(conversacionId, miembro.correo) : Promise.resolve(null)),
    saber.hayVectores() ? vectorDe(texto) : Promise.resolve(null),
  ]);
  const msContexto = Date.now() - tArranque;
  // Primero la base sin saber, para saber cuánto queda. El hilo anterior se
  // reserva aparte; el saber recibe lo que sobra, y si sobra poco, poco.
  const previa = previaLeida;
  const voz = saber.vozDeLaCasa().slice(0, 6);
  // La base (identidad, memoria, pendientes, estado vivo) no puede comerse el
  // presupuesto: si las memorias son muchas y largas, se sueltan las más
  // viejas hasta que la base quede en menos de la mitad y el saber y el hilo
  // tengan sitio. Antes una junta con cuarenta memorias largas dejaba la
  // pregunta sin saber y el pedido pasado del contexto.
  let memoriasUsadas = memorias;
  const armar = (secciones) => sistema({ miembro, memorias: memoriasUsadas, estadoVivo, secciones, vozCasa: voz, pendientes: abiertos, chico: true, modo, alias }).map((b) => b.text).join('\n\n');
  let base = armar([]);
  const TOPE_BASE = Math.floor(PRESUPUESTO_FICHAS * 0.5);
  while (fichas(base) > TOPE_BASE && memoriasUsadas.length) { memoriasUsadas = memoriasUsadas.slice(0, Math.max(0, memoriasUsadas.length - 4)); base = armar([]); }
  const hiloEstimado = Math.min(hablando ? TOPE_HILO_VOZ : TOPE_HILO, (previa?.turnos || []).slice(hablando ? -VENTANA_HILO_VOZ : -VENTANA_HILO).reduce((a, t) => a + Math.min(hablando ? TOPE_TURNO_VOZ : TOPE_TURNO, String(t.texto || '').length), 0))
    + Math.min(TOPE_RESUMEN, String(previa?.resumen || '').length);
  const sobra = PRESUPUESTO_FICHAS - fichas(base) - fichas(hiloEstimado ? 'x'.repeat(hiloEstimado) : '') - fichas(texto);
  const paraSaber = Math.max(0, Math.floor(sobra * LETRAS_POR_FICHA));
  const paraSaberReal = hablando ? Math.min(paraSaber, TOPE_SABER_VOZ) : paraSaber;
  const secciones = paraSaberReal >= SABER_MINIMO ? saber.buscar(texto, { maximo: hablando ? SABER_VOZ : 8, maxBytes: paraSaberReal, vector }) : [];
  // Hablando, quedarse sin saber es a propósito y no se avisa como avería.
  if (paraSaber < SABER_MINIMO) console.warn(`[nodo] sin sitio para el saber: la base ya ocupa ${fichas(base)} fichas de ${PRESUPUESTO_FICHAS}`);
  ctx.fuentes.push(...secciones.map((s) => ({ id: s.id, titulo: s.titulo, fuente: s.fuente })));
  const system = armar(secciones);
  const mensajes = armarMensajes({ system, previa, texto, voz: hablando });

  let textoFinal = '';
  /* ── EL CRONÓMETRO ───────────────────────────────────────────────────────
     Nadie tenía uno en el camino que duele. Los nueve a quince segundos se
     midieron a mano UNA vez, y después de arreglar cinco cosas nadie iba a
     poder decir cuál sirvió. Ahora cada turno deja escrito dónde se fueron los
     milisegundos, y viaja en el evento `fin` para que se pueda ver también
     desde la pantalla. */
  let msPrimera = 0;
  let vueltasDadas = 0;
  const usadas = [];
  const uso = { entrada: 0, salida: 0, lecturaCache: 0, escrituraCache: 0 };
  // En voz, la respuesta es corta por diseño: menos fichas de salida es menos
  // segundos hasta la primera frase dicha, y una frase dicha larga no se sigue.
  /* LOS PARÁMETROS QUE PIDE EL FABRICANTE, Y POR QUÉ SE TARDÓ EN PONERLOS.
   *
   * Durante dos días el bucle de «sourceMappingError» se trató como un vicio
   * del modelo chico y se combatió a mano: una guarda que mira lo escrito y
   * corta. Se cambió el modelo entero —de qwen2.5:14b a qwen3.8:27b— y el
   * bucle salió IGUAL, con el mismo texto literal. Eso descartó al modelo: dos
   * generaciones distintas no coinciden por casualidad.
   *
   * La respuesta estaba en la ficha del fabricante, sin buscar mucho. Qwen
   * publica los parámetros de su modo instruct y dice, textual, que
   * `presence_penalty` se ajusta «para reducir la repetición sin fin», y que
   * subirlo de más «puede producir mezcla de idiomas». Repetición sin fin y
   * mezcla de idiomas son EXACTAMENTE los dos síntomas que llevábamos
   * persiguiendo — y de los cuatro parámetros que recomiendan, mandábamos uno.
   *
   *   fabricante:  temperature 0.7 · top_p 0.80 · top_k 20 · presence_penalty 1.5
   *   se mandaba:  temperature 0.35 · repeat_penalty 1.05 · nada más
   *
   * Se adoptan los suyos con dos salvedades pensadas:
   *
   *   · `presence_penalty` va en 1.0, no en 1.5. Su propio aviso dice que
   *     alto mezcla idiomas, y esta casa habla español y solo español: se
   *     toma lo que cura la repetición sin pagar la deriva.
   *   · `repeat_penalty` vuelve a 1.0, que es lo que piden. El 1.05 era un
   *     apaño nuestro contra el mismo mal, y dos frenos a la vez sobre el
   *     mismo eje es como se llega al chino de media frase del 4-sep.
   *
   * LAS GUARDAS SE QUEDAN. Curar la causa no es razón para quitar la red: si
   * el modelo se engancha igual, la guarda sigue cortando. Lo que cambia es
   * que ya no es lo único que hay. */
  const opciones = {
    temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0,
    presence_penalty: 1.0, repeat_penalty: 1.0,
    num_predict: modo === 'voz' ? 360 : 1400,
    /* ── EL CONTEXTO SE PIDE, NO SE HEREDA ─────────────────────────────────
     * Aquí NO se mandaba `num_ctx`, así que el motor usaba el del modelo:
     * 32768. Y eso no es un número inocente — es cuánta memoria de tarjeta se
     * reserva para la conversación ANTES de contestar la primera palabra.
     *
     * Medido en la máquina, el 6-sep: con 32768, una pregunta tarda 236
     * SEGUNDOS porque el modelo no cabe y hay que volver a cargarlo entero;
     * con el modelo ya dentro y sin recargar, la misma pregunta tarda 0,6.
     * No era el modelo, ni la red, ni el navegador: era que no cabía.
     *
     * Y 32768 no lo usamos: `PRESUPUESTO_FICHAS` recorta el prompt a 8188
     * precisamente para no pasarnos de `CTX`, que son 12288. Se estaba
     * pagando —en memoria de tarjeta y en recargas de minutos— por un espacio
     * que el propio código se prohíbe usar. */
    num_ctx: CTX,
  };
  // El trozo pasa por la guarda del idioma ANTES de llegar al panel: lo que se
  // fue a otro alfabeto no se enseña ni un instante.
  /* Las dos guardas del stream, en el mismo sitio: el idioma y el bucle. Las
     dos cortan devolviendo menos de lo que llegó, que es la señal que
     `pedir()` usa para cerrar la conexión con el nodo. */
  const conGuarda = (acum) => (t) => {
    const limpio = hastaOtroAlfabeto(t);
    if (limpio) { if (!msPrimera) msPrimera = Date.now() - tArranque; acum.t += limpio; emitir('texto', { t: limpio }); }
    if (limpio.length < t.length) return limpio;
    const corte = dondeEmpiezaElBucle(acum.t);
    if (corte != null) {
      // Lo repetido ya se emitió: se le dice a la consola con qué quedarse.
      acum.t = acum.t.slice(0, corte).trimEnd();
      acum.bucle = true;
      emitir('reemplazo', { texto: acum.t });
      return '';
    }
    return t;
  };
  let derivas = 0;
  let reintentos = 0;
  /* ── LAS CAJAS ABIERTAS EN ESTE TURNO ───────────────────────────────────
     ULTRON lleva a mano las doce de todos los días; lo demás vive en cajas que
     el propio modelo pide con `mas_herramientas` cuando le hacen falta. Aquí se
     apunta cuáles abrió, y desde la vuelta siguiente sus definiciones viajan
     con las demás. Es por TURNO: las cajas se cierran solas al terminar, así
     que la pregunta siguiente vuelve a salir ligera. */
  const cajas = [];

  /* Lo que queda del presupuesto del turno. Todo lo opcional lo consulta. */
  const quedaMs = () => presupuestoMs() - (Date.now() - tArranque);

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    /* Se cortó entre vueltas: ni una herramienta más. Un turno cancelado en la
       vuelta 3 seguía ejecutando las cinco restantes —con lo que eso significa
       cuando una de ellas escribe. */
    if (senalCorte?.aborted) break;
    /* Y se acabó el tiempo: se cierra con lo que haya. Seguir dando vueltas
       cuando ya se pasó del presupuesto es lo que convertía un turno en
       noventa segundos de pantalla muda. Solo si YA dijo algo: cortar sin una
       palabra escrita sería peor que tardar. */
    if (vuelta > 0 && quedaMs() <= 0 && textoFinal.trim()) {
      emitir('pensando', { vuelta, motivo: 'se acabó el tiempo del turno' });
      console.warn(`[nodo] se acabó el presupuesto (${presupuestoMs()} ms) en la vuelta ${vuelta}: se cierra con lo que hay`);
      break;
    }
    /* ── Y SI SE ACABÓ EL TIEMPO SIN HABER DICHO NADA ──────────────────────
       Cortar aquí sería dejar la pantalla en blanco, así que no se corta: se
       le quitan las HERRAMIENTAS y se le pide que conteste con lo que ya
       tiene. Sin herramientas no puede pedir otra vuelta —el bucle termina
       por fuerza— y encima la llamada es la más barata del turno.
       Esto es lo que faltaba el 7-sep: «primera 95061ms · vueltas 3» son tres
       llamadas encadenadas, ninguna de las dos primeras con una palabra para
       la persona, y el techo entre vueltas no las paraba porque exigía que ya
       hubiera dicho algo. Ahora la vuelta que se pasa del techo es la ÚLTIMA,
       diga lo que diga. */
    const sinTiempo = vuelta > 0 && quedaMs() <= 0;
    if (sinTiempo) {
      console.warn(`[nodo] se acabó el presupuesto (${presupuestoMs()} ms) en la vuelta ${vuelta} y aún no dijo nada: se le pide la respuesta sin herramientas`);
      mensajes.push({ role: 'user', content: '[sistema] Se acabó el tiempo de este turno. Contestá AHORA, en dos o tres líneas, con lo que ya averiguaste. Si te faltó algo, decí qué te faltó — pero contestá.' });
    }
    vueltasDadas = vuelta + 1;
    emitir('pensando', { vuelta, ...(sinTiempo ? { motivo: 'se acabó el tiempo: cierro con lo que hay' } : {}) });
    const acum = { t: '' };
    let r = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: sinTiempo ? undefined : herramientas.paraOllama({ cajas }), stream: true, options: opciones }, { alTrozo: conGuarda(acum) });
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
    /* SE ENGANCHÓ.
     *
     * Si ya había dicho algo, eso es lo que vale y se cierra el turno con
     * ello: el modelo estaba dando vueltas sobre sí mismo y lo de después no
     * aporta nada.
     *
     * PERO SI SE ENGANCHÓ SIN HABER DICHO NADA —el primer token ya era el
     * bucle— cerrar ahí le deja a la junta un «no me salió una respuesta con
     * palabras» y el turno entero perdido por un token. Pasó en vivo el 5-sep
     * con una pregunta de tres líneas: el modelo escribió «sourceMapping»
     * cientos de veces desde el arranque y la guarda, haciendo su trabajo,
     * devolvió el vacío.
     *
     * El enganche es ALEATORIO, no determinista: la misma pregunta con otra
     * semilla sale bien. Así que se reintenta UNA vez, con otra semilla y algo
     * más de temperatura para que no caiga en el mismo pozo. Una y no más: si
     * vuelve a engancharse, el problema no es la semilla y hay que decirlo en
     * vez de quemar el nodo a reintentos. */
    if (acum.bucle) {
      emitir('pensando', { vuelta, motivo: 'se repetía' });
      console.warn('[nodo] el modelo se repetía: se cortó el turno donde empezó el bucle');
      /* «Nada que salvar» se mide en PALABRAS, no en caracteres. La guarda
         corta en la primera repetición, y cuando el bucle empieza en el token
         uno lo que queda es un cascajo —«sou», el principio de la primera
         «sourceMapping»— que no está vacío pero tampoco es una respuesta.
         Tres palabras es el corte: menos que eso no es una frase que nadie
         pueda leer, y más que eso ya dijo algo que vale la pena conservar. */
      const palabras = acum.t.trim().split(/\s+/).filter(Boolean).length;
      const nadaQueSalvar = palabras < 3 && !textoFinal.trim();
      if (!nadaQueSalvar || reintentos > 0) { textoFinal = acum.t; break; }
      reintentos++;
      emitir('pensando', { vuelta, motivo: 'se reintenta' });
      console.warn('[nodo] se enganchó sin decir nada: un reintento con otra semilla');
      const otro = { t: '' };
      r = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas }), stream: true,
        options: { ...opciones, temperature: 0.6, seed: Math.floor(Math.random() * 1e9) } },
        { alTrozo: conGuarda(otro) });
      uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
      if (otro.bucle) {
        console.warn('[nodo] se volvió a enganchar en el reintento: se cierra el turno');
        textoFinal = otro.t;
        break;
      }
      // Salió: sigue el turno normal con esta respuesta (herramientas incluidas).
    }
    if (r.cortado && derivas === 0) {
      derivas++;
      emitir('pensando', { vuelta, motivo: 'otro idioma' });
      const hastaAqui = r.content;
      const sigue = await pedirDelTurno({ model: MODELO, stream: true, options: { ...opciones, temperature: 0.2 },
        messages: [...mensajes, { role: 'assistant', content: hastaAqui }, { role: 'user', content: '[sistema] Te fuiste a otro idioma a media frase. Seguí en ESPAÑOL exactamente desde donde quedaste, sin repetir lo ya escrito y sin herramientas.' }] },
        { alTrozo: conGuarda(acum) });
      uso.entrada += sigue.uso.entrada; uso.salida += sigue.uso.salida;
      // Sin separador: el corte fue a media palabra («rápid|amente») y el
      // modelo sigue exactamente desde ahí.
      r = { ...r, content: hastaAqui + sigue.content, tool_calls: r.tool_calls };
    }
    if (r.uso.entrada > CTX * 0.92) console.warn(`[nodo] AVISO: una llamada evaluó ${r.uso.entrada} fichas con un contexto de ${CTX}: el principio del prompt pudo quedar fuera`);

    const enTexto = llamadasEnTexto(r.content);
    const llamadas = [...r.tool_calls, ...enTexto.llamadas];
    let visible = enTexto.limpio;
    if (!llamadas.length) { textoFinal += (textoFinal && visible ? '\n\n' : '') + visible; break; }
    /* La vuelta sin tiempo era la ÚLTIMA por definición: fue sin herramientas,
       así que si aun así escribió una llamada en el texto, no se corre. Sin
       esto el bucle podría seguir hasta MAX_VUELTAS pasado el techo, que es
       justo lo que este techo existe para impedir. */
    if (sinTiempo) { textoFinal += (textoFinal && visible ? '\n\n' : '') + visible; break; }

    // Hubo herramientas: lo dicho antes de llamarlas se conserva si es texto de
    // verdad (una frase de «voy a mirar»), no si era la etiqueta.
    if (visible) textoFinal += (textoFinal ? '\n\n' : '') + visible;
    /* Si pidió una caja, se apunta ANTES de correr nada: la vuelta siguiente
       tiene que salir ya con esas herramientas dentro, o el modelo pediría la
       caja, se la darían, y seguiría sin verla. */
    for (const l of llamadas) {
      if (l.function?.name !== 'mas_herramientas') continue;
      let e = l.function?.arguments;
      if (typeof e === 'string') { try { e = JSON.parse(e); } catch { e = {}; } }
      const caja = String(e?.caja || '').trim();
      if (caja && herramientas.CAJAS[caja] && !cajas.includes(caja)) cajas.push(caja);
    }
    mensajes.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined });
    for (const res of await correrLote(llamadas, { ctx, usadas, emitir })) {
      mensajes.push({ role: 'tool', content: recortar(res.salida, TOPE_RESULTADO), tool_name: res.nombre });
    }
    // Si con los resultados el pedido se pasa del presupuesto, se sueltan los
    // turnos viejos del hilo (nunca el system ni la pregunta ni los resultados).
    while (largoDe(mensajes) > PRESUPUESTO && mensajes.length > 3 && mensajes[1].role !== 'tool' && !mensajes[1].tool_calls) mensajes.splice(1, 1);
  }
  /* ── LA GUARDA DEL «NO PUEDO» SIN HABER MIRADO ────────────────────────────
     Es la red de la que cuelga todo el recorte a doce herramientas.

     6-sep, primera prueba real después de recortar: a «¿qué archivos hay en
     infra/ultron/lib?» ULTRON contestó «no tengo esa información» SIN haber
     pedido la caja del taller, que era donde estaban las manos para mirarlo.
     Y a la pregunta siguiente —su propia salud— sí pidió la caja y contestó
     bien. O sea que el modelo entiende la puerta, pero no siempre se acuerda
     de ella, y cuando no se acuerda el fallo es INVISIBLE: la junta se queda
     sin un dato que sí existía y nadie sabe por qué.

     Pedirle por favor en el encabezado no alcanza —ya está pedido, y aun así
     pasó—. Así que se comprueba: si la respuesta es una negativa Y no se abrió
     ninguna caja Y no se corrió ninguna herramienta, se le devuelve UNA vez
     con TODO a la vista y la orden de mirar antes de negar. Cuesta una vuelta
     y solo se paga en el caso en que ya habíamos fallado.

     Se exige que no se haya corrido NINGUNA herramienta a propósito: si miró
     algo y aun así no encontró, la negativa es legítima y no se le insiste. */
  const NEGATIVA = /\b(no tengo esa informaci[oó]n|no tengo acceso|no puedo (acceder|leer|ver|hacer)|no dispongo|no s[eé] (eso|nada)|no est[aá] entre (las fichas|lo que)|no me consta)\b/i;
  /* ── LAS GUARDAS MIRAN EL RELOJ ──────────────────────────────────────────
     Cada una cuesta DOS llamadas más al modelo. Con el turno ya en el minuto,
     insistir es empeorar lo único que la persona nota. Si no hay tiempo se
     salta y queda escrito en el registro, que es mejor que un turno de
     noventa segundos. */
  const hayTiempoParaGuarda = (quien) => {
    if (quedaMs() >= GUARDA_NECESITA_MS) return true;
    console.warn(`[nodo] no se corre la guarda de ${quien}: quedan ${Math.max(0, quedaMs())} ms del presupuesto`);
    return false;
  };
  if (!cajas.length && !usadas.length && NEGATIVA.test(textoFinal) && hayTiempoParaGuarda('la negativa')) {
    emitir('pensando', { vuelta: MAX_VUELTAS, motivo: 'dijo que no sin mirar' });
    mensajes.push({ role: 'assistant', content: textoFinal });
    mensajes.push({ role: 'user', content: '[sistema] Dijiste que no podés o que no sabés, y no llamaste ni una herramienta. '
      + 'Ahora las tenés TODAS a la vista. Mirá con la que corresponda y contestá con lo que devuelva. '
      + 'Si después de mirar sigue sin poder saberse, entonces sí decilo, pero diciendo QUÉ miraste.' });
    /* ── NO SE ABREN LAS 64 ──────────────────────────────────────────────
       Esto decía `cajas: CAJAS_UTILES`, o sea el catálogo entero: 10 058
       fichas de herramientas en CADA una de las dos llamadas de la guarda. Es
       lo que llevó los turnos a 33 000 fichas en producción — y de paso el
       motivo por el que se recortaron a doce las de siempre. Se abren las que
       sirven para responder una negativa —buscar, leer, las casas, las
       cuentas, los documentos— y bajan a 5 144. Si de verdad hacía falta otra,
       para eso está `mas_herramientas`, que va en el núcleo. */
    const cajasDeLaGuarda = ['internet', 'cadenas', 'cuentas', 'documentos'].filter((c) => herramientas.CAJAS_UTILES.includes(c));
    let dicho = '';
    const r = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas: cajasDeLaGuarda }), stream: true, options: opciones }, { alTrozo: (t) => { dicho += t; } });
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
    const enTexto = llamadasEnTexto(r.content);
    const llamadas = [...r.tool_calls, ...enTexto.llamadas];
    if (llamadas.length) {
      mensajes.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined });
      for (const res of await correrLote(llamadas, { ctx, usadas, emitir })) {
        mensajes.push({ role: 'tool', content: recortar(res.salida, TOPE_RESULTADO), tool_name: res.nombre });
      }
      const r2 = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas: cajasDeLaGuarda }), stream: true, options: opciones }, { alTrozo: (t) => {} });
      uso.entrada += r2.uso.entrada; uso.salida += r2.uso.salida;
      const limpio = llamadasEnTexto(r2.content).limpio.trim();
      if (limpio) { textoFinal = limpio; emitir('reemplazo', { texto: textoFinal }); }
    } else if (dicho.trim() && !NEGATIVA.test(dicho)) {
      textoFinal = llamadasEnTexto(dicho).limpio.trim() || textoFinal;
      emitir('reemplazo', { texto: textoFinal });
    }
  }

  /* ── LA GUARDA DE LO PROMETIDO ────────────────────────────────────────────
     7-sep, conversación de verdad. José: «me puedes armar un PDF de esta
     idea». ULTRON abrió dos cajas, se quedó sin vueltas, y contestó:
     «Listo, le dejo el PDF en el chat.» No había creado nada. Tres veces
     seguidas, hasta que José escribió «para descargar, no me lo cuentes».
     Es el peor fallo que puede tener: decir que hizo algo que no hizo. Todo
     este archivo está escrito contra eso —no inventar una cifra, no citar una
     herramienta que no corrió— y faltaba el caso de la ENTREGA.
     Así que se mira: si dice que dejó un documento y NO corrió la herramienta
     que lo crea, se le devuelve UNA vez con la caja ya abierta. Y si aun así
     no lo hace, se le quita la promesa al texto: es preferible «no pude
     armarlo» a un PDF que no existe. */
  /* Dos formas de prometer y una sola de comprobarlo: o dice que LO ENTREGA
     («le dejo», «acá tiene», «adjunto») o que YA LO HIZO («ya le armé», «ya se
     lo preparé»), y a menos de sesenta letras nombra un documento. «Le dejo
     Ordenex a un toque» no cae: eso es `abrir`, y es verdad. */
  const DOC = 'pdf|documento|memo|acta|informe|carta';
  const PROMETE_RE = [
    // «le dejo el PDF», «aquí tiene el informe», «ya le armé el documento»
    new RegExp(`(?:(?:le|te|se lo|te lo)?\\s*dejo|ac[a\u00e1] tiene|aqu[i\u00ed] tiene|adjunto|ya\\s+(?:\\S+\\s+){0,2}(?:dej|arm|prepar|gener|cre|escrib)\\S*)[^.]{0,60}\\b(?:${DOC})\\b`, 'i'),
    // y al revés: «el acta queda lista para bajar»
    new RegExp(`\\b(?:${DOC})\\b[^.]{0,40}(?:queda|est[a\u00e1])\\s+list[oa]`, 'i'),
  ];
  const PROMETE = { test: (t) => PROMETE_RE.some((r) => r.test(t)) };
  /* SE MIDE CONTRA LO QUE PIDIERON, no contra «hizo algo». Primera versión de
     esta guarda, probada contra producción: ULTRON llamó a `crear_documento`
     —así que la guarda se dio por satisfecha— pero NUNCA llamó a
     `exportar_pdf`, y siguió diciendo «le dejo el PDF a un toque» con
     `acciones: []`. O sea: el documento existía en la biblioteca y el PDF no,
     y no había ni un botón que tocar. Quien pidió un PDF quiere un archivo,
     no una entrada en una lista. */
  const pidioPdf = /\b(pdf|descargar|descarga|bajar(?:lo|la)?|para bajar|imprimir)\b/i.test(texto);
  const creoDoc = () => usadas.some((h) => h.nombre === 'crear_documento');
  const hayPdf = () => ctx.acciones.some((a) => a.tipo === 'abrir' && /formato=pdf/.test(a.url || ''));
  const cumplio = () => (pidioPdf ? hayPdf() : creoDoc());
  if (PROMETE.test(textoFinal) && !cumplio() && hayTiempoParaGuarda('lo prometido')) {
    emitir('pensando', { vuelta: MAX_VUELTAS, motivo: 'dijo que lo dejó sin haberlo hecho' });
    mensajes.push({ role: 'assistant', content: textoFinal });
    /* El aviso dice EXACTAMENTE qué falta, que no es lo mismo según el caso:
       o no escribió nada, o lo escribió y no lo dejó en PDF. */
    mensajes.push({ role: 'user', content: '[sistema] ' + (creoDoc()
      ? 'Escribiste el documento pero NO llamaste a exportar_pdf, así que no hay ningún botón para bajarlo y le dijiste a la persona que se lo dejabas. Llamá AHORA a exportar_pdf con el id del documento que acabás de crear.'
      : 'Dijiste que dejabas un documento o un PDF y no lo creaste: no llamaste a crear_documento. Escribilo COMPLETO con crear_documento y, si pidieron PDF, dejalo después con exportar_pdf.')
      + ' Después contestá en dos líneas. Si de verdad no se puede, decí que no pudiste y por qué — pero no vuelvas a decir que lo dejaste si no está.' });
    for (const c of ['documentos']) if (!cajas.includes(c)) cajas.push(c);
    let dicho = '';
    const r = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas }), stream: true, options: opciones }, { alTrozo: (t) => { dicho += t; } });
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
    const llamadas = [...r.tool_calls, ...llamadasEnTexto(r.content).llamadas];
    if (llamadas.length) {
      mensajes.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined });
      for (const res of await correrLote(llamadas, { ctx, usadas, emitir })) {
        mensajes.push({ role: 'tool', content: recortar(res.salida, TOPE_RESULTADO), tool_name: res.nombre });
      }
      const r2 = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas }), stream: true, options: opciones }, { alTrozo: () => {} });
      uso.entrada += r2.uso.entrada; uso.salida += r2.uso.salida;
      const limpio = llamadasEnTexto(r2.content).limpio.trim();
      if (limpio) { textoFinal = limpio; emitir('reemplazo', { texto: textoFinal }); }
    } else if (dicho.trim()) {
      textoFinal = llamadasEnTexto(dicho).limpio.trim() || textoFinal;
      emitir('reemplazo', { texto: textoFinal });
    }
  }

  /* ── LA GUARDA DE LO QUE DIJO QUE GUARDÓ ────────────────────────────────
     7-sep, medido contra producción tres veces seguidas. Se le dijo: «a la
     corresponsal de Yoro la llamamos ROSIBEL AGUILAR, cupo 6.400». Contestó
     «Guardado para toda la junta: corresponsal de Yoro, ROSIBEL AGUILAR».
     Trece turnos después: «No aparece en mi memoria». Y en /memorias no había
     nada — nunca llamó a `recordar`.

     De NUEVE datos que se le pidió guardar en tres rondas, guardó tres. De los
     otros seis dijo que sí y no llamó la herramienta.

     Es el mismo fallo del PDF —decir que hizo algo que no hizo— pero en la
     memoria, y ahí es peor: el PDF se nota al momento porque no hay botón que
     tocar, y esto no se nota hasta que hace falta el dato, semanas después, y
     ya no está. Era también la causa de fondo de «se pierde en conversación
     larga»: lo que se le pedía recordar no se guardaba en ningún lado.

     `recordar` y `anotar_pendiente` van las DOS en el núcleo, o sea que
     siempre las tuvo delante. No es que no pudiera. */
  const APUNTA_RE = [
    // «Guardado.», «Guardado para toda la junta:», «Anotado, señor»
    /^\s*(?:listo[,.]?\s*)?(?:guardad[oa]|anotad[oa]|apuntad[oa]|registrad[oa])\b/i,
    // «queda anotado», «lo dejo anotado», «queda guardado como dato fijo»
    /\b(?:queda|quedan|dej[oé]|dejar[eé])\s+(?:\S+\s+){0,3}?(?:guardad[oa]s?|anotad[oa]s?|apuntad[oa]s?|registrad[oa]s?)\b/i,
    // «lo guardo», «lo anoté». Las formas de PASADO van acentuadas a propósito:
    // «que lo guarde» es un ofrecimiento, no una afirmación, y no cuenta.
    /\b(?:lo|la|los|las)\s+(?:guardo|anoto|apunto|guardé|anoté|apunté)(?![a-záéíóúñ])/i,
    /\bya\s+(?:lo|la|los|las)\s+(?:tengo\s+)?(?:guardad|anotad|apuntad|registrad|guardé|anoté|apunté)/i,
  ];
  /* La negación gana SIEMPRE. «No lo tengo guardado» y «eso no está anotado»
     son respuestas honestas, y hacerlas pasar por esta guarda sería castigar
     justo lo que se le pide. Igual una pregunta: «¿quiere que lo guarde?» es
     un ofrecimiento. */
  const NIEGA = /\bno\s+(?:\S+\s+){0,3}?(?:qued|guard|anot|apunt|registr|est[aá]|aparece|tengo|hay)/i;
  const dijoQueGuardo = (t) => String(t).split(/(?<=[.!?\n])\s+/).some((f) => {
    const frase = f.trim();
    return frase && !NIEGA.test(frase) && !/^[¿?]/.test(frase) && APUNTA_RE.some((r) => r.test(frase));
  });
  const GUARDAR = new Set(['recordar', 'anotar_pendiente', 'cerrar_pendiente', 'crear_documento']);
  const guardoDeVerdad = () => usadas.some((h) => GUARDAR.has(h.nombre));
  if (dijoQueGuardo(textoFinal) && !guardoDeVerdad() && hayTiempoParaGuarda('lo que dijo que guardó')) {
    emitir('pensando', { vuelta: MAX_VUELTAS, motivo: 'dijo que lo guardó sin guardarlo' });
    mensajes.push({ role: 'assistant', content: textoFinal });
    mensajes.push({ role: 'user', content: '[sistema] Dijiste que lo guardabas o lo anotabas y NO llamaste a ninguna herramienta, '
      + 'así que no quedó en ningún lado y dentro de diez turnos ese dato no va a existir. '
      + 'Llamá AHORA a `recordar` si es algo que hay que tener presente, o a `anotar_pendiente` si es algo que hay que hacer. '
      + 'Después contestá en una línea. Si de verdad no había nada que guardar, decilo — pero no digas que lo guardaste.' });
    let dicho = '';
    const r = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas }), stream: true, options: opciones }, { alTrozo: (t) => { dicho += t; } });
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
    const llamadas = [...r.tool_calls, ...llamadasEnTexto(r.content).llamadas];
    if (llamadas.length) {
      mensajes.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined });
      for (const res of await correrLote(llamadas, { ctx, usadas, emitir })) {
        mensajes.push({ role: 'tool', content: recortar(res.salida, TOPE_RESULTADO), tool_name: res.nombre });
      }
      const r2 = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas }), stream: true, options: opciones }, { alTrozo: () => {} });
      uso.entrada += r2.uso.entrada; uso.salida += r2.uso.salida;
      const limpio = llamadasEnTexto(r2.content).limpio.trim();
      if (limpio) { textoFinal = limpio; emitir('reemplazo', { texto: textoFinal }); }
    } else if (dicho.trim()) {
      textoFinal = llamadasEnTexto(dicho).limpio.trim() || textoFinal;
      emitir('reemplazo', { texto: textoFinal });
    }
  }
  /* Y si aun así sigue diciendo que lo guardó sin haberlo guardado, se le
     añade la verdad: es preferible que la junta sepa que NO quedó anotado a
     que lo dé por hecho y lo descubra dentro de una semana. Corre siempre,
     haya habido segundo intento o no. */
  if (dijoQueGuardo(textoFinal) && !guardoDeVerdad()) {
    console.warn('[nodo] dijo que lo guardaba y no llamó a recordar ni a anotar_pendiente: se corrige el texto');
    textoFinal = `${textoFinal}\n\n_(Aviso: NO quedó guardado — no llegué a anotarlo. Pídamelo otra vez y lo dejo en la memoria.)_`;
    emitir('reemplazo', { texto: textoFinal });
  }

  /* Y AUNQUE NO HAYA HABIDO TIEMPO DE INTENTARLO, LA MENTIRA NO SE PUBLICA.
     Esto vivía DENTRO de la guarda de arriba, o sea que si la guarda no corría
     —porque se acabó el presupuesto del turno— la promesa falsa salía a
     pantalla tal cual. Corregir el texto no cuesta ni una llamada al modelo:
     corre SIEMPRE, haya habido segundo intento o no. Si prometió un documento
     y no está, se dice lo que hay. */
  if (PROMETE.test(textoFinal) && !cumplio()) {
    console.warn(`[nodo] prometió ${pidioPdf ? 'un PDF' : 'un documento'} y no lo dejó: se corrige el texto`);
    /* Y se dice lo que DE VERDAD pasó, que no es lo mismo: si el documento
       quedó escrito, decir «no pude» sería tirar el trabajo hecho. */
    textoFinal = creoDoc()
      ? 'Escribí el documento y quedó en la biblioteca, pero no logré dejarlo en PDF. Pídame el PDF otra vez y lo saco de ahí.'
      : 'No pude armar el documento en este turno. Pídamelo otra vez y lo escribo completo.';
    emitir('reemplazo', { texto: textoFinal });
  }

  /* LA GUARDA DE LAS CITAS. 5-sep, primera prueba real: «El oro cerró hoy a
     US$ 4,435 (según buscar_web)» — y buscar_web no se había llamado. El
     número venía del estado vivo y la fuente era inventada. Un modelo chico
     hace esto, y no se arregla pidiéndole por favor: se mira si citó una
     herramienta que no corrió, y si lo hizo se le devuelve UNA vez para que
     la llame o quite la cita. Si reincide, la cita se marca en el texto para
     que la persona lo vea. */
  // Solo las de internet: el estado vivo y el saber SÍ van en el prompt, así
  // que citarlos sin llamarlos es correcto. Una búsqueda, no.
  const CITA = /seg[uú]n\s+[`«"']?(buscar_web|leer_pagina)[`»"']?/gi;
  const citadas = [...new Set([...textoFinal.matchAll(CITA)].map((m) => m[1].toLowerCase()))];
  const corridas = new Set(usadas.map((h) => h.nombre));
  const falsas = citadas.filter((c) => !corridas.has(c));
  /* Sin tiempo no se le devuelve —son dos llamadas más— pero la cita falsa NO
     se publica limpia: se marca abajo igual, que es lo que de verdad protege a
     quien lee. */
  if (falsas.length && !hayTiempoParaGuarda('las citas')) {
    textoFinal += `\n\n_(ULTRON citó ${falsas.join(', ')} sin haberla usado en este turno: tome ese dato con cuidado.)_`;
  } else if (falsas.length) {
    emitir('pensando', { vuelta: MAX_VUELTAS, motivo: 'cita sin herramienta' });
    mensajes.push({ role: 'assistant', content: textoFinal });
    mensajes.push({ role: 'user', content: `[sistema] Citaste «${falsas.join('», «')}» pero no la llamaste en este turno. Llamala ahora y contestá con lo que devuelva, o reescribí la respuesta sin esa cita diciendo de dónde sale de verdad el dato.` });
    let dicho = '';
    const r = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas }), stream: true, options: opciones }, { alTrozo: (t) => { dicho += t; } });
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida;
    const enTexto = llamadasEnTexto(r.content);
    const llamadas = [...r.tool_calls, ...enTexto.llamadas];
    if (llamadas.length) {
      mensajes.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined });
      /* Acá el lote va con `usadas` vacío a propósito: si el modelo cita
         buscar_web sin haberla corrido, se le está pidiendo justamente que la
         corra. Pasarle la lista del turno haría que se le devolviera «ya
         consultado» y la cita seguiría siendo falsa. */
      for (const res of await correrLote(llamadas, { ctx, usadas: [], emitir })) {
        usadas.push({ nombre: res.nombre, entrada: res.entrada, salida: res.salida.slice(0, 2000) });
        mensajes.push({ role: 'tool', content: recortar(res.salida, TOPE_RESULTADO), tool_name: res.nombre });
      }
      const r2 = await pedirDelTurno({ model: MODELO, messages: mensajes, tools: herramientas.paraOllama({ cajas }), stream: true, options: opciones }, { alTrozo: (t) => {} });
      uso.entrada += r2.uso.entrada; uso.salida += r2.uso.salida;
      dicho = llamadasEnTexto(r2.content).limpio;
    } else dicho = enTexto.limpio;
    if (dicho.trim()) { textoFinal = dicho.trim(); emitir('reemplazo', { texto: textoFinal }); }
    // Si aun así cita lo que no corrió, se marca: la persona tiene que verlo.
    const todavia = [...textoFinal.matchAll(CITA)].map((m) => m[1].toLowerCase()).filter((c) => !new Set(usadas.map((h) => h.nombre)).has(c));
    if (todavia.length) textoFinal += `\n\n_(ULTRON citó ${todavia.join(', ')} sin haberla usado en este turno: tome ese dato con cuidado.)_`;
  }
  textoFinal = sinRepetidos(sinCodigoPegadoArriba(sinElRestoDeUnaHerramienta(textoFinal)));
  if (!textoFinal.trim()) textoFinal = 'Revisé lo que me pidió y no me salió una respuesta con palabras. Le pido que me lo plantee de otra forma.';

  const vistas = new Set();
  const fuentes = ctx.fuentes.filter((f) => !vistas.has(f.id) && vistas.add(f.id));
  // En el nodo pensar no cuesta por ficha: la tarjeta ya está pagada. Cero es
  // el número honesto, y se anota igual para contar los turnos.
  memoria.anotarGasto({ miembro: miembro.correo, modelo: 'nodo:' + MODELO, ...uso, dolares: 0, canal: ctx.canal || 'panel' })
    .catch((e) => console.error(`[gasto] ${e.message}`));
  return { texto: textoFinal, fuentes, herramientas: usadas, memorias: ctx.memorias, documentos: ctx.documentos,
           envios: ctx.envios, pendientes: ctx.pendientes, acciones: ctx.acciones, uso: { ...uso, dolares: 0 }, modelo: 'nodo:' + MODELO,
           ms: { contexto: msContexto, primera: msPrimera, cerebro: Date.now() - tArranque, vueltas: vueltasDadas, fichas: uso.entrada } };
}

/** Un título corto, sin herramientas y con pocas fichas. */
/* ── CALENTAR LA CACHÉ MIENTRAS LA PERSONA TODAVÍA HABLA ────────────────────
 *
 * Medido contra producción el 6-sep, con la misma pregunta: con la caché de
 * prefijo FRÍA la primera palabra tarda 6,5 s; con la caché CALIENTE, 1,0 s.
 * Seis veces, y la diferencia entera está en evaluar el prompt.
 *
 * Cuando alguien abre el micrófono, el motor está parado y quedan tres o
 * cuatro segundos de persona hablando en los que no hace nada. Eso es
 * exactamente lo que se tarda en evaluar el prompt. Así que se manda a
 * evaluarlo YA, con `num_predict: 1`: cuando llegue la pregunta de verdad, el
 * prefijo ya está en la caché del motor y la primera palabra sale de una.
 *
 * Se manda solo la parte QUIETA del prompt —identidad, lecciones, memoria,
 * pendientes, con quién habla— porque es un prefijo válido y completo del
 * prompt real: el saber de la pregunta, el estado vivo y la hora van detrás y
 * todavía no se saben. Y con las MISMAS herramientas, que también viajan en la
 * plantilla y también cuentan.
 *
 * Si sale mal no pasa nada: es una optimización, no una función. Quien la
 * llama no espera la respuesta.
 */
async function precalentar({ miembro, junta, sistema, modo = 'voz', alias = null }) {
  if (!encendido()) return { ok: false, motivo: 'nodo apagado' };
  const t0 = Date.now();
  const [memorias, estadoVivo, abiertos] = await Promise.all([
    memoria.memoriasDe(miembro.correo, { limite: modo === 'voz' ? MEMORIAS_VOZ : 30 }),
    vivo.leerRapido(),
    memoria.pendientes({ limite: modo === 'voz' ? PENDIENTES_VOZ : 25 }),
  ]);
  const bloques = sistema({ miembro, memorias, estadoVivo, secciones: [], vozCasa: saber.vozDeLaCasa().slice(0, 6), pendientes: abiertos, chico: true, modo, alias });
  /* Hasta el bloque quieto y ni una letra más: lo de después cambia con la
     pregunta, y mandarlo aquí calentaría un prefijo que no va a coincidir. */
  const hastaQuieto = [];
  for (const b of bloques) { hastaQuieto.push(b.text); if (b.quieto) break; }
  const system = hastaQuieto.join('\n\n');
  /* CON UNA PREGUNTA MÍNIMA DETRÁS, y no por gusto: un /api/chat con SOLO un
     mensaje de sistema lo rechaza el motor (502 · MODELO), así que la primera
     versión de esto no calentó nada en producción y solo dejó una línea en el
     registro diciéndolo. La pregunta va DESPUÉS del sistema, o sea fuera del
     prefijo que se comparte con el turno de verdad: no lo acorta ni un byte. */
  await pedir({
    model: MODELO, stream: false,
    messages: [{ role: 'system', content: system }, { role: 'user', content: '.' }],
    tools: herramientas.paraOllama({ cajas: [] }),
    options: { num_predict: 1, temperature: 0, num_ctx: CTX },
  }, { plazo: 20_000 });
  return { ok: true, ms: Date.now() - t0, fichas: fichas(system) };
}

/* ── EL RESUMEN DEL HILO ─────────────────────────────────────────────────────
 *
 * 7-sep, medido contra producción. Se le dijo en el turno 1: «al agente de
 * Choluteca lo llamamos Mario Velásquez, cupo 3.500 lempiras». Diez turnos de
 * relleno. Turno 14: «¿cómo se llama el agente de Choluteca?». No se acordaba.
 *
 * Y no era el modelo: era que al prompt solo van los últimos ocho turnos y lo
 * de más atrás SE TIRABA. Ocho son los que caben —cada turno viejo son fichas
 * que el modelo evalúa antes de decir la primera palabra— así que la respuesta
 * no es meter más, es no perder lo que sale.
 *
 * Esto corre DESPUÉS de contestar, nunca antes: a la persona no le cuesta ni
 * un segundo. Y el resumen no crece — cuando pasa de su tope se vuelve a
 * resumir sobre sí mismo—, o sea que una conversación de doscientos turnos
 * cuesta en fichas lo mismo que una de veinte.
 *
 * Lo que se le pide es lo contrario de un resumen bonito: NOMBRES, CIFRAS,
 * FECHAS y DECISIONES. Un resumen que dice «se habló de logística» no sirve
 * para nada; el que dice «agente de Choluteca: Mario Velásquez, cupo 3.500»
 * es justo el que hacía falta. */
async function resumirHilo({ previa, voz = false, senalCorte = null } = {}) {
  const turnos = previa?.turnos || [];
  const ventana = voz ? VENTANA_HILO_VOZ : VENTANA_HILO;
  const hechos = Number(previa?.resumidos || 0);
  /* Se resume lo que YA salió de la ventana, no lo que está por salir: si se
     adelantara, el mismo turno estaría en el resumen y en el hilo, y el modelo
     lo leería dos veces. */
  const hasta = turnos.length - ventana;
  if (hasta <= hechos) return null;
  /* ── SE EMPIEZA POR LO NUEVO, NO POR LO VIEJO ──────────────────────────
     La primera versión resumía de a ocho DESDE lo más antiguo, y con una
     conversación de cien turnos atrasados se quedaba arrastrándose por lo de
     la mañana mientras lo de hace cinco minutos se perdía. Medido contra
     producción: el resumen decía «Agente de Choluteca: Mario Velásquez» —de
     tres rondas antes— y del dato de hacía diez turnos no había ni rastro.

     Lo que importa de una conversación es lo RECIENTE. Así que se toman
     siempre los últimos que salieron de la ventana, y lo de más atrás se da
     por perdido de una vez en lugar de bloquear la cola. En marcha normal no
     se salta nada —salen dos turnos por pregunta y caben de sobra—; el salto
     solo pasa la primera vez, o después de un rato largo sin resumir. */
  const desde = Math.max(hechos, hasta - RESUMIR_DE_UNA_VEZ);
  if (desde > hechos) console.warn(`[nodo] resumen muy atrasado: se saltan ${desde - hechos} turnos viejos y se resume lo reciente`);
  const nuevos = turnos.slice(desde, hasta);
  if (!nuevos.length) return null;

  const anterior = String(previa?.resumen || '').trim();
  const transcripcion = nuevos
    .map((t) => `${t.rol === 'miembro' ? 'ÉL' : 'VOS'}: ${recortar(String(t.texto || ''), 700)}`)
    .join('\n');
  const orden = [
    'Escribí en español, en tercera persona y en frases cortas, lo que hay que RECORDAR de este pedazo de conversación.',
    'Guardá SIEMPRE: nombres propios, cifras, fechas, cupos, acuerdos y decisiones. Con sus palabras exactas cuando sean datos.',
    'Tirá el relleno: saludos, cortesías, y cualquier dato que se pueda volver a mirar con una herramienta (precios, alturas de bloque, saldos).',
    'No inventes nada que no esté escrito. Si no hay nada que valga la pena, escribí solo: NADA.',
    `Máximo ${Math.floor(TOPE_RESUMEN / 6)} palabras.`,
  ].join(' ');
  const cuerpo = anterior
    ? `Lo que ya venía anotado de esta conversación:\n${anterior}\n\nY esto es lo que siguió:\n${transcripcion}\n\n${orden} Devolvé UNA sola lista, la de antes y la de ahora juntas, sin repetir.`
    : `${transcripcion}\n\n${orden}`;
  try {
    const r = await pedir({ model: MODELO, stream: false,
      options: { temperature: 0.2, num_predict: Math.floor(TOPE_RESUMEN / 4) },
      messages: [{ role: 'user', content: cuerpo }] }, { plazo: 45_000, senalCorte });
    let texto = hastaOtroAlfabeto(llamadasEnTexto(r.content || '').limpio).trim();
    if (!texto || /^nada\b/i.test(texto)) {
      /* «NADA» no es un fallo: es que ese pedazo no traía nada que guardar. Se
         apunta igual hasta dónde se llegó, o se volvería a resumir lo mismo en
         cada turno para siempre. */
      return { resumen: anterior, resumidos: hasta, fichas: r.uso?.entrada || 0, vacio: true };
    }
    /* Se corta por la ultima linea entera, no a media palabra: el resumen se
       le da al modelo como hechos, y medio hecho es peor que ninguno. */
    if (texto.length > TOPE_RESUMEN) {
      const corte = texto.lastIndexOf('\n', TOPE_RESUMEN);
      texto = texto.slice(0, corte > TOPE_RESUMEN / 2 ? corte : TOPE_RESUMEN).trim();
    }
    return { resumen: texto, resumidos: hasta, fichas: r.uso?.entrada || 0 };
  } catch (e) {
    /* Que falle el resumen NO puede romper nada: la conversación sigue con su
       ventana de ocho, que es lo que había antes de todo esto. Se reintenta
       solo en el turno siguiente porque `resumidos` no se movió.
       Y el fallo NORMAL es el bueno: llegó otra pregunta y se cortó para
       dejarle la ranura. Eso no se escribe en rojo. */
    if (senalCorte?.aborted || e?.codigo === 'CORTADO') return null;
    console.warn(`[nodo] no se pudo resumir el hilo: ${e?.codigo || ''} ${String(e?.message || e).slice(0, 90)}`);
    return null;
  }
}

async function titular(texto) {
  try {
    const r = await pedir({ model: MODELO, stream: false, options: { temperature: 0.2, num_predict: 24 },
      messages: [{ role: 'user', content: `Título de máximo seis palabras, en español, sin comillas ni punto final, para una conversación que empieza así:\n\n${texto.slice(0, 400)}\n\nSolo el título.` }] },
      { plazo: 30_000 });
    /* EL TÍTULO TAMBIÉN SE VA A OTRO ALFABETO. Visto en vivo el 5-sep:
       «Consultas ORIGEN y pendientes сегодня不宜继续用西班牙语回答». La guarda
       del idioma vigilaba la RESPUESTA y no el título, que se pide aparte —
       y el título es lo que la junta ve en la lista de conversaciones para
       siempre. Se corta donde empieza el otro alfabeto; si lo que queda no
       llega a dos palabras no se fuerza un título malo: se devuelve null y
       quien llama pone el suyo. */
    const crudo = (r.content || '').split('\n')[0].replace(/^["«»]+|["«»]+$/g, '').trim();
    const limpio = hastaOtroAlfabeto(crudo).trim().replace(/[\s,;:·—-]+$/, '');
    if (limpio.split(/\s+/).filter(Boolean).length < 2) return null;
    return limpio.slice(0, 80) || null;
  } catch { return null; }
}

/** ¿El motor contesta? Para /salud y para el punto del panel. */
async function salud() {
  if (!encendido()) return { vivo: false, porQue: 'sin URL o secreto' };
  return new Promise((resolver) => {
    let u; try { u = new URL(URL_NODO + '/salud'); } catch { return resolver({ vivo: false, porQue: 'URL mala' }); }
    const seguro = u.protocol === 'https:';
    const opciones = { method: 'GET', hostname: u.hostname, port: u.port || (seguro ? 443 : 80), path: u.pathname, headers: { 'x-ultron-secreto': SECRETO }, timeout: 8000 };
    if (seguro && CERT) opciones.ca = CERT;
    const req = (seguro ? https : http).request(opciones, (res) => {
      let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { try { const j = JSON.parse(t); resolver({ vivo: res.statusCode === 200 && !!j.ok, ...j }); } catch { resolver({ vivo: false, porQue: `contestó ${res.statusCode}` }); } });
    });
    req.on('timeout', () => { req.destroy(); resolver({ vivo: false, porQue: 'no contesta a tiempo' }); });
    req.on('error', (e) => resolver({ vivo: false, porQue: e.code || e.message }));
    req.end();
  });
}

module.exports = { pensar, precalentar, titular, resumirHilo, salud, encendido, MODELO, _adentro: { pedir, pedirJson, vectorDe, llamadasEnTexto, armarMensajes, sinRepetidos, sinElRestoDeUnaHerramienta, sinCodigoPegadoArriba, hastaOtroAlfabeto, dondeEmpiezaElBucle, fichas, PRESUPUESTO, PRESUPUESTO_FICHAS, CTX, presupuestoMs, GUARDA_NECESITA_MS, VENTANA_HILO, VENTANA_HILO_VOZ, TOPE_RESUMEN } };
