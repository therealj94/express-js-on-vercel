# AURA OS

El sistema operativo espacial de la junta de Orden Global. El asistente **es** la
interfaz: un ser de luz cian en el vacío, las casas del ecosistema orbitando a
su alrededor con sus datos vivos, la conversación flotando en el espacio, y un
arco de voz abajo. Nada de paneles, nada de columnas de chat.

Se sirve **desde ULTRON** (`infra/ultron/public/os`, ruta `/os/`): mismo
origen, misma cookie de sesión, mismo `/pensar`. La raíz de ULTRON manda al OS;
el panel de antes sigue en `/clasico/`.

## Cómo se trabaja

```
npm ci
npm run dev          # http://localhost:3000/os  (apuntá el API a ULTRON con un proxy, o usá el build)
npm run typecheck
npm run entregar     # next build + copia a ../../infra/ultron/public/os
node ../../infra/ultron/pruebas/probar-os.mjs   # el OS en un navegador de verdad
```

`public/os` se **versiona**: el despliegue de ULTRON empaqueta `git archive`,
así que lo que se sube es lo que está construido y comprobado en el repo.

## Qué hay adentro

| Archivo | Qué hace |
| --- | --- |
| `lib/os-store.ts` | El estado (zustand): `mode` boot·idle·listen·think·speak·focus, módulo enfocado, mensajes, nivel de voz. |
| `lib/api.ts` | El API de ULTRON: `/yo`, `/saludo`, `/vivo`, `/pendientes`, `/pensar` en streaming, `/voz`. Todo real. |
| `lib/voz.ts` | El locutor: dice las frases **a medida que llegan** (ElevenLabs flash o la voz del navegador) y escucha con Web Speech. |
| `lib/aura-rig.ts` | El rig: respiración de 4,2 s, cabeza, párpados, sienes, cintas, pecho, por modo. |
| `lib/modules.ts` | Las casas: ORIGEN·ORO, VETA WALLET, ORDENEX (anillo medio) · CADENA 5550, AUCORP, GENESIS ID, PENDIENTES (exterior). |
| `lib/renderer.ts` | WebGL2 con ACES por defecto; WebGPU solo con `?webgpu=1`; el vigilante baja de calidad si un cuadro pasa de 18 ms dos segundos. |
| `components/os/AuraBeing.tsx` | El ser: 40 mil puntos en un draw call, ojos, núcleo, filamentos. |
| `components/os/EnergyRibbons.tsx` | Cinco cintas de seda de energía; una se enrolla al pensar, todas se abren al escuchar. |
| `components/os/OrbitModules.tsx` | Los orbes en órbita: pasar ilumina, tocar despliega la lámina y atenúa el resto. |
| `components/os/ConversationField.tsx` | Las burbujas (Aura junto a la mejilla, la persona abajo a la derecha) y la chispa que sale del pecho. |
| `components/os/VoiceOrbInput.tsx` | El arco de voz y el orquestador de un turno: texto → pensar → burbuja viva → voz frase por frase. |
| `components/os/HUDChrome.tsx` | Lo mínimo: ORDEN GLOBAL, hora, CADENA 5550. La puerta cuando no hay sesión. Menú con toque largo sobre el núcleo. |

## Reglas que no se negocian

- Solo cian, azul eléctrico y blanco-azul. El estado se dice con luz, no con
  otro color: lo vivo brilla, lo caído se apaga.
- Ningún número inventado. Lo que no se pudo leer sale como «—» o «no contesta».
- Si no hay WebGL, el ser sale en 2D y la conversación sigue: nunca una pantalla en blanco.
- Siempre en español. El modelo se presenta como «Aura» en esta interfaz (`alias`).
