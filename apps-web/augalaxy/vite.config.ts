import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  css: { postcss: { plugins: [{
    postcssPlugin: 'orden-isolated-shell',
    Rule(rule) {
      if (!rule.source?.input.file?.endsWith('/experience.css')) return;
      if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
      rule.selectors = rule.selectors.map(selector => {
        if (selector.includes('.galaxy-os') || selector.startsWith('html.og-standalone')) return selector;
        if (/^(\.is-embedded|\[data-(motion|contrast))/.test(selector)) return ':where(.galaxy-os)' + selector;
        return ':where(.galaxy-os) ' + selector;
      });
    },
  }] } },
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        /* La ENTRADA lleva nombre fijo porque la wallet la carga por ruta
           conocida, y le cuelga su versión (?v=…) al pedirla. Los TROZOS van
           con huella en el nombre: son los que la entrada importa sola, y sin
           huella un navegador con la copia vieja seguía sirviendo el motor de
           antes por más que se publicara uno nuevo. Eso fue exactamente lo que
           le pasó a José: pantalla vieja después de publicar. */
        entryFileNames: 'assets/augalaxy.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        /* La hoja de estilo conserva el nombre conocido que carga la casa; el
           resto de recursos (tipografías) llevan huella para no pisarse entre
           sí ni quedarse en la caché del navegador. */
        assetFileNames: (info: {names?: string[]; name?: string}) =>
          (info.names?.[0] || info.name || '').endsWith('.css')
            ? 'assets/augalaxy.css'
            : 'assets/[name]-[hash][extname]',
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/postprocessing', 'postprocessing'],
          ui: ['react', 'react-dom', 'framer-motion', 'zustand'],
        },
      },
    },
  },
})
