# Encender el correo del sistema — lo que falta y quién lo hace

> Estado al 19 de agosto de 2026. Lo marcado ✅ ya está hecho; lo marcado ⏳
> necesita a una persona con acceso a la consola de AWS.
>
> **Los cuatro registros de cPanel quedaron aplicados el 19-ago** (serial de la
> zona 2026081001 → 2026081900). Los tres CNAME ya resuelven en DNS público; el
> SPF nuevo está en el autoritativo y termina de propagar en cuatro horas por
> el TTL. Hay respaldo de la zona anterior fuera del repositorio.

Hasta hoy el sistema mandaba correo desde **dos buzones de consumidor**: una
cuenta de Gmail para la confirmación de cuenta y una de Outlook para el
restablecimiento de contraseña y los avisos de tarjeta. Eso se cambia por
Amazon SES enviando como **info@ordenglobal.org**.

Por qué no se usa el webmail de la empresa para esto: vive en hosting
compartido. Mandar desde ahí el correo de decenas de miles de personas choca
con el límite de envío por hora y, peor, mete esa IP en listas negras — y ahí
se pierde **todo** el correo del dominio, incluido el que la empresa le escribe
a su Junta. Hoy esa IP está limpia en las once listas que se midieron.

Para escribirle a mano a una persona o a un grupo chico, el webmail sigue
siendo lo correcto y funciona bien.

---

## Ya hecho ✅

| Qué | Detalle |
|---|---|
| Identidad de dominio en SES | `ordenglobal.org` creada, con DKIM de 2048 bits |
| Usuario IAM `orden-global-correo` | Solo puede `ses:SendEmail`, y **solo** como `*@ordenglobal.org`. Con la llave filtrada nadie puede enviar en nombre de otro remitente |
| Salida del modo prueba | Solicitada a AWS (respuesta habitual: 24–48 h) |
| Código de envío | Escrito en Genesis ID y en el backend de la billetera, sin dependencias nuevas |
| Correos de Genesis ID | Identidad aprobada (con el GID) e identidad rechazada (con el motivo completo) |
| Correos de la billetera | Confirmación de cuenta, restablecimiento de contraseña, tarjeta emitida y disputas — todos migrados a SES |
| Pantalla de contraseña nueva | La app ya atiende el enlace del correo. Antes no existía: ver abajo |

---

## Paso 1 ✅ HECHO — cuatro registros en cPanel

En **cPanel → Editor de zona DNS** del dominio `ordenglobal.org`.

### 1a · Los tres CNAME del DKIM

Sin ellos SES no puede firmar y no deja enviar. Cada uno es un CNAME:

| Nombre | Valor |
|---|---|
| `vaddbn6iwla7zqgsfxlnyo3ebsqfowy6._domainkey.ordenglobal.org` | `vaddbn6iwla7zqgsfxlnyo3ebsqfowy6.dkim.amazonses.com` |
| `3g4ktjb67q5wr2ft5kzjdz2unygvixtg._domainkey.ordenglobal.org` | `3g4ktjb67q5wr2ft5kzjdz2unygvixtg.dkim.amazonses.com` |
| `44fz7qhl7v45lgboepf64bf5d3jkipd4._domainkey.ordenglobal.org` | `44fz7qhl7v45lgboepf64bf5d3jkipd4.dkim.amazonses.com` |

> El DKIM que ya existe (`default._domainkey`) **no se toca**: es el del
> servidor de cPanel y sigue firmando el correo que se escribe a mano desde el
> webmail. Los dos conviven sin problema.

### 1b · Sumar SES al SPF

El SPF de hoy autoriza **una sola IP** — la del servidor de cPanel — así que
todo lo que salga por SES fallaría la comprobación y caería en spam.

Hay que **reemplazar** el TXT del ápice:

```
ANTES:  v=spf1 +mx +a +ip4:50.31.177.40 ~all
AHORA:  v=spf1 +mx +a +ip4:50.31.177.40 include:amazonses.com ~all
```

