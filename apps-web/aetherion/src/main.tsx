import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import './styles.css'
import { transit } from './transit/transit'
import { refrescarCasas } from './sky/Wells'
import { useUiStore } from './state/uiStore'

/* LA FUSIÓN CON LA WALLET. Aetherion no se monta solo: expone montar y
   desmontar, y la wallet decide cuándo el Inicio es esta galaxia. El modo
   standalone (un #root en la página) sigue vivo para desarrollo. */
let raiz: Root | null = null

function montar(el: HTMLElement) {
  if (raiz) desmontar()
  /* La casa ya dejó puestos el idioma y las marcas: se rearman los planetas
     con eso ANTES de dibujar nada. */
  refrescarCasas()
  raiz = createRoot(el)
  // sin StrictMode dentro de la wallet: el doble-montaje de desarrollo
  // duplica los efectos del canvas y ahí no ayuda a nadie
  raiz.render(<App />)
}

function desmontar() {
  raiz?.unmount()
  raiz = null
}

/* Exhalar desde afuera: cuando una casa se abre en otra pestaña, la wallet
   pide la Exhalación y esta galaxia vuelve sola al cielo. */
function exhalar() {
  try { transit.requestExit() } catch { /* sin tránsito activo no hay nada que exhalar */ }
  useUiStore.getState().setActive(null)
}

;(window as any).AETHERION = { montar, desmontar, exhalar }

refrescarCasas()
const solo = document.getElementById('root')
if (solo) {
  document.documentElement.classList.add('ae-solo')
  raiz = createRoot(solo)
  raiz.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
