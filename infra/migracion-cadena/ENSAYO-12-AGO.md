# Ensayo del corte · 12-ago-2026

Ensayo completo sobre el camino de producción, sin congelar nada y sin que
ningún usuario se enterara. Encontró cuatro cosas. Tres se arreglaron esa misma
noche; la cuarta cambia la fecha del corte.

## Lo que funciona, medido

| | |
|---|---|
| Volcado del árbol de estado | **332 cuentas · 173 contratos · 1.385 ranuras** |
| Nodos del árbol que faltan | **0** |
| Las cuatro billeteras de emisión | **firmadas y verificadas** el 12-ago |
| Copia fría de las llaves de validador | **hecha y comprobada** por su dueño |

El cero de nodos faltantes es la garantía de que la foto está entera: el
volcador termina en error si le falta uno solo.

## Hallazgo 1 · El runbook llevaba al directorio equivocado

Dice `node-1`. El nodo en marcha usa **`node-x`** — lo dice su propia unidad de
systemd. El primer volcado salió con **0 cuentas y el nodo raíz ausente**.

En un corte real eso ocurre con el servicio ya caído y con el reloj corriendo.

`/home/ec2-user/node-1` es un directorio abandonado: 760 KB de árbol contra los
6,7 MB del bueno, y 116 MB de cadena contra 2,6 GB.

## Hallazgo 2 · Nada de la cadena de herramientas estaba en producción

En node1 no había **Go**, ni el volcador compilado, ni `pip`, ni
`pycryptodome`. El kit de migración vivía disperso en la máquina de ensayo.

Instalado y compilado el 12-ago en `/opt/migracion`. Ya no es un problema, pero
lo era: son unos veinte minutos de instalaciones que nadie había contado.

## Hallazgo 3 · SSM no admite comandos de más de 97 KB

Los archivos de datos del kit pasan ese límite. Se suben por S3 con enlace
temporal. Anotado porque es el tipo de detalle que detiene una noche de corte.

## Hallazgo 4 · El que cambia el plan: **el cierre de ranuras caduca**

> ## ⚠ Corregido el 12-ago por la tarde — este hallazgo estaba mal
>
> **El cierre no caduca, porque la cadena vieja está parada.**
>
> La raíz de estado de la 8532 es **idéntica desde el bloque 4.149.261**, del
> **8-ago-2026 a las 11:45 UTC**. Comprobado por búsqueda binaria sobre
> `stateRoot`: no es que haya poca actividad, es que el estado **no ha cambiado
> en 3,9 días**. En los últimos 12.000 bloques hay **cero transacciones**
> —12.000 bloques leídos, cero fallos—; la cadena produce bloques vacíos.
>
> Con el estado congelado, los volcados del 11 y del 12 de agosto son **el mismo
> estado**. Así que las 78 huérfanas **no son ranuras nuevas**: son ranuras que
> nunca se identificaron. Es un trabajo de una vez, no una carrera contra el
> reloj.
>
> **Lo que sigue en pie:** las 78 hay que cerrarlas antes de construir el
> génesis, y eso no cambia. **Lo que se cae:** que la ventana de una hora sea
> inalcanzable, y que haga falta un cierre diario.
>
> **Lo que lo sustituye, y es exacto:** guardar el `stateRoot` del momento del
> cierre y volver a leerlo antes del corte. Si coincide, el cierre sigue siendo
> válido, sin repetir nada. Si no coincide, es que hubo movimiento y hay que
> rehacerlo. Es una comparación de dos cadenas de texto, no un proceso nocturno.
>
> Cómo me equivoqué, que importa para no repetirlo: mi primer barrido dijo «cero
> transacciones en toda la cadena» y era falso. Este nodo **acepta lotes de
> hasta 20 peticiones** y yo mandaba 100 y 200; todas fallaban, y mi contador
> sumaba *peticiones enviadas* en vez de *bloques leídos*. Contaba trabajo que
> no se había hecho. Lo de arriba está medido contando sólo respuestas válidas.

Al emparejar las preimágenes contra el estado de hoy aparecieron **156 ranuras
huérfanas**. No es un fallo del método: la lista de candidatos es del 11-ago y
desde entonces la cadena avanzó unos 6.000 bloques. Cada transacción nueva crea
ranuras que esa lista no conoce.

Fusionando el cierre de la sesión anterior —`preimagenes-cerradas.json`, que hay
que convertir de formato— bajan a **78**. Las 78 restantes son ranuras nuevas.

**Y cerrarlas no es correr un script.** Requiere:

1. Cosechar las transacciones nuevas contra la cadena vieja
2. Un nodo «banco» con `debug_traceTransaction` —la cadena vieja no lo expone—
3. Reproducir esas transacciones y leer los SLOAD/SSTORE reales
4. Realimentar y repetir hasta punto fijo

Son varias vueltas y consultas a la cadena. **No cabe en una ventana de una
hora.**

### Qué significa para el corte

*(Reemplazado por la corrección de arriba. Se deja escrito lo que se pensó, para
que se vea de dónde salió la conclusión.)*

La ventana de 50–70 minutos del plan **no es alcanzable** si el cierre se hace
dentro de ella. Y el cierre no se puede hacer «el día antes» y reutilizar,
porque cada bloque nuevo vuelve a abrir ranuras.

### La salida, y es barata

**Dejar el banco encendido y correr el cierre a diario.** Así la distancia entre
el último cierre y el corte es de horas, no de días, y quedan un puñado de
ranuras nuevas en vez de 156. Con eso el cierre dentro de la ventana vuelve a
ser cuestión de minutos.

El banco ya existe y está encendido: tres cadenas Besu en la máquina de ensayo,
con `debug_traceTransaction` respondiendo.

### Cómo queda de verdad

El cierre de las 78 se hace **fuera de la ventana, con calma**, y se guarda con
el `stateRoot` de la 8532 al que corresponde. La noche del corte sólo se
comprueba que ese `stateRoot` sigue siendo el de la punta. La ventana de una
hora vuelve a estar en pie.

Un detalle que conviene mirar de todas formas: **que la cadena lleve cuatro días
sin una sola transacción no es normal en una red con usuarios**. O no hay
actividad real, o algo dejó de enviar. No bloquea el corte, pero merece
respuesta antes de dar la migración por buena.

## Lo que queda por ensayar

Construir el génesis 5550, repartirlo, arrancar los cuatro Besu y pasar el juez.
No se llegó a eso porque el cierre no cerró, y **construir un génesis con
ranuras sin identificar produce una cadena que parece correcta y ha perdido
estado** — que es exactamente el error que este proyecto ya cometió una vez.
