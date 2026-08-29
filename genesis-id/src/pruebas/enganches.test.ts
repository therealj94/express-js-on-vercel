// Los avisos a las aplicaciones.
//
// POR QUE ESTAS PRUEBAS EXISTEN
//
// Un enganche falla de tres formas, y las tres son silenciosas DESDE AQUI:
//
//   1. No sale. La aprobación se guardó, el operador vio «listo», y la app del
//      integrador nunca se enteró. Nadie lo nota hasta que una persona se queja
//      de que su cuenta sigue bloqueada.
//   2. Sale a quien no debe. Contarle a una aplicación quién se verificó en
//      otra convierte una comodidad en una fuga de datos.
//   3. Sale sin firma comprobable. Entonces cualquiera que adivine la dirección
//      del integrador puede mandarle «esta persona quedó verificada», y tenemos
//      una vía para colar identidades aprobadas sin pasar por Genesis ID.
//
// Las tres se prueban aquí. Y la firma se prueba desde el lado del que recibe
// —comprobando lo que un integrador comprobaría— porque es ahí donde importa
// que funcione.

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-enganches-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL

const { store } = await import('../store.js')
const {
  avisar, firmar, firmaCuadra, vaciarCola, ponerEnganche, quitarEnganche, EVENTOS,
} = await import('../enganches/enganches.js')

/** Una aplicación con enganche puesto. Devuelve su secreto. */
function app(clave: string, url = 'https://ejemplo.invalid/avisos', eventos: string[] = []) {
  const a: any = {
    id: 'a-' + clave, clave, nombre: clave, hashClave: 'x', pistaClave: 'x',
    alcances: ['identidad.crear'], activa: true, creadaEn: new Date().toISOString(), ultimoUso: null,
  }
  store.todo().aplicaciones.push(a)
  const r = ponerEnganche(a, url, eventos, 'prueba@ejemplo.invalid')
  assert.ok(r.ok, 'ok' in r && !r.ok ? (r as any).error : '')
  return { app: a, secreto: (r as any).secreto as string }
}

/** Lo que llegó al servidor del integrador. */
let recibido: { url: string; cabeceras: Record<string, string>; cuerpo: string }[] = []

function servidor({ falla = 0 } = {}) {
  const original = globalThis.fetch
  recibido = []
  globalThis.fetch = (async (url: any, init: any) => {
    recibido.push({
      url: String(url),
      cabeceras: Object.fromEntries(
        Object.entries(init?.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)])),
      cuerpo: String(init?.body ?? ''),
    })
    if (falla) return { ok: false, status: falla } as any
    return { ok: true, status: 200 } as any
  }) as any
  return () => { globalThis.fetch = original }
}

const SUJETO = {
  id: 'idn_1', gid: 'OG-AB12CD', estado: 'verificada',
  creadaPor: 'veta-wallet', vinculos: [] as { app: string }[],
}

