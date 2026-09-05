import type { Config } from 'tailwindcss';

// Solo cian, azul eléctrico y blanco azulado. No hay otro color en este mundo.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vacio: '#02060f',
        abismo: '#030814',
        cian: '#5DD6FF',
        electrico: '#1B6BFF',
        hielo: '#EAF2FF',
        bruma: '#9FB3CC',
      },
      fontFamily: {
        marca: ['Cinzel', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { hud: '0.28em' },
    },
  },
  plugins: [],
};
export default config;
