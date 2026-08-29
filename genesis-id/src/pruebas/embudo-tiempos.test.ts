// El embudo y los tiempos de verificación.
//
// POR QUE ESTAS PRUEBAS EXISTEN
//
// DOS PROBLEMAS OPUESTOS QUE EL EMBUDO CONFUNDIA. El último paso, «Aprobada»,
// cuenta solo `verificada`; el paso anterior incluye a todo el que pasó la
// biometría. La diferencia entre los dos metía en el mismo saco tres cosas que
// no se parecen en nada:
//
//     quien ESTA ESPERANDO a que el equipo lo mire
//     quien fue RECHAZADO
//     quien estaba verificado y se le SUSPENDIO
//
// Eso se lee como «se nos cae la gente al final» cuando lo que hay es una cola
// sin atender. Y son problemas OPUESTOS: uno se arregla cambiando el producto,
// el otro poniendo a alguien a revisar. Un embudo que los confunde manda a
// arreglar lo que no está roto.
//
// Y LO QUE NO SE MEDIA. Cuánto tarda una persona en quedar verificada no se
// medía en ningún sitio, teniendo `verificadaEn` guardado desde siempre. Es la
// cifra sobre la que vive una operación de cumplimiento: «tenemos 40 en
// revisión» no dice nada solo — cuarenta con dos horas de espera es un equipo
// trabajando, cuarenta con nueve días es gente que ya se fue a otra app.

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-embudo-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL

const { store } = await import('../store.js')
const { embudoKyc, tiemposDeVerificacion } = await import('../analitica/consultas.js')

const HORA = 3600000
const ahora = Date.now()

/** Una identidad con el estado y los tiempos que hagan falta. */
function meter(estado: string, creadaHace: number, verificadaHace: number | null,
               tocadaHace = creadaHace) {
  store.todo().identidades.push({
    id: 'i' + Math.random().toString(36).slice(2),
    email: `x${Math.random()}@ejemplo.invalid`,
    estado,
    creadaEn: new Date(ahora - creadaHace).toISOString(),
    actualizadaEn: new Date(ahora - tocadaHace).toISOString(),
    verificadaEn: verificadaHace === null ? null : new Date(ahora - verificadaHace).toISOString(),
    vinculos: [], pep: false,
  } as any)
}

describe('el embudo', () => {
  before(() => {
    store.todo().identidades.length = 0
    // 10 empezaron. 2 se quedaron en cada uno de los primeros pasos.
    for (let i = 0; i < 2; i++) meter('iniciada', 5 * HORA, null)
    for (let i = 0; i < 2; i++) meter('datos', 5 * HORA, null)
    for (let i = 0; i < 1; i++) meter('documento', 5 * HORA, null)
    // Y del final: 3 esperando, 1 rechazada, 1 suspendida, 3 verificadas.
    for (let i = 0; i < 3; i++) meter('en-revision', 30 * HORA, null, 26 * HORA)
    meter('rechazada', 40 * HORA, null)
    meter('suspendida', 50 * HORA, 45 * HORA)
    meter('verificada', 10 * HORA, 8 * HORA)
    meter('verificada', 20 * HORA, 16 * HORA)
    meter('verificada', 100 * HORA, 4 * HORA)
  })

  test('LA COLA NO SE CUENTA COMO GENTE PERDIDA', () => {
    const e = embudoKyc()
    const ultimo = e.pasos[e.pasos.length - 1]

    // La caída bruta sigue estando: son los que no llegaron a «aprobada».
    assert.equal(ultimo.caida, 5, '3 esperando + 1 rechazada + 1 suspendida')

    // Pero ahora se dice cuántos de esos SOLO ESTAN ESPERANDO…
    assert.equal(ultimo.esperando, 3)
    assert.equal(e.esperandoDecision, 3)

    // …y cuántos se perdieron de verdad.
    assert.equal(ultimo.perdidos, 2,
      'los que de verdad se fueron: la rechazada y la suspendida. '
      + 'Sin esto, tres personas EN COLA se leían como tres que se fueron')
  })

  test('en los pasos de en medio, perdidos y caída son lo mismo', () => {
    /* La distinción solo aplica al final: en medio no hay cola de nadie, y
       hacer que difieran ahí sería inventarse una diferencia. */
    const e = embudoKyc()
    for (const p of e.pasos.slice(1, -1)) {
      assert.equal(p.perdidos, p.caida, `«${p.paso}» difiere y no debería`)
      assert.equal(p.esperando, 0)
    }
  })

  test('rechazadas y suspendidas siguen contándose por separado', () => {
    const e = embudoKyc()
    assert.equal(e.rechazadas, 1)
    assert.equal(e.suspendidas, 1)
  })
})

