# Estado de seguridad, medido el 22 de agosto de 2026

Solo lo comprobado de primera mano contra producción. Lo que reportan los
agentes y no pude confirmar va marcado como tal.

---

## LO PRIMERO, PORQUE ORDENA TODO LO DEMÁS

**Casi nada de lo que se arregló está corriendo.**

| Servicio | Cómo se despliega | ¿Al día? |
|---|---|---|
| Genesis ID (Render) | **automático** desde la rama | **sí** — commit `1861a8d` |
| Ordenex API (Heroku) | a mano, `git subtree push` | **no** |
| Backend de la billetera (Heroku) | a mano, `git push heroku` | **no** |
| La web (Amplify) | a mano, `subir.py` | **no** |

Comprobado, no supuesto:

- `GET /tarifas` de Ordenex —ruta creada hoy— contesta **404**.
- `app.vetawallet.com/candado.js` **no tiene** la firma de mensajes.
- `app.vetawallet.com/app.js` **no tiene** ni el nombre que se acorta ni la hoja
  de grupos fuera de la rama del hilo.

O sea que el ecosistema que se está usando hoy es el de antes de esta sesión, en
tres de los cuatro servicios. **La brecha entre lo arreglado y lo que corre es
ahora mismo el mayor problema de seguridad que hay**, más grande que cualquier
hallazgo suelto de la lista.

Yo no puedo cerrarla: probé las credenciales de AWS y de Heroku en este
contenedor y **las dos están inválidas**.

---

## Cabeceras de seguridad, medidas ahora

| Servicio | HSTS | CSP | X-Frame | nosniff | Firma del servidor |
|---|---|---|---|---|---|
| Backend de la billetera | sí | sí | sí | sí | oculta |
| **Ordenex API** | **no** | **no** | **no** | **no** | **`Express` a la vista** |
| **Relevo de mensajes** | **no** | **no** | **no** | **no** | oculta |
| Genesis ID | sí | no | sí | sí | oculta |
| `app.vetawallet.com` | **no** | sí | **no** | sí | oculta |

Lo de Ordenex **ya está arreglado en la rama** —`helmet` y los frenos por tipo
de ruta— y sigue así en producción por lo de arriba.

Lo de `app.vetawallet.com` es distinto: es Amplify sirviendo la web, y la
cabecera se pone en la configuración del sitio, no en el código. No lo cubre
ningún arreglo de esta sesión.

---

## Genesis ID: desplegado, pero dos cosas siguen apagadas

`GET /healthz`, commit `1861a8d`:

| | |
|---|---|
| Las listas se mantienen solas | **sí** |
| Caducidad de documentos activa | **sí** |
| El ancla de la bitácora corre | **sí** — 1.320 entradas ancladas hoy a las 01:57 |
| **La bitácora se firma** | **NO** |
| **Operadores sin segundo factor** | **2** |
| El ancla sale fuera de la base | **no** — solo al registro |

Las dos que están en **no** no son fallos de código: el código está desplegado y
funcionando. Falta poner **una variable de entorno** en Render y que **dos
personas aprieten un botón**. Mientras tanto:

- La bitácora está encadenada pero **sin firmar**, o sea que quien tenga la
  cadena de conexión de Mongo la puede reescribir entera y va a cuadrar. Es
  exactamente el agujero que ese arreglo cerraba.
- Dos operadores con rol de aprobar identidades y leer cédulas entran **solo con
  contraseña**.

El ancla sí corre y deja el hash en el registro del servicio, que está fuera de
la base. Configurando `GENESIS_ANCLA_URL` saldría además a un sitio propio.

---

## Lo que ya estaba medido y sigue igual

- **No hay copias de seguridad de ninguna de las tres bases de MongoDB.** En la
  de la billetera viven las semillas cifradas de cada usuario.
- **No hay vigilancia ni alertas** en ningún servicio. Si algo se cae ahora, el
  primer aviso es un usuario quejándose.
- **No hay CI.** Las pruebas existen —y hoy son muchas más— y no las corre nada.
- **No hay registro de auditoría** en la billetera ni en Ordenex. Genesis ID sí.
- **No hay procedimiento de incidente escrito**, ni forma de cerrar todas las
  sesiones de golpe.
