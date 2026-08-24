import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import './styles.css'
import { transit } from './transit/transit'
import { refrescarCasas } from './sky/Wells'
import { rig } from './kernel/rig'
import { sim } from './kernel/sim'
import { useUiStore } from './state/uiStore'
import './kernel/genesis'

/* LA FUSIÓN CON LA WALLET. Aetherion no se monta solo: expone montar y
   desmontar, y la wallet decide cuándo el Inicio es esta galaxia. El modo
   standalone (un #root en la página) sigue vivo para desarrollo. */
let raiz: Root | null = null

/* EN CERO. El motor guarda su estado en módulos que sobreviven al montaje:
   si una casa quedó marcada como abierta al salir, al volver el Inicio la
   abría sola y no había manera de quedarse en la galaxia. Montar y desmontar
   pasan por aquí, siempre. */
function reiniciar() {
  try {
    transit.active = false
    transit.mode = null
    transit.wid = null
    transit.exitRequested = false
    rig.enabled = true
    const st = useUiStore.getState()
    st.setActive(null)
    st.select(null)
    st.closeTear()
    st.setPulso(false)
  } catch { /* un motor a medio cargar no tiene nada que reiniciar */ }
}

function montar(el: HTMLElement) {
  if (raiz) desmontar()
  reiniciar()
  /* Nace como corresponda: suelto en el umbral, en formación dentro de la
     casa. Sin esto, entrar directo al Inicio (una recarga con sesión) mostraba
     el sistema desparramado sin motivo. */
  cancelAnimationFrame(acomodoRaf)
  sim.acomodo = (window as any).__AE_PUERTA ? 1 : 0
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
  reiniciar()
}

/* Exhalar desde afuera: cuando una casa se abre en otra pestaña, la wallet
   pide la Exhalación y esta galaxia vuelve sola al cielo. */
function exhalar() {
  try { transit.requestExit() } catch { /* sin tránsito activo no hay nada que exhalar */ }
  useUiStore.getState().setActive(null)
}

;/* LA ENTRADA CONTINUA. La puerta y la casa son LA MISMA escena: la wallet
   monta la galaxia detrás del login con __AE_PUERTA puesto (cámara lejos, a
   la deriva, nombres callados) y, cuando la persona entra, llama a entrar():
   un solo vuelo de cámara — sin cortes — hasta el encuadre de casa.

   Dos maneras de entrar, como pide el diseño:
     · 'descubrir' (cuenta recién creada): descenso lento, con fase de
       acercamiento — el ecosistema se presenta.
     · 'directo' (sesión de siempre): vuelo corto y decidido.
   AURA late más fuerte como bienvenida en los dos. alListo se llama con el
   vuelo al 80%: la casa cambia de vista mientras la cámara sigue volando y
   nadie ve una costura. */
function entrar(tipo: 'descubrir' | 'directo', alListo?: () => void) {
  const dura = tipo === 'descubrir' ? 2300 : 1100
  delete (window as any).__AE_PUERTA
  sim.auraBrillo = tipo === 'descubrir' ? 1 : 0.6
  rig.volar(dura)
  /* EL ACOMODO DEL SISTEMA. Mientras la cámara vuela, los mundos viajan desde
     su sitio disperso hasta su órbita: se ACOMODAN. Tarda un pelo más que el
     vuelo a propósito —la cámara llega y las casas terminan de asentarse
     delante— y con easing suave para que se lea como algo que se ordena, no
     como algo que salta. */
  acomodar(0, dura * 1.25)
  if (alListo) window.setTimeout(alListo, Math.round(dura * 0.8))
}

/* Lleva sim.acomodo hasta un destino en el tiempo pedido. Reloj de pared: en
   un teléfono lento el acomodo tiene que durar lo que dice, no el doble. */
let acomodoRaf = 0
function acomodar(hasta: number, dura: number) {
  cancelAnimationFrame(acomodoRaf)
  const desde = sim.acomodo
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    sim.acomodo = desde + (hasta - desde) * e
    if (p < 1) acomodoRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.acomodo = hasta; return }
  acomodoRaf = requestAnimationFrame(paso)
}

/* De vuelta al umbral: salir de la sesión no corta la escena, la aleja. */
function puerta() {
  ;(window as any).__AE_PUERTA = true
  rig.puerta()
  // el sistema vuelve a soltarse, más despacio de lo que se acomodó
  acomodar(1, 1600)
}

/* Para que la casa pueda comprobar lo que ve: en qué punto está el acomodo
   (1 = suelto, 0 = en formación). Lo usa la prueba de la puerta. */
;(window as any).AETHERION = {
  montar, desmontar, exhalar, entrar, puerta,
  acomodo: () => sim.acomodo,
}

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
