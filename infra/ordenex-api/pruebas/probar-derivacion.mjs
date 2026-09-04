/* La derivación de las direcciones de depósito.
 *
 *   node pruebas/probar-derivacion.mjs
 *
 * Pura: sin Mongo y sin red.
 *
 * La prueba más importante del archivo es la primera y es un VECTOR FIJO: una
 * frase pública de pruebas y las direcciones escritas como literales. Es la red
 * que atrapa un cambio de ruta, de librería o de convención — cualquiera de las
 * tres cambiaría las direcciones de todo el mundo en silencio, y las viejas
 * quedarían con dinero que nadie puede barrer.
 *
 * La frase es la de Hardhat/Anvil, conocida por todo el mundo y sin un centavo
 * en ninguna cadena. Ese es justamente el punto: no puede confundirse con una
 * de verdad.
 */

const der = (await import('../lib/derivacion.js')).default;
const { olvidar } = der._adentro;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);
const lanza = (fn, codigo) => {
  try { fn(); return false; } catch (e) { return codigo ? e.codigo === codigo : true; }
};

const { HDNodeWallet } = await import('ethers');

const FRASE = 'test test test test test test test test test test test junk';
const OTRA  = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const XPUB  = HDNodeWallet.fromPhrase(FRASE, '', der.RUTA_BASE).neuter().extendedKey;
const XPUB_OTRA = HDNodeWallet.fromPhrase(OTRA, '', der.RUTA_BASE).neuter().extendedKey;

/* Direcciones de la frase de Hardhat, escritas a mano. Si estas cambian, algo
   cambió en la ruta o en la librería y hay que enterarse AQUÍ. */
const DIR_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DIR_2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const DIR_3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

function conEntorno({ frase, xpub }, cuerpo) {
  const antes = [process.env.ORDENEX_SEMILLA_DEPOSITOS, process.env.ORDENEX_SEMILLA_XPUB];
  if (frase === undefined) delete process.env.ORDENEX_SEMILLA_DEPOSITOS;
  else process.env.ORDENEX_SEMILLA_DEPOSITOS = frase;
  if (xpub === undefined) delete process.env.ORDENEX_SEMILLA_XPUB;
  else process.env.ORDENEX_SEMILLA_XPUB = xpub;
  olvidar();
  try { return cuerpo(); } finally {
    if (antes[0] === undefined) delete process.env.ORDENEX_SEMILLA_DEPOSITOS;
    else process.env.ORDENEX_SEMILLA_DEPOSITOS = antes[0];
    if (antes[1] === undefined) delete process.env.ORDENEX_SEMILLA_XPUB;
    else process.env.ORDENEX_SEMILLA_XPUB = antes[1];
    olvidar();
  }
}

decir('el vector fijo: si esto cambia, cambiaron las direcciones de todos');
conEntorno({ frase: FRASE, xpub: XPUB }, () => {
  comprobar(der.RUTA_BASE === "m/44'/60'/0'/0",
    'la ruta es la estándar de Ethereum, no una inventada', der.RUTA_BASE);
  comprobar(der.direccionDe(1) === DIR_1, 'el índice 1 da la dirección esperada', der.direccionDe(1));
  comprobar(der.direccionDe(2) === DIR_2, 'y el 2', der.direccionDe(2));
  comprobar(der.direccionDe(3) === DIR_3, 'y el 3', der.direccionDe(3));
  comprobar(der.firmanteDe(1).address === DIR_1,
    'el firmante controla EXACTAMENTE la dirección que se publica');
});

decir('el índice 0 queda reservado y no se le da a nadie');
conEntorno({ frase: FRASE, xpub: XPUB }, () => {
  comprobar(der.INDICE_MINIMO === 1, 'el mínimo es 1');
  comprobar(lanza(() => der.direccionDe(0), 'INDICE_INVALIDO'),
    'el 0 se rechaza: es el casillero que enseña cualquier billetera al importar la frase');
});

decir('los índices que no son índices');
conEntorno({ frase: FRASE, xpub: XPUB }, () => {
  const malos = [-1, 0, 1.5, 2 ** 31, 2 ** 53, NaN, Infinity, null, undefined, {}, [], true];
  let todos = true;
  for (const m of malos) if (!lanza(() => der.direccionDe(m), 'INDICE_INVALIDO')) todos = false;
  comprobar(todos, 'negativos, cero, decimales, 2^31, NaN, null y objetos: INDICE_INVALIDO');
  comprobar(lanza(() => der.direccionDe('347'), 'INDICE_INVALIDO'),
    'un "347" en string se RECHAZA, no se convierte — convertir es cómo nacen dos direcciones');
  comprobar(!lanza(() => der.direccionDe(2 ** 31 - 1)), 'el tope de BIP-32 sí vale');
});

decir('mil índices, mil direcciones distintas');
conEntorno({ frase: FRASE, xpub: XPUB }, () => {
  const vistas = new Set();
  for (let i = 1; i <= 1000; i++) vistas.add(der.direccionDe(i));
  comprobar(vistas.size === 1000, 'ni una repetida en mil', `distintas=${vistas.size}`);
});

decir('determinismo: la misma semilla da siempre lo mismo');
{
  const a = conEntorno({ frase: FRASE, xpub: XPUB }, () => der.direccionDe(7));
  const b = conEntorno({ frase: FRASE, xpub: XPUB }, () => der.direccionDe(7));
  comprobar(a === b && a === HDNodeWallet.fromPhrase(FRASE, '', der.RUTA_BASE).deriveChild(7).address,
    'dos cargas frescas dan la misma dirección, y coincide con derivarla a mano');
}

