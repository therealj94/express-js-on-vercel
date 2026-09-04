/* Elegir y DESCARTAR un RPC.
 *
 *   node pruebas/probar-proveedores.mjs
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * El 4 de septiembre, con el vigía externo recién desplegado, Ethereum y BSC
 * llevaban horas sin ver un solo bloque. Los nodos no estaban caídos: a
 * `eth_chainId` contestaban al instante y por la cadena correcta, así que
 * pasaban la puerta de proveedores.js y se quedaban elegidos cinco minutos.
 * Lo que rechazaban era el `eth_getLogs`:
 *
 *   403 · {"code":-32602,"message":"Archive requests require a personal token"}
 *
 * Sirvo la punta, no sirvo historia. Y como el único criterio para cambiar de
 * nodo era «no contesta», el vigía se quedaba pegado al que lo rechazaba y
 * fallaba cada treinta segundos, en silencio, para siempre. La lista de
 * respaldo estaba escrita y no servía de nada, porque nadie podía llegar a
 * ella.
 *
 * Lo que se prueba acá es la pieza que faltaba: que quien USA el proveedor
 * —el único que sabe si de verdad le sirvió— pueda decir «este no» y que la
 * llamada siguiente elija OTRO. Y que el castigo ordene sin excluir: si todos
 * están castigados hay que reintentar igual, porque quedarse sin cadena es
 * peor que insistirle a uno que quizá ya se recuperó.
 *
 * No se toca la red: los proveedores se fingen. Lo que se mide es la lógica de
 * elección, no si publicnode está de pie hoy.
 */

// Un RPC propio en el entorno se colaría al principio de cada lista y correría
// las posiciones que estas pruebas cuentan. Se quitan ANTES de cargar el
// módulo, que lee las variables al importarse.
for (const k of ['RPC_POLYGON', 'RPC_BSC', 'RPC_ETHEREUM', 'OG_CHAIN_PROVIDER']) delete process.env[k];
process.env.RPC_CASTIGO_MS = '150';

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const proveedores = require('../lib/proveedores.js');
const { _adentro } = proveedores;

/* El mismo decir/comprobar que las otras suites de esta carpeta. No es
   cosmético: `bin/desplegar.sh` y `bin/desplegar.mjs` cuentan los «Todo en
   verde» para decir cuántas suites pasaron, y una suite que habla de otra
   forma no se cuenta — y entonces nadie nota el día que deja de correr. */
let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

/** Deja el módulo como recién cargado. */
function limpio() {
  _adentro.recordado.clear();
  _adentro.castigados.clear();
}

/** Un proveedor fingido, metido a mano en la memoria del módulo. */
function elegido(red, url) {
  _adentro.recordado.set(Number(red), { pv: { finge: url }, en: Date.now(), url });
}

decir('descartar olvida el elegido y dice cuál era');
{
  limpio();
  elegido(1, 'https://uno.example');
  const fuera = proveedores.descartar(1);
  comprobar(fuera === 'https://uno.example', 'devuelve la URL que se descartó', String(fuera));
  comprobar(_adentro.recordado.has(1) === false, 'y ya no hay ninguno elegido para esa cadena');
}

decir('y lo castiga, para que el reintento inmediato NO lo vuelva a elegir');
{
  limpio();
  elegido(1, 'https://uno.example');
  proveedores.descartar(1);
  /* Sin el castigo, `descartar` solo borraría la memoria y la línea siguiente
     elegiría otra vez al mismo — un bucle, no un respaldo. Es lo que hacía
     inútil la lista de reserva: estaba escrita y no se llegaba a ella. */
  comprobar(_adentro.castigado('https://uno.example') === true,
    'el descartado queda castigado un rato');
}

decir('descartar una cadena sin nadie elegido no revienta');
{
  limpio();
  // Descartar es lo que se hace cuando algo YA salió mal. Una excepción acá
  // taparía el error de verdad con uno peor.
  comprobar(proveedores.descartar(56) === null, 'devuelve null y sigue');
}

