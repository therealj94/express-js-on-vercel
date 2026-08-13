# Despliegue del backend · 12-ago-2026

Con el token nuevo se desplegó por fin lo que llevaba días escrito. Salieron
tres cosas por el camino: una avería que llevaba horas corriendo, un error mío
que duré cinco minutos en producción, y una comprobación que hacía falta.

## Lo que quedó desplegado · v73

- **`lib/gas.js`** — el precio y el límite del gas salen de la cadena, con
  suelo en los 93 gwei acordados. Eran 400 gwei en enviar, 600 en enviar token
  y 2000 en el canje, con un `gasLimit` de 210.000 que reservaba 0,084 ORIGEN
  por envío.
- **`lib/origenPrice.js`** — el precio deja de estar en dos sitios. Ya no se
  inventa una onza a 2.000 USD cuando fallan las fuentes: falla, que en un
  camino de dinero es lo correcto. Y CoinGecko va primero, porque **Binance
  devuelve 451 a las IP de Estados Unidos**, que es donde corre este servidor.
- **`app.js`** — avisa en el log de arranque si `PASS_TOKEN` o la clave de
  cifrado son más cortas de 32 caracteres.

**El precio: me equivoqué y está revertido.** Esa noche lo puse en 0,01 USD
fijo creyendo que era lo acordado. No lo era: el ORIGEN vale **el gramo de oro
dividido entre 55**, que es la fórmula que el código tenía desde siempre. José
lo corrigió y quedó de vuelta en modo oro — comprobado ejecutando el módulo
dentro de Heroku: *2.5728469610990876, modo oro*.

Nadie salió perjudicado, y no es una suposición: mientras estuvo mal, de las
00:15 a las 02:01 UTC, hubo **cero fondeos de tarjeta, cero depósitos, cero
transacciones y cero pagos**, contados contra la base de datos.

La lección es la de siempre en esta sesión: *confirmar el número antes de
escribirlo en producción, no después.*

## La avería que estaba corriendo desde antes

En el log de producción había un bucle de error repitiéndose sin parar:

```
JsonRpcProvider failed to detect network and cannot start up; retry in 1s
```

**El proveedor de Polygon estaba caído para nosotros.** El de Alchemy devuelve
**429** («rate-limited due to unusually high global traffic») y el público de
respaldo, `polygon-rpc.com`, contesta «API key disabled, tenant disabled». Con
los dos fuera, el vigilante de depósitos de USDT reintentaba en bucle y **la
pasarela de entrada y el fondeo de tarjeta no podían funcionar**.

Cambiado `POLYGON_CHAIN_PROVIDER` a `https://polygon-bor-rpc.publicnode.com`,
que responde la cadena 137 y la altura correcta. **El bucle desapareció**: cero
errores desde el reinicio.

## El error mío, y cómo se vio

El clon del backend que tenía en esta máquina **estaba obsoleto**. Le faltaban
la idempotencia, el puente Genesis ID, el login social, el censo y varios
cambios en usuarios y autenticación — porque esas versiones se habían
desplegado desde otro árbol de trabajo, con un paquete, y **no por git**. El
repositorio de Heroku llevaba semanas atrasado sin que se notara.

Al empujar desde aquí, esas cosas se fueron de producción. Duró **cinco
minutos**: se vio al comprobar los endpoints después del despliegue —
`/auth/social` contestaba 404— y se volvió a la versión anterior de inmediato.

Después se recuperó el código del **propio paquete de la v69**, que Heroku deja
descargar, se comprobó archivo por archivo que no faltaba nada, y se rehicieron
los cambios encima. **Ahora el repositorio y lo desplegado coinciden**, que es
lo que hay que mantener a partir de aquí: desplegar por `git push`, no por
paquete.

La lección, dicha en voz alta: *comprobar que el clon local es lo que está
corriendo, antes de empujar y no después.*

## La rotación de las claves de cifrado: terminada

`lib/cripto.js` implementa la rotación en dos claves —`PASS_ADM_NUEVA` para
cifrar, `PASS_ADM` como respaldo al descifrar—. En producción `PASS_ADM` **ya
no está**, lo cual sólo es correcto si todos los registros se recifraron.

Comprobado, contando dentro de la propia red de Heroku y sin sacar ni una llave:

| | |
|---|---|
| Usuarios | **435** |
| Llaves privadas que descifran con la clave nueva | **434** |
| Frases semilla que descifran con la clave nueva | **434** |
| Registros que no descifran | **1** — el mismo, ya documentado como corrupto de antes |

**La etapa 2 se completó y quitar la clave vieja fue correcto.** El aviso de
arranque se corrigió para reconocerlo: que `PASS_ADM` no esté es lo normal, y
si apareciera avisaría de que la rotación quedó a medias.

## Lo que sigue pendiente

- **Pasar el precio a 0,01** cuando la 5550 esté en marcha: `OG_ORIGEN_USD` y
  quitar `OG_PRECIO_MODO=oro`. Con la Junta, porque cambia la tasa a la que la
  tarjeta consume ORIGEN.
- **El registro corrupto**, uno de 435. No se descifra con ninguna clave y
  viene de antes de la rotación. Hay que mirar de qué cuenta es y si tiene
  fondos.
- **Un proveedor de Polygon propio.** El público de ahora funciona, pero es
  público: sin acuerdo, sin garantía y sin aviso si deja de estar. El de
  Alchemy hay que renovarlo o pagarlo.
