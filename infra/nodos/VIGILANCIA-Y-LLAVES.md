# Copia de las llaves y vigilancia de los validadores · 20-ago

Dos agujeros que se midieron antes de opinar, y los dos salieron mal:

```
llave del validador:        64 bytes  (existe)
copia fuera de la maquina:  ninguna   ← en los 7
vigilancia de besu:         0         ← nadie mira
```

## 1 · Las llaves ya tienen copia

Cada validador es un archivo de 64 bytes que existia **en un solo disco**. Con
siete validadores QBFT hacen falta **cinco vivos** para que la cadena avance:
perder dos se aguanta, **perder tres la detiene**, y sin copia de la llave esa
identidad no vuelve.

Las siete estan ahora en `s3://og-5550-llaves-validadores-548380372606/`, con:

- **acceso publico bloqueado** en las cuatro formas que ofrece S3;
- **versionado activado**, para que un borrado no sea definitivo;
- **cifrado en reposo con KMS** por defecto en el bucket.

### Como se subieron, que es lo que importa
La llave viaja **del nodo a S3 por TLS**, con una URL firmada de una hora. En
ningun momento pasa por el asistente ni queda escrita en ningun registro de
conversacion. Lo unico que se leyo desde fuera fue la huella sha256, para
comprobar que las siete son distintas — y lo son.

### Prueba de restauracion
No basta con subir un archivo: hay que saber que sirve. Se bajo lo guardado
**dentro del nodo** y se comparo alli mismo con la llave en uso:

```
node5: IDENTICA a la que esta en uso
node2: IDENTICA a la que esta en uso
```

### Lo que esta copia NO protege
El bucket vive en **la misma cuenta de AWS** que los nodos. Protege contra el
disco que muere, que es lo que pasa de verdad. **No protege contra perder la
cuenta**: para eso hace falta una copia fuera de AWS, y para hacerla sin que
ningun secreto cambie de manos, Jose genera un par de llaves en su computadora
y manda solo la **publica**:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out og-llaves.pem
openssl rsa -in og-llaves.pem -pubout -out og-llaves.pub
```

`og-llaves.pub` se puede pegar en cualquier sitio; `og-llaves.pem` no sale de su
computadora nunca.

## 2 · Ya hay quien vigile

`ogb-vigia.sh` + `ogb-vigia.timer`, cada 3 minutos, en los **siete** nodos.

| Situacion | Que hace |
|---|---|
| El servicio esta caido | lo levanta |
| El RPC no contesta dos vueltas seguidas | reinicia |
| No avanza y se quedo **sin pares** | reinicia: esta aislado |
| No avanza **con pares** | reinicia UNA vez; si a la cuarta vuelta sigue igual, **avisa y deja de reiniciar** |

Esa ultima fila es la que evita el peor comportamiento posible: un validador
reiniciandose cada tres minutos estorba mas de lo que ayuda, y si hay pares y la
altura no sube, el problema no es de esa maquina sino del consenso.

Los avisos van al tema SNS `og5550-avisos`, que reparte por correo a
`info@ordenglobal.org`, **limitados a uno por hora**: si algo va mal, un correo
basta para ir a mirar; sesenta consiguen que se ignoren.

### El fallo que aparecio al desplegarlo, y como se arreglo
La primera version comparaba la altura con la de la vuelta anterior **sin mirar
cuanto tiempo habia pasado**. Al ejecutarla dos veces con dos segundos de
diferencia canto «ESTANCADO» en los siete nodos, porque en dos segundos no da
tiempo a que salga un bloque. Se anadio una guardia: por debajo de 60 segundos
no se concluye nada. Redesplegado, la doble ejecucion ya no dice nada.

### Prueba real
No se dio por bueno mirando el codigo. Se **paro Besu en node7** y se dejo
actuar al vigilante:

```
[30s] besu: failed
[60s] besu: failed
[90s] besu: active
       REPARANDO: el servicio estaba caido
```

Noventa segundos. Y durante toda la prueba la cadena se mantuvo en **siete
validadores**: parar uno con siete es seguro, que es justo por lo que se
subieron de cuatro a siete.

## 3 · `status: active`, listo para mandar

La marca `incubating` se puso cuando habia un validador. Ya hay siete, asi que
el motivo desaparecio. El archivo con el cambio esta en
`infra/chainlist/eip155-5550-active.json` y **los cuatro chequeos del CI ya se
corrieron en verde** contra el master actual del repositorio de cadenas.