- **La billetera y Ordenex se administran con una cadena de texto compartida**,
  no con operadores con nombre. Genesis ID sí los tiene, con roles y segundo
  factor.
- **`npm audit` del backend de la billetera: 21**, una crítica. Ordenex y
  Genesis ID: cero.

---

## Lo que se cerró esta sesión, para no volver sobre ello

Genesis ID: las nueve. PULSE2CHAT: la firma del remitente y el código de
seguridad. Ordenex: el trato atómico, el retiro dudoso, el freno, las cabeceras,
la comisión a la vista y la puerta de idoneidad de ONDK. La billetera: el saldo
cero, la revocación de sesión, la idempotencia obligatoria, el freno del envío,
la firma del webhook y el registro que imprimía credenciales.

**Todo eso está en la rama. Casi nada está corriendo.**

---

## Las apps de teléfono · verificado por mí

### MyTokenPay corre entera contra un servidor de mentira

`mytokenpay-app/mobile/src/lib/api.ts:13` → `USE_MOCK_API = true`, y la línea 139
desvía **toda** la app al simulador. La ficha de sesión es la cadena
`mock.<id-de-usuario>`, o sea falsificable a mano sin servidor. El paquete lleva
además cuentas de demostración con sus contraseñas en claro.

### Y se declara «identidad verificada» en el propio teléfono

`store/genesis.ts:35` genera el identificador con **`Math.random()`**:

```js
function makeUid(): string {
  const n = () => Math.floor(1000 + Math.random() * 9000)
  return `GEN-${n()}-${n()}`
}
```

Y `verificar-identidad.tsx:170` es esto entero:

```js
function handleCapture() {
  if (step === 'doc-front') genesis.advance('doc-back')
  else if (step === 'doc-back') genesis.advance('face')
  else if (step === 'face') genesis.advance('processing')
}
```

**No abre la cámara, no captura nada, no manda nada.** Solo avanza el paso. Al
terminar, la pantalla le dice al usuario que su Genesis ID quedó verificada y
que sirve «en Veta Wallet, MyTokenPay y todo el ecosistema».

### ¿Está publicada? No hay evidencia de que sí, y sí de que no

- La web de MyTokenPay figura como **sin desplegar** en `apps-web/README.md:14`.
- **Ningún flujo de trabajo la compila**: los cuatro de `.github/workflows` son
  de Genesis ID y de Veta Wallet.
- Pero **el perfil `production` existe** y produce un paquete de tienda.

Así que hoy esto es deuda de desarrollo, no un incidente. Lo que no se puede
decir es que sea inofensivo: **está a un comando de publicarse tal cual**.

### El hallazgo más fino de todo el informe

La pantalla de verificación llama a dos funciones que **no existen**
(`genesisClient.process` y `.start`), fuera de cualquier `try`, así que lanza y
la pantalla se queda en «Procesando» para siempre.

Eso significa que **ese fallo es hoy lo único que impide que la verificación
falsa se complete**. Arreglar el fallo sin arreglar lo de arriba **activaría** la
verificación de mentira. Hay que hacer las dos cosas, y en ese orden.

### Lo que está bien, y es mucho

- **La semilla y la llave privada no se guardan nunca.** Se piden al servidor
  con la contraseña en el momento, viven en memoria y se borran solas a los 45
  segundos.
- **El desbloqueo biométrico está bien hecho**: exige autenticación y no sale
  del aparato.
- **Ningún secreto real horneado** en ninguna de las cuatro apps, y ninguna
  desactiva la comprobación de certificados.
- **La clave `gidp_` no es una filtración**, y no se dio por buena leyendo el
  comentario: se comprobó contra el servidor. Solo abre dos rutas de escritura;
  toda lectura del directorio exige operador.
- **Los permisos son proporcionados.** La app de Genesis ID bloquea
  explícitamente cámara, micrófono y almacenamiento que no usa.

### Y una que se repite: un comentario que dejó de ser cierto

`orden-global-app/src/unlock.js:17` dice que el viejo «Recordarme» *«se reemplaza
por uno que el sistema protege»*. Es falso: `screens/Auth.js:156` sigue guardando
la contraseña sin biometría. Y esa contraseña es la que autoriza enviar fondos,
revelar la semilla y ver el PIN de la tarjeta.

