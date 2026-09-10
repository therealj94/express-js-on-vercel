# La web al nivel de la app · plan

## Dónde va

| | |
|---|---|
| Pantallas en la app | **51** |
| Vistas en la web hoy | **21** |
| Faltan | **30** |

**Ya está hecho** (15-ago, después de la migración a la 5550):

| | |
|---|---|
| **La bienvenida** | Las seis tarjetas del teléfono, palabra por palabra. Sale una vez y queda en Ajustes. |
| **Enviar cualquier token** | Ya no solo ORIGEN. Fichas de moneda, MÁX que respeta la comisión, equivalente en dólares y aviso de que el gas se paga en ORIGEN. |
| **AURO CHAT** | Conversaciones y grupos, búsqueda por nombre/correo/Genesis ID, adjuntos hasta 8 MB, tarjeta de comprobante con enlace a ordenscan, y el botón de desbloquear. Puerta de Genesis ID aprobado, igual que en la app. |
| **Cobrar** | Un código con la cantidad ya puesta. Es un enlace de verdad: lo leen esta web y la app, y la cámara del teléfono lo abre sin ninguna app nuestra. |

## Lo que falta

| Bloque | Pantallas | Qué es |
|---|---|---|
| **MyTokenPay** | pay-inicio · panel · explorar · negocio · bonos · actividad · notificaciones · negocio-panel · negocio-detalle | el directorio de comercios y el panel del negocio |
| **El Núcleo** | ecosistema · lista | el tablero de neuronas que abre las apps |
| **NEXUS** | (flotante) | el asistente por voz |
| **Wallet que falta** | passport · watchOnly · reporte · notifs | |
| **Chat que falta** | auro-grupo · auro-ajustes | administrar un grupo, invitar, salir |
| **Entrada** | help · about · blocked | |

## Lo que decide cómo se hace

**No todo puede viajar a la web tal cual, y conviene decirlo antes que después:**

- **NEXUS por voz**: el navegador tiene reconocimiento de voz, pero no en todos
  (Safari de iPhone es irregular). Se puede hacer con caja de texto siempre y
  micrófono cuando el navegador lo dé.
- **El lector del documento (KYC)**: en la app lo lee ML Kit nativo. En la web
  no existe. Por eso la verificación web ya funciona **sin** leer el documento:
  datos + foto + selfie, y una persona revisa.
- **Notificaciones con la app cerrada**: en web solo con permiso del navegador y
  no en iPhone salvo que se instale como aplicación. Conviene no prometerlo.
- **Sonidos y hápticos**: el navegador los da a medias. Se pueden imitar.

## Una decisión pendiente, del chat

El relevo de mensajes da **una llave por correo, y solo una**. El primer
dispositivo que entra se la queda; el segundo recibe un 409 y no hay forma de
recuperarla. En el teléfono se notaba poco —una persona, un teléfono—, pero en
la web es cuestión de tiempo: quien ya usa el chat en la app y abra la web
verá «tu chat está en otro lado».

Se dice con todas las letras en pantalla y no se le ofrece un botón que no
puede funcionar, pero **eso no lo arregla**. Arreglarlo es una decisión de
diseño del relevo, no un parche: o la llave se deriva de la sesión de la wallet
(que ya prueba quién es), o se admiten varias llaves por correo. Lo primero es
más limpio y quita el problema de raíz.

## El orden de lo que queda

1. **El Núcleo** como portada: es lo que da sentido a que todo esté junto.
2. **MyTokenPay**: cobrar ya está; falta el directorio y el panel del negocio.
3. **Administrar grupos** en el chat (invitar, editar, salir).
4. **El resto de la wallet** (pasaporte, observadas, reporte).
5. **NEXUS**, al final: es lo más frágil en navegador.

## Cómo debe verse

La web es **un solo fichero sin compilar** (index.html + app.js + i18n +
cadena + chat + qr), y eso hay que conservarlo: se despliega en segundos, no
tiene dependencias que se rompan y cabe en el CDN ajeno que sirve `www`.

- **Móvil primero**: la mayoría entra desde el teléfono. Barra inferior como en
  la app, pantallas a una columna, botones grandes.
- **Escritorio**: no estirar el móvil. Dos columnas —lista a la izquierda,
  detalle a la derecha— como ya hace el chat.
- **El mismo lenguaje visual que la app**: verde profundo, oro, la didona para
  los títulos. Que se note que es la misma casa.
