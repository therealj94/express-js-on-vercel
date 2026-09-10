// Ajustes que SOLO se aplican al build de ensayo.
//
// Expo lee primero app.json y le pasa el resultado a este archivo. Con
// EXPO_PUBLIC_ENSAYO sin poner se devuelve tal cual, así que production,
// preview y development no cambian ni un byte.
//
// Con EXPO_PUBLIC_ENSAYO=1 salen tres diferencias, y las tres hacen falta:
//
//   1. OTRO NOMBRE DE PAQUETE. Así el ensayo se instala AL LADO de la app de
//      verdad en vez de reemplazarla. Nadie pierde su Veta Wallet por probar.
//   2. TRÁFICO SIN CIFRAR PERMITIDO. El backend de ensayo vive en una IP con
//      http://, y Android bloquea el texto plano desde hace varias versiones.
//      Sin esto la app no llega al servidor y parece que "no funciona".
//   3. OTRO NOMBRE VISIBLE, para no confundir los dos iconos en el teléfono.
//
// El tráfico sin cifrar queda encerrado en este build: la app de las tiendas
// nunca lo lleva.

module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_ENSAYO !== '1') return config;

  const PAQUETE = 'com.ordenglobal.vetawallet.ensayo';

  // Copiar los plugins añadiéndole la excepción a expo-build-properties, sin
  // tocar el resto de su configuración.
  const plugins = (config.plugins || []).map((p) => {
    if (Array.isArray(p) && p[0] === 'expo-build-properties') {
      return [p[0], { ...p[1], android: { ...(p[1] || {}).android, usesCleartextTraffic: true } }];
    }
    return p;
  });

  return {
    ...config,
    name: 'Veta Wallet ENSAYO',
    plugins,
    android: { ...config.android, package: PAQUETE },
    ios: { ...config.ios, bundleIdentifier: PAQUETE },
  };
};
