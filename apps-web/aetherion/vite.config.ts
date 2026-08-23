import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        // nombres fijos: la wallet los carga por ruta conocida; el caché se
        // rompe por ETag del CDN, no por hash en el nombre
        entryFileNames: 'assets/aetherion.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/aetherion.[ext]',
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/postprocessing', 'postprocessing'],
          ui: ['react', 'react-dom', 'framer-motion', 'zustand'],
        },
      },
    },
  },
})
