# La copia fría de las cuatro llaves de validador

Las llaves viven hoy en dos sitios: cada una en su nodo, y cifrada en SSM
Parameter Store. Las dos están dentro de la misma cuenta de AWS. **Si esa
cuenta se pierde, se borra o alguien la toma, se pierde la cadena.** La copia
fría es la única que sobrevive a eso.

Perder **una** llave se repara: los otros tres validadores votan y sacan al
que falta. Lo que no se repara es perder **dos**.

## El principio

José genera un par de llaves en **su propia computadora**. Me pasa sólo la
mitad pública. Cada nodo cifra su llave de validador contra esa pública, y el
resultado puede viajar por donde sea —chat, correo, S3— porque **sólo la
privada de José lo abre**.

Así la llave de validador nunca aparece en claro fuera de su nodo, ni pasa por
el operador, ni queda en ningún registro.

**Probado el 11-ago-2026 de punta a punta** con un par de prueba: el nodo cifró,
el descifrado devolvió los 64 caracteres correctos, y la dirección derivada
coincidió con la publicada de node3. El par de prueba se borró.

## Los pasos

### 1 · En tu computadora, generá el par (una sola vez)

```sh
openssl genrsa -out og-respaldo-privada.pem 4096
openssl rsa -in og-respaldo-privada.pem -pubout -out og-respaldo-publica.pem
```

`og-respaldo-privada.pem` **no sale nunca de esa máquina**. Si se pierde, el
respaldo queda ilegible para siempre. Ponele una copia en un lugar seguro
antes de seguir.

### 2 · Pasame `og-respaldo-publica.pem`

Sólo la pública. Es inofensiva: con ella únicamente se puede cifrar.

### 3 · Yo la subo a los cuatro nodos y cada uno cifra la suya

```sh
openssl pkeyutl -encrypt -pubin -inkey og-respaldo-publica.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in /opt/besu-validador/llave.hex -out llave-<nodo>.cif
```

Te devuelvo cuatro bloques en base64, uno por nodo. Podés recibirlos por el
canal que quieras: sin tu privada no son nada.

### 4 · En tu computadora, descifrá y **verificá**

```sh
base64 -d llave-node3.b64 > llave-node3.cif
openssl pkeyutl -decrypt -inkey og-respaldo-privada.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in llave-node3.cif -out llave-node3.hex
```

Tienen que salir **64 caracteres hexadecimales**. Y ahora la parte que hace que
esto no dependa de confiar en mí: comprobá que cada llave corresponde a su
dirección.

```sh
python3 verificar-respaldo.py llave-node3.hex
```

Tiene que devolver la dirección de ese nodo:

| Nodo | Dirección que tiene que salir |
|---|---|
| node3 | `0x69e8a7b25586511a0c14430b45100e9439aae36c` |
| node5 | `0x65f987264bd77c3a094badfd88e4ba84c0b36382` |
| node6 | `0xc548464725d5fd4a15b882a221da67b9cfd29514` |
| node4 | `0x48ccec9a54b9357623458f26afadcd7412a6a833` |

**Si las cuatro coinciden, el respaldo es real.** No hace falta creerle a nadie:
la comprobación se hace sola con las direcciones que están publicadas en la
cadena.

### 5 · Guardalas

Dos copias, en **dos lugares físicos distintos**:

- **Papel** en una caja fuerte. Son cuatro líneas de 64 caracteres; se
  transcriben y se comparan a mano si hace falta.
- **Un dispositivo desconectado** —una memoria USB que no se enchufe a nada con
  internet—, con los cuatro archivos y una copia de `og-respaldo-privada.pem`.

Nunca las cuatro en el mismo lugar que la cuenta de AWS. La copia fría existe
justamente para el día en que esa cuenta no esté.

### 6 · Borrá lo intermedio

```sh
shred -u llave-node*.hex llave-node*.cif llave-node*.b64
```

## Si preferís no usar la consola

Hay un camino más simple, y es aceptable si la computadora es de confianza:
entrar a cada nodo desde el navegador con **AWS Systems Manager → Session
Manager**, y leer la llave con tus propios ojos:

```sh
sudo cat /opt/besu-validador/llave.hex
```

Es más directo, pero la llave aparece en el navegador y en el historial de la
sesión. El camino con cifrado es preferible porque no deja rastro en ningún
lado.

## Cada cuánto rehacerla

Cuando cambie una llave de validador. Mientras las cuatro sigan siendo las
mismas, la copia sigue valiendo — y conviene comprobarla una vez al año
descifrando y verificando las direcciones, para descubrir un respaldo ilegible
antes de necesitarlo, y no el día que haga falta.
