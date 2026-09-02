/* El tamiz de sanciones, en memoria.
 *
 *   node pruebas/probar-sanciones.mjs
 *
 * Lee una lista en el FORMATO REAL de la OFAC (SDN.CSV + ALT.CSV, con fichas
 * inventadas) y comprueba las tres cosas que importan de un tamiz:
 *
 *   1. Sin lista NO dice «limpio»: dice «sin tamizar», y eso es un no.
 *   2. Encuentra lo que se parece —orden cambiado, tilde, alias, un apellido
 *      con una letra distinta— y NO encuentra lo que no se parece.
 *   3. No decide: devuelve coincidencias con fuerza y razones, y la puerta
 *      (`veredictoNombre`) sólo dice pasa / revisión / sin-tamiz.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const S = (await import('../lib/sanciones.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

decir('SIN LISTA NO HAY «LIMPIO»');
{
  comprobar(S.hayListas() === false, 'de fábrica no hay lista cargada');
  const r = S.tamizarNombre('Cualquier Persona');
  comprobar(r.tamizado === false && r.coincidencias.length === 0, 'tamizar sin lista devuelve tamizado:false, no «sin coincidencias»');
  comprobar(S.veredictoNombre('Cualquier Persona').veredicto === 'sin-tamiz', 'y el veredicto es «sin-tamiz», que la puerta trata como NO');
  const d = S.tamizarDireccion('1FicticiaDireccionSancionada000000');
  comprobar(d.tamizado === false && d.sancionada === false, 'una dirección sin lista tampoco se da por limpia');
  comprobar(S.estado().vencidas === true, 'y el estado dice «vencidas» (sin lista no hay frescura que valga)');
}

decir('la lectura del formato de la OFAC');
{
  const sdn = readFileSync(join(AQUI, 'listas', 'sdn-prueba.csv'), 'utf8');
  const alt = readFileSync(join(AQUI, 'listas', 'alt-prueba.csv'), 'utf8');
  const registros = S.leerSdnCsv(sdn);
  comprobar(registros.length === 4, 'se leen las cuatro fichas', String(registros.length));
  const p = registros.find((r) => r.id === 'OFAC-10001');
  comprobar(p?.tipo === 'persona' && p.programa === 'SDGT', 'una persona con su programa');
  comprobar(p?.fechaNacimiento === '1970-03-12', 'la fecha de nacimiento sale de las observaciones', p?.fechaNacimiento);
  comprobar(p?.direcciones?.[0] === '1FicticiaDireccionSancionada000000', 'y la dirección cripto también', p?.direcciones?.[0]);
  comprobar(registros.find((r) => r.id === 'OFAC-10003')?.tipo === 'buque', 'un buque se reconoce como tal');
  comprobar(registros.find((r) => r.id === 'OFAC-10004')?.fechaNacimiento === '1965-00-00', 'una fecha con sólo el año se guarda así');
  S.aplicarAlias(alt, registros);
  comprobar(p.alias.includes('EL SANCIONADO FICTICIO'), 'los alias del ALT se enganchan por número', JSON.stringify(p.alias));
  const n = S.cargarEnMemoria(registros, 'prueba');
  comprobar(n === 4 && S.hayListas(), 'y quedan cargadas en memoria');
  comprobar(S.estado().vencidas === false, 'con fecha de hoy no están vencidas');
}

decir('lo que se parece se encuentra; lo que no, no');
{
  const exacto = S.tamizarNombre('Persona Sancionado de Prueba');
  comprobar(exacto.tamizado && exacto.fuertes >= 1, 'el nombre en otro orden y sin coma da coincidencia FUERTE', JSON.stringify(exacto.coincidencias[0]?.puntuacion));
  comprobar(exacto.coincidencias[0]?.razones?.[0]?.includes('%'), 'y viene con su razón en lenguaje llano', exacto.coincidencias[0]?.razones?.[0]);

  const conTilde = S.tamizarNombre('persona sancionadó de prúeba');
  comprobar(conTilde.fuertes >= 1, 'con tildes y minúsculas también');

  const alias = S.tamizarNombre('El Sancionado Ficticio');
  comprobar(alias.fuertes >= 1 && /alias/.test(alias.coincidencias[0]?.razones?.[0] || ''), 'por el alias se encuentra y se dice que fue por el alias', alias.coincidencias[0]?.razones?.[0]);

  const parecido = S.tamizarNombre('Ruperto Garcia Morales');
  comprobar(parecido.coincidencias.length >= 1 && parecido.coincidencias[0].puntuacion >= 0.88,
    '«Garcia Morales» encuentra a «GARSIA MORALEZ» (una letra distinta en cada apellido)', String(parecido.coincidencias[0]?.puntuacion));

  const empresa = S.tamizarNombre('Empresa Ficticia Sancionada, S.A.');
  comprobar(empresa.fuertes >= 1, 'una razón social con puntuación distinta se encuentra');

  const limpio = S.tamizarNombre('Ana Pérez Rodríguez');
  comprobar(limpio.tamizado === true && limpio.coincidencias.length === 0, 'un nombre que no está no da nada — y tamizado:true, que ahora sí se miró');
  const otro = S.tamizarNombre('Banco Atlántida');
  comprobar(otro.coincidencias.length === 0, 'ni un banco cualquiera');
}

decir('la fecha de nacimiento ajusta, no decide');
{
  const mismo = S.tamizarNombre('Persona Sancionado de Prueba', { fechaNacimiento: '1970-03-12' });
  const distinto = S.tamizarNombre('Persona Sancionado de Prueba', { fechaNacimiento: '1990-01-01' });
  comprobar(mismo.coincidencias[0].puntuacion >= distinto.coincidencias[0].puntuacion, 'el mismo año sube y otro año baja');
  comprobar(distinto.coincidencias.length === 1 && distinto.coincidencias[0].puntuacion >= S.UMBRAL_MINIMO,
    'pero un nombre exacto con otro año SIGUE a la vista (una fecha falsa esquiva tamices)', String(distinto.coincidencias[0]?.puntuacion));
  comprobar(/NO coincide/.test(distinto.coincidencias[0].razones.join(' ')), 'y la razón lo dice');
}

decir('la puerta: pasa / revisión / sin-tamiz');
{
  comprobar(S.veredictoNombre('Ana Pérez Rodríguez').veredicto === 'pasa', 'un nombre limpio pasa');
  const rev = S.veredictoNombre('Persona Sancionado de Prueba');
  comprobar(rev.veredicto === 'revision' && rev.detalle.fuertes >= 1, 'una coincidencia fuerte queda en revisión, no en rechazo');
  const d = S.tamizarDireccion('1ficticiadireccionsancionada000000');
  comprobar(d.tamizado && d.sancionada && d.registro?.id === 'OFAC-10001', 'una dirección sancionada se reconoce, sin importar mayúsculas');
  const d2 = S.tamizarDireccion('0x' + 'a'.repeat(40));
  comprobar(d2.tamizado && !d2.sancionada, 'y una que no está, no');
}

decir('una lista JSON propia también se lee');
{
  const propia = S.leerJson(JSON.stringify([{ nombre: 'Lista Local Ficticia', lista: 'PEP-LOCAL' }, { sinNombre: true }]), 'local');
  comprobar(propia.length === 1 && propia[0].lista === 'PEP-LOCAL' && propia[0].id === 'local-0', 'las fichas sin nombre se descartan y las demás toman su id', JSON.stringify(propia[0]));
}

decir('la comparación de nombres, sola');
{
  comprobar(S.normalizar('José García-Pérez') === 'JOSE GARCIA PEREZ', 'normalizar quita tildes, guiones y mayúsculas');
  comprobar(S.fichas('Juan de la Cruz').join(' ') === 'JUAN CRUZ', 'las partículas no cuentan');
  comprobar(S.parecidoNombres('Jose Garcia', 'GARCIA, Jose') === 1, 'el orden no importa');
  comprobar(S.parecidoNombres('Yousef Garcia', 'Jose Garcia') === 1, 'las variantes de transliteración son la misma persona');
  comprobar(S.parecidoNombres('Jose Ordoñez', 'ORDONEZ JOS') >= 0.97, 'un nombre cortado por la MRZ no se penaliza');
  comprobar(S.parecidoNombres('Pedro Lopez', 'Maria Fernandez') < 0.6, 'y dos personas distintas no se parecen');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
