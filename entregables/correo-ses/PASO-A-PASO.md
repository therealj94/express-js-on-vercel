# Lo que tenés que hacer vos, en orden

**El paso 1 ya está hecho.** Con la clave de cPanel entré y dejé los tres
registros puestos. Te quedan dos cosas: tocar un enlace y llenar un formulario.

---

## PASO 0 · Verificar tu correo ✅ HECHO

Tu Gmail quedó verificado en SES. Ya te mandé un correo de prueba por el mismo
camino exacto que usa la billetera, y para comprobar que llegó bien:

> En Gmail, abrí los tres puntitos arriba a la derecha del correo y tocá
> **«Mostrar original»**. Buscá tres líneas: **SPF: PASS**, **DKIM: PASS** y
> **DMARC: PASS**. Si las tres dicen PASS, el correo está firmado como debe.

---

## PASO 1 · Los tres registros ✅ HECHO

Con la clave que me pasaste entré a cPanel y los dejé puestos. Antes de tocar
nada guardé una copia de la zona entera, por si algo hubiera salido mal.

Los dos servidores que mandan en la zona ya sirven lo nuevo, comprobado
preguntándoles directo:

| | |
|---|---|
| SPF de la raíz | `v=spf1 +a +mx +ip4:50.31.177.34 include:spf.jetsmtp.net include:amazonses.com ~all` |
| MX de `correo` | `10 feedback-smtp.us-east-1.amazonses.com` |
| TXT de `correo` | `v=spf1 include:amazonses.com ~all` |

Un detalle que puede confundir: si consultás el SPF desde afuera puede que
todavía te salga el viejo. Los resolutores guardan la copia anterior hasta
cuatro horas. No está mal, está en caché.

<details>
<summary>Los valores, por si algún día hay que rehacerlo a mano</summary>

### 1.a · Agregar el MX

| | |
|---|---|
| Tipo | **MX** |
| Nombre | `correo` (algunos paneles piden el nombre completo: `correo.ordenglobal.org`) |
| Prioridad | `10` |
| Valor | `feedback-smtp.us-east-1.amazonses.com` |

### 1.b · Agregar el TXT del remitente

| | |
|---|---|
| Tipo | **TXT** |
| Nombre | `correo` (o `correo.ordenglobal.org`) |
| Valor | `v=spf1 include:amazonses.com ~all` |

### 1.c · EDITAR el SPF que ya existe

**Este es el que tiene trampa. No crees uno nuevo.**

Buscá el registro TXT del dominio raíz que hoy dice:

```
v=spf1 +a +mx +ip4:50.31.177.34 include:spf.jetsmtp.net ~all
```

Editalo y dejalo así, con `include:amazonses.com` metido antes del `~all`:

```
v=spf1 +a +mx +ip4:50.31.177.34 include:spf.jetsmtp.net include:amazonses.com ~all
```

> **Por qué importa tanto.** Un dominio con **dos** registros SPF falla en los
> dos. No da error, no avisa nadie: el correo simplemente empieza a caer en la
> carpeta de spam de todo el mundo. Si el panel no te deja editar y solo te deja
> agregar, borrá el viejo primero y creá uno solo con el texto de arriba.

</details>

### Comprobar cuando quieras

```sh
cd entregables/correo-ses
python3 comprobar.py
```

---

## PASO 2 · Pedir el paso a producción ← acá estás

Corré `comprobar.py` y mirá el veredicto del final. Te va a decir una de tres
cosas, sin que tengas que interpretar la lista:

| Dice | Qué hacer |
|---|---|
| **TODAVIA NO PIDAS** | falta algo de verdad, está listado |
| **CASI** | el DNS está puesto y AWS no lo revisó todavía. Conviene esperar |
| **LISTO PARA PEDIR** | adelante |

Hoy dice **CASI**: los registros ya están, falta que AWS los revise por su
cuenta. Su revisión es automática y suele tardar minutos, aunque puede llegar a
horas. Se puede pedir igual, pero **conviene esperar**: con el remitente propio
en SUCCESS la solicitud llega más fuerte, y un segundo rechazo cuesta más que
esperar una tarde.

1. Entrá a la consola de AWS con la cuenta de Orden Global.
2. Arriba a la derecha, elegí la región **Este de EE. UU. (Norte de Virginia)
   · us-east-1**. Si estás en otra región no vas a ver la cuenta correcta.
3. Buscá **Amazon SES** y entrá.
4. En el menú de la izquierda: **Account dashboard**.
5. Vas a ver un cartel amarillo que dice que la cuenta está en el sandbox. A la
   derecha hay un botón **Request production access**. Tocalo.
6. Llená el formulario con lo que está en `solicitud-produccion.md`. El texto
   largo ya está escrito, es copiar y pegar.

**El campo que estaba mal la vez pasada es «Website URL».** Poné
`https://www.ordenglobal.org`, no la de la billetera. El revisor entra a esa
web y busca la relación con el dominio que firma el correo; cuando no cuadran,
la solicitud se cae.

---

## PASO 3 · Esperar, y comprobar cuando contesten

AWS suele contestar en un día hábil.

**Si aprueban:**

```sh
python3 comprobar.py
```

Tiene que decir **«LA CUENTA YA ESTA EN PRODUCCION»**. Ahí el correo empieza a
salirle a los usuarios sin tocar una línea de código: el backend ya está
conectado y probado.

Después, mandate un correo de prueba a un Gmail y a un Outlook y abrí **«mostrar
original»** en cada uno. Buscá tres palabras: `spf=pass`, `dkim=pass`,
`dmarc=pass`. Las tres tienen que estar.

**Si vuelven a decir que no:** no reenvíes lo mismo. En la respuesta del caso
está la pregunta exacta que hay que hacerles, al final de
`solicitud-produccion.md`. Obliga a que te digan qué falta en concreto en vez
de repetir el rechazo.

---

## Si te urge mandar correo antes de que AWS conteste

La única salida real es un proveedor distinto, porque **el límite es de la
cuenta de AWS entera** y no se puede esquivar cambiando de dominio. Eso lo
comprobé mandando un correo de verdad.

El dominio ya tiene otro proveedor en su SPF (`spf.jetsmtp.net`). Antes de
montar nada nuevo, averiguá si esa cuenta sigue viva y con cupo: puede que la
puerta ya esté abierta y no haga falta nada más.
