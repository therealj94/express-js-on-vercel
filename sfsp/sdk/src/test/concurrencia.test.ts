/* T-CONC-01 a T-CONC-13 · las carreras, contra un almacén durable de verdad.
 *
 * El documento `scripts/concurrencia.md` describía cinco carreras y decía qué
 * prueba las demostraría. Estas son esas pruebas. Hasta ahora no podían
 * escribirse porque no existía el almacén; escribirlas contra el directorio en
 * memoria habría sido teatro, porque un solo hilo nunca compite consigo mismo.
 *
 * La base es `node:sqlite`, que viene con Node. Cada prueba crea su archivo en
 * un directorio temporal y lo borra al terminar: es infraestructura desechable
 * aprovisionada para esa ejecución, que es lo que la regla de aislamiento pide.
 * No se toca ninguna base real, no hay red y no hay credenciales.
 *
 * La regla que todas comprueban es la misma: **el árbitro es el índice único,
 * no una lectura previa.** Quien pierde la carrera recibe una violación de
 * restricción y lo sabe. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { DirectorioDurable } from '../durable/directorioDurable.js';
import { INDICES_ESPERADOS } from '../durable/esquema.js';
import { formatear, claveDeIndice } from '../numeroCuenta.js';
import { ErrorSFSP } from '../codigos.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const DIR_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DIR_B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const DESDE = '2026-01-01T00:00:00.000Z';

/** Un archivo por prueba, borrado al terminar. */
function conBase<T>(fn: (ruta: string) => T): T {
  const carpeta = mkdtempSync(join(tmpdir(), 'sfsp-conc-'));
  try {
    return fn(join(carpeta, 'directorio.db'));
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

/* La versión asíncrona hace falta de verdad: con la síncrona, el `finally`
   borraba el archivo en cuanto `fn` devolvía la promesa, o sea antes de que los
   hilos llegaran a abrirlo. El síntoma era «unable to open database file», que
   parece un problema de la base y era un problema de la prueba. */
async function conBaseAsync<T>(fn: (ruta: string) => Promise<T>): Promise<T> {
  const carpeta = mkdtempSync(join(tmpdir(), 'sfsp-conc-'));
  try {
    return await fn(join(carpeta, 'directorio.db'));
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

const alta = (n: number) => ({
  genesisSubjectRef: `gsr_${n}`,
  custodyProfile: 'MANAGED' as const,
  policyVersion: 'prueba',
});

function cuentaConRuta(d: DirectorioDurable, n: number, direccion = DIR_A) {
  const c = d.crearCuenta(alta(n));
  const b = d.crearBinding(c.accountId, 5550, direccion, 'PAYMENTS', 'MANAGED', DESDE, null);
  d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(b.bindingId, 'PRIMARY', 'prueba', 'principal');
  return { cuenta: c, binding: d.binding(b.bindingId)! };
}

/* ─────────────────────────── el esquema ─────────────────────────── */

test('el esquema impone las diez restricciones que el contrato durable exige', () => {
  assert.equal(INDICES_ESPERADOS.length, 10);
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    assert.deepEqual(d.invariantes(), []);
    d.cerrar();
  });
});

/* ─────────────────── C1 · dos altas simultáneas ─────────────────── */

test('T-CONC-01 · 64 altas desde 4 hilos con colisiones forzadas: ni un número repetido', async () => {
  await conBaseAsync(async (ruta) => {
    /* Se crea el esquema antes de lanzar los hilos, para que la carrera sea por
       el índice y no por quién ejecuta el CREATE TABLE. */
    new DirectorioDurable({ ruta }).cerrar();

    const HILOS = 4;
    const ALTAS = 16;
    /* Bolsa de 80 números para 64 altas: las colisiones son inevitables. */
    const TAMANO_BOLSA = 80;

    const resultados = await Promise.all(
      Array.from({ length: HILOS }, (_, i) =>
        new Promise<{ numeros: string[]; sorteos: number; agotados: number }>((resolve, reject) => {
          const w = new Worker(join(aqui, 'trabajador-altas.js'), {
            workerData: { ruta, altas: ALTAS, tamanoDeLaBolsa: TAMANO_BOLSA, semilla: 1000 + i * 7919 },
          });
          w.on('message', resolve);
          w.on('error', reject);
        }),
      ),
    );

    const numeros = resultados.flatMap((r) => r.numeros);
    const sorteos = resultados.reduce((n, r) => n + r.sorteos, 0);
    const agotados = resultados.reduce((n, r) => n + r.agotados, 0);

    const d = new DirectorioDurable({ ruta });
    try {
      /* Tantas cuentas como altas que salieron bien. */
      assert.equal(d.totalCuentas, numeros.length, 'hay cuentas que no corresponden a ningún alta');

      /* Cero números repetidos. Ésta es la que importa. */
      const distintos = new Set(numeros.map(claveDeIndice));
      assert.equal(distintos.size, numeros.length, 'se entregó dos veces el mismo número de cuenta');

      /* Y las colisiones ocurrieron de verdad: hubo más sorteos que altas. */
      assert.ok(
        sorteos > numeros.length + agotados,
        `no hubo colisiones que resolver: ${sorteos} sorteos para ${numeros.length} altas`,
      );

      assert.deepEqual(d.invariantes(), []);
    } finally {
      d.cerrar();
    }
  });
});

test('T-CONC-02 · un alta que revienta deja el número consumido para siempre', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    try {
      /* Se liga la cuenta a un origen que ya existe: el alta falla DESPUÉS de
         consumir el número. */
      const primera = d.crearCuenta({ ...alta(1), refCuentaOrigen: 'origen_1' });
      const fijo = formatear('424242424242');

      const conNumeroFijo = new DirectorioDurable({ ruta, generarNumero: () => fijo });
      assert.throws(
        () => conNumeroFijo.crearCuenta({ ...alta(2), refCuentaOrigen: 'origen_1' }),
        ErrorSFSP,
        'ligar a un origen ya ligado tiene que fallar',
      );
      conNumeroFijo.cerrar();

      /* La cuenta no existe... */
      assert.equal(d.totalCuentas, 1);
      assert.equal(d.cuentaPorNumero(fijo), null);
      /* ...y el número NO vuelve al sorteo. Es A3 llevada a la base. */
      assert.ok(d.numeroFueConsumido(fijo), 'un número consumido no vuelve aunque el alta falle');

      const otro = new DirectorioDurable({ ruta, generarNumero: () => fijo });
      assert.throws(() => otro.crearCuenta(alta(3)), ErrorSFSP, 'agota reintentos: ese número ya no se entrega');
      otro.cerrar();

      assert.equal(primera.accountNumber.length, 'SF-0000-0000-0000-0'.length);
    } finally {
      d.cerrar();
    }
  });
});

