# ÆTHERION · v0.1 "Semilla del Sistema Vivo"

Web OS galáctico vivo. React 19 + TypeScript + Vite + React Three Fiber v9 + postprocessing + Zustand + Framer Motion. Cero assets externos: todo es procedural (shaders, canvas textures, síntesis WebAudio).

## Arranque

```bash
npm install
npm run dev      # abre en el puerto que indique Vite (host expuesto)
npm run build    # tsc --noEmit + bundle
```

## Mapa del código

| Ruta | Rol |
|---|---|
| `src/kernel/sim.ts` | Estado por-frame compartido (no-reactivo), paletas de Marea, easings, RNG |
| `src/kernel/Kernel.tsx` | Reloj maestro, latido 52 BPM, respiración 4.6 s, exposición AgX, escalera térmica de calidad |
| `src/kernel/rig.ts` | Cámara orbital esférica con damping + etiquetas de altitud |
| `src/state/uiStore.ts` | Estado reactivo UI (selección, sintonía, marea, eclipse, pulso) |
| `src/sky/lattice.ts` | Generador de la Trama: filamentos neuronales + muestreo arc-length |
| `src/sky/galaxy.ts` | Instancia única de la galaxia (seed fija) |
| `src/sky/Sky.tsx` | Ensamblado: filamentos, nebulosas, polvo ×2, Núcleo, Tu Luz, Mareas, intro |
| `src/sky/Wells.tsx` | 5 arquetipos de Pozos (pulsar/binaria/memoria/toroide/centinela), registry para raycast y tránsito |
| `src/sky/Dust.tsx` `textures.ts` | Polvo instanciado por shader; texturas procedurales en canvas |
| `src/shaders/shared.ts` | Snoise/fbm, atmósfera fresnel-backside, shader de polvo |
| `src/shaders/MembraneEffect.tsx` | Pass único: iris de membrana, desaturación (dilación temporal), distorsión de entrada, brillo plasma |
| `src/transit/transit.ts` | Motor cinematográfico: entrada 1650 ms en fases (0–120–450–900–1300–1650) + La Exhalación 1250 ms + órbita interior + ráfagas de partículas |
| `src/transit/TransitRunner.tsx` | Loop del tránsito + composer (Bloom → Membrane → Vignette) |
| `src/pulses/Pulses.tsx` | Notificaciones viajeras por filamento con llegada anticipada |
| `src/gesture/useGestures.tsx` | Fusión de pointers: tap/dbl-tap/long-press/pinch/2-dedo marea/edge pulso/rueda/Esc |
| `src/audio/engine.ts` | WebAudio: dron respiratorio, shimmer, latido, whoosh, aterrizaje, campanas + háptica |
| `src/hud/Hud.tsx` | Arco superior, altitud, línea de Marea, toasts, FPS |
| `src/hud/Overlays.tsx` | Tarjeta-susurro, Desgarro de gravedad radial, El Pulso, panel de dimensión interior |

## Gestos

- **1 dedo drag** — orbitar · **pinch / rueda** — altitud (Cielo→Constelación→Órbita)
- **tap** — seleccionar (susurro) · **doble-tap** — Sintonizar (transición épica)
- **long-press 420 ms** — menú radial "Desgarro de gravedad"
- **swipe vertical a 2 dedos** — cambiar Marea · **edge-swipe izquierdo desde borde derecho** — El Pulso
- **dentro de una app:** swipe hacia abajo o botón EXHALAR — La Exhalación
- **E** — Eclipse · **Esc** — retroceder capa

## Adaptarlo a tu proyecto

1. Copia `src/` (o solo las carpetas) y monta `<App />` donde quieras.
2. Apps reales: sustituye el grid de cristales de `DimensionPanel` (`hud/Overlays.tsx`) por tu UI; crea `src/dimensions/<app>/` y móntala condicionando por `activeId`.
3. Nuevos pozos: añade entradas en `WELL_NAMES` (`sky/Wells.tsx`) — la galaxia coloca órganos nuevos automáticamente sobre la Trama.
4. Automatizaciones-cometa, esporas widget y Constelación Activa (multitask visual): puntos de extensión marcados por `wellRegistry`, `GALAXY.paths` y `PulsePool`.

## Presupuesto de rendimiento

Draw calls < 30 en reposo. Escalera térmica automática: DPR → Bloom off → (documentado para extender a densidad de polvo). Objetivo: 60 fps sostenidos en gama media; `sim.frameEma` alimenta el autoajuste y el contador HUD.

## La fusión con Veta Wallet

Este árbol es LA FUENTE del Inicio de Veta Wallet. Lo que corre en la wallet
es el bundle compilado que vive en `apps-web/veta-wallet/augalaxy/assets/`
(nombres fijos: `augalaxy.js`, `augalaxy.css`, `three.js`, `r3f.js`,
`ui.js`), cargado en diferido por `app.js` solo al pisar el Inicio.

Contrato con la casa (`src/main.tsx`):

- `window.AUGALAXY = { montar(el), desmontar(), exhalar() }` — la wallet
  decide cuándo el Inicio es esta galaxia. El modo standalone (`#root` en la
  página) sigue vivo para desarrollo y marca `html.ae-solo`, que es lo ÚNICO
  que activa los estilos globales de pantalla completa: fundida en la wallet
  no se toca ni el fondo ni el scroll de la casa.
- `window.__AE_LANG` (`'es'`/`'en'`) elige el idioma de pozos y HUD.
- `window.__AE_ABRIR(clave)` es el puente real de navegación; con él
  presente, los Pulsos aleatorios se apagan (nada de avisos inventados).

Para reconstruir el bundle tras tocar la fuente:

```bash
cd apps-web/augalaxy
npm install --legacy-peer-deps    # postprocessing pinneado pelea con npm a secas
npx vite build
cp dist/assets/{augalaxy.js,augalaxy.css,three.js,r3f.js,ui.js} \
   ../veta-wallet/augalaxy/assets/
node ../veta-wallet/pruebas/augalaxy-inicio.mjs   # la prueba de la fusión
```

## Publicar (y por qué NO se copia a mano)

```bash
cd apps-web/augalaxy
npm install --legacy-peer-deps    # solo la primera vez
python3 publicar.py               # compila, copia y SELLA la versión
```

`publicar.py` calcula la huella de lo compilado y la escribe en `app.js`
(`const AET_V`), que pide el motor con `?v=<huella>`. Los trozos ya llevan su
huella en el nombre. Esto existe porque pasó de verdad: se publicó un Inicio
nuevo y el teléfono siguió enseñando el viejo durante horas, porque el archivo
de entrada tiene nombre fijo y el navegador se quedó con su copia. Con la
huella colgada del pedido, motor nuevo es dirección nueva y no hay copia vieja
que valga.
