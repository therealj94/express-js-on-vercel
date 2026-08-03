// SDK 54: babel-preset-expo ya incluye el plugin de worklets/reanimated
// automáticamente — declararlo a mano (como en SDK 51) rompe el arranque.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
