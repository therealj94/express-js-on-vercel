// theme/tokens.ts — sistema de diseño Sport Kapital con 4 temas intercambiables.
//
// `colors` es un Proxy que SIEMPRE devuelve el valor del tema activo, así que
// cualquier uso en línea (props de JSX, valores por defecto de parámetros) se
// resuelve en el momento del render y cambia de tema automáticamente.
//
// Los StyleSheet.create de cada archivo se envuelven en `themedSheet((colors) =>
// StyleSheet.create({...}))`: la hoja se construye por tema (con caché) y se
// re-resuelve al remontar la app tras un cambio de tema (key en el layout raíz).
import { getPalette, getThemeKey, type Palette, type ThemeKey } from './palettes';

export type { Palette, ThemeKey };
export { getPalette, getThemeKey };

/** Paleta viva: siempre lee el tema activo. */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_t, prop) => (getPalette() as unknown as Record<string | symbol, unknown>)[prop],
}) as Palette;

/**
 * Hoja de estilos por tema: recibe la paleta concreta y devuelve la hoja.
 * Se cachea una hoja por tema; el Proxy resuelve cada acceso a `styles.x`
 * contra la hoja del tema activo en el momento del render.
 */
export function themedSheet<T extends object>(factory: (c: Palette) => T): T {
  const cache = new Map<ThemeKey, T>();
  return new Proxy({} as T, {
    get(_t, prop) {
      const k = getThemeKey();
      let sheet = cache.get(k);
      if (!sheet) {
        sheet = factory(getPalette());
        cache.set(k, sheet);
      }
      return (sheet as Record<string | symbol, unknown>)[prop];
    },
  }) as T;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

// cortes duros por defecto: la marca evita las esquinas muy redondeadas
export const radius = { none: 0, sm: 2, md: 4, lg: 6, xl: 8, full: 4 };

export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, '2xl': 24, '3xl': 30, '4xl': 40 },
  family: {
    heading: 'Orbitron_800ExtraBold',
    headingBlack: 'Orbitron_900Black',
    headingBold: 'Orbitron_700Bold',
    body: 'JetBrainsMono_400Regular',
    bodyMedium: 'JetBrainsMono_500Medium',
    bodySemiBold: 'JetBrainsMono_600SemiBold',
    bodyBold: 'JetBrainsMono_700Bold',
    mono: 'ShareTechMono_400Regular',
  },
};

export const deltaColor = (v: number) => (v >= 0 ? getPalette().profit : getPalette().loss);

/** Sombra de neón (glow) real vía shadow* (iOS) — en Android se combina con un halo de color detrás. */
export function neon(color: string, size: 'sm' | 'md' | 'lg' = 'md') {
  const radiusBySize = { sm: 6, md: 12, lg: 22 } as const;
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: size === 'sm' ? 0.55 : size === 'lg' ? 0.9 : 0.75,
    shadowRadius: radiusBySize[size],
    elevation: size === 'sm' ? 4 : size === 'lg' ? 14 : 8,
  };
}
