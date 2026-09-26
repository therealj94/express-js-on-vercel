const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const config = getDefaultConfig(__dirname)
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (platform === 'web' && name === 'react-native-maps') return { type: 'sourceFile', filePath: path.resolve(__dirname, 'maps-stub.js') }
  if (platform === 'web' && name === 'expo-secure-store') return { type: 'sourceFile', filePath: path.resolve(__dirname, 'securestore-stub.js') }
  return ctx.resolveRequest(ctx, name, platform)
}
module.exports = config
