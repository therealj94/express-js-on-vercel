export const colors = {
  bg: '#07080f',
  bgSoft: '#0b0e18',
  surface: '#10131f',
  surfaceHi: '#161a2a',
  border: '#1f2437',
  muted: '#8892a8',
  muted2: '#5c6480',
  text: '#eef0f7',

  violet: '#8b5cf6',
  blue: '#4c8dff',
  cyan: '#22d3ee',

  ok: '#34d399',
  warn: '#fbbf24',
  danger: '#f87171',
}

export const gradient = [colors.violet, colors.blue, colors.cyan] as const

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
}

export const spacing = (n: number) => n * 4

export const fonts = {
  display: 'Sora_600SemiBold',
  displayBold: 'Sora_700Bold',
  displayMedium: 'Sora_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

export const alpha = withAlpha
