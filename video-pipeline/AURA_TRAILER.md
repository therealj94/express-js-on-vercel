# AU-RA FP · tráiler para inversionistas: borrador 5 («Un día con AU-RA»)

**Formato:** 9:16, unos 80 s.

**Idea:** un día completo, de las 6:00 a la noche: primero en el teléfono, después **salta a la computadora con Windows**. El cierre es «todo el ecosistema en un solo lugar».

**Voces:**

| Quién | Voz |
|---|---|
| Narrador de tráiler | **Hugo DeepSound** `zHRr9GkjqXG8YdNdzt2V` (latino neutro, grave, para tráilers) |
| Usuario | José (clon `5rpOswWClIYBLr0xKelj`): la voz del fundador, que les pide cosas |
| AU-RA | `AoT6sxPBYB0OGpSnIiwc` |
| Claudio | `5hNQxGboC72zatTcGoJN` |
| ANT-ONIO | `wXojZ3FhzsE0AumH6Oym` |

## Lo que se puede mostrar (verificado en el código el 4 de octubre)

| Función | Estado | Fuente |
|---|---|---|
| Llamada de AU-RA y despertador como llamada («despiértame a las 6») | ✅ | lib/manos-app.ts, docs/PUSH.md |
| Recordatorios con llamada | ✅ | |
| Correo de cualquier proveedor: revisar, leer, contestar con su «sí» | ✅ | docs/CORREO.md |
| Posts e ideas (Claudio) | ✅ | |
| Enviar ORIGEN: AURA prepara, **tú firmas** en Veta Wallet, «Verificado en la cadena de Orden Global» | ✅ en la web; la app de la wallet todavía no atiende el enlace directo | docs/CARTERA.md |
| 1 ORIGEN = 1/55 g de oro | ✅ | conocimiento.ts |
| **Tarjeta Visa virtual** dentro de Veta Wallet y de AU-RA: congelar, ver número y PIN, recargar | ✅ (real, emitida con CryptoMate) | veta-wallet-app/src/screens/Card.js, mobile/src/cartera/veta/SeccionTarjeta.tsx |
| Llamadas y videollamadas de PULSE2CHAT | ✅ | |
| Su computadora en la nube con vista en vivo | ✅ | |
| Windows: notch, «Oye AURA», tu día con Google Calendar u Outlook (solo lectura), Spotify, avisos de WhatsApp, Teams y Outlook | ✅ | windows/README.md |

**Fuera del tráiler:**
- Que **AURA compra o paga sola.** La regla es «Pagar o comprar: nunca».
- Pagar con NFC o Google Wallet: falta la aprobación de Google.
- Comprar ORIGEN o hacer swap: está apagado.
- MyTokenPay: está simulado.
- iPhone: sin verificar.

## Guion

