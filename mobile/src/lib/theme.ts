// Palette sampled from the MyTokenPay mark itself (magenta-violet → royal blue →
// cyan) rather than a generic purple/blue gradient — neutrals are tinted toward
// the same violet instead of a flat blue-black.
export const colors = {
  bg: '#0A0812',
  bgSoft: '#100C1B',
  surface: '#171224',
  surfaceHi: '#211A33',
  border: '#2C2444',
  muted: '#9D91B8',
  muted2: '#6C6089',
  text: '#F5F2FA',

  violet: '#C266F5',
  blue: '#4C6EF0',
  cyan: '#4FF0FF',

  ok: '#34D399',
  warn: '#FBBF24',
  danger: '#FB7185',
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
  display: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_800ExtraBold',
  displayMedium: 'BricolageGrotesque_500Medium',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemiBold: 'InstrumentSans_600SemiBold',
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

export const alpha = withAlpha

import { Platform } from 'react-native'

// Tinted shadows (matching the surface hue, not generic black) for the few
// elements that should visibly float: primary CTAs, sheets, floating buttons.
// direction 'up' is for bottom sheets, whose only visible edge is the top one.
export function shadow(tintColor: string, size: 'sm' | 'lg' = 'sm', direction: 'down' | 'up' = 'down') {
  const cfg = size === 'lg' ? { offset: 14, opacity: 0.32, radius: 24, elevation: 10 } : { offset: 6, opacity: 0.26, radius: 12, elevation: 5 }
  const height = direction === 'up' ? -cfg.offset : cfg.offset
  return Platform.select({
    ios: {
      shadowColor: tintColor,
      shadowOffset: { width: 0, height },
      shadowOpacity: cfg.opacity,
      shadowRadius: cfg.radius,
    },
    android: { elevation: cfg.elevation, shadowColor: tintColor },
    default: {},
  })
}
