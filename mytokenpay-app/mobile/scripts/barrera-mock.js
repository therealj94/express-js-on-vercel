#!/usr/bin/env node
// Barrera de compilación (SFSP v0.3 §16, plan v0.3 tareas 0.8 y C6): EAS
// ejecuta este script antes de instalar dependencias (`eas-build-pre-install`).
//
// Una compilación del perfil «production» es la que va a la tienda. Esa no
// sale mientras falte cualquiera de estas cuatro cosas:
//
//   1. Datos simulados apagados (EXPO_PUBLIC_USE_MOCK_API=0). Es la tarea 0.8.
//   2. Una API de verdad: EXPO_PUBLIC_API_URL puesta y en https. Sin ella, un
//      binario de tienda no tiene `hostUri` y la app cae en
//      http://localhost:3001 (src/lib/api.ts): no conecta con nada, y además
//      Genesis queda apagado (src/lib/genesisClient.ts lee la misma variable).
//   3. El libro local retirado. La billetera (saldo inicial inventado), las
//      ventas y los retiros del negocio, los catálogos y los botones «Simular
//      pago» viven en el teléfono y NO dependen de la bandera del punto 1. Es
//      el libro paralelo que C6 prohíbe publicar.
//   4. La decisión firmada que cierra C6 («Fase 4: consumir la liquidación del
//      protocolo. Hasta entonces, no publicar la app móvil»): la referencia
//      del acta va en MTP_C6_ACTA. Apagada por omisión.
//
// Antes esta barrera solo miraba el punto 1 y daba verde a un binario que no
// conectaba y que enseñaba saldos inventados. Los perfiles que no son de
// tienda (preview, local) no cambian: siguen con los datos simulados.

const fs = require('fs')
const path = require('path')

const RAIZ = path.join(__dirname, '..')
const PERFILES_TIENDA = ['production']

// Lo que delata que la app sigue llevando su propio libro. Si un archivo ya no
// existe, su señal no cuenta: al pasar a la liquidación del protocolo se
// retiran, y entonces la barrera deja de verlos.
const LIBRO_LOCAL = [
  { archivo: 'src/store/wallet.ts', senal: /INITIAL_ORIGEN/, que: 'saldo ORIGEN inicial inventado en el teléfono' },
  { archivo: 'src/store/business.ts', senal: /SEED_SALES|requestCashout/, que: 'ventas semilla y retiros bancarios simulados' },
  { archivo: 'src/lib/commerce.ts', senal: /CURATED|PRICE_RANGE/, que: 'catálogos y precios generados en el teléfono' },
  { archivo: 'app/cobro.tsx', senal: /Simular pago/, que: 'botones «Simular pago»' },
]

function leerFuente(rel) {
  try {
    return fs.readFileSync(path.join(RAIZ, rel), 'utf8')
  } catch {
    return null
  }
}

/**
 * Revisa un entorno de compilación. Devuelve { perfil, mock, motivos }:
 * `motivos` vacío quiere decir que la compilación puede seguir.
 */
function revisar(env = process.env, leer = leerFuente) {
  const perfil = env.EAS_BUILD_PROFILE || ''
  const mock = env.EXPO_PUBLIC_USE_MOCK_API !== '0'
  const motivos = []
  if (!PERFILES_TIENDA.includes(perfil)) return { perfil, mock, motivos }

  if (mock) {
    motivos.push('EXPO_PUBLIC_USE_MOCK_API tiene que ser 0: el perfil de tienda no lleva datos simulados.')
  }

  const url = String(env.EXPO_PUBLIC_API_URL || '').trim()
  if (!url) {
    motivos.push('Falta EXPO_PUBLIC_API_URL: sin ella la app de tienda apunta a http://localhost:3001 y no conecta.')
  } else if (!/^https:\/\/[^/\s]+/i.test(url) || /^https:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(url)) {
    motivos.push(`EXPO_PUBLIC_API_URL tiene que ser una dirección pública en https (llegó «${url}»).`)
  }

  const quedan = LIBRO_LOCAL.filter(({ archivo, senal }) => {
    const src = leer(archivo)
    return src != null && senal.test(src)
  })
  for (const { archivo, que } of quedan) {
    motivos.push(`C6: la app todavía lleva libro propio (${que}, ${archivo}).`)
  }

  if (!String(env.MTP_C6_ACTA || '').trim()) {
    motivos.push('C6: no hay decisión firmada para publicar la app móvil (MTP_C6_ACTA vacía). El plan v0.3 la deja sin publicar hasta la fase 4.')
  }

  return { perfil, mock, motivos }
}

if (require.main === module) {
  const { perfil, mock, motivos } = revisar()
  if (motivos.length) {
    console.error(`BARRERA: el perfil ${perfil} no se compila todavía:`)
    for (const m of motivos) console.error(`  - ${m}`)
    process.exit(1)
  }
  console.log(`barrera-mock: perfil=${perfil || '(local)'} · datos simulados ${mock ? 'ENCENDIDOS' : 'apagados'}`)
}

module.exports = { revisar, LIBRO_LOCAL, PERFILES_TIENDA }
