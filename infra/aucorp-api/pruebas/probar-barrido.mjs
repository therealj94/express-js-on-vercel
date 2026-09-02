/* El barrido de solicitudes atascadas: SOLO AVISA.
 *
 *   node pruebas/probar-barrido.mjs
 *
 * Lo que se persigue: que encuentre lo que lleva demasiado sin cambiar —un
 * retiro pendiente viejo, uno que quedó en `ejecutando`, un depósito avisado
 * que nadie miró—, que NO cuente lo reciente ni lo terminado, que diga qué le
 * falta a cada una… y, sobre todo, que después de correr NO haya cambiado ni
 * un estado ni un saldo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { levantar, contador } from './arnes.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const { pedir, entrar, cerrar, ADMIN } = await levantar();
const { comprobar, decir, terminar } = contador();

const { Solicitud, Saldo } = (await import('../models/index.js')).default;
const { atascadas, queFalta } = (await import('../lib/barrido.js')).default;

// La lista de sanciones, para que los retiros puedan pedirse.
await pedir('/tesoreria/sanciones/importar', { metodo: 'POST', admin: ADMIN, cuerpo: {
  texto: readFileSync(join(AQUI, 'listas', 'sdn-prueba.csv'), 'utf8'), fuente: 'prueba' } });

const ana = await entrar('gid-ana');
await pedir('/cuentas', { metodo: 'POST', token: ana, cuerpo: { moneda: 'USD' } });
await pedir('/tesoreria/corresponsal', { metodo: 'POST', admin: ADMIN, cuerpo: {
  moneda: 'USD', banco: 'Banco de prueba', titular: 'AuCorp LLC', numero: '9999-0000-1111' } });
await pedir('/tesoreria/deposito', { metodo: 'POST', admin: ADMIN, cuerpo: {
  gid: 'gid-ana', moneda: 'USD', monto: '1000', ref: 'deposito-inicial-0001', comprobante: 'Extracto #1' } });
const ben = (await pedir('/beneficiarios', { metodo: 'POST', token: ana, cuerpo: {
  alias: 'Mi banco', tipo: 'bancario', moneda: 'USD', banco: 'Banco Atlántida', titular: 'Ana Pérez', numero: '01234567890123' } })).datos.beneficiario?.id;
comprobar(!!ben, 'el escenario se armó (lista, cuenta, corresponsal, saldo, destino)');

const pedirRetiro = async (ref, monto) => (await pedir('/solicitudes/retiro', { metodo: 'POST', token: ana, cuerpo: {
  ref, moneda: 'USD', monto, beneficiario: ben } })).datos.solicitud;
const avisar = async (ref, monto) => (await pedir('/solicitudes/deposito', { metodo: 'POST', token: ana, cuerpo: {
  ref, moneda: 'USD', monto, referenciaBancaria: 'REF-BANCO-1' } })).datos.solicitud;

const HORA = 3600000;
const ahora = new Date();
const envejecer = (id, horas) => Solicitud.updateOne({ _id: id }, { $set: { actualizada: new Date(ahora.getTime() - horas * HORA) } });

const vieja = await pedirRetiro('retiro-viejo-0001', '100');          // 50 h sin cambio
const reciente = await pedirRetiro('retiro-reciente-0002', '50');     // 2 h
const aMedias = await pedirRetiro('retiro-a-medias-0003', '30');      // quedó en ejecutando hace 30 h
const avisoViejo = await avisar('aviso-viejo-0004', '200');           // 72 h
const pagada = await pedirRetiro('retiro-pagado-0005', '10');         // ejecutada hace 100 h: terminada
comprobar([vieja, reciente, aMedias, avisoViejo, pagada].every((s) => s?.id), 'cinco solicitudes creadas');

await envejecer(vieja.id, 50);
await envejecer(reciente.id, 2);
await Solicitud.updateOne({ _id: aMedias.id }, { $set: { estado: 'ejecutando' } });
await envejecer(aMedias.id, 30);
await envejecer(avisoViejo.id, 72);
await pedir(`/tesoreria/solicitudes/${pagada.id}/ejecutar`, { metodo: 'POST', admin: ADMIN, cuerpo: { comprobante: 'Wire #1' } });
await envejecer(pagada.id, 100);

const fotoSolicitudes = JSON.stringify(await Solicitud.find({}).sort({ ref: 1 }).lean());
const fotoSaldos = JSON.stringify(await Saldo.find({}).sort({ cuenta: 1, moneda: 1 }).lean());

decir('el barrido encuentra lo atascado y sólo lo atascado');
{
  const r = await atascadas({ horas: 24, ahora });
  const refs = r.atascadas.map((s) => s.ref.split(':')[1]).sort();
  comprobar(r.revisadas === 4, 'revisa las cuatro abiertas (la pagada ya terminó)', String(r.revisadas));
  comprobar(refs.join(',') === 'aviso-viejo-0004,retiro-a-medias-0003,retiro-viejo-0001',
    'atascadas: el retiro viejo, el que quedó a medias y el aviso de depósito sin mirar', refs.join(','));
  comprobar(!refs.includes('retiro-reciente-0002'), 'el reciente NO cuenta');
  comprobar(!refs.includes('retiro-pagado-0005'), 'y el pagado tampoco, por viejo que sea');
  comprobar(r.porEstado.pendiente === 1 && r.porEstado.ejecutando === 1 && r.porEstado.avisada === 1, 'con el resumen por estado', JSON.stringify(r.porEstado));
  const v = r.atascadas.find((s) => s.ref.endsWith('retiro-viejo-0001'));
  comprobar(v.horasSinCambio === 50 && v.neto === '100.00' && v.gid === 'gid-ana', 'cada una dice cuánto lleva, cuánto es y de quién', JSON.stringify(v));
  comprobar(/pagar el retiro/.test(v.queFalta), 'y qué le falta: a la pendiente, que operaciones la pague o la rechace', v.queFalta);
  const m = r.atascadas.find((s) => s.estado === 'ejecutando');
  comprobar(/a medias/.test(m.queFalta), 'a la que quedó en ejecutando, que se compruebe contra el banco ANTES de tocar nada', m.queFalta);
  const a = r.atascadas.find((s) => s.tipo === 'deposito');
  comprobar(/extracto del banco/.test(a.queFalta), 'al aviso de depósito, que se busque en el extracto', a.queFalta);
}

decir('el umbral se respeta');
{
  const r1 = await atascadas({ horas: 1, ahora });
  comprobar(r1.atascadas.length === 4, 'con 1 hora, las cuatro abiertas están atascadas');
  const r100 = await atascadas({ horas: 100, ahora });
  comprobar(r100.atascadas.length === 0, 'con 100 horas, ninguna');
  const r0 = await atascadas({ horas: 0, ahora });
  comprobar(r0.horas === 1, 'y un umbral de 0 se sube a 1: «atascada desde hace nada» no significa nada');
}

decir('DESPUÉS DEL BARRIDO NADA CAMBIÓ');
{
  comprobar(JSON.stringify(await Solicitud.find({}).sort({ ref: 1 }).lean()) === fotoSolicitudes, 'las solicitudes están exactamente igual: ni un estado tocado');
  comprobar(JSON.stringify(await Saldo.find({}).sort({ cuenta: 1, moneda: 1 }).lean()) === fotoSaldos, 'y los saldos también: el barrido no mueve un céntimo');
}

decir('el endpoint de operaciones');
{
  const sinClave = await pedir('/tesoreria/solicitudes/atascadas?horas=24');
  comprobar(sinClave.estado === 401, 'sin clave de operaciones no se ve');
  const r = await pedir('/tesoreria/solicitudes/atascadas?horas=24', { admin: ADMIN });
  comprobar(r.estado === 200 && r.datos.atascadas?.length === 3, 'con clave, las tres', String(r.datos.atascadas?.length));
  const mal = await pedir('/tesoreria/solicitudes/atascadas?horas=abc', { admin: ADMIN });
  comprobar(mal.estado === 400 && mal.datos.codigo === 'ENTERO_INVALIDO', 'horas que no son un número se rechazan');
  const porDefecto = await pedir('/tesoreria/solicitudes/atascadas', { admin: ADMIN });
  comprobar(porDefecto.datos.horas === 24, 'sin horas, 24 por defecto');
}

decir('el cliente ve lo mismo desde su lado');
{
  const mias = await pedir('/solicitudes', { token: ana });
  const v = mias.datos.solicitudes.find((s) => s.ref.endsWith('retiro-viejo-0001'));
  comprobar(v.horasSinCambio === 50 && v.queFalta === queFalta({ estado: 'pendiente' }), 'su retiro pendiente dice cuánto lleva y qué falta');
  comprobar(mias.datos.solicitudes.find((s) => s.ref.endsWith('retiro-pagado-0005')).queFalta === '', 'y el pagado no tiene nada pendiente');
  const aviso = mias.datos.solicitudes.find((s) => s.tipo === 'deposito');
  comprobar(aviso.estado === 'avisada' && aviso.estadoTexto === 'Esperando acreditación' && aviso.referenciaBancaria === 'REF-BANCO-1',
    'el aviso de depósito está con su referencia bancaria y su estado legible');
}

const fallos = terminar();
await cerrar();
process.exit(fallos ? 1 : 0);
