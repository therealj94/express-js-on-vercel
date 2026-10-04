# AU-RA FP · tráiler: borrador 2 (guion y diseño, sin producir)

Fuente: rama `claude/ultron-fp-premium-s46jxx` de ULTRON-APP, la más reciente: va 50 commits delante de `main` y tiene cambios del 4 de octubre. El borrador 1 se hizo sobre una versión vieja y queda descartado.

## 1. Lo que la app es hoy

**Qué promete.** «Cuatro personajes, un solo cerebro (mismas herramientas y memoria), pero cada uno con su cara, su voz, sus colores y su oficio» (mobile/src/avatares/catalogo.ts).

**Quién la usa.** Gente con Veta Wallet o Genesis ID, además de la junta. Ya no es solo un producto interno.

**Plataformas:**
- Android: APK 5.3.0 con actualizaciones por OTA.
- Web y PWA.
- Windows: AURA 1.2, con un notch negro arriba al centro, al estilo de la isla dinámica.
- iPhone: solo por la web y **sin verificar**. En el tráiler no se menciona.

**Los tres protagonistas.** El Guardián existe, pero queda fuera del tráiler.

| | AU-RA | Claudio | ANT-ONIO |
|---|---|---|---|
| Quién es | Orbe de luz que **forma con partículas las palabras que dice**. Cálida | Zorro con lentes amarillos y suéter negro con la corona verde de OG. Ingenioso y bromista | Hormiga de lentes y **cuatro brazos**, ropa negra con cian. Enérgico y práctico |
| Oficio | Compañera: agenda, recordatorios, memoria, ánimo | Anfitrión de marketing: ideas, posts, guiones | Aliado para resolver: planes, pendientes, Veta, Genesis, PULSE2CHAT |
| Color | Oro `#D6B56C` | Naranja `#FF9A4D` | Cian `#45C9DE` |
| Frase propia | «Aquí estoy. Soy AU-RA, tu compañera. ¿Qué hacemos hoy?» | «Traigo ideas frescas y los lentes puestos. ¿Qué vendemos hoy?» | «Con cuatro brazos hacemos varias cosas a la vez. ¿Qué resolvemos?» |
| Material | Orbe WebGL (src/14-orbe/orbe.html), aura.glb | 17 clips de video de 720×1280, 5 s, en bucle; claudio.glb con 30 animaciones | Igual: 17 clips; antonio.glb |

Los clips son: reposo, escucha, piensa, habla, teclea, lee, espera, saluda, señala, risa, sorpresa, triste, celebra, asiente, niega, duda y despide. Cada avatar tiene además su voz en ElevenLabs.

**Funciones que se pueden mostrar sin mentir:**
- **Hablar:** le hablas encima y se calla.
- **Llamada:** «llámame» funciona incluso con la app cerrada.
- **Recordatorios** que llaman a la hora.
- **Cámara:** «qué ves» o leer un papel.
- **Chats:** PULSE2CHAT, WhatsApp (solo para los dueños) y correo de cualquier proveedor.
- **Permisos exactos:** «Nada sale sin que tú digas que sí»; un «sí» para Ana no sirve para enviar a Bruno.
- **Cartera Veta Wallet:**
  - Es de solo lectura.
  - El pago lo prepara AURA y se firma en Veta Wallet, con el resultado «Verificado en la cadena de Orden Global».
  - **AURA nunca mueve el dinero.**
- **Su propia computadora en la nube:** muestra el plan, la vista en vivo y los pasos con captura. No paga ni compra.
- **Memoria y su círculo:** el ejemplo es el cumpleaños de mamá.
- **Propuestas** con las opciones «Sí, hazlo / Luego / No».
- **Windows:**
  - El notch, «Oye AURA» y escribir en cualquier app.
  - Control de la PC por voz y Spotify.
  - Notificaciones de WhatsApp, Teams y Outlook.

**Lo que no se dice:**
- Que AURA mueve dinero.
- Que funciona en iPhone.
- Que WhatsApp es oficial.
- «Potenciado por IA» o «tu asistente inteligente», que la propia guía prohíbe.
- Datos reales de nadie: los ejemplos del recorrido son ficticios y tienen que verse como tales.

## 2. Crítica

1. **Hay dos logos en uso.**
   - El planeta crema de AU-RA (app móvil, solo en PNG).
   - El punzón de lingote «AU» de Windows, de la dirección «Contraste», en vector (windows/marca/marca.svg).

   El tráiler necesita **uno solo**. Recomiendo el punzón: es vector, es sobrio y su idea es la más fuerte («el contraste es la marca que se golpea sobre el oro para garantizar su ley»).
2. **Hay un choque de estilos que se resuelve con una regla.** «Contraste» prohíbe orbes, partículas y glow, pero AU-RA *es* un orbe de partículas, aprobado por ti. La regla: **la marca es el escenario y los avatares son el reparto.**
   - El escenario: negro obsidiana, filos de oro de 1 px, tipografía grabada.
   - El reparto: AU-RA, Claudio y ANT-ONIO viven en ese escenario, cada uno con su color.
   - Fuera de la cara de AU-RA, el escenario no lleva orbes, glow ni partículas.
3. **Tres personajes pueden convertirse en un catálogo.** Ese error ya se cometió con el ecosistema: «el espectador frío se perdió entre Veta, Genesis, Pulse y AU-RA».
   - Solución: **un solo cerebro y tres caras** como idea, y cada personaje entra con su oficio en una sola frase.
   - Las funciones salen como acciones de ellos, no como una lista.