Esto ya estaba advertido en el diagnóstico del 10 de agosto: «si en algún
momento el dominio empieza a enviar desde otro servicio hay que sumarlo al SPF
**antes** de endurecer la política».

Sigue habiendo tres consultas DNS, muy por debajo del límite de diez.

### 1c · Comprobar

Cuatro horas después (el TTL es de 14400 s):

```sh
# Los tres DKIM tienen que resolver
for t in vaddbn6iwla7zqgsfxlnyo3ebsqfowy6 3g4ktjb67q5wr2ft5kzjdz2unygvixtg 44fz7qhl7v45lgboepf64bf5d3jkipd4; do
  dig +short CNAME $t._domainkey.ordenglobal.org
done

# Y el SPF tiene que traer el include
dig +short TXT ordenglobal.org
```

En la consola de SES, la identidad `ordenglobal.org` pasa de **Pending** a
**Verified** sola en cuanto los CNAME resuelven.

---

## Paso 2 ⏳ — la llave de envío

**El secreto no pasa por el chat ni por el repositorio.** Se crea y se pega
directo en los paneles:

1. Consola de AWS → **IAM → Usuarios → `orden-global-correo`**
2. Pestaña **Security credentials → Create access key** → caso de uso
   «Application running outside AWS»
3. Copiar las dos cadenas **una sola vez** (AWS no las vuelve a mostrar)

Pegarlas en los dos servicios:

| Servicio | Panel | Variables |
|---|---|---|
| Genesis ID | Render → genesis-id → Environment | `GENESIS_SES_LLAVE`, `GENESIS_SES_SECRETO` |
| Billetera | Heroku → vetawallet → Settings → Config Vars | `SES_LLAVE`, `SES_SECRETO` |

Las otras dos variables ya están puestas por defecto en el código
(`GENESIS_SES_DE` / `SES_DE` = `info@ordenglobal.org`, región `us-east-1`), así
que no hace falta tocarlas salvo que se quiera cambiar el remitente.

**Mientras falten esas llaves, no se rompe nada**: el módulo queda apagado, lo
dice en el registro, y todo lo demás sigue funcionando igual. Es el estado
normal hasta que la Junta apruebe el gasto.

---

## Paso 3 ⏳ — desplegar el backend de la billetera

Los cambios del backend (`infra/veta-wallet-backend/`) están escritos y
commiteados, **pero no desplegados**. Ese despliegue va por `git push heroku` y
tiene un antecedente: el 12 de agosto un clon desfasado borró funciones de
producción. Antes de empujar hay que confirmar que este código está al día
contra lo que corre — para eso existe el agente `cirujano-despliegue`.

No corre prisa: sin las llaves del paso 2 el código nuevo no manda nada de
todas formas, así que el orden correcto es cPanel → llaves → despliegue.

---

## Paso 4 — al mes

Con los informes de DMARC en mano y sin sorpresas, subir la política de
`p=none` a `p=quarantine`, y más adelante a `p=reject`. **No antes**: subirla
con el SPF recién cambiado tira correo legítimo.

Y sigue pendiente con nivapixel el arreglo del PTR de 50.31.177.40, que apunta
a un nombre que resuelve a otra IP. Eso solo afecta al correo que sale del
servidor de cPanel; el que sale por SES lo esquiva por completo.

---

## De regalo: un trámite que estaba roto

Investigando esto apareció que **la recuperación de contraseña no funcionaba
para nadie**. El correo llevaba a `www.vetawallet.com/changePassword?token=…`,
y esa dirección la atiende la app — que no tenía ninguna pantalla para
`changePassword` ni leía el token. La persona caía en la portada, sin sitio
donde escribir la clave nueva, y los quince minutos de vigencia se le vencían
buscando.

Ya está arreglado de las dos puntas: la app tiene su pantalla (con medidor de
fuerza, confirmación, aviso de enlace vencido y el token borrado de la barra de
direcciones al leerlo), y el correo apunta al dominio correcto. También se
agregó el enlace **«¿Olvidaste tu contraseña?»** en el formulario de entrar,
que tampoco existía.
