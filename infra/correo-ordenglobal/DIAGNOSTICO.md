# El correo de ordenglobal.org

> **Estado: aplicado el 10 de agosto de 2026.** El SPF y el DMARC ya están en
> la zona (serial `2026081001`) y los sirven ns1, ns2 y los cuatro resolutores
> públicos que se comprobaron. Lo único que queda abierto es el PTR, que
> depende del proveedor. El detalle de lo aplicado está al final.

Medido el 10 de agosto de 2026 contra los servidores de nombres autoritativos
(`ns1`/`ns2.nivapixel.com`) y contra el servidor de correo.

## Lo que está bien

| Cosa | Estado |
|---|---|
| Servidor de correo | 50.31.177.40, en pie |
| Webmail | responde; el login carga y autentica (401 con cuenta falsa) |
| MX | `0 ordenglobal.org.` -> 50.31.177.40, coherente |
| `mail.ordenglobal.org` | CNAME correcto al ápice |
| DKIM | `default._domainkey`, RSA-2048, clave válida y no revocada |
| Listas negras | limpio en Spamhaus, SpamCop, Barracuda, SORBS, PSBL, CBL, UCEPROTECT (11 listas) |
| Certificado | Let's Encrypt `*.ordenglobal.org`, vence 12 oct 2026 |

Recibir correo debería funcionar. El problema está en **enviar**.

## Lo que está roto

### 1. No hay SPF. Ninguno.

En el ápice hay tres registros TXT y ninguno es SPF:

```
ordenglobal.org.  TXT  "50.31.177.40"
ordenglobal.org.  TXT  "ordenglobal.org."
ordenglobal.org.  TXT  "GOOGLE-SITE-VERIFICATION=IOJL57T6QIYWYXT7DP6UKI-0BBNLKFN4BOYCEIZ"
```

Los dos primeros son basura: alguien volcó el valor del registro A y el destino
del MX dentro de registros TXT. Es la huella de una importación de zona mal
hecha, y en el camino se llevó puesto el SPF.

Sin SPF, Gmail, Outlook y Yahoo no tienen forma de confirmar que el servidor
que envía está autorizado. El resultado es correo en spam o rechazado. **Esta
es, con diferencia, la causa más probable de que "los correos no funcionen".**

### 2. No hay DMARC

`_dmarc.ordenglobal.org` no existe (NXDOMAIN). Sin DMARC no hay política ni
visibilidad de quién está usando el dominio para enviar.

### 3. El DNS inverso no confirma

```
50.31.177.40  ->  priva-110.privatednsorg.com  ->  50.31.177.34
```

El PTR apunta a un nombre que resuelve a **otra IP**. La comprobación directa-
inversa (FCrDNS) falla, y varios receptores lo penalizan en el puntaje de spam.
Esto sólo lo puede corregir el proveedor del servidor.

## El arreglo

En cPanel -> **Editor de zona DNS** del dominio `ordenglobal.org`:

**Borrar** los dos TXT basura del ápice: `"50.31.177.40"` y `"ordenglobal.org."`
(no tocar el de Google).

**Agregar:**

| Nombre | Tipo | TTL | Valor |
|---|---|---|---|
| `ordenglobal.org.` | TXT | 14400 | `v=spf1 +mx +a +ip4:50.31.177.40 ~all` |
| `_dmarc.ordenglobal.org.` | TXT | 14400 | `v=DMARC1; p=none; rua=mailto:admin@ordenglobal.org; fo=1` |

Sobre el SPF: `+mx +a` autoriza al propio servidor, `ip4` lo fija explícitamente,
y `~all` marca lo demás como sospechoso sin rechazarlo. Si en algún momento se
envía correo del dominio desde otro servicio (un boletín, un formulario, la
billetera), hay que sumarlo con su `include:` antes de endurecerlo.

Sobre el DMARC: se arranca en `p=none`, que sólo observa y reporta. Recién
después de un mes de informes limpios se sube a `p=quarantine` y luego a
`p=reject`. Empezar en `reject` con el SPF recién puesto tira correo legítimo.

**Al proveedor (nivapixel)** hay que pedirle por separado que el PTR de
50.31.177.40 apunte a un nombre que resuelva de vuelta a esa misma IP.

## Verificar después

```sh
python3 - <<'PY'
import dns.resolver
r=dns.resolver.Resolver(); r.nameservers=['8.8.8.8']
for n in ('ordenglobal.org','_dmarc.ordenglobal.org'):
    for x in r.resolve(n,'TXT'):
        print(n, ''.join(s.decode() for s in x.strings))
PY
```

Tiene que aparecer un `v=spf1` y un `v=DMARC1`, y ya no los dos TXT basura.
El TTL es de 14400 segundos, así que hay que darle cuatro horas antes de dar
por buena la propagación.

## Lo que se aplicó

El 10 de agosto de 2026, sobre la zona en cPanel. Serial `2026080701` ->
`2026081001`.

**Borrado** del ápice, los dos TXT basura de la importación fallida:

```
ordenglobal.org.  TXT  "50.31.177.40"
ordenglobal.org.  TXT  "ordenglobal.org."
```

**Agregado:**

```
ordenglobal.org.           14400  TXT  "v=spf1 +mx +a +ip4:50.31.177.40 ~all"
preventa.ordenglobal.org.  14400  TXT  "v=spf1 +mx +a +ip4:50.31.177.40 ~all"
_dmarc.ordenglobal.org.    14400  TXT  "v=DMARC1; p=none; rua=mailto:admin@ordenglobal.org; fo=1"
```

`preventa` lleva su propio SPF porque es un dominio de correo aparte —tiene su
propia clave DKIM— y el SPF se comprueba contra el dominio exacto del remitente,
no hereda del de arriba. El DMARC sí hereda: la política del ápice cubre los
subdominios, así que no hace falta uno para `preventa`.

El SPF exige dos consultas DNS (`mx` y `a`), muy por debajo del límite duro de
diez a partir del cual los receptores lo descartan entero.

**Verificado** en ns1, ns2, Google, Cloudflare, Quad9 y OpenDNS: SPF y DMARC
presentes, cero registros basura. El DKIM de ambos dominios quedó intacto
(RSA-2048, sin tocar).

Hay un respaldo de la zona completa anterior al cambio, tomado antes de tocar
nada, fuera del repositorio.

### Lo que quedó sin tocar a propósito

- El TXT de verificación de Google está **duplicado** (dos registros idénticos).
  Es inofensivo y borrarlo arriesga romper una verificación que quizá algo use.
- El PTR sigue mal: `50.31.177.40 -> priva-110.privatednsorg.com -> 50.31.177.34`.
  Sólo lo puede corregir nivapixel.

### Los siguientes pasos, en orden

1. **Esperar cuatro horas** (el TTL) y mandar un correo de prueba desde una
   cuenta @ordenglobal.org a un Gmail. En el mensaje recibido, "Mostrar
   original" tiene que decir `SPF: PASS`, `DKIM: PASS` y `DMARC: PASS`.
2. **Pedirle a nivapixel** el arreglo del PTR.
3. **Al mes**, con los informes DMARC en mano y sin sorpresas, subir la política
   de `p=none` a `p=quarantine`, y más adelante a `p=reject`. No antes: subirla
   con el SPF recién puesto tira correo legítimo.
4. Si en algún momento el dominio empieza a enviar desde otro servicio —un
   boletín, un formulario, la billetera— hay que sumarlo al SPF con su
   `include:` **antes** de endurecer la política.
