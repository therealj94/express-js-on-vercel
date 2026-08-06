module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // El plugin de worklets DEBE ir al final. Reanimated 4 lo trae aquí y no en
    // react-native-reanimated/plugin como en la 3.
    plugins: ['react-native-worklets/plugin'],
  }
}
