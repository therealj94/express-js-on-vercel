import { View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'

// Código QR de demostración: patrón determinístico generado desde el payload
// (mismo payload → mismo dibujo). En producción se sustituye por una librería
// QR real; la interfaz del componente no cambia.

const GRID = 21

function bitsFrom(payload: string): boolean[] {
  let h1 = 0x811c9dc5
  const out: boolean[] = []
  for (let i = 0; i < GRID * GRID; i++) {
    const c = payload.charCodeAt(i % payload.length)
    h1 ^= c + i
    h1 = (h1 * 16777619) >>> 0
    out.push((h1 & 0x9) % 3 !== 0)
  }
  return out
}

function isFinder(x: number, y: number): boolean {
  const inTL = x < 7 && y < 7
  const inTR = x >= GRID - 7 && y < 7
  const inBL = x < 7 && y >= GRID - 7
  return inTL || inTR || inBL
}

function finderOn(x: number, y: number): boolean {
  const lx = x < 7 ? x : x - (GRID - 7)
  const ly = y < 7 ? y : y - (GRID - 7)
  const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6
  const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4
  return ring || core
}

export function QrBadge({ payload, size = 200, fg = '#0A0812', bg = '#FFFFFF' }: { payload: string; size?: number; fg?: string; bg?: string }) {
  const cell = size / (GRID + 4) // quiet zone de 2 celdas
  const off = cell * 2
  const bits = bitsFrom(payload)
  const rects = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const on = isFinder(x, y) ? finderOn(x, y) : bits[y * GRID + x]
      if (on) rects.push(<Rect key={`${x}-${y}`} x={off + x * cell} y={off + y * cell} width={cell + 0.4} height={cell + 0.4} fill={fg} />)
    }
  }
  return (
    <View style={{ width: size, height: size, backgroundColor: bg, borderRadius: 16, overflow: 'hidden' }}>
      <Svg width={size} height={size}>{rects}</Svg>
    </View>
  )
}
