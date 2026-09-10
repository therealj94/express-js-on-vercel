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
        /* La ENTRADA lleva nombre fijo porque la wallet la carga por ruta
           conocida, y le cuelga su versión (?v=…) al pedirla. Los TROZOS van
           con huella en el nombre: son los que la entrada importa sola, y sin
           huella un navegador con la copia vieja seguía sirviendo el motor de
           antes por más que se publicara uno nuevo. Eso fue exactamente lo que
           le pasó a José: pantalla vieja después de publicar. */
        entryFileNames: 'assets/augalaxy.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/augalaxy.[ext]',
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/postprocessing', 'postprocessing'],
          ui: ['react', 'react-dom', 'framer-motion', 'zustand'],
        },
      },
    },
  },
})