/* ─────────────────── C2 · el mismo alias a la vez ─────────────────── */

test('T-CONC-03 · 32 solicitudes del mismo alias desde conexiones distintas: gana una', () => {
  conBase((ruta) => {
    const base = new DirectorioDurable({ ruta });
    const cuentas = Array.from({ length: 32 }, (_, i) => base.crearCuenta(alta(i)));

    let ganadas = 0;
    let rechazadas = 0;
    for (const c of cuentas) {
      const conexion = new DirectorioDurable({ ruta });
      try {
        conexion.registrarAlias(c.accountId, '@medardo');
        ganadas++;
      } catch (error) {
        assert.ok(error instanceof ErrorSFSP);
        rechazadas++;
      } finally {
        conexion.cerrar();
      }
    }

    assert.equal(ganadas, 1, 'sólo una puede llevarse el alias');
    assert.equal(rechazadas, 31);
    assert.deepEqual(base.invariantes(), []);
    base.cerrar();
  });
});

test('T-CONC-04 · dos alias distintos con el mismo esqueleto: sólo entra uno', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const a = d.crearCuenta(alta(1));
    const b = d.crearCuenta(alta(2));

    const otra = new DirectorioDurable({ ruta });
    d.registrarAlias(a.accountId, '@medardo');
    assert.throws(() => otra.registrarAlias(b.accountId, '@medard0'), ErrorSFSP);
    assert.throws(() => otra.registrarAlias(b.accountId, '@me_dardo'), ErrorSFSP);
    otra.cerrar();

    assert.deepEqual(d.invariantes(), []);
    d.cerrar();
  });
});

