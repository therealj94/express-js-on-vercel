# Los dos bots · tráfico real en la red de pruebas

Una cadena que no recibe transacciones **parece sana aunque no lo esté**. El
VIGÍA mira que los bloques avancen y que el gas siga puesto, pero eso lo
comprueba mirando; nadie estaba *usando* la cadena. Estos dos bots la usan cada
tres horas y dejan escrito el resultado.

Si un día una transacción no entra, no confirma, o el gas deja de aceptarse, se
sabe por esto —y no por un usuario.

## Dónde corren, y dónde no

**Red de pruebas 5534.** Nunca la 8532.

Esto no es una preferencia. La cadena vieja está congelada y el génesis de la
5550 se construyó de su estado cerrado y se juzgó con **cero diferencias**. Una
sola transacción allí cambia la raíz de estado y **obliga a rehacer la
migración entera**.

Por eso `bots.py` pregunta el `chainId` **antes de firmar nada** y se niega a
seguir si no es 5534. Es la primera comprobación del archivo, antes que
cualquier otra cosa.

## Las dos billeteras

| | dirección |
|---|---|
| BOT A | `0x2C1f7757892DFCeceb2F7e930275C42325F02c0E` |
| BOT B | `0x5352d42C9100A22F1799fD721a88d915D7a529D8` |

Las llaves se generaron **en la propia máquina** y viven en `/etc/ogb-bots/`,
de root y sólo de root. **No están en este repositorio, ni en S3, ni en ningún
parte, y no han salido nunca de esa máquina.**

## Quién paga

Los cuatro validadores. Habían ido acumulando el gas que cobra la propia red
—entre 0,008 y 0,04 ORIGEN cada uno— y se les vació una vez a los dos bots:
**0,1095 ORIGEN**, que a 0,001953 por envío dan **56 envíos, unos 7 días** al
ritmo de ocho al día.

Y se sostiene solo, porque **el gas que gastan los bots vuelve a los
validadores**. El ORIGEN circula; sólo hay que devolverlo de vez en cuando con
el mismo procedimiento con que se sacó.

Manda siempre **el que más saldo tiene**. Parece un detalle y no lo es: el que
envía paga el importe *más* el gas, así que si mandara siempre el mismo se
secaría en la mitad de tiempo. Así se reparten solos.

## Qué mide cada carrera

No sólo que la transacción salga —eso no prueba nada—, sino que **llegue**:

- el recibo, esperando hasta 90 segundos (la cadena hace un bloque cada 10)
- el estado de la transacción, por si revirtió
- en qué bloque entró y cuánto gas gastó de verdad
- cuántos segundos tardó en confirmar
- el precio del gas que aceptó la cadena
- los saldos de los dos, y **cuántos envíos quedan** antes de secarse

Todo va a `/var/log/ogb-bots/ultimo.json` y se acumula en `historial.jsonl`.
El VIGÍA lo lee en cada ronda y lo mete en su parte.

## Cómo se maneja

```
systemctl list-timers ogb-bots.timer     # cuándo dispara la próxima
systemctl start ogb-bots.service         # una carrera ahora mismo
journalctl -u ogb-bots -n 20             # qué pasó
cat /var/log/ogb-bots/ultimo.json        # el último resultado
```

Vive en `ogb-testnet-2` (`i-0aff688efc52ab8c8`), la misma máquina que sirve el
cerebro, y habla con Besu por `127.0.0.1:8545`.

## Lo que falta · fase 2

Hoy sólo se mandan **ORIGEN nativo**. Para mandarse **ONDK** —que existe en la
red de pruebas, en `0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1`— y los otros 26
tokens, un bot tiene que *tener* ese token, y eso no se consigue con gas: hay
que reconstruir el génesis de la red de pruebas dándoles saldo.

Eso **reinicia la red de pruebas desde el bloque cero**, y hoy hay dos
solicitudes en revisión en Chainlist que apuntan a esos mismos RPC. Se hace
cuando Chainlist acepte, no antes.
