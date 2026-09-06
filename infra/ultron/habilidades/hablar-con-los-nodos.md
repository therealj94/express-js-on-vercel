---
nombre: hablar-con-los-nodos
cuando: Cuando hay que mirar o tocar un nodo de la cadena 5550 en AWS — la altura, el servicio, el disco, los pares — o cuando la cadena no avanza.
---

# Hablar con los nodos

Los nodos se nombran por su etiqueta: node1 a node7. `nodos` los lista con su estado; `nodo_comando` corre un comando en uno por SSM, con autorización del dueño que ve el comando exacto.

## Lo que se mira primero (todo de solo lectura)

- **La altura y si avanza**: `/usr/local/bin/polygon-edge status --grpc-address localhost:10000 | grep 'Current Block Number' | grep -oE '[0-9]+$'`. OJO: sin el `grep 'Current Block Number'` se lee el Chain ID (5550) en vez del bloque. Se compara con `cadena_altura` (la punta que ve Ordenex/OrdenScan).
- **El servicio**: `systemctl is-active polygon-edge` (o `besu` si el nodo ya migró) y `journalctl -u polygon-edge -n 40 --no-pager`.
- **El vigilante del nodo**: `journalctl -t ogb-watchdog -n 6 --no-pager`. Si dice «ESTANCADO … reparando» una vez, está haciendo su trabajo; si lo dice cinco veces seguidas sin que el bloque avance, ya no alcanza y hay que mirar más hondo.
- **Los pares**: `curl -s -X POST localhost:8545 -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"net_peerCount","params":[]}'`. Cero pares es un nodo solo, y un nodo solo no sincroniza.
- **Disco y memoria**: `df -h / | tail -1` y `free -m | head -2`. Un disco al 90 % es lo que tumba un nodo un domingo.

## Lo que se toca (cada uno con su motivo en el pedido)

- Reiniciar el servicio: `sudo systemctl restart polygon-edge`. Solo después de leer el journal y saber por qué.
- Nunca borrar la carpeta de datos, nunca tocar las llaves del validador, nunca cambiar `--nat` o los bootnodes sin el dueño delante: eso rearma la red entera.

## Cómo se entrega

Una tabla: nodo, bloque, cuánto le falta a la punta, servicio, pares, disco. Y una línea por nodo que preocupe. Lo que haya que hacer y no se haga en el momento, a `anotar_pendiente`.
