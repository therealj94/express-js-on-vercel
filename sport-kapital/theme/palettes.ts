// theme/palettes.ts
// Los 4 temas de la app. El tema activo vive aquí como estado de módulo (sin
// depender del store, para evitar imports circulares); el store lo sincroniza
// al hidratar y al cambiarlo el usuario. Cambiar de tema remonta toda la app
// (key en el layout raíz), así que todos los estilos se recalculan al instante.

export type ThemeKey = 'neon' | 'pro' | 'light' | 'vivid';

export interface Palette {
  dark: boolean;            // controla StatusBar, scanlines y fondos
  bg: string;
  bgCard: string;
  bgCardHover: string;
  bgElevated: string;
  profit: string;
  profitDim: string;
  loss: string;
  lossDim: string;
  gold: string;             // acento principal de marca (CTAs, selección)
  goldDim: string;
  blue: string;
  blueDim: string;
  purple: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  /** gradiente del fondo ambiental (CyberBackground) */
  bgGradient: [string, string, string];
}

export const PALETTES: Record<ThemeKey, Palette> = {
  // El look original: cyberpunk neón (verde Matrix + magenta eléctrico).
  neon: {
    dark: true,
    bg: '#0A0A0F', bgCard: '#12121A', bgCardHover: '#1C1C2E', bgElevated: '#0D0D14',
    profit: '#00FF88', profitDim: 'rgba(0,255,136,0.14)',
    loss: '#FF3366', lossDim: 'rgba(255,51,102,0.14)',
    gold: '#FF00FF', goldDim: 'rgba(255,0,255,0.14)',
    blue: '#00D4FF', blueDim: 'rgba(0,212,255,0.14)',
    purple: '#B026FF',
    text: '#E0E0E0', textSecondary: '#9CA3AF', textTertiary: '#6B7280',
    border: '#2A2A3A', borderStrong: 'rgba(0,255,136,0.35)',
    bgGradient: ['#0D0D16', '#0A0A0F', '#08080C'],
  },
  // Estilo exchange profesional (inspirado en Binance): carbón + dorado.
  pro: {
    dark: true,
    bg: '#0B0E11', bgCard: '#171B20', bgCardHover: '#1E242B', bgElevated: '#12161B',
    profit: '#0ECB81', profitDim: 'rgba(14,203,129,0.13)',
    loss: '#F6465D', lossDim: 'rgba(246,70,93,0.13)',
    gold: '#F0B90B', goldDim: 'rgba(240,185,11,0.13)',
    blue: '#3B82F6', blueDim: 'rgba(59,130,246,0.13)',
    purple: '#8B5CF6',
    text: '#EAECEF', textSecondary: '#A7B1BC', textTertiary: '#5E6673',
    border: '#2B3139', borderStrong: 'rgba(240,185,11,0.4)',
    bgGradient: ['#10141A', '#0B0E11', '#090C0F'],
  },
  // Blanco limpio, tipo app bancaria moderna.
  light: {
    dark: false,
    bg: '#F4F6FA', bgCard: '#FFFFFF', bgCardHover: '#EDF0F6', bgElevated: '#FFFFFF',
    profit: '#059669', profitDim: 'rgba(5,150,105,0.10)',
    loss: '#DC2626', lossDim: 'rgba(220,38,38,0.08)',
    gold: '#7C3AED', goldDim: 'rgba(124,58,237,0.10)',
    blue: '#0284C7', blueDim: 'rgba(2,132,199,0.10)',
    purple: '#7C3AED',
    text: '#0F172A', textSecondary: '#475569', textTertiary: '#94A3B8',
    border: '#E2E8F0', borderStrong: 'rgba(5,150,105,0.45)',
    bgGradient: ['#FFFFFF', '#F4F6FA', '#EDF1F7'],
  },
  // Vibrante multicolor: violeta profundo con acentos naranja/cian/magenta.
  vivid: {
    dark: true,
    bg: '#0D0221', bgCard: '#190B33', bgCardHover: '#241245', bgElevated: '#120730',
    profit: '#3BFF9E', profitDim: 'rgba(59,255,158,0.14)',
    loss: '#FF4D8D', lossDim: 'rgba(255,77,141,0.14)',
    gold: '#FFB800', goldDim: 'rgba(255,184,0,0.15)',
    blue: '#4CC9F0', blueDim: 'rgba(76,201,240,0.14)',
    purple: '#B5179E',
    text: '#F5F0FF', textSecondary: '#C3B8E3', textTertiary: '#8C7FB5',
    border: '#32215C', borderStrong: 'rgba(255,184,0,0.45)',
    bgGradient: ['#16063A', '#0D0221', '#0A0119'],
  },
};

export const THEME_LABEL: Record<ThemeKey, { es: string; en: string }> = {
  neon: { es: 'Neón', en: 'Neon' },
  pro: { es: 'Trader Pro', en: 'Pro Trader' },
  light: { es: 'Claro', en: 'Light' },
  vivid: { es: 'Vibrante', en: 'Vivid' },
};

export const THEME_KEYS: ThemeKey[] = ['neon', 'pro', 'light', 'vivid'];

// ---------- tema activo (estado de módulo, sincronizado por el store) ----------
let currentKey: ThemeKey = 'neon';

export function setCurrentTheme(k: ThemeKey): void {
  if (PALETTES[k]) currentKey = k;
}
export function getThemeKey(): ThemeKey {
  return currentKey;
}
export function getPalette(): Palette {
  return PALETTES[currentKey];
}
