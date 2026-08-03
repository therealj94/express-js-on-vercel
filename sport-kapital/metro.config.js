// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// El Firebase JS SDK todavía no es compatible con la resolución de "package
// exports" que Expo SDK 50+ activa por defecto en Metro: con eso encendido,
// firebase/auth se resuelve a un build equivocado y falla en tiempo de
// ejecución con "Component auth has not been registered yet". Lo apagamos
// para que Metro use la resolución clásica (main/browser fields).
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
