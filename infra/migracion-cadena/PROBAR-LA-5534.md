# Cómo probar la cadena nueva · 12-ago-2026

La 5534 ya tiene **RPC abierto a internet**, así que puedes conectarte con
MetaMask —o con cualquier billetera— y mover fondos de verdad sobre una copia
del estado real.

## Ponerla en MetaMask

Ajustes → Redes → **Agregar red manualmente**:

| Campo | Valor |
|---|---|
| Nombre | Orden Global · pruebas |
| URL del RPC | `https://pruebas.ordenglobal-rpc.com` |
| ID de cadena | **5534** |
| Símbolo | ORIGEN |
| Explorador | *(déjalo vacío)* |

> **Corregido el 12-ago.** Aquí decía `http://18.234.39.26:8545` y que MetaMask
> lo aceptaba. **La app del móvil no lo acepta**: exige HTTPS y contesta «Los
> identificadores URI requieren el prefijo HTTPS adecuado». De paso marca el ID
> de cadena como inválido, que despista, porque no puede consultárselo a un RPC
> que rechazó.
>
> Ya tiene certificado de verdad —Let's Encrypt, renovación automática— detrás
> del nombre `pruebas.ordenglobal-rpc.com`. Y al ir por nombre y no por IP, si
> la máquina cambia de dirección se arregla en el DNS sin tocar el teléfono de
> nadie.

## Qué vas a ver

Tu dirección de siempre, con **lo que tienes hoy en la cadena vieja**: los
tokens con sus saldos intactos. Importa la dirección con tu frase o tu llave
privada y aparecen.

Lo único distinto a propósito es el **ORIGEN nativo**: cada billetera de persona
lleva **exactamente 1 ORIGEN**, que es lo acordado el 11-ago. En esta cadena de
pruebas el gas además es gratis (precio 0), así que ese 1 ORIGEN da para todas
las pruebas que quieras.

## Qué probar, en orden

1. **Que tus saldos están.** Añade uno de los tokens por su dirección
   —ONDK, AUKA, MNKA— y comprueba que el número es el que esperas.
2. **Enviar ORIGEN** a otra dirección tuya. Debe confirmar en ~10 segundos.
3. **Enviar un token.** Es la prueba que de verdad importa: mueve estado de
   contrato, no solo saldo nativo.
4. **Que el saldo del que recibe sube** y el del que envía baja.

Si eso funciona, la cadena está bien: el estado migró y la máquina virtual
ejecuta igual que la vieja.

## Lo que todavía NO puedes probar

**La app Veta Wallet sigue apuntando a la cadena vieja.** Su backend está atado
a la 8532, y cambiarlo es tocar producción — eso no se hace sin ti delante. Lo
de arriba prueba **la cadena**; probar **la app contra la cadena nueva** es el
paso siguiente y necesita un backend de ensayo aparte.

## Detalles que conviene saber

- **Es una cadena de pruebas.** Lo que muevas ahí no afecta a nadie y puede
  borrarse. No es el corte.
- **Esa IP no es fija.** La cuenta no me deja asignar una IP elástica
  (`InvalidParameterCombination` en las cinco libres), así que si esa máquina se
  reinicia del todo, la dirección cambia. Para uso serio hay que arreglar el
  permiso y ponerle una fija.
- **El RPC está recortado a propósito.** Solo `ETH`, `NET` y `WEB3`. `admin`,
  `debug` y `miner` responden *Method not enabled*. Comprobado.
- **Se cierra en un minuto** quitando la regla del 8545 en el grupo
  `sg-06d4056832210c88b`, si prefieres que no esté abierto.

## Cómo quedó montado

| | |
|---|---|
| Nodo RPC | `ogb-testnet-2` · 18.234.39.26 · **no es validador** |
| Servicio | `rpc5534`, con systemd y arranque automático |
| Validadores | los cuatro de siempre: node3, node4, node5, node6 |
| Génesis | el mismo de los validadores (`fd85fb52…`) |

Dos cosas costaron y quedan anotadas:

1. **El descubrimiento de nodos no bastaba.** Con solo `--bootnodes` el nodo se
   quedaba en cero peers y «Unable to find sync target». Se arregló con
   `static-nodes.json`, que fuerza la conexión directa sin depender del
   descubrimiento.
2. **El cortafuegos tenía que abrirse en los dos sentidos.** Abrir el 30303 de
   los validadores hacia el nodo RPC no alcanzaba: el nodo RPC también tenía que
   dejar entrar a los validadores.

## Un cabo suelto que encontré

Había **dos cadenas distintas usando el mismo número 5534**: la buena, con 331
cuentas y 172 contratos, y otra **vacía** —1 cuenta, 0 contratos— en las tres
máquinas `ogb-testnet`. Apagué la de `testnet-1` y `testnet-2`; **queda viva la
de `testnet-3`** y hay que quitarle el número o apagarla, porque con el mismo ID
una billetera puede acabar hablando con la equivocada.
