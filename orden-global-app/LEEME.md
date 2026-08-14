# Orden Global — la app única, con GENESIS de asistente

Todo el ecosistema en un solo lugar: se abre con el monograma OG latiendo,
se entra con la cuenta de Veta Wallet, y dentro viven las apps —cada una
con su propio diseño—, el cerebro en vivo, el chat con envío de ORIGEN y la
barra de GENESIS abajo, en todas las pantallas.

---

## La crítica primero — lo pedido, revisado antes de construir

Se pidió «critícalo todo, arma las mejorías y luego entrega». Esto es lo que
se cambió del pedido original, y por qué:

1. **«Iniciar sesión ya abre a todo»** — casi. El login abre Veta Wallet,
   el explorador y el cerebro. Pero **MyTokenPay mantiene el candado de
   Genesis ID** (como también se pidió): mover el dinero propio es una cosa;
   operar como comercio, otra. El candado pregunta al puente `/genesis` del
   backend y una falla de red NO deja a nadie fuera — solo bloquea la
   respuesta «no está completo».

2. **Chat «guardado en blockchain»** — el chat NO va a la cadena, y la app
   no lo promete en ningún texto. Meter cada mensaje en la cadena costaría
   gas por saludo y haría público cada «hola». Lo que SÍ está en la cadena
   es lo que importa: los envíos de ORIGEN que nacen del chat. Los mensajes
   van por un relevo propio (`infra/mensajes`, ya desplegado en el nodo del
   cerebro). **Sin cifrado de extremo a extremo en v1** — dicho aquí y no
   escondido; E2E es fase siguiente.

3. **Dictado de voz** — GENESIS **habla** con `expo-speech` (la mejor voz
   del teléfono, es-MX / en-US, con la respiración por trozos del cerebro).
   Para **escuchar**, el botón dorado enfoca la caja y el micrófono del
   teclado (Gboard/iOS) dicta gratis y en los dos idiomas. Un módulo nativo
   de reconocimiento era riesgo de compilación sin poder probarlo aquí; se
   añade en fase 2 con un build de desarrollo en la mano.

4. **«Las apps con sus diseños, dentro»** — se usan las **versiones web
   reales ya desplegadas** (`apps-web/`): Veta Wallet en `app.vetawallet.com`
   y MyTokenPay en su Amplify. Mismo diseño porque es la misma app. La regla
   de seguridad se mantiene: **nada que vea una clave privada vive fuera de
   su propio contexto** — la web de la wallet firma donde siempre.

5. **«Enviar ORIGEN listo desde el chat / por voz»** — GENESIS **prepara,
   la persona firma**. Confirmación SÍ/NO con lo entendido escrito (y la
   dirección `og://` a la vista), y la wallet abre con la dirección copiada.
   Ni el chat ni el asistente transmiten jamás una transacción: un error de
   oído no puede costar dinero, y las tiendas rechazan lo contrario.

6. **El monto y el destinatario nunca se inventan.** «Envía 15 a Ramón» sin
   Ramón en la libreta → lo dice. «Envíale a Juan» sin monto → lo pide.
   «Envía mil» en letras → pide el número. Probado en node, 31 casos.

---

## Qué hay dentro

| Pieza | Fichero | Qué hace |
|---|---|---|
| Portada | `src/screens/Splash.js` | monograma OG con anillos de oro latiendo |
| Puerta | `src/screens/Auth.js` | la MISMA cuenta de Veta Wallet (`/auth/login`) |
| Inicio | `src/screens/Home.js` | pantalla negra, apps con su logo sobre su fondo de marca |
| Apps dentro | `src/screens/AppView.js` | WebView + candado Genesis + nota de envío preparado |
| El cerebro | `src/screens/Cerebro.js` | 42 neuronas en 3 capas de profundidad, pulsos de oro por las sinapsis; botón al cerebro completo (FLUX con su voz) |
| Chat | `src/screens/Chat.js` | contactos, hilo, emojis, ENVIAR ORIGEN |
| Asistente | `src/screens/Asistente.js` | ejemplos que se tocan y funcionan + las tres reglas |
| La barra | `src/BarraGenesis.js` | escucha → entiende → confirma; en todas las pantallas |
| El mapa | `src/rutas.js` | **si no está aquí, GENESIS no lo puede hacer** |
| El traductor | `src/intencion.js` | 4 verbos; entidades de la libreta, nunca inventadas |
| La voz | `src/voz.js` | expo-speech con respiración por trozos (como el cerebro) |
| Sesión y red | `src/api.js` | wallet, puente Genesis, relevo de mensajes, libreta |
| Idiomas | `src/i18n.js` | 69 claves, paridad es/en comprobada por prueba |

Toda navegación —dedo, asistente o enlace `og://`— pasa por `abrir(uri)` y
por el mapa. **Un solo camino, un solo sitio que auditar.**

## Las pruebas (corren aquí, sin emulador)

```
npm run probar
```
- `probar-intencion.cjs` — 31 comprobaciones del traductor y el mapa,
  incluidos los tres fallos que tienen que fallar bien.
- `probar-i18n.cjs` — los dos idiomas dicen lo mismo: mismas claves, mismas
  variables, ninguna vacía.
- Los 18 ficheros pasan el parser de Babel (sintaxis JSX comprobada).

## Generar el APK

Igual que Veta Wallet (ver `COMO_GENERAR_APK.md` en la raíz): el build corre
en la nube de Expo con tu cuenta — desde este entorno no se puede, no hay
credenciales de Expo y no deben estar aquí.

```bash
cd orden-global-app
npm install
eas init                                # una vez, con tu cuenta de expo.dev
eas build -p android --profile preview  # ~10-15 min → enlace del .apk
```

## El relevo de mensajes (el servidor del chat)

`infra/mensajes/servidor.py` — python puro, sin dependencias, corriendo como
`mensajes.service` en el nodo del cerebro, detrás de Caddy en
`https://cerebro.ordenscan.com/mensajes/*` (comprobado en producción: alta,
envío, bandeja, ficha, y el 401 de lo interno intacto).

Identidad v1: primer alta de un correo se queda la llave; nadie usurpa un
buzón ya dado de alta. **Pendiente honesto:** verificar la sesión de la
wallet en el alta — eso llega cuando se rote el PASS_TOKEN (tarea 27 de la
Junta), y entonces nadie podrá darse de alta con el correo de otro ni antes.

## Lo que NO está en v1 (a propósito)

- Modelo de lenguaje en el asistente (la gramática cubre la demo; el modelo
  necesita el crédito que decide la Junta — y nunca decidirá un monto).
- E2E en el chat, reconocimiento de voz nativo, cobro por voz.
- Fusionar el código nativo de MyTokenPay (WebView hasta que haya motivo).