decir('el castigo se vence solo');
{
  limpio();
  elegido(1, 'https://uno.example');
  proveedores.descartar(1);
  comprobar(_adentro.castigado('https://uno.example') === true, 'castigado al principio');
  await new Promise((r) => setTimeout(r, 200));   // RPC_CASTIGO_MS = 150 en esta prueba
  comprobar(_adentro.castigado('https://uno.example') === false,
    'y se le perdona: casi todos estos rechazos son límites por minuto, no políticas. '
    + 'Un castigo eterno regalaría el mejor nodo de una cadena por un tropiezo');
}

decir('descartar dos veces seguidas castiga a los DOS, no solo al último');
{
  limpio();
  const lista = proveedores.REDES[1].rpcs;
  elegido(1, lista[0]);
  proveedores.descartar(1);
  elegido(1, lista[1]);
  proveedores.descartar(1);
  // Es el caso de verdad: el vigía prueba uno, lo rechazan, prueba el
  // siguiente, también lo rechazan. Si el primer castigo se perdiera al poner
  // el segundo, la vuelta siguiente volvería al primero y no avanzaría nunca.
  comprobar(_adentro.castigado(lista[0]) === true, `sigue castigado ${lista[0]}`);
  comprobar(_adentro.castigado(lista[1]) === true, `y también ${lista[1]}`);
}

decir('el orden de intento pone a los castigados al final, pero NO los saca');
{
  limpio();
  const lista = proveedores.REDES[137].rpcs;
  comprobar(lista.length >= 2, 'Polygon tiene más de un RPC', `son ${lista.length}`);
  elegido(137, lista[0]);
  proveedores.descartar(137);

  // Se reconstruye el mismo orden que arma proveedorDe, sin tocar la red.
  const orden = [...lista.filter((u) => !_adentro.castigado(u)), ...lista.filter(_adentro.castigado)];
  comprobar(orden[orden.length - 1] === lista[0], 'el castigado va al final', orden.join(' · '));
  comprobar(orden.length === lista.length,
    'y sigue en la lista: si todos están castigados hay que reintentar igual, '
    + 'porque quedarse sin cadena es peor que insistirle a uno que quizá ya se recuperó',
    `${orden.length} de ${lista.length}`);
}

decir('enUso enseña los castigados, para que el panel explique el cambio');
{
  limpio();
  const primero = proveedores.REDES[137].rpcs[0];
  elegido(137, primero);
  proveedores.descartar(137);
  const u = proveedores.enUso();
  comprobar(u[137].url === null, 'ya no hay ninguno elegido');
  comprobar(JSON.stringify(u[137].castigados) === JSON.stringify([primero]),
    'y se ve cuál está castigado: sin esto el panel diría «usando el segundo '
    + 'de la lista» y nadie sabría por qué no está usando el primero',
    JSON.stringify(u[137].castigados));
}

decir('cada cadena que recibe USDT tiene al menos un respaldo');
{
  // Una lista de uno hace que `descartar` no tenga a dónde ir: se descarta, se
  // vuelve a pedir, dan el mismo, y el respaldo es una promesa vacía. Es
  // exactamente la situación que dejó a Ethereum ciego.
  for (const id of [137, 56, 1]) {
    const n = proveedores.REDES[id].rpcs.length;
    comprobar(n >= 2, `${proveedores.REDES[id].nombre} tiene respaldo`, `solo ${n} RPC`);
  }
}

decir('un RPC propio del entorno manda: va primero');
{
  /* Es la salida cuando los públicos no alcanzan —Ethereum sin nodo de
     archivo—, así que tiene que ganarle a la lista de por omisión. Se
     comprueba en un proceso aparte porque las listas se arman al importar el
     módulo, y este ya está importado sin la variable. */
  const { execFileSync } = require('node:child_process');
  const salida = execFileSync(process.execPath, ['-e',
    "console.log(require('./lib/proveedores.js').REDES[1].rpcs[0])"],
    { env: { ...process.env, RPC_ETHEREUM: 'https://mio.example' }, encoding: 'utf8' });
  comprobar(salida.trim() === 'https://mio.example',
    'con RPC_ETHEREUM puesto, ese es el primero que se prueba', salida.trim());
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
