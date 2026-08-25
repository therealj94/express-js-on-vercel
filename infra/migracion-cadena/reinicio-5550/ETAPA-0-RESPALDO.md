# Etapa 0 · El respaldo · 25-ago 2026

**Ejecutada y comprobada.** Producción no se tocó: todo lo de aquí es lectura.

Altura del corte medida: **92.426**
Hash del bloque: `0x2727efa62cd845b871fac59afe6dea44420e852ace0b4c340f2ecf04f8b08e17`
Raíz del estado: `0x853cda796baf43be6b2d0df3db6941a111c14e5ab51bad646389022739792678`

---

## Dos hallazgos que corrigen el plan

### 1 · La cadena tiene 23 transacciones, no una

El plan decía «una sola en toda su vida: la transferencia de 20 ORIGEN del
bloque 14.955». Se midieron **los 92.410 bloques, uno por uno** —no una
muestra— y salieron **23 transacciones en 23 bloques**:

- 6 envíos de ORIGEN nativo
- 17 transferencias ERC-20 (`transfer(address,uint256)`) sobre tres tokens:
  `0xfb83eea4…` (9), `0x6facc8df…` AUKA (7) y `0x961f798f…` (1)

De dónde salió el error: la medición anterior miró los últimos 2.000 bloques
—que sí estaban vacíos— y de ahí saltó a «una sola en toda su vida». Mirar el
final de la cadena no es mirar la cadena.

**Qué cambia en el plan:** el génesis nuevo debe llevar los saldos de token
movidos, no los del génesis viejo. Se construye sobre la foto, que es lo que
el plan ya decía; pero ahora sabemos que esa diferencia existe y cuál es.

**Qué NO cambia:** el argumento de fondo. 23 transacciones en diez días sigue
siendo una cadena sin uso real, y el precio de reiniciar sigue siendo bajo.

### 2 · La llave del validador vive dentro del directorio que el plan manda vaciar

```
/opt/og5550-real/nodo/key      <- la llave privada del validador
/opt/og5550-real/nodo/database <- los datos de la cadena
```

La etapa 3 paso 4 dice «vaciar el directorio de datos de los siete». Hecho al
pie de la letra, **los siete nodos arrancan con identidades nuevas, ninguno
sería validador, y la cadena no produce un solo bloque.** Y no lo diría claro:
los nodos levantan, el RPC responde, y la altura se queda en cero.

**Corrección:** el paso 4 pasa a ser *vaciar `database/`, conservar `key`*, con
comprobación de la dirección derivada después de vaciar y antes de arrancar.
El respaldo de las llaves deja de ser una precaución y pasa a ser parte del
procedimiento.

---

## Lo que se respaldó, y cómo se comprobó

Todo en `s3://og-5550-arranque-548380372606/respaldo-reinicio-2026-08-25/`.

| Archivo | Bytes | Cómo se comprobó |
|---|---|---|
| `genesis-al-corte.json` | 4.551.689 | md5 `89a1ec6b15d584525326ca11951d87df`, **igual al que corre en node1** |
| `foto-estado-5550.json` | 4.603.054 | md5 `317c480d22e94e7542107f42f1eb939b` calculado **en el nodo y aquí**, iguales |
| `detalle-tx-5550.json` | 16.429 | las 23 transacciones con sus recibos y registros |
| `ranuras-tokens.json` | 5.518 | las 18 ranuras de saldo de los tres tokens tocados |

La foto no es una copia de un volcado: el RPC de producción **no tiene la API
`DEBUG`**, así que no hay `debug_accountRange`. Se leyó cuenta por cuenta y
ranura por ranura a una altura fija —leer a `latest` mientras la cadena avanza
produce una foto que nunca existió—: 343 cuentas y 1.375 ranuras.

### Las llaves de los siete validadores

Estaban en `s3://og-5550-llaves-validadores-548380372606/2026-08-20/`. Dos
comprobaciones, y ninguna imprime la llave:

1. **Se deriva la dirección de cada copia** y se contrasta con el conjunto QBFT
   que la cadena publica. **Las siete coinciden con su nodo.**
2. **Se compara la copia con la llave viva** de cada máquina: cada lado calcula
   el sha256 de los mismos 32 bytes normalizados y solo se compara igualdad.
   **Las siete al día.**

Los archivos miden 66 bytes tres de ellos y 64 los otros cuatro. No es
truncamiento: unos llevan el prefijo `0x` y otros no. Los siete normalizan a
32 bytes exactos. Esto se comprueba, no se supone — es la lección del corte
anterior, cuando las llaves salieron a 62 caracteres y nadie lo habría sabido.

---

## El estado, entero y cuadrado

Diferencias entre el génesis y la cadena viva a la altura del corte:

| | Cuántas | Cuadra con |
|---|---|---|
| Cuentas con saldo nativo distinto | 16 | 8 por transacciones + 7 validadores cobrando comisión + el tesoro |
| Cuentas con nonce distinto | 7 | los incrementos suman **23**, el número exacto de transacciones |
| Ranuras del génesis que cambiaron | 10 de 1.375 | todas dentro de los tres tokens tocados |
| Ranuras nuevas (tenedores que no existían) | 7 | receptores de las transferencias |
| Cuentas con código distinto | **0** | ningún contrato se desplegó ni cambió |

Y la comprobación que importa: en los tres tokens, **la suma de los tenedores
tocados es idéntica antes y después**, al último decimal. Nada se emitió y nada
se quemó.

El tesoro `0x3d5510e5…` pasó de 249.999.982.618,073120117 a
249.999.982.598,071166992 ORIGEN: **−20,001953**, que son los 20 del bloque
14.955 y su comisión. Es la misma cifra del informe de las cadenas.

---

## Lo único que falta de la etapa 0

**La copia de la base de Ordenscan.** El explorador de producción no corre en
las máquinas de AWS: es `orden-global-scan-c4abe71e8024.herokuapp.com`, con su
base en Heroku, y esta sesión no tiene ese token.

No bloquea el corte, y conviene decir por qué en vez de dejarlo como una
casilla sin marcar: el índice de Ordenscan **es dato derivado**. Se reconstruye
leyendo la cadena, y el procedimiento ya lo reindexa después del corte. Si
hubiera que volver atrás, se reindexa otra vez desde el estado restaurado. Lo
que la copia ahorraría es tiempo, no información.

Si José pasa el token de Heroku, se hace y se tacha del todo.

---

## Herramientas

En esta misma carpeta, y sirven desde cualquier máquina —leen la sesión de AWS
de `$OG_SECRETOS`, que nunca va al repositorio:

| Guion | Qué hace |
|---|---|
| `ssm.py` | corre un comando en un nodo y devuelve **el código de salida del comando**, no el de SSM |
| `canal_s3.py` | sube un archivo desde un nodo con URL prefirmada, sin darle permisos de S3 al nodo |
| `escanear_bloques.py` | recorre la cadena entera en lotes y anota cada bloque con transacciones |
| `detalle_tx.py` | cada transacción con su recibo y sus registros |
| `foto_estado.py` | la foto: cuentas y ranuras a una altura fija |
| `comprobar_llaves.py` | deriva la dirección de cada llave respaldada y la contrasta con el validador |

Sobre `canal_s3.py`: el rol de las máquinas (`EC2-SSM-Core`) no puede escribir
en S3. Ampliárselo para un respaldo sería dejar abierto lo que solo hacía falta
un rato. En vez de eso se firma la URL aquí y el nodo sube a ciegas: no puede
listar, ni leer, ni tocar otra clave.