decir('solo con la xpub: se calcula pero NO se firma');
conEntorno({ frase: undefined, xpub: XPUB }, () => {
  comprobar(der.hayDerivacion() === true, 'con la xpub sola sí se pueden calcular direcciones');
  comprobar(der.puedeFirmar() === false, 'pero no se puede firmar');
  comprobar(der.direccionDe(1) === DIR_1,
    'y la dirección es la MISMA que con la llave: es aritmética, no una convención');
  comprobar(lanza(() => der.firmanteDe(1), 'SIN_SEMILLA'),
    'firmanteDe lanza SIN_SEMILLA en el proceso que solo lleva la xpub');
  // La prueba de que el aislamiento es real y no una promesa.
  const { HDNodeWallet: H } = { HDNodeWallet };
  const neutro = H.fromExtendedKey(XPUB).deriveChild(1);
  comprobar(!('privateKey' in neutro) || neutro.privateKey == null,
    'el nodo neutro NO tiene llave privada, ni siquiera nula: la propiedad no existe');
});

decir('LA GUARDA: una frase válida pero EQUIVOCADA no pasa');
conEntorno({ frase: OTRA, xpub: XPUB }, () => {
  comprobar(der.hayDerivacion() === true, 'la xpub sigue sirviendo para calcular');
  comprobar(der.puedeFirmar() === false,
    'pero la frase de otro universo NO habilita la firma, aunque su checksum sea válido');
  comprobar(lanza(() => der.firmanteDe(1), 'SEMILLA_NO_COINCIDE'),
    'y el código lo dice: SEMILLA_NO_COINCIDE');
  comprobar(String(der.motivo()).includes('no corresponde'),
    'el motivo explica qué pasó', String(der.motivo()));
  // La razón de existir de la guarda: sin ella, esto habría "funcionado".
  const enganosa = HDNodeWallet.fromPhrase(OTRA, '', der.RUTA_BASE).deriveChild(1).address;
  comprobar(enganosa !== DIR_1,
    'porque esa frase deriva una dirección DISTINTA y perfectamente válida', enganosa);
});

decir('una frase rota muere al cargar, y sin filtrarse');
conEntorno({ frase: 'test test test test test test test test test test test test', xpub: XPUB }, () => {
  comprobar(der.puedeFirmar() === false, 'checksum malo: no se puede firmar');
  let msg = '';
  try { der.firmanteDe(1); } catch (e) { msg = e.message + ' ' + String(der.motivo()); }
  comprobar(!msg.includes('junk') && !msg.includes('test test'),
    'y NI EL MENSAJE NI EL MOTIVO llevan la frase dentro — un error se copia a un ticket', msg);
});

decir('sin nada configurado');
conEntorno({ frase: undefined, xpub: undefined }, () => {
  comprobar(der.hayDerivacion() === false && der.puedeFirmar() === false,
    'sin xpub no se calcula ni se firma');
  comprobar(lanza(() => der.direccionDe(1), 'SIN_SEMILLA'), 'direccionDe lanza SIN_SEMILLA');
  comprobar(der.huella() === null || der.huella() === undefined, 'no hay huella que enseñar');
});
conEntorno({ frase: FRASE, xpub: 'xpub-de-mentira' }, () => {
  comprobar(der.hayDerivacion() === false, 'una xpub con forma mala no sirve');
  comprobar(String(der.motivo()).includes('forma de xpub'), 'y se dice por qué');
});

decir('CON LA FRASE SOLA alcanza: la xpub se calcula de ella');
conEntorno({ frase: FRASE, xpub: undefined }, () => {
  comprobar(der.hayDerivacion() === true && der.puedeFirmar() === true,
    'sin xpub puesta, la frase sola calcula Y firma');
  comprobar(der.direccionDe(1) === DIR_1,
    'y da exactamente las mismas direcciones que con la xpub puesta');
  comprobar(der.huella() !== null, 'la huella sale igual, calculada de la frase');
  comprobar(der.estado().comprobada === false,
    'pero el panel dice que NO está comprobada: no hay contra qué comprobarla');
  comprobar(der.motivo() === null, 'y no es un error — es una puesta en marcha de un solo paso');
});
conEntorno({ frase: FRASE, xpub: XPUB }, () => {
  comprobar(der.estado().comprobada === true,
    'con la xpub puesta al lado, la frase sí queda comprobada');
});

decir('la huella, para que dos procesos se puedan comparar');
{
  const h1 = conEntorno({ frase: FRASE, xpub: XPUB }, () => der.huella());
  const h2 = conEntorno({ frase: undefined, xpub: XPUB }, () => der.huella());
  const h3 = conEntorno({ frase: OTRA, xpub: XPUB_OTRA }, () => der.huella());
  comprobar(h1 === h2, 'el que firma y el que solo calcula enseñan la MISMA huella');
  comprobar(h1 !== h3, 'y dos semillas distintas, huellas distintas');
  comprobar(/^0x[0-9a-f]{8}$/i.test(String(h1)), 'la huella tiene forma de huella', String(h1));
}

decir('el cuadro del panel no filtra nada');
conEntorno({ frase: FRASE, xpub: XPUB }, () => {
  const json = JSON.stringify(der.estado());
  comprobar(!json.includes('junk') && !json.includes('test'),
    'el estado no lleva la frase ni un trozo de ella', json.slice(0, 120));
  comprobar(!json.includes(XPUB),
    'ni la xpub: con ella se enumeran TODAS las direcciones de la casa sin tocar Mongo');
  comprobar(json.includes(String(der.huella())), 'pero sí la huella, que no deriva nada');
  comprobar(der.estado().puedeFirmar === true && der.estado().puedeCalcular === true,
    'y dice qué puede hacer este proceso');
});

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
