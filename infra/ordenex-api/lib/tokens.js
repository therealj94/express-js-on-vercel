// Los quince activos que se negocian en Ordenex.
//
// Es la TABLA ESPEJO: la misma lista, con los mismos contratos, que enseña la
// billetera en apps-web/veta-wallet/cadena.js y que lee el backend de la
// wallet en infra/veta-wallet-backend/lib/saldos.js (TOKENS_5550). Si un dia
// se corrige una direccion alla y no aqui, Ordenex estaria abriendo mercado
// sobre un contrato que ya no es el del activo — o peor, el vigia acreditaria
// depositos de un token equivocado. Cualquier cambio se hace en las TRES
// tablas o en ninguna.
//
// Los contratos estan confirmados contra la cadena 5550 y todos usan 18
// decimales; se fija ese valor en vez de preguntarlo por RPC, igual que hace
// la billetera. ORIGEN es el nativo: paga el gas y es la pata comun de todos
// los mercados.

const TOKENS = [
  { s: 'ORIGEN', nativo: true },
  { s: 'AUKA', contrato: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B' },
  { s: 'AGKA', contrato: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B' },
  { s: 'ONDK', contrato: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1' },
  { s: 'MNKA', contrato: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead' },
  { s: 'IBS', contrato: '0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62' },
  { s: 'HARV', contrato: '0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923' },
  { s: 'AUBEX', contrato: '0xF1498640B27A66C0DC505093D70911C060e04fb0' },
  { s: 'ASL', contrato: '0x69846aC960D45F9946C613DFCe1b761D37Faf098' },
  { s: 'LOVE', contrato: '0x638F2ba0e3E1083D1ba570b449BD266F3860D164' },
  { s: 'REST', contrato: '0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD' },
  { s: 'SOL', contrato: '0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66' },
  { s: 'AIT', contrato: '0xAE14Db486872AC07d74Ad69cC09590239b21BA2e' },
  { s: 'AGRO', contrato: '0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe' },
  { s: 'POLITICAL', contrato: '0x92496E1848e001428A3495409a9A9f616bB6dD3B' },
];

// Para no recorrer la lista cada vez que llega un simbolo por la API.
const PORSIMBOLO = Object.fromEntries(TOKENS.map((t) => [t.s, t]));

// Los mercados de la v1: cada token contra ORIGEN, y nada mas. ORIGEN no se
// negocia contra si mismo, asi que son 14. El nombre del par es el identificador
// que viaja por rutas, ordenes, tratos y velas: 'AUKA-ORIGEN'.
const MERCADOS = TOKENS.filter((t) => !t.nativo).map((t) => `${t.s}-ORIGEN`);

module.exports = { TOKENS, PORSIMBOLO, MERCADOS };
