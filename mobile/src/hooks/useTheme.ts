import { useThemeStore } from '../store/theme'
import { themes, type ThemeColors, type ThemeName } from '../lib/themes'
import { fonts, radius, spacing, alpha } from '../lib/theme'

export function useTheme() {
  const themeName = useThemeStore((s) => s.themeName)
  const setTheme = useThemeStore((s) => s.setTheme)
  const def = themes[themeName]

  return {
    themeName,
    setTheme,
    themeDef: def,
    isDark: def.isDark,
    colors: def.colors,
    gradient: def.gradient,
    fonts,
    radius,
    spacing,
    alpha,
  }
}

export type { ThemeColors, ThemeName }