| Tiempo | Imagen | Audio |
|---|---|---|
| **0–4 · Oscuridad** | Negro `#050B17`. | José, en voz baja: «AU-RA.» |
| **4–9 · La «A»** | Se enciende un punto cian (el punto de la «A»). Las líneas de la «A» se dibujan desde él, se vuelve **vidrio 3D** que gira en macro y se asienta con un golpe. | Tono de cristal y golpe grave. |
| **9–13 · Ella** | El punto se despega y **estalla en partículas**: el orbe de AU-RA forma «Hola». | AU-RA: «Aquí estoy.» · Narrador: **«Conoce a AU-RA.»** |
| **13–21 · 6:00 a. m.** | Cuarto en penumbra azul. En la mesa de noche, el teléfono se ilumina a pantalla completa con **«AU-RA te está llamando»**. Una mano contesta. Las partículas del orbe salen de la pantalla y forman tres tarjetas en el aire: 9:00 reunión · 12:30 almuerzo · **cumpleaños de mamá 🎂**. | AU-RA: «Buenos días. Hoy es el cumpleaños de tu mamá.» · Narrador: **«Te despierta. Te recuerda. Te llama.»** |
| **21–28 · Desayuno · Claudio** | Las partículas se condensan en **el brillo de unos lentes amarillos**: Claudio, junto a la taza de café. Chasquea los dedos y salen tres posts listos en abanico. Elige uno. | José: «Claudio, el post del lanzamiento.» · Claudio: «¿Qué tal este? ¿Lo publico?» · José: «Sí.» · Clic de cristal · Narrador: **«Ideas, listas para usar.»** |
| **28–34 · Camino · ANT-ONIO** | ANT-ONIO entra rodando el post. **Sus cuatro brazos ordenan la bandeja**: los correos vuelan a tres pilas (urgente, responder, después) y un borrador queda listo. | José: «ANT-ONIO, mis correos.» · ANT-ONIO: «Tres urgentes. Te dejé la respuesta lista.» · Narrador: **«Ordena tu día.»** |
| **34–46 · El oro (momento wow)** | José: «Mándale 110 ORIGEN a mi mamá.» Uno de los brazos de ANT-ONIO prepara el pago, otro trae la ficha de mamá y otro te señala: «La firma es tuya.» El dedo firma en Veta Wallet. **La fórmula se resuelve**: 110 ORIGEN × 1/55 g se convierte en **2 g de oro**. Un **lingote de oro diminuto en 3D** se materializa, cruza la ciudad con estela dorada y llega al teléfono de mamá, que sonríe. Sello: **Verificado en la cadena de Orden Global**. | Narrador: **«Cada ORIGEN es oro. Y solo tú firmas.»** |
| **46–51 · La tarjeta** | La **tarjeta Visa de Veta Wallet** gira en 3D (flip), muestra las opciones «Congelar» y «Recargar» y se congela con un efecto de escarcha. | Narrador: **«Tu tarjeta Visa. Dentro de tu wallet.»** |
| **51–60 · El salto a la computadora** | Oficina, de día. El teléfono está sobre el escritorio junto a una laptop con Windows. Claudio en el teléfono: «Me hago chiquito…» Se encoge, **salta del teléfono a la pantalla de la laptop** y se mete en el **notch**. El notch se despliega con «Tu día»: tres reuniones (desde el calendario) y avisos de WhatsApp, Teams y Outlook. | José: «Oye AURA, pon música.» · Spotify suena · Narrador: **«Del teléfono a tu computadora.»** |
| **60–66 · Su computadora** | José: «Investiga a este proveedor.» En el notch se abre la vista en vivo de **su propia computadora en la nube**: pestañas que se abren y capturas que se apilan; al final, una tarjeta de resultado. | Narrador: **«Y tiene su propia computadora.»** |
| **66–71 · Noche** | Cuarto, luz tenue. El orbe de AU-RA respira despacio. | AU-RA: «¿Algo más por hoy?» · José: «Gracias, AU-RA.» · AU-RA: «Para eso estoy.» |
| **71–80 · Todo en un solo lugar** | Los íconos del ecosistema (Veta Wallet, la tarjeta, PULSE2CHAT, el correo, el calendario, ORIGEN, AUKA, AGKA y Genesis ID) orbitan el punto de la «A». Los hilos se tensan, todo colapsa en el punto, medio segundo de silencio y **estallido**: la «A» de vidrio entera con AU-RA, Claudio y ANT-ONIO a su alrededor. Debajo: **AU-RA FP** · **POWERED BY ORDEN GLOBAL**. | Narrador: **«Tu wallet. Tu tarjeta. Tus chats. Tu día. Todo tu ecosistema… en un solo lugar.»** · Golpe final y silencio. |

## Producción por etapas

Hay que aprobar cada etapa antes de pasar a la siguiente.

**1. Imágenes clave:** un cuadro por escena, en 1080×1920.
- **Por código:** la «A» de vidrio en 3D (three.js con material de transmisión), el orbe de AU-RA (el real de la app, src/14-orbe), la interfaz (llamada, wallet, tarjeta, notch, correo) en vector y el final del ecosistema.
- **Placas fotográficas con IA (gpt-image-2):** el cuarto a las 6:00, la mesa del desayuno, la oficina con la laptop y el lingote de oro en macro.
  - Los avatares salen de sus fotos de referencia.
  - **Sin texto ni logos generados por IA:** las pantallas salen en blanco y se rellenan por código.
- **Costo estimado:** de 5 a 8 imágenes, unos 2 USD.

**2. Audio:** narrador, José, los tres personajes, foley y música, con una mezcla de prueba sobre las imágenes fijas (animatic).

**3. Video (lo caro):**
- Los planos de los avatares en movimiento se generan con MiniMax H3 Max, tomando las imágenes clave como primer y último cuadro.
- El motion graphics, la «A», el oro, la interfaz y las transiciones van por código.
