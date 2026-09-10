/* El tamizado de la dirección de destino.
 *
 * Fija las tres cosas que hacen que este control valga:
 *   · una dirección sancionada se bloquea;
 *   · una limpia pasa;
 *   · y cuando NO se pudo comprobar, `tamizado` es false — que no es lo mismo
 *     que decir que está limpia. Esa confusión es justo la que convierte un
 *     control en un sello falso.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const respuestas = new Map();
globalThis.fetch = async (url) => {
  const dir = String(url).split('/').pop().toLowerCase();
  const r = respuestas.get(dir);
  if (!r) throw new Error('red caída');
  return { ok: true, json: async () => r };
};

process.env.GENESIS_API_KEY = 'gid_test_para_la_prueba';
const { tamizarDestino, negativaPorSancion } = await import('../lib/tamizDestino.js');

test('una dirección sancionada sale marcada, con su ficha', async () => {
  respuestas.set('0xmala', { tamizado: true, sancionada: true,
    ficha: { nombre: 'LAZARUS GROUP', lista: 'OFAC-SDN' } });
  const r = await tamizarDestino('0xMALA');
  assert.equal(r.tamizado, true);
  assert.equal(r.sancionada, true);
  assert.equal(r.ficha.nombre, 'LAZARUS GROUP');
});

test('una dirección limpia pasa', async () => {
  respuestas.set('0xbuena', { tamizado: true, sancionada: false, ficha: null });
  const r = await tamizarDestino('0xBUENA');
  assert.equal(r.tamizado, true);
  assert.equal(r.sancionada, false);
});

test('si no se pudo comprobar, NO se dice que está limpia', async () => {
  const r = await tamizarDestino('0xsinrespuesta');
  assert.equal(r.tamizado, false, 'tamizado tiene que ser false: nadie comprobó nada');
  assert.equal(r.sancionada, false);
  // La diferencia entre los dos casos es lo único que impide que un fallo de
  // red se registre como un tamizado correcto.
  assert.notEqual(r.tamizado, true);
});

test('el «no» no dice qué lista ni por qué', async () => {
  const n = negativaPorSancion();
  assert.match(n.message, /wa\.me/);
  assert.doesNotMatch(n.message, /OFAC|sanci|lista/i,
    'decirle a quien lo disparó por qué se bloqueó le enseña a esquivarlo');
});
