// Reparte un estilo entre el Pressable externo (layout) y la vista animada
// interna (lo visual).
//
// POR QUÉ: nuestros pressables animados envuelven a sus hijos en una
// Animated.View. Si TODO el estilo va a esa vista interna, el Pressable
// externo queda con ancho automático y un `width: '48%'` o `flex: 1` del que
// lo usa se resuelve contra ese ancho automático: la tarjeta colapsa a una
// tira. Se vio en producción: el teclado de la caja y las tarjetas del panel
// aplastados en columnas ilegibles.
//
// La regla: lo que posiciona y dimensiona (width, flex, márgenes, alignSelf)
// vive en el externo; lo que pinta (fondo, borde, padding, sombra) vive en el
// interno, que se estira para llenar al externo cuando este tiene tamaño.

import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

const CLAVES_LAYOUT = [
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
  'display', 'aspectRatio',
] as const

export function repartirEstilo(style: StyleProp<ViewStyle>): {
  externo: ViewStyle
  interno: ViewStyle
} {
  const plano = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>
  const externo: Record<string, unknown> = {}
  const interno: Record<string, unknown> = {}

  for (const [clave, valor] of Object.entries(plano)) {
    if ((CLAVES_LAYOUT as readonly string[]).includes(clave)) externo[clave] = valor
    else interno[clave] = valor
  }

  // Si el externo tiene tamaño propio, el interno lo llena; si no, el interno
  // se dimensiona por su contenido, como siempre.
  const tieneAncho =
    externo.width !== undefined || externo.flex !== undefined ||
    externo.flexGrow !== undefined || externo.flexBasis !== undefined ||
    externo.alignSelf === 'stretch'
  if (tieneAncho) interno.width = '100%'
  if (externo.height !== undefined) interno.height = '100%'

  return { externo: externo as ViewStyle, interno: interno as ViewStyle }
}