4. **No hay locutor.** Solo hablan ellos, con sus voces reales. La chispa del recorrido (Claudio y ANT-ONIO pinchándose) se usa una vez: es lo que da personalidad.
5. **La confianza es el diferencial.** En un mundo de IA que hace cosas solas, la frase que se queda es **«Nada sale sin tu sí.»** El clímax del tráiler es un dedo que toca «Sí».
6. **La calidad del material:**
   - Los clips son de 720p, sirven para planos medios en 9:16.
   - Para los planos héroe al estilo Apple (avatar girando en estudio, macro de los lentes de Claudio, los cuatro brazos de ANT-ONIO) hay que **renderizar los GLB en 4K con luz de estudio**. Ya existen, con 30 animaciones cada uno.
   - Los teléfonos y la laptop salen como maquetas en 3D con la interfaz real capturada.

## 3. Idea: «Un cerebro. Tres caras. Tu sí.»

## 4. Guion · 75 s · 16:9, con montaje propio en 9:16

| Tiempo | Imagen | Voz / texto en pantalla |
|---|---|---|
| 0–4 | Obsidiana. El punzón llega desde la profundidad y **golpea**: destello de 70 ms, sacudida de 2 px y el «AU» queda calado. Silencio y luego un golpe metálico seco. | — |
| 4–10 | Del negro nace el orbe. Sus partículas **forman la palabra «Hola»** y se deshacen. | AU-RA: «Aquí estoy.» · Texto: **Te escucha.** |
| 10–15 | Una partícula vuela y se convierte en el reflejo de unos lentes amarillos: **Claudio** (GLB en 4K, giro de estudio) se los acomoda y sonríe. | Claudio: «Traigo ideas frescas… y los lentes puestos.» · **Ideas.** |
| 15–20 | Un filo de oro de 1 px corta el cuadro y entra **ANT-ONIO**: los cuatro brazos se abren uno tras otro, al ritmo. | ANT-ONIO: «Cuatro brazos. Cero excusas.» · **Resuelve.** |
| 20–24 | Los tres en fila sobre obsidiana, cada uno con su color de acento. Un filo de oro los une. | Texto grande: **Un cerebro. Tres caras.** |
| 24–31 | Un teléfono flotando suena: «AU-RA te está llamando». Se contesta. | AU-RA: «Hoy es el cumpleaños de tu mamá.» · **Se acuerda por ti.** |
| 31–40 | ANT-ONIO teclea. Su pantalla se vuelve la laptop en la nube: plan, pasos con captura, vista en vivo. | ANT-ONIO: «Yo me encargo.» · **Tiene su propia computadora.** |
| 40–49 | Claudio escribe un borrador de correo. El botón **Sí, envíalo** se graba en oro, el dedo se acerca, pausa, silencio total… y toca. | Claudio: «¿Lo mando?» · **Nada sale sin tu sí.** |
| 49–56 | Cartera: el pago preparado pasa a Veta Wallet, se firma y aparece «Verificado en la cadena de Orden Global». | **Tu firma. Tu dinero.** |
| 56–64 | Laptop con Windows. Claudio: «Me hago chiquito y me meto ahí.» Se encoge y vuela al **notch**. | «Oye AURA.» · **También en tu computadora.** |
| 64–70 | Remate con chispa: ANT-ONIO asiente, Claudio celebra y el orbe forma «Listo». | ANT-ONIO: «¡Ojalá contigo funcionara igual, Claudio!» (o la que se elija del recorrido) |
| 70–75 | Obsidiana. Punzón, **AU·RA FP** y debajo, en Mono ceniza, POWERED BY ORDEN GLOBAL. Abajo y pequeño: Android · Windows · Web. | Un acorde. |

## 5. Diseño

- **Escenario «Contraste»:**
  - Obsidiana `#0D0C0A` y grafito `#171512`.
  - Oro crudo `#B8913F` y oro pulido `#E3C77E` **solo en filos de 1 px y en lo activo**.
  - Texto en papel `#ECE5D6`.
- **Tipografía:**
  - Títulos en IBM Plex Sans Condensed SemiBold, en mayúsculas y con tracking amplio.
  - Cifras en Plex Mono.
  - Una idea por pantalla, cuatro palabras como máximo.
- **Movimiento** (la guía de Windows ya lo define):
  - **golpe** (escala de 1,04 a 1 en 200 ms, con un destello mínimo);
  - **grabado** (un filo de oro que se traza);
  - **canto estriado** (para «pensando»);
  - **pátina** (para «escuchando»).
  - Los empujes de cámara son lentos. Las transiciones salen del objeto: partícula a reflejo de lentes, filo de oro a corte, avatar al notch.
- **Planos héroe:** los GLB renderizados en 4K con luz de estudio de tres puntos sobre obsidiana, con giro lento y macros (pelo de Claudio, ojos de ANT-ONIO, partículas del orbe).
- **Interfaz:** capturas reales redibujadas en vector, dentro de maquetas de teléfono y laptop. Los datos de ejemplo son ficticios.
- **Sonido:**
  - Pulso grave y piano mínimo; silencio antes del «Sí».
  - Foley de metal para el golpe, papel y teclas.
  - Las voces son las reales de los tres personajes.

## 6. Decisiones pendientes de José

1. **Logo del tráiler:** el punzón «AU» de Windows (recomendado) o el planeta de la app móvil.
2. **Público:** usuarios del ecosistema (Veta Wallet y Genesis ID), inversionistas o redes en frío.
3. **Formato:** 75 s en 16:9 más montaje en 9:16, o solo 9:16.
4. **Guardián:** fuera (recomendado) o un cameo de un segundo.
5. **Planos héroe:** ¿renderizamos los GLB en 4K? Recomendado; es por código y sin costo de IA.
