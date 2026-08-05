# Watchdog de sincronización de los nodos

## El problema

Los nodos no validadores (node2, node4, node5, node6) se quedaban trabados
sincronizando: paraban en un bloque exacto y no volvían a avanzar, **sin
ningún error en el log** y con los peers todavía conectados. Reiniciar el
servicio los destrababa, pero volvía a pasar a las horas.

## La causa raíz

Está en el diseño del `syncer` de polygon-edge (`syncer/syncer.go`). Su bucle
principal es puramente reactivo:

```go
func (s *syncer) Sync(callback func(*types.FullBlock) bool) error {
    for {
        // Wait for a new event to arrive
        <-s.newStatusCh          // ← se bloquea acá indefinidamente
        ...
        s.bulkSyncWithPeer(bestPeer.ID, bestPeer.Number, callback)
    }
}
```

Solo despierta cuando llega un aviso de que un peer tiene bloques nuevos. Y ese
aviso se emite con un envío **no bloqueante** sobre un canal **sin buffer**:

```go
func (s *syncer) notifyNewStatusEvent() {
    select {
    case s.newStatusCh <- struct{}{}:
    default:                     // ← si nadie escucha, se descarta en silencio
    }
}
```

Mientras el syncer está ocupado dentro de `bulkSyncWithPeer` — que tarda
segundos trayendo miles de bloques — nadie está escuchando `newStatusCh`, así
que **todos los avisos que llegan en esa ventana se pierden**. Cuando la ráfaga
termina, el bucle vuelve a bloquearse y necesita un aviso *nuevo*. Si ese aviso
no vuelve a llegar, el nodo queda detenido para siempre.

Se confirmó empíricamente: cuando se traba **no aparece** ninguna de las líneas
de error del código (`failed to complete bulk sync`, `timeout awaiting block`,
`unable to verify block`). El bulk sync termina limpio y simplemente no hay
quién lo vuelva a despertar.

No hay opción de configuración para esto ni reintento periódico en el código, y
el binario desplegado es de octubre de 2023 (IBFT, ya descontinuado aguas
arriba), así que parchear el fuente no es razonable.

## La solución

`ogb-watchdog.sh` + un timer de systemd que lo corre cada 3 minutos. Compara la
altura actual con la de la corrida anterior; si no avanzó, reinicia el servicio
y vuelve a agregar al validador como peer — la combinación que se comprobó que
destraba.

Reiniciar estos nodos es barato: **no producen bloques** (no son validadores
todavía), solo sincronizan. El validador de producción (node1) **no** lleva
watchdog, justamente porque reiniciarlo sí detendría la cadena.

## Instalación

El `__NODE1_ADDR__` del script se reemplaza según la región del nodo:

- node5, node6 (us-east-1, misma VPC que node1) → IP privada
  `/ip4/172.31.53.32/tcp/10001/p2p/16Uiu2HAmLUenEzvFUe5EZnQpzRHbw17SYWS68eoWfQjL9BAAmW2c`
- node2, node4 (us-east-2, otra región) → IP pública
  `/ip4/34.203.38.219/tcp/10001/p2p/16Uiu2HAmLUenEzvFUe5EZnQpzRHbw17SYWS68eoWfQjL9BAAmW2c`

Se instala en `/usr/local/bin/ogb-watchdog.sh` con
`ogb-watchdog.service` (oneshot) + `ogb-watchdog.timer` (cada 3 min,
`OnBootSec=3min` para que sobreviva reinicios).

Para ver qué hizo: `journalctl -t ogb-watchdog`
