# Por hacer

Lo que quedó pendiente, con el porqué de cada cosa. Al 1 de septiembre de 2026.

Ordenado por lo que de verdad mueve la aguja, no por lo que es fácil.

---

## Lo que está esperando por José

Nada de esto lo puedo hacer yo: hace falta una cuenta, una firma o plata.

### 1 · Crear `aura-buzon` en Render
Sin esto, la burbuja del ecosistema NO habla con la AU-RA de verdad — quien
llegue sin cuenta sigue recibiendo el guion fijo del navegador, que no aprende.

Todo lo demás está hecho y desplegado; el nodo lleva días sondeando y recibiendo
404 porque el servicio no existe todavía.

- El blueprint ya está en `render.yaml` (servicio `aura-buzon`)
- La llave está en **AWS Parameter Store, `/aura/buzon/llave`** (SecureString).
  Se abre en la consola y se pega en el panel de Render. No la pasé por el chat
  a propósito: por ahí ya se comprometieron la de Zernio, las de AWS y la de
  cPanel.
- Cuesta un plan `starter` más al mes
- **Si Render le pone sufijo al nombre**, la URL cambia y hay que ajustarla en
  dos sitios: `/etc/aura-buzon.env` del nodo y `window.OG_BUZON` en la web

### 2 · Publicar el número de WhatsApp
`+1 778-717-3592` **no aparece en ninguna parte** del repositorio: ni en la web,
ni en un documento, ni en un enlace. Nadie puede encontrarlo aunque quiera.

Es la razón por la que AU-RA ha tenido UNA conversación con alguien de fuera en
toda su vida. El motor está afinado y no pasa nadie.

### 3 · Enviar la verificación de negocio de Meta
Sigue en `pending_submission`. Mientras siga así, AU-RA **no puede escribir
primero** — solo contestar — y el número queda en `TIER_250`. Cinco plantillas
siguen en PENDING.

### 4 · Rotar cuatro credenciales comprometidas
Todas se pegaron en un chat en algún momento:

- La llave de Zernio (`sk_37d7…`)
- Las llaves de AWS
- La contraseña de cPanel
- `ORDENGLOBAL54`, del buzón `info@`

### 5 · Confirmar la suscripción de correo del vigía (SNS)
Está esperando un clic en un correo de confirmación.

### 6 · Variables de entorno de Render para Génesis
`GENESIS_WHATSAPP_CLAVE` y `GENESIS_WHATSAPP_CUENTA`, que se piden en el panel.

---

## Lo que puedo hacer yo, en orden

### 7 · Medir la conversión del embudo
El embudo termina en un enlace a `app.vetawallet.com` y ahí **se pierde el
rastro**. Nadie sabe cuántos de los que hablaron con AU-RA abrieron billetera.
Ese número hoy no existe.

Sin él, «mejorar el embudo» es decoración: se le pueden cambiar las palabras un
mes entero sin saber si mejoró o empeoró.

### 8 · Notas de voz por WhatsApp
Se retiraron porque costaban 657 segundos de GPU al día y causaban esperas de
21 a 59 segundos. **La objeción que las mató ya no aplica**: con la memoria de
voz puesta, el guion entero cuesta cero — medido, de 1.056 segundos a 1.

En Honduras la gente manda notas de voz por defecto. Quien manda un audio y
recibe tres párrafos siente que habló con un formulario.

### 9 · Borrar el T4 apagado
`i-02653feadc919d3a4`, etiquetado `aura-gpu-T4-APAGADA-respaldo`. Unos diez
dólares al mes por estar parado.

**Antes de borrarlo hay que decidir si se enciende.** Ver abajo.

### 10 · `asistente.py` son 3.028 líneas
Y tiene la peor proporción de pruebas del proyecto: 0,4 líneas de prueba por
cada una de código, contra 2:1 de las piezas chicas. El archivo más grande es
el menos cubierto.

---

## Decisiones que hay que tomar, no tareas

### El T4: hoy la respuesta es que NO se enciende