test('T-CONC-05 · cambiar de alias es una sola operación: nadie se cuela en medio', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const a = d.crearCuenta(alta(1));
    const b = d.crearCuenta(alta(2));
    d.registrarAlias(a.accountId, '@medardo');

    /* Si liberar y tomar fuesen dos operaciones, entre medias otro podría
       llevarse el alias que se acaba de soltar. Van en una transacción. */
    const nuevo = d.cambiarAlias(a.accountId, '@medardo.og');
    assert.equal(nuevo.normalized, 'medardo.og');
    assert.equal(d.cuentaPorAlias('@medardo'), null);
    assert.equal(d.cuentaPorAlias('@medardo.og')?.accountId, a.accountId);

    /* Y el alias liberado queda disponible para otro, que es el motivo de que
       el índice del esqueleto sea parcial. */
    const otra = new DirectorioDurable({ ruta });
    const recuperado = otra.registrarAlias(b.accountId, '@medardo');
    assert.equal(recuperado.accountId, b.accountId);
    otra.cerrar();

    assert.deepEqual(d.invariantes(), []);
    d.cerrar();
  });
});

/* ───────── C3 · cambio de ruta mientras se resuelve un destino ───────── */

test('T-CONC-06 · resolver, cambiar la ruta en otra conexión, y ejecutar: no se ejecuta', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const { cuenta, binding } = cuentaConRuta(d, 1);
    const ahora = '2026-06-01T00:00:00.000Z';

    const resolucion = d.resolver(cuenta.accountNumber, 5550, ahora);
    /* Dentro de la ventana y sin cambios: pasa. */
    d.ejecutarContraRuta(resolucion, ahora);

    /* Otra conexión cambia la ruta. */
    const otra = new DirectorioDurable({ ruta });
    otra.cambiarEstadoBinding(binding.bindingId, 'SUSPENDED', 'otro', 'sospecha');
    otra.cerrar();

    /* La ejecución condiciona la escritura a la versión leída, así que se
       entera. La revalidación previa acotaba la ventana; esto la cierra. */
    assert.throws(() => d.ejecutarContraRuta(resolucion, ahora), ErrorSFSP);
    d.cerrar();
  });
});

test('T-CONC-07 · dos promociones a primaria a la vez: queda una sola', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const c = d.crearCuenta(alta(1));

    const b1 = d.crearBinding(c.accountId, 5550, DIR_A, 'PAYMENTS', 'MANAGED', DESDE, null);
    const b2 = d.crearBinding(c.accountId, 5550, DIR_B, 'PAYMENTS', 'MANAGED', DESDE, null);
    d.cambiarEstadoBinding(b1.bindingId, 'ACTIVE', 'x', 'alta');
    d.cambiarEstadoBinding(b2.bindingId, 'ACTIVE', 'x', 'alta');

    const uno = new DirectorioDurable({ ruta });
    const dos = new DirectorioDurable({ ruta });
    uno.cambiarEstadoBinding(b1.bindingId, 'PRIMARY', 'uno', 'primera');
    dos.cambiarEstadoBinding(b2.bindingId, 'PRIMARY', 'dos', 'segunda');
    uno.cerrar();
    dos.cerrar();

    assert.equal(d.rutasPrimarias(c.accountId), 1, 'el índice parcial no admite dos primarias');
    assert.equal(d.binding(b2.bindingId)?.status, 'PRIMARY');
    assert.equal(d.binding(b1.bindingId)?.status, 'ACTIVE');
    assert.deepEqual(d.invariantes(), []);
    d.cerrar();
  });
});

test('T-CONC-08 · dos cambios desde la misma versión: el segundo se entera', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const c = d.crearCuenta(alta(1));
    const b = d.crearBinding(c.accountId, 5550, DIR_A, 'PAYMENTS', 'MANAGED', DESDE, null);
    const versionLeida = b.version;

    d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'uno', 'alta', undefined, versionLeida);

    /* El segundo parte de la versión vieja: su UPDATE cambia cero filas. */
    const otra = new DirectorioDurable({ ruta });
    assert.throws(
      () => otra.cambiarEstadoBinding(b.bindingId, 'REVOKED', 'dos', 'baja', undefined, versionLeida),
      ErrorSFSP,
      'pisar un cambio ajeno sin enterarse es lo que la versión optimista impide',
    );
    otra.cerrar();

    assert.equal(d.binding(b.bindingId)?.status, 'ACTIVE');
    d.cerrar();
  });
});