describe('los tiempos de verificación', () => {
  test('mide de cuando empezó a cuando se aprobó', () => {
    const t = tiemposDeVerificacion(30)
    /* CUATRO, no tres: la suspendida también cuenta. Estuvo verificada —tiene
       su `verificadaEn`— y lo que se está midiendo es cuánto tardó VERIFICARLA,
       no si sigue vigente hoy. Excluirla haría que suspender a alguien
       reescribiera hacia atrás el rendimiento del equipo, que es justo lo que
       una cifra de cumplimiento no puede hacer.
       Los cuatro trámites: 2 h, 4 h, 5 h y 96 h. */
    assert.equal(t.decididas, 4)
    assert.equal(t.masRapidaHoras, 2)
    assert.equal(t.masLentaHoras, 96)
  })

  test('la MEDIANA, no el promedio', () => {
    /* Con 2, 4, 5 y 96 horas el promedio es 26,75 —que no le pasó a nadie, y
       está más cerca del peor caso que del típico— y la mediana es 5. Un solo
       caso olvidado cuatro días destroza el promedio de todo el mes y hace
       pensar que el equipo va mal cuando va bien. */
    const t = tiemposDeVerificacion(30)
    assert.equal(t.medianaHoras, 5)
    const promedio = (2 + 4 + 5 + 96) / 4
    assert.ok(promedio > 26 && promedio < 27,
      `el promedio sería ${promedio}: no le pasó a nadie y está pegado al peor caso`)
  })

  test('y el p90, que es qué tan malo es el mal día', () => {
    const t = tiemposDeVerificacion(30)
    assert.equal(t.p90Horas, 96)
  })

  test('la ventana filtra por cuándo SE DECIDIO, no por cuándo empezó', () => {
    /* Una identidad que empezó hace cuatro días y se aprobó ayer tiene que
       contar en la ventana de un día: si se filtrara por la fecha de inicio,
       la que más tardó sería justo la que no se cuenta — y el número saldría
       siempre bonito. */
    const t = tiemposDeVerificacion(1)
    assert.equal(t.decididas, 3, 'tres se decidieron en las últimas 24 h; '
      + 'la suspendida se decidió hace 45 h y cae fuera de esta ventana')
    assert.equal(t.masLentaHoras, 96, 'incluida la que tardó cuatro días en tramitarse')
  })

  describe('la cola de ahora, que es otra pregunta', () => {
    test('cuántos esperan y desde cuándo', () => {
      const c = tiemposDeVerificacion(30).cola
      assert.equal(c.esperando, 3)
      assert.equal(c.masViejaHoras, 26,
        'la más vieja es el peor caso que está pasando AHORA, y la que se convierte en queja')
    })

    test('y cuántos llevan más de un día', () => {
      /* Es el umbral a partir del cual quien se estaba dando de alta ya se fue
         a hacer otra cosa. */
      assert.equal(tiemposDeVerificacion(30).cola.masDeUnDia, 3)
    })
  })

  test('sin datos no se inventa un cero: se dice que no hay', () => {
    /* Un cero se lee como «tardamos cero horas», que es una mentira preciosa.
       `null` dice «no hay de dónde sacarlo», que es la verdad. */
    store.todo().identidades.length = 0
    const t = tiemposDeVerificacion(30)
    assert.equal(t.decididas, 0)
    assert.equal(t.medianaHoras, null)
    assert.equal(t.p90Horas, null)
    assert.equal(t.cola.masViejaHoras, null)
  })
})