Encenderlo cuesta **250 a 380 dólares al mes**. Lo que compraría es capacidad
que hoy no hace falta: AU-RA ha tenido una conversación de fuera.

Y lo que parecía su mejor trabajo —llevarse la voz para liberar el A10G— dejó
de ser urgente al medirlo: la voz ocupa el 42% de la tarjeta (4.108 MiB
cargados más 5.500 que ollama se achica por ella) y **no se usó ni una vez en
siete días**. Eso no es porque no sirva: es porque no han lanzado.

**El disparador para encenderlo:** cuando las notas de voz estén en producción
y de verdad se usen. Ahí la voz se gana su sitio y el T4 pasa a tener trabajo.
Antes de eso sería pagar por adelantado.

### Que el equipo pueda enseñarle a AU-RA

Quedó apartado a propósito, para pensarlo bien.

**El problema:** las 40 fichas de conocimiento viven en `saber.json`, en el
nodo, con permisos de root. Para corregir una respuesta mala hace falta llegar
a mí y que yo despliegue. Nicole sabe las respuestas de mercadeo, Melany las de
legal, y **ninguna de las dos puede corregir a AU-RA**. Eso pone un techo: su
conocimiento crece al ritmo de mi disponibilidad.

**Lo bueno:** la maquinaria ya está. Los encargos, la firma de dos admin, el
mayordomo — todo eso existe y funciona. Falta un encargo más, «corregir lo que
AU-RA sabe», que se pide desde WhatsApp y firma un admin.

**Lo que hay que pensar** es qué pasa cuando dos personas corrigen lo mismo, y
qué se hace con una ficha mal escrita que ya salió por la boca de AU-RA.

### Usuario y contraseña por WhatsApp: desaconsejado

José lo pidió; le dije que no y por qué. Queda escrito para no repetir la
conversación:

Una contraseña escrita en WhatsApp vive para siempre en el historial de los dos
teléfonos, pasa por Meta **y por Zernio** —cuya llave ya está comprometida— y
la lee cualquiera con el teléfono desbloqueado.

**El número de teléfono ya es la identidad, y es más fuerte:** no se puede
escribir el número de otro. Una contraseña sí se copia y se pega.

La segunda llave para lo delicado ya existe: es la firma de otro admin en los
encargos. Y lo que faltaba —**ver** quién es quién— ya está hecho (`roles`).

Si aun así se quiere con clave, se hace fuera del chat, no dentro.

---

## Deuda anotada, sin urgencia

- **La voz no tiene versión vectorial de ningún logo.** Todo es mapa de bits.
  Para vídeo en alta o impresión grande van a pixelar. Las monedas pesan 2-3 KB
  cada una: en pantalla se ven mal.
- **Los units de systemd viven en dos sitios**: la mayoría en `infra/aura/`, el
  del mayordomo en `infra/aura/systemd/`.
- **La voz escucha en `0.0.0.0:8123`.** No está expuesta —el grupo de seguridad
  no permite ninguna entrada— pero es descuido de fondo.
- **Ordenex no tiene ningún documento legal, ni límite de peticiones, ni
  cabeceras de seguridad** (medido el 21 de agosto; conviene volver a mirar).
- **El backend de la billetera es el único sin sonda de salud**, siendo el que
  mueve dinero (misma fecha, misma advertencia).

---

## Un patrón mío que vale anotar

Tres veces en un mismo día escribí una prueba que **lee el código fuente como
texto y tropieza con un comentario**: una buscaba `vistazo.JEFES` y lo
encontraba en la explicación del fallo; otra buscaba «historial» en un
comentario; la tercera contaba una expresión que estaba dentro de mi propio
comentario.

Una de ellas vigilaba una regla de privacidad — y una prueba que salta por un
comentario se «arregla» borrando el comentario, que es exactamente al revés de
lo que hace falta.

**La regla:** una prueba que comprueba código se escribe con el analizador de
sintaxis, no buscando palabras en el archivo.