Es el mismo patrón que ya salió tres veces esta sesión.

---

## CORRECCIÓN · lo que yo venía diciendo mal

Estuve toda la sesión listando `PASS_TOKEN` como crítico abierto. **Lo medí hoy
contra la API de Heroku y tiene 64 caracteres, no 7.**

| | |
|---|---|
| `PASS_TOKEN` | **64 caracteres** |
| `PASS_TOKEN_VIEJO` | **no existe** → la rotación se completó entera |
| `PASS_ADM` | **no existe** → esa también |
| `PASS_ADM_NUEVA` | 64 caracteres |
| `ADMIN_SECRET` | **20 caracteres** ← esta es la que quedó corta |

Que `PASS_TOKEN_VIEJO` no esté es el dato que lo cierra: significa que se llegó a
la tercera etapa, la de borrar la llave anterior.

Lo arrastré de una nota de sesiones anteriores y no lo volví a medir. Es el mismo
error contra el que vengo avisando todo el día: **un documento no es una fuente.**

---

## Infraestructura · verificado en vivo contra AWS y Heroku

### Una rotación empezada y nunca terminada

El documento del 12 de agosto decía que había que borrar una llave de AWS y
rotar el token de Heroku. Comprobado contra la API real, no contra el documento:
la llave **sigue activa**, sin usarse desde entonces, y el mismo usuario tiene
otra que sí se usa a diario. Se creó la reemplazo y no se borró la vieja. Ese
usuario tiene permisos de administrador.

### Seis de los siete discos de validador, sin cifrar

Y sus copias también. El runbook del propio equipo dice que la llave de firma
vive en claro dentro de cada nodo, así que quien acceda a una copia la lee sin
pasar por ningún control de sesión. La copia fría que sí existe se hizo el 11 de
agosto y **no cubre a dos de los siete**, que se sumaron el 20.

### Puertos abiertos al mundo para servicios apagados

Dos puertos de la cadena vieja siguen abiertos en los siete nodos, y los de la
red de pruebas también. No hay nada escuchando — pero **GuardDuty registra
sondeos, y el más reciente es de hoy**.

### Un administrador dormido dos años, sin segundo factor

Permisos de administrador, acceso por consola, cero dispositivos de segundo
factor, contraseña usada por última vez en **agosto de 2024**.

### 453 llamadas con credenciales de root

Entre el 9 y el 19 de agosto, desde una dirección residencial de Honduras. La
cuenta root tiene segundo factor y no tiene llaves permanentes, así que no hay
indicio de que la sesión se abriera sin él. Pero el patrón es inusual y **alguien
tiene que confirmar que fue propio**.

### Seis dominios apuntando a algo que ya no existe

Y no es un proyecto abandonado: el backend de uno de ellos se actualizó el 20 de
agosto. El frontend quedó roto en silencio.

---

## Lo bueno, verificado en vivo

Registro de auditoría de AWS activo, multirregional y entregando ahora mismo. El
bucket de llaves de validador cifrado, versionado y sin acceso público, con
rotación automática de su llave. La RPC de producción cerrada al balanceador y
no al mundo. El usuario que manda correo con dos permisos y condicionados al
remitente. La cuenta de Heroku con un solo dueño y segundo factor.

---

## Lo que NO se pudo medir, y por qué

- **Render**, por falta de credenciales: no se pudo comprobar la edad ni el
  estado real de sus variables.
- **MongoDB Atlas**: sin credenciales, no se revisaron IPs permitidas ni
  rotaciones.
- **Si el repositorio es público o privado.** Cambia mucho la gravedad de la
  llave que quedó en el historial de git.
- **Si lo que corre hoy en los teléfonos es este código.** Las apps se
  actualizan por aire.
- **Si algo responde de verdad en los puertos abiertos.** Se usó la
  configuración real de red, que es mejor fuente que un comentario, pero no es
  lo mismo que probarlo desde fuera.

**No se tocó nada.** No se rotó ninguna credencial, no se cerró ningún puerto y
no se desplegó nada.