test('T-CONC-09 · revocar entre la revalidación y la ejecución', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const { cuenta, binding } = cuentaConRuta(d, 1);
    const ahora = '2026-06-01T00:00:00.000Z';
    const resolucion = d.resolver(cuenta.accountNumber, 5550, ahora);

    const otra = new DirectorioDurable({ ruta });
    otra.cambiarEstadoBinding(binding.bindingId, 'REVOKED', 'otro', 'llave perdida');
    otra.cerrar();

    assert.throws(() => d.ejecutarContraRuta(resolucion, ahora), ErrorSFSP);
    assert.equal(d.rutasPrimarias(cuenta.accountId), 0);
    d.cerrar();
  });
});

/* ───────────── C4 · dos migraciones del mismo censo ───────────── */

test('T-CONC-10 · dos corridas del mismo censo a la vez: sólo una en curso', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const corrida = d.abrirCorrida('censo_2026_09');

    const otra = new DirectorioDurable({ ruta });
    assert.throws(() => otra.abrirCorrida('censo_2026_09'), ErrorSFSP);
    /* Otro censo sí puede correr a la vez: la exclusión es por censo. */
    const deOtro = otra.abrirCorrida('censo_2026_10');
    assert.ok(deOtro.startsWith('op_'));
    otra.cerrar();

    d.cerrarCorrida(corrida);
    /* Cerrada la primera, ya se puede volver a abrir. */
    const segunda = d.abrirCorrida('censo_2026_09');
    assert.notEqual(segunda, corrida);
    d.cerrar();
  });
});

test('T-CONC-11 · una corrida interrumpida se reanuda sin repartir números nuevos', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const censo = ['origen_a', 'origen_b', 'origen_c'];

    /* Primera pasada: se procesan dos y se corta. */
    for (const ref of censo.slice(0, 2)) {
      d.crearCuenta({ ...alta(1), refCuentaOrigen: ref, censoId: 'censo_x' });
    }
    const antes = censo.slice(0, 2).map((r) => d.parDeOrigen(r)!.accountNumber);

    /* Reanudación desde otra conexión: las ya hechas no se repiten. */
    const otra = new DirectorioDurable({ ruta });
    for (const ref of censo) {
      if (otra.parDeOrigen(ref)) continue;
      otra.crearCuenta({ ...alta(2), refCuentaOrigen: ref, censoId: 'censo_x' });
    }
    otra.cerrar();

    assert.equal(d.totalCuentas, 3);
    assert.equal(d.totalOrigenesLigados, 3);
    const despues = censo.slice(0, 2).map((r) => d.parDeOrigen(r)!.accountNumber);
    assert.deepEqual(despues, antes, 'reanudar no puede cambiar los números ya entregados');
    d.cerrar();
  });
});

test('T-CONC-12 · una cuenta de origen tiene una sola cuenta SFSP, venga del censo que venga', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    d.crearCuenta({ ...alta(1), refCuentaOrigen: 'origen_compartido', censoId: 'censo_a' });

    /* Otro censo que se solapa con el primero: no puede repartir un segundo
       número a la misma persona. */
    const otra = new DirectorioDurable({ ruta });
    assert.throws(
      () => otra.crearCuenta({ ...alta(2), refCuentaOrigen: 'origen_compartido', censoId: 'censo_b' }),
      ErrorSFSP,
    );
    otra.cerrar();

    assert.equal(d.totalCuentas, 1);
    d.cerrar();
  });
});

/* ───────────── C5 · el mismo operationId dos veces ───────────── */

test('T-CONC-13 · 16 envíos de la misma operación: una se ejecuta, quince son repetición', () => {
  conBase((ruta) => {
    const d = new DirectorioDurable({ ruta });
    const resultados: string[] = [];

    for (let i = 0; i < 16; i++) {
      const conexion = new DirectorioDurable({ ruta });
      resultados.push(conexion.registrarOperacion('op_pago_0001', 'huella:destino=SF-1,monto=100'));
      conexion.cerrar();
    }

    assert.equal(resultados.filter((r) => r === 'NUEVA').length, 1, 'sólo una puede ser la primera');
    assert.equal(resultados.filter((r) => r === 'REPETIDA').length, 15);

    /* Y el mismo identificador con OTRA petición no es un reintento: es un
       error. Devolverle el resultado de la primera sería peor que fallar,
       porque creería que se ejecutó lo que pidió. */
    assert.throws(
      () => d.registrarOperacion('op_pago_0001', 'huella:destino=SF-9,monto=999999'),
      ErrorSFSP,
    );
    d.cerrar();
  });
});
