# Cadena 5550 · dónde estamos, qué se puede probar, qué se decide antes del corte

11 de agosto de 2026. Todo lo afirmado acá está medido contra la cadena en vivo
o probado en la de ensayo.

**La idea que ordena el documento:** casi todo lo que suena definitivo se puede
cambiar después del corte. Dos cosas no. Este reporte separa unas de otras.

| | |
|---|---|
| Ranuras de almacenamiento sin identificar | **0** |
| Cuentas sin dirección conocida | **0** |
| Cuentas en el génesis | **331**, ninguna afuera |
| Raíces de almacenamiento distintas | **0** |

## I · Dónde estamos

| Etapa | Estado | Qué la da por buena |
|---|---|---|
| Inventario del estado | **cerrada** | 332 cuentas, 0 sin dirección, 0 ranuras sin identificar |
| Génesis | **cerrada** | 172 de 173 contratos completos; el único incompleto es el de staking, que no viaja |
| Consolidación del ORIGEN | **cerrada** | la emisión antes y después es idéntica; el constructor aborta si no cuadra |
| Las cuatro llaves | **cerrada** | cada una en su nodo, cifrada aparte, y ninguna puede leer la de otra |
| Ensayo y comparación | **cerrada** | **1.350 comprobaciones iguales, 0 distintas** |
| Red de cuatro validadores | **cerrada** | produce bloques, aguanta una caída, se detiene con dos, se recupera sola |
| Oráculo del oro | **cerrada** | probadas la mediana, la banda muerta, el tope y el aborto por falta de fuentes |
| Aplicaciones contra el ensayo | abierta | falta operar una semana con la billetera apuntando a la cadena de pruebas |
| El corte | falta autorizar | necesita acuerdo de la Junta y ventana de mantenimiento |

## II · Cómo se emitiría ORIGEN

El ORIGEN nativo no se acuña desde un contrato: **el motor de consenso puede
crear moneda nueva en cada bloque** y dársela a una dirección elegida. Es un
parámetro de la cadena, no una transacción.

Esto se comprobó, no se supuso.

**Primera prueba.** Cadena de laboratorio con 2 ORIGEN de recompensa por
bloque. A los 8 bloques la dirección beneficiaria tenía **16 ORIGEN** que antes
no existían.

**Segunda prueba, la que importa: cambiarla con la cadena ya viva.** Se
programó que en el bloque 30 la recompensa pasara de 2 a 5, se reinició, y:

| Momento | Recompensa por bloque |
|---|---|
| Bloque 29 · antes | 2 ORIGEN |
| Bloque 31 · después | **5 ORIGEN** |
| Hash del génesis | **idéntico — es la misma cadena** |

Que el hash del génesis no cambiara es el dato central: encender o ajustar la
emisión **no obliga a migrar de nuevo**. Se actualiza la configuración de los
cuatro validadores y la cadena sigue donde estaba, con toda su historia.

El costo es coordinación —actualizar los cuatro nodos y reiniciarlos, con el
cambio entrando en un bloque futuro acordado—. Es una tarde de trabajo, no una
migración.

## III · La puerta de un solo sentido

### Lo único que se cierra de verdad

**1 · Los saldos de las billeteras cuya llave nadie tiene.** El génesis es el
único momento en que un saldo se mueve **sin firmar**. Después, mover ORIGEN
exige la llave privada de esa billetera. Si una llave se perdió, ese saldo
queda congelado para siempre.

**2 · El identificador de red.** Queda en 5550. Cambiarlo más adelante es otra
migración completa, con su corte y su interrupción.

### Lo que queda abierto

Emisión de ORIGEN nuevo · precio del gas (en caliente, sin reiniciar) · quiénes
son validadores (por voto) · ritmo de bloque · comisiones · y volver atrás,
porque la cadena vieja no se apaga.

## IV · Las tres billeteras que hay que probar antes

La emisión está repartida en cuatro asignaciones de 250.000 millones. Tres
**nunca firmaron una transacción**.

