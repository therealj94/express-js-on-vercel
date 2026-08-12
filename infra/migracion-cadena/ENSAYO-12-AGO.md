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

## Lo que queda por ensayar

Construir el génesis 5550, repartirlo, arrancar los cuatro Besu y pasar el juez.
No se llegó a eso porque el cierre no cerró, y **construir un génesis con
ranuras sin identificar produce una cadena que parece correcta y ha perdido
estado** — que es exactamente el error que este proyecto ya cometió una vez.
