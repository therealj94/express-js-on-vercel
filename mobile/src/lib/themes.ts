export type ThemeName = 'nocturno' | 'claro' | 'tierra'

export interface ThemeColors {
  bg: string
  bgSoft: string
  surface: string
  surfaceHi: string
  border: string
  muted: string
  muted2: string
  text: string
  violet: string
  blue: string
  cyan: string
  ok: string
  warn: string
  danger: string
}

export interface ThemeDef {
  name: ThemeName
  label: string
  description: string
  isDark: boolean
  colors: ThemeColors
  gradient: readonly [string, string, string]
  swatch: readonly [string, string, string]
}

const nocturnoColors: ThemeColors = {
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

const claroColors: ThemeColors = {
  bg: '#FBF9FF',
  bgSoft: '#F2EEFA',
  surface: '#FFFFFF',
  surfaceHi: '#F0EAFB',
  border: '#E2D9F2',
  muted: '#5F5578',
  muted2: '#8F86A3',
  text: '#1B1330',
  violet: '#8A3DDA',
  blue: '#3450D6',
  cyan: '#0B93A3',
  ok: '#0F9D63',
  warn: '#B7791F',
  danger: '#D6365B',
}

const tierraColors: ThemeColors = {
  bg: '#180F09',
  bgSoft: '#20140C',
  surface: '#2A1B10',
  surfaceHi: '#382512',
  border: '#4A3319',
  muted: '#CBAC87',
  muted2: '#8E7150',
  text: '#FBF0E1',
  violet: '#FF7A45',
  blue: '#F2B705',
  cyan: '#2FBF9F',
  ok: '#6BCB77',
  warn: '#F2B705',
  danger: '#F0654C',
}

export const themes: Record<ThemeName, ThemeDef> = {
  nocturno: {
    name: 'nocturno',
    label: 'Nocturno',
    description: 'El tema original, oscuro y vibrante.',
    isDark: true,
    colors: nocturnoColors,
    gradient: [nocturnoColors.violet, nocturnoColors.blue, nocturnoColors.cyan],
    swatch: [nocturnoColors.violet, nocturnoColors.blue, nocturnoColors.cyan],
  },
  claro: {
    name: 'claro',
    label: 'Claro',
    description: 'Fondo blanco, alto contraste, ideal para uso de día.',
    isDark: false,
    colors: claroColors,
    gradient: [claroColors.violet, claroColors.blue, claroColors.cyan],
    swatch: [claroColors.violet, claroColors.blue, claroColors.cyan],
  },
  tierra: {
    name: 'tierra',
    label: 'Tierra',
    description: 'Cálido y terracota, inspirado en textiles latinoamericanos.',
    isDark: true,
    colors: tierraColors,
    gradient: [tierraColors.violet, tierraColors.blue, tierraColors.cyan],
    swatch: [tierraColors.violet, tierraColors.blue, tierraColors.cyan],
  },
}
