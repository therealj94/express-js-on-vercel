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
todavía), solo sincronizan.

### El validador lleva una variante aparte

`ogb-watchdog-validador.sh` corre en **node1**, que sí produce bloques: mientras
reinicia, la cadena entera deja de avanzar. Por eso está pensado para
equivocarse hacia el lado de **no** actuar, con tres frenos que el otro no tiene:

1. **Exige dos chequeos seguidos sin avance** (~6 min). El validador produce un
   bloque cada 15 s, así que 6 minutos sin uno no es lentitud, es que se rompió.
2. **Máximo 2 reinicios por hora.** Si reiniciar no resuelve, insistir cada 3
   minutos solo impide que el nodo termine cualquier recuperación que necesite
   tiempo. Pasado el límite deja de intentar y registra una alerta.
3. **No agrega peers** — el validador es el origen de los bloques, no el destino.

El `jsonrpc` de node1 escucha en el **puerto 80**, no en 10002 como los demás.

Se instaló **sin reiniciar node1**: la cadena no se detuvo en ningún momento.

## Instalación

El `__NODE1_ADDR__` del script se reemplaza según la región del nodo:

- node5, node6 (us-east-1, misma VPC que node1) → IP privada
  `/ip4/172.31.53.32/tcp/10001/p2p/16Uiu2HAmLUenEzvFUe5EZnQpzRHbw17SYWS68eoWfQjL9BAAmW2c`
- node2, node4 (us-east-2, otra región) → IP pública
  `/ip4/34.203.38.219/tcp/10001/p2p/16Uiu2HAmLUenEzvFUe5EZnQpzRHbw17SYWS68eoWfQjL9BAAmW2c`
- node3 (us-east-1) → IP privada, igual que node5/node6

node1 usa `ogb-watchdog-validador.sh`, que no necesita esa dirección.

## Nota aparte: el `--nat` mal puesto

Varios nodos anunciaban una IP que ya no era la suya, lo que los dejaba
incomunicados. El caso más llamativo fue **node3**, que anunciaba
`18.191.232.121` — la IP vieja de **node2**, un copiar/pegar mal de quien lo
configuró. Su IP real es `54.165.79.187`. Corregido en los cinco.

**node1 también estaba mal** (anunciaba `54.166.135.175` en vez de
`34.203.38.219`). Ya corregido. Requirió reiniciar el validador: el corte fue
de ~2 segundos, la cadena siguió produciendo y el RPC público y el explorador
no se vieron afectados. Tras el reinicio hubo que reconectar los 5 nodos a
mano, porque el descubrimiento automático no los vuelve a unir solo.

## Pendiente: los nodos no tienen IP elástica

Ninguna de las IPs públicas de los nodos es elástica, así que **AWS les asigna
una nueva cada vez que la instancia se detiene y arranca** — que es exactamente
el origen de todo este problema: los `--nat` quedaron apuntando a direcciones
que dejaron de existir, y los nodos se quedaron anunciando una dirección
inalcanzable.

Corregir los `--nat` arregla el síntoma de hoy, pero **va a volver a pasar** en
el próximo stop/start de cualquier nodo. El arreglo de fondo es asignarles IPs
elásticas. Dato útil: la cuenta ya tiene **dos IPs elásticas asignadas y sin
usar** (`18.211.40.149` y `3.224.143.231`) — se están pagando igual, así que
usarlas no cuesta nada extra.

Ojo: asociar una IP elástica **cambia la IP pública** de la instancia, así que
hay que actualizar después los `--nat` y los bootnodes que la referencien.

Se instala en `/usr/local/bin/ogb-watchdog.sh` con
`ogb-watchdog.service` (oneshot) + `ogb-watchdog.timer` (cada 3 min,
`OnBootSec=3min` para que sobreviva reinicios).

Para ver qué hizo: `journalctl -t ogb-watchdog`
