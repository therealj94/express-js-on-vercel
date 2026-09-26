#!/usr/bin/env node
// Barrera de compilación (SFSP v0.3 §16, plan v0.3 tarea 0.8): EAS ejecuta este
// script antes de instalar dependencias. Una compilación del perfil «production»
// con los datos simulados encendidos se detiene aquí.
const perfil = process.env.EAS_BUILD_PROFILE || ''
const mock = process.env.EXPO_PUBLIC_USE_MOCK_API !== '0'
if (perfil === 'production' && mock) {
  console.error('BARRERA: el perfil production no puede llevar EXPO_PUBLIC_USE_MOCK_API distinto de 0 (datos simulados).')
  process.exit(1)
}
console.log(`barrera-mock: perfil=${perfil || '(local)'} · datos simulados ${mock ? 'ENCENDIDOS' : 'apagados'}`)