describe('los enganches', () => {
  beforeEach(() => {
    store.todo().aplicaciones.length = 0
    store.todo().entregas.length = 0
  })

  describe('a quién le llega', () => {
    test('a la aplicación que creó la identidad', async () => {
      app('veta-wallet')
      assert.equal(avisar('identidad.verificada', SUJETO), 1)
    })

    test('y a las que la tienen vinculada', () => {
      app('veta-wallet')
      app('pulse2chat')
      const puestos = avisar('identidad.verificada',
        { ...SUJETO, vinculos: [{ app: 'pulse2chat' }] })
      assert.equal(puestos, 2)
    })

    test('A NADIE MAS, aunque tenga enganche', () => {
      /* Es la prueba que separa una comodidad de una fuga. Una aplicación con
         enganche puesto no puede enterarse de quién se verificó en otra por el
         mero hecho de tener enganche. */
      app('veta-wallet')
      app('una-app-ajena')
      avisar('identidad.verificada', SUJETO)
      const destinos = store.todo().entregas.map((e) => e.app)
      assert.deepEqual(destinos, ['veta-wallet'])
    })

    test('ni a las revocadas', () => {
      const { app: a } = app('veta-wallet')
      a.activa = false
      assert.equal(avisar('identidad.verificada', SUJETO), 0)
    })

    test('el filtro de eventos se respeta', () => {
      app('veta-wallet', 'https://ejemplo.invalid/avisos', ['identidad.rechazada'])
      assert.equal(avisar('identidad.verificada', SUJETO), 0)
      assert.equal(avisar('identidad.rechazada', { ...SUJETO, estado: 'rechazada' }), 1)
    })

    test('un evento que no existe no se manda nunca', () => {
      /* Pasa si mañana se añade un estado nuevo y se olvida esta lista. Sin el
         corte, a quien escucha «todos» le llega un evento que su código no sabe
         leer. */
      app('veta-wallet')
      assert.equal(avisar('identidad.inventada' as any, SUJETO), 0)
    })
  })

  describe('qué lleva dentro', () => {
    test('NI UN DATO PERSONAL', async () => {
      /* Un aviso viaja a un servidor ajeno por una dirección que se configuró
         una vez y que nadie vuelve a mirar. Lo que va ahí, va regalado. */
      app('veta-wallet')
      avisar('identidad.verificada', SUJETO, { motivo: 'documento y biometría correctos' })
      const soltar = servidor()
      try {
        await vaciarCola()
        const cuerpo = JSON.parse(recibido[0].cuerpo)
        assert.equal(cuerpo.evento, 'identidad.verificada')
        assert.equal(cuerpo.datos.identidad, 'idn_1')
        assert.equal(cuerpo.datos.gid, 'OG-AB12CD')

        const texto = recibido[0].cuerpo
        for (const prohibido of ['email', 'nombre', 'documento', 'foto', 'fecha_nacimiento']) {
          assert.ok(!texto.toLowerCase().includes(prohibido + '"'),
            `el aviso lleva «${prohibido}» dentro`)
        }
      } finally { soltar() }
    })

    test('cada envío trae su identificador, para poder ignorar repetidos', async () => {
      app('veta-wallet')
      avisar('identidad.verificada', SUJETO)
      const soltar = servidor()
      try {
        await vaciarCola()
        assert.ok(JSON.parse(recibido[0].cuerpo).entregaId, 'sin identificador no se puede desduplicar')
        assert.ok(recibido[0].cabeceras['x-genesis-entrega'])
        assert.equal(recibido[0].cabeceras['x-genesis-evento'], 'identidad.verificada')
      } finally { soltar() }
    })
  })

  describe('la firma, vista por quien la recibe', () => {
    test('LO QUE MANDAMOS LO PUEDE COMPROBAR EL INTEGRADOR', async () => {
      const { secreto } = app('veta-wallet')
      avisar('identidad.verificada', SUJETO)
      const soltar = servidor()
      try {
        await vaciarCola()
        const { cuerpo, cabeceras } = recibido[0]
        assert.ok(firmaCuadra(cuerpo, secreto, cabeceras['x-genesis-firma']),
          'el integrador no podría comprobar lo que le mandamos')
      } finally { soltar() }
    })

    test('con otro secreto NO cuadra', () => {
      const cuerpo = '{"evento":"identidad.verificada"}'
      assert.ok(!firmaCuadra(cuerpo, 'otro-secreto', firmar(cuerpo, 'el-bueno')))
    })

    test('si cambia una coma del cuerpo, NO cuadra', () => {
      /* Sin esto, quien intercepte el aviso puede cambiar «rechazada» por
         «verificada» y la firma seguiría valiendo. */
      const cabecera = firmar('{"estado":"rechazada"}', 'secreto')
      assert.ok(!firmaCuadra('{"estado":"verificada"}', 'secreto', cabecera))
    })

    test('UN AVISO VIEJO REENVIADO NO CUADRA', () => {
      /* La mitad que se olvida. Sin la hora dentro de lo firmado, un aviso
         legítimo capturado una vez se reenvía mil veces y la firma cuadra
         siempre: es un «esta persona quedó verificada» reutilizable. */
      const cuerpo = '{"evento":"identidad.verificada"}'
      const haceUnaHora = Math.floor(Date.now() / 1000) - 3600
      const vieja = firmar(cuerpo, 'secreto', haceUnaHora)

      assert.ok(!firmaCuadra(cuerpo, 'secreto', vieja), 'aceptó un aviso de hace una hora')
      // Y con la hora dentro, la firma de hace una hora no vale para AHORA.
      assert.notEqual(vieja, firmar(cuerpo, 'secreto'))
    })

    test('una cabecera vacía o rota no cuela', () => {
      const cuerpo = '{}'
      for (const mala of ['', 'nada', 't=,v1=', 'v1=abc', `t=${Math.floor(Date.now() / 1000)},v1=zz`]) {
        assert.ok(!firmaCuadra(cuerpo, 'secreto', mala), `coló «${mala}»`)
      }
    })
  })

  describe('cuando el otro lado falla', () => {
    test('un 500 no se da por entregado, y se reintenta más tarde', async () => {
      app('veta-wallet')
      avisar('identidad.verificada', SUJETO)
      const soltar = servidor({ falla: 500 })
      try {
        await vaciarCola()
        const e = store.todo().entregas[0]
        assert.equal(e.estado, 'pendiente')
        assert.equal(e.intentos, 1)
        assert.match(e.ultimoError || '', /500/)
        assert.ok(e.proximoIntento > Date.now(), 'no se reintenta inmediatamente')
      } finally { soltar() }
    })

    test('se rinde después de seis intentos, y queda escrito', async () => {
      app('veta-wallet')
      avisar('identidad.verificada', SUJETO)
      const soltar = servidor({ falla: 500 })
      try {
        for (let i = 0; i < 6; i++) {
          store.todo().entregas[0].proximoIntento = 0   // vence la espera
          await vaciarCola()
        }
        const e = store.todo().entregas[0]
        assert.equal(e.estado, 'fallida')
        assert.equal(e.intentos, 6)
        assert.ok(store.todo().bitacora.some((b) => b.accion === 'enganche.fallido'),
          'un aviso que se rinde tiene que quedar escrito: si solo queda en la cola, nadie lo mira')
      } finally { soltar() }
    })

    test('si el enganche se apaga mientras espera, no se entrega', async () => {
      const { app: a } = app('veta-wallet')
      avisar('identidad.verificada', SUJETO)
      quitarEnganche(a, 'prueba@ejemplo.invalid')
      const soltar = servidor()
      try {
        await vaciarCola()
        assert.equal(recibido.length, 0, 'se mandaron datos a una dirección ya no autorizada')
        assert.equal(store.todo().entregas[0].estado, 'cancelada')
      } finally { soltar() }
    })

    test('que el otro lado esté caído no tumba nada de aquí', async () => {
      app('veta-wallet')
      avisar('identidad.verificada', SUJETO)
      const original = globalThis.fetch
      globalThis.fetch = (async () => { throw new Error('ECONNREFUSED') }) as any
      try {
        await vaciarCola()                    // no lanza
        assert.match(store.todo().entregas[0].ultimoError || '', /ECONNREFUSED/)
      } finally { globalThis.fetch = original }
    })
  })

  describe('a dónde se deja apuntar', () => {
    const nueva = () => {
      const a: any = { id: 'x', clave: 'x', nombre: 'x', hashClave: '', pistaClave: '',
        alcances: [], activa: true, creadaEn: '', ultimoUso: null }
      store.todo().aplicaciones.push(a)
      return a
    }

    test('solo https', () => {
      const r = ponerEnganche(nueva(), 'http://ejemplo.invalid/x', [], 'a@b.invalid')
      assert.equal(r.ok, false)
      assert.match((r as any).error, /https/)
    })

    test('NO A LA RED DE CASA', () => {
      /* Sin esto, un enganche es una forma de hacer que este servicio pida
         cosas a direcciones internas que desde fuera no se alcanzan —y encima
         con reintentos automáticos. */
      for (const malo of ['https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x',
                          'https://192.168.1.1/x', 'https://169.254.169.254/latest/meta-data/',
                          'https://172.16.3.4/x']) {
        const r = ponerEnganche(nueva(), malo, [], 'a@b.invalid')
        assert.equal(r.ok, false, `dejó apuntar a ${malo}`)
      }
    })

    test('un evento inventado se rechaza al configurarlo', () => {
      const r = ponerEnganche(nueva(), 'https://ejemplo.invalid/x', ['identidad.inventada'], 'a@b.invalid')
      assert.equal(r.ok, false)
    })

    test('EL SECRETO NO SE PUEDE VOLVER A VER', async () => {
      const { app: a, secreto } = app('veta-wallet')
      const { verEnganche } = await import('../enganches/enganches.js')
      const visto = JSON.stringify(verEnganche(a))
      assert.ok(!visto.includes(secreto), 'el panel enseña el secreto otra vez')
      assert.match(visto, /"tieneSecreto":true/)
    })
  })

  test('los eventos que se documentan son los que existen', () => {
    /* Que la lista pública y la que se usa de verdad no puedan separarse. */
    assert.ok(EVENTOS.includes('identidad.verificada'))
    assert.equal(new Set(EVENTOS).size, EVENTOS.length, 'hay eventos repetidos')
  })
})
