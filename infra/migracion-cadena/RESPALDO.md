# El respaldo de la cadena 8532 · 10-ago-2026

Un nodo encendido no es un respaldo. Si alguien termina la instancia, el
respaldo se va con ella. Esto es lo que sí lo es.

## Dónde está

Bucket `s3://ordenglobal-cadena-8532-respaldo` (us-east-1), con:

- **acceso público bloqueado** en las cuatro formas,
- **versionado activado** — un borrado no destruye nada, deja una marca que se
  puede revertir,
- cifrado en reposo por omisión.

## Qué hay dentro

### Datos de la cadena · `2026-08-10/nodo-3/` · cifrado AES-256

| Archivo | Tamaño | SHA-256 del original |
|---|---|---|
| `estado-arbol-completo.json.gz` | 0,9 MB | `10e9116dbf8f1c96535bf2c57afdf68320bd81dd0bdd1dffc960a8bb3158f7c0` |
| `emparejamiento.json.gz` | 0,9 MB | `56363872f0e5a6f9cf240b62e477d6289f2fb90addab5101cf24d9d33915dec3` |
| `genesis-viejo.json` | 0,02 MB | `d9eb31cfba14d09222fc79104435988c0814b87ec97a3e0753313bd830f7ac76` |
| `trie.tar.gz` | 3,0 MB | — (copia cruda del árbol) |
| `blockchain.tar.gz` | 2.198 MB | — (la historia completa de bloques) |

El estado del árbol es del bloque **4.158.431**, raíz
`0xd21e29ff024fd135656a54ee3581bda080f716836d0e0243f0e8ec3a0b277882`, volcado
**sin un solo nodo faltante ni ilegible**. Contiene las 332 cuentas y las
1.385 ranuras: **todo el que tenga hasta una migaja de cualquier token está
ahí**, no hay lista de tenedores que se pueda quedar corta.

### Llaves de los nodos · `2026-08-10/llaves/` · cifrado **SSE-KMS**

Los seis juegos (`validator.key`, `validator-bls.key`, `libp2p.key`), uno por
nodo. Van con una clave KMS propia —
`alias/ordenglobal-llaves-cadena`, rotación anual activada — de modo que
**tener acceso al bucket no alcanza**: hace falta además permiso de descifrado
sobre esa clave, y cada uso queda en CloudTrail.

El contenido nunca se mostró ni se copió a ninguna máquina intermedia: se
empaquetó en el propio nodo, se subió por una URL firmada y el paquete
temporal se borró. Lo único que se registró de cada uno es su huella:

| Nodo | SHA-256 del paquete |
|---|---|
| node1 | `6a01eae93bbb118bd76335c4985b75574d02a38ad924f380065af6474d5c1ec7` |
| node2 | `1216c7181088bd5f235286f8aecf0f5fe3dccc0b3e039ea71df3ba89bd2ead6e` |
| node3 | `5faebaa3400c669507cf51e073c440da37f6d34c8e5a2f9d7dc9941c320c2c52` |
| node4 | `c8245f25837679e0a92e2eb3d44196bea7031952c5a0711928a4002fbbaae1a3` |
| node5 | `219af52c7915b37bf43f5c307b7ecbbd7591d4f6fa99d46546ea1596f58a4a18` |
| node6 | `3ae0e2ed0e3029cfb881846b38cb8ea6cdda84482afec890ae835c4305dcbfbc` |

## La máquina que no se puede perder

La cadena tiene **un solo validador**, confirmado por la instantánea IBFT en
el bloque 4.158.528:

    0xF777de573E67E78ECEcd2Afe19dD18dD046fd4d0

Derivando la dirección de la llave de cada nodo (sin leer ninguna llave, sólo
calculando su dirección en la propia máquina), esa llave está en **node1** —
`i-0260fc386a911acec`, 23.23.205.33, us-east-1.

Las direcciones de los otros cinco nodos existen y son válidas, pero **ninguna
está en el conjunto de validadores**: hoy no firman nada. Por eso el nodo 1 es,
literalmente, la cadena. Si se pierde su disco y no hubiera respaldo, la cadena
no produce un bloque más nunca. Ahora hay respaldo.

## Lo que este respaldo permite hacer

1. **Reconstruir la cadena vieja entera** en máquinas nuevas: génesis + base de
   bloques + llave del validador.
2. **Volver atrás después del corte** sin depender de que las máquinas viejas
   sigan encendidas.
3. **Auditar** que el génesis nuevo no perdió nada: el árbol volcado es la
   referencia contra la que se compara, y está firmado por su SHA-256.

## Lo que hay que hacer y no depende de mí

**Rotar la llave de acceso de AWS que quedó expuesta.** Ahora hay más razón
que antes: ese bucket contiene la llave del validador. El cifrado con KMS
ayuda, pero si la identidad expuesta tiene permiso de descifrado, no basta.
Rotarla es lo primero.
