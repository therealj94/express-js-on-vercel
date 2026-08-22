# El DNS de ordenglobal.org — copia lista en Route53, esperando el cambio

## Qué hay hecho

La zona entera de `ordenglobal.org` está **replicada en Route53** y comprobada
contra la que sirve nivapixel hoy. Falta un único paso, y es en el registrador.

| | |
| --- | --- |
| Zona en Route53 | `Z00615813BFIIDXDLPWPS` |
| Conjuntos de registros | 35 |
| Registrador del dominio | **NameSilo** (vence 29-abr-2027) |
| Servidores hoy | `ns1.nivapixel.com`, `ns2.nivapixel.com` |

## Cómo se sacó la zona, y por qué eso importa

cPanel 134 **no tiene exportar** en el Editor de Zonas —se comprobó: el
engranaje solo trae «filas por página» y «actualizar»—, y desde esta sesión el
panel está bloqueado por la política de egreso. Así que la zona se transcribió
de capturas de pantalla del propio editor.

**Transcribir de una captura es de donde salen los errores**, así que no se dio
por buena: se comprobó cada registro contra el DNS en vivo.

| Comprobación | Resultado |
| --- | --- |
| Registros transcritos que cuadran con el DNS en vivo | **34 de 35** |
| El que no cuadraba | `default._domainkey` — el DKIM |
| Registros vivos que faltaban en la transcripción | **0** (se sondearon 48 nombres habituales) |

El DKIM falló exactamente donde tenía que fallar: son 411 caracteres de base64
que la captura parte en varias líneas, y unirlas a ojo se equivoca. **Se tomó
del DNS en vivo**, que es la fuente autoritativa, no de la lectura.

## La comprobación que decide

No basta con «copié bien». Lo que importa es **qué contestaría Route53 si
mañana le preguntan**, comparado con lo que contesta nivapixel hoy. Se le
preguntó a Route53 por cada nombre y tipo con `test_dns_answer` y se comparó
contra el DNS público:

```
══ IDÉNTICOS: 35 / 35   distintos: 0
```

## Lo que falta: cambiar los servidores en NameSilo

Entrar a `namesilo.com` → el dominio `ordenglobal.org` → **Change Nameservers**,
y dejar estos cuatro en lugar de los dos de nivapixel:

```
ns-354.awsdns-44.com
ns-896.awsdns-48.net
ns-1227.awsdns-25.org
ns-1924.awsdns-48.co.uk
```

**Solo eso.** No hay que tocar nada en cPanel, y no hay que borrar la zona de
nivapixel: en cuanto el registrador apunte a AWS, la de nivapixel deja de
consultarse sola. Dejarla ahí es la red de seguridad — si algo saliera mal, se
vuelve poniendo los dos nombres de nivapixel otra vez.

### Se copió TAL CUAL, a propósito

El `_dmarc` va con `p=none`, igual que está hoy, **aunque el plan sea subirlo**.
Mezclar una mudanza con un cambio de política deja sin saber cuál de las dos
rompió qué. Primero se muda y se comprueba; la rampa del DMARC va después, y ya
sin pedir nada porque la zona será nuestra.

## Qué mirar después del cambio

Tarda entre minutos y unas horas según el TTL de cada quien.

| Qué | Cómo se ve que sigue bien |
| --- | --- |
| La web | `ordenglobal.org` y `www.ordenglobal.org` cargan |
| El correo que entra | escribirle a `info@ordenglobal.org` y que llegue |
| El correo que sale | que un correo del sistema siga saliendo firmado |
| cPanel y webmail | `cpanel.ordenglobal.org`, `webmail.ordenglobal.org` |
| La preventa | `preventa.ordenglobal.org` y su `www` |

## Tres cosas anotadas, ninguna urgente

**El certificado automático de cPanel.** cPanel escribe solo
`_cpanel-dcv-test-record` y `_acme-challenge` para renovar el certificado. Con
el DNS fuera ya no puede. Normalmente no pasa nada —AutoSSL valida por HTTP, y
el sitio se sigue sirviendo desde ese servidor—, pero **si algún día avisa que
no pudo renovar, la causa es esta** y se resuelve poniendo el registro que pida.

**El `GOOGLE-SITE-VERIFICATION` estaba duplicado** en la zona vieja: dos
registros idénticos. Route53 no admite el mismo valor dos veces en un conjunto,
así que quedó una sola copia. No cambia nada: la verificación de Google se
cumple igual con una.

**Queda una zona suelta.** Se había creado `_dmarc.ordenglobal.org`
(`Z0057746HZGTMWH2BUA0`) como delegación para poder subir el DMARC sin tocar
nivapixel. Con el dominio entero en Route53 **ya no hace falta**: la política
vive en la zona principal. Se borra después del cambio, cuando esté claro que
no hay vuelta atrás.