| Billetera | ORIGEN | ¿Firmó? | Qué prueba |
|---|---:|---|---|
| `0xacc03b…44b8` | 250.000.000.000 | no | no hay prueba de que exista su llave |
| `0x3011f7…5718` | 250.000.000.000 | no | ídem |
| `0x502191…7f74` | 250.000.000.000 | no | ídem |
| `0x3d5510…32c9` | 249.999.831.471 | **27 veces** | **alguien puede firmar** · es la billetera única elegida |

Que nunca hayan firmado no demuestra que la llave se haya perdido —puede estar
guardada y sin usar—, pero **tampoco demuestra que exista**, y por 750.000
millones eso no se supone.

**La prueba no mueve un solo ORIGEN.** Firmar un mensaje demuestra tener la
llave sin gastar gas ni mover fondos:

```
Orden Global · prueba de control de esta billetera · 11-ago-2026
```

Si las tres responden, quedan intactas y se asignan cuando se quiera. Si alguna
no responde, **el corte es la última oportunidad** de reasignar ese saldo, y eso
lo decide la Junta.

## V · Qué se puede probar ahora

Todo sin tocar producción y sin interrumpir a nadie.

| Prueba | Qué contesta | Riesgo |
|---|---|---|
| Firmar con las tres billeteras | si se pueden asignar después o hay que hacerlo ahora | ninguno · no mueve fondos |
| La billetera contra la cadena de pruebas | si los saldos se ven bien y un envío funciona | ninguno · es otra cadena |
| Una transacción con gas de verdad | si la aplicación explica bien el fallo por saldo insuficiente | ninguno · hoy el gas es cero y ese camino nunca se ejecutó |
| Descifrar y verificar el respaldo de las llaves | si la copia fría sirve el día que haga falta | ninguno · se comprueba contra las direcciones publicadas |
| El explorador contra la cadena de pruebas | si indexa desde el bloque cero | ninguno |
| Ensayo del corte completo | cuánto dura la ventana de verdad | ninguno sobre la cadena de pruebas |

## VI · Lo que ya quedó cerrado

| Asunto | Quedó |
|---|---|
| Motor y consenso | Hyperledger Besu con QBFT · sin proof of stake |
| Identificador de red | **5550** · pruebas en 5534 |
| Validadores al arrancar | **4** · aguantan una caída |
| Ritmo de bloque | 10 segundos |
| Precio del gas al arrancar | **77 gwei** · una transferencia cuesta un centavo |
| Cómo se revisa el gas | contra el oro · un ORIGEN es un gramo dividido en 55 |
| Saldos de las personas | **1 ORIGEN** cada una · alcanza para unas 210 transferencias |
| Saldos de los contratos | intactos · su ORIGEN respalda valor de la gente |
| Las tres asignaciones | intactas · se asignan después |
| Los demás tokens | migran completos, con todos sus tenedores |
| Hierro | se reutilizan cuatro nodos · **coste adicional cero** |
| Vuelta atrás | reapuntar el DNS · la cadena vieja no se apaga |

## VII · Lo que falta para poder cortar

1. **Las tres firmas** de las billeteras de 250.000 millones. Es la única
   prueba que, si sale mal, cambia una decisión que después no se puede cambiar.
2. **La copia fría de las cuatro llaves de validador**, cifrada y fuera de la
   cuenta de AWS. Necesita una persona.
3. **Credenciales de Expo** para actualizar la aplicación móvil esa noche.
4. **La semana de ensayo** con las aplicaciones apuntando a la cadena de pruebas.
5. **El acuerdo de la Junta** y la fecha de la ventana.

### Dos cosas fuera de la migración, pero urgentes

**El backend recibe ORIGEN de los usuarios en una dirección cuya llave privada
nadie tiene.** Su propio código lo dice. Ese ORIGEN no puede volver a salir.
Hoy son 126 y crece con cada canje.

**El token de acceso a Heroku sigue sin rotar**, y en esa misma cuenta está
guardada, como variable de entorno, la llave privada del tesoro de Polygon.

---

Génesis candidato de la 5550 · huella
`6b8ab3544660582ce77375bb895786c64f9b637cea4be7594f3b0381178ddd4c`. No es el
definitivo: el del corte se construye sobre la foto que se tome al congelar.
