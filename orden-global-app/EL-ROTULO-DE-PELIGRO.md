# El rótulo de peligro al instalar el APK

## La respuesta corta

**No se puede quitar.** Y no es que falte configurar algo: ese aviso existe
precisamente porque la app viene de fuera de Play y nadie la verificó. Si
hubiera una forma de apagarlo desde el APK, la usaría toda la gente que hace
apps maliciosas — que es exactamente el motivo por el que Google no la dejó.

Lo que sí se puede es **dejar de repartir el APK a mano**. La app puede estar
en Google Play para la gente que vos elijas **hoy, sin esperar al lanzamiento
público**, y ahí instalan desde la tienda: sin ningún aviso, y con las
actualizaciones llegándoles solas.

---

## Los tres avisos, que no son el mismo

Vale distinguirlos porque la gente los cuenta como uno y son tres momentos
distintos:

| Cuándo | Qué dice | Quién lo pone |
|---|---|---|
| Al descargar | «Este tipo de archivo puede dañar tu dispositivo» | El navegador, por ser un `.apk` |
| Antes de instalar | «Por seguridad, tu teléfono no puede instalar apps desconocidas de esta fuente» | Android, permiso por aplicación |
| Al instalar o después | «Play Protect no reconoce al desarrollador» / «app no segura» | Google Play Protect |

Ninguno de los tres se quita cambiando el APK, ni firmándolo distinto, ni
comprando un certificado. Los tres desaparecen solos cuando la instalación
viene de Play.

---

## Lo que sí resuelve el problema

Google Play tiene canales de prueba que **no son el lanzamiento público**:

**Pruebas internas.** Hasta 100 personas invitadas por correo. Se sube el
`.aab` y está disponible **en minutos, sin revisión**. Google da un enlace de
invitación; la persona lo abre, toca instalar, y le llega desde Play Store.
Cero avisos. Las actualizaciones le entran solas.

Esto es exactamente lo que hace falta: agregar gente, que bajen la app, que
solo instalen, y que no salga ningún rótulo.

**Pruebas cerradas.** Si hacen falta más de 100. Lleva revisión de Google, o
sea días de espera.

**Pruebas abiertas.** Cualquiera con el enlace, y la app aparece en Play.

---

## Qué falta, y de quién depende

| Qué | Estado | Quién |
|---|---|---|
| Ficha de Play (textos, ícono 512, gráfico 1024×500, Data Safety) | **Lista** — está en `LISTO-PARA-ANDROID.md` | — |
| Política de privacidad y términos en línea | **Vivas** — comprobado: `vetawallet.com/privacidad` y `/terminos` responden | — |
| Compilador del `.aab` | **Existe** — workflow «Veta Wallet — compilar Android», perfil `production` | — |
| Envío a Play desde la línea de comandos | **Cableado** en `eas.json` (canal `internal`) | — |
| **Cuenta de Google Play Console** | **FALTA** | **José** |
| **Llave de la cuenta de servicio** | **FALTA** (depende de la cuenta) | **José** |

### La cuenta de Play Console

Es lo único que bloquea todo lo demás. Cuesta **25 dólares una sola vez**, y
Google pide **verificar la identidad** de quien publica — documento de la
persona o papeles de la empresa. Eso lleva desde unas horas hasta unos días y
no lo puede hacer nadie más en tu nombre.

Conviene abrirla como **organización** y no como persona: la ficha va a decir
«Orden Global Corp» en vez de un nombre propio, que para una billetera es la
diferencia entre parecer una empresa y parecer un proyecto de alguien.

### La llave de la cuenta de servicio

Una vez abierta la consola, se crea una cuenta de servicio en Google Cloud y
se le da permiso de publicar. Ese archivo `.json` **no va al repositorio** —
ya está bloqueado en `.gitignore`. Si se filtra, cualquiera puede publicar una
versión de la app en nuestro nombre, que es la peor cosa que le puede pasar a
una billetera.

Va en `.secretos/play-service-account.json`, o como secreto en EAS.

---

## El camino completo, una vez exista la cuenta

```
1. Compilar el .aab
   GitHub → Actions → «Veta Wallet — compilar Android» → perfil: production

2. Subirlo a Play, canal de pruebas internas
   cd orden-global-app && eas submit --platform android --profile production

3. En Play Console
   Pruebas → Pruebas internas → crear lista de correos → publicar

4. Google da un enlace de invitación. Se manda a la gente.
   Lo abren, tocan instalar, y les llega desde Play Store.
```

---

## Una cosa que conviene saber antes de empezar

Play trata las apps que manejan dinero con más cuidado que al resto: pide
declaraciones extra sobre qué hace la app con los fondos, y a veces vuelve a
preguntar. Es normal y se contesta, pero **no es un trámite de una tarde**.
Vale presupuestar ida y vuelta con el revisor, y no prometerle a nadie una
fecha antes de tener la primera respuesta de Google.

Mientras tanto, el APK a mano sigue funcionando — con su rótulo. No hay forma
de tener las dos cosas.
