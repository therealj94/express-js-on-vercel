# Etapa 3 · El corte · 25-ago 2026, 23:26–23:45 UTC

**Hecho.** La 5550 corre sobre el génesis nuevo, con los siete validadores, y
el ORIGEN de las pruebas está en el tesoro.

Se hizo de día, no de noche como decía el plan. Fue decisión de José —«hazlo
ahora mismo»— y con 23 transacciones en diez días el impacto es despreciable.
Queda dicho para que conste.

---

## El resultado

| | |
|---|---|
| Último bloque de la cadena vieja | **92.834** · `0xc2d1bbd962daa707…` |
| Génesis nuevo | `0x56b3cf56694f61c8a1ff1eae8bb50c57723899a1f493910a59f797b3ce734405` |
| chainId | 5550, sin cambios |
| Validadores | **7**, y los siete proponen bloques |
| Tesoro | **249.999.999.845,000000000 ORIGEN** |
| Wrapper y pool | **0** |
| Billeteras con su 1 ORIGEN | **155 de 155** |
| ORIGEN total | 1.000.000.000.000,000000000 exacto |

Comprobado contra la cadena viva, no contra el archivo: **343 cuentas y 1.361
ranuras, cero diferencias** respecto al génesis previsto. Y desde el RPC
público, que es lo que ve la app: chainId, altura subiendo, tesoro, wrapper a
cero y la emisión de AUKA intacta.

Ordenscan se reindexó solo: reporta la punta real sin que hubiera que tocarlo.

---

## Salió mal a la primera, y por qué

El primer arranque **partió la red en dos cadenas**: node1, node3, node4 y
node5 quedaron en el génesis VIEJO, y node2, node6 y node7 en el nuevo.

### La causa

`ogb-vigia.timer` — un vigía que instalamos nosotros mismos y que **reinicia
`besu5550` cada tres minutos si la altura no avanza**. Durante el corte hizo
exactamente su trabajo: veía nodos parados y los levantaba. Como el reparto del
génesis a las siete máquinas tarda un minuto y medio por SSM, los nodos que el
vigía resucitó antes de que les llegara su archivo arrancaron con el viejo.

Las fechas no dejan lugar a dudas:

| | Besu arrancó | génesis nuevo escrito |
|---|---|---|
| node1 | 23:26:55 | 23:27:40 |
| node3 | 23:27:03 | 23:27:51 |
| node4 | 23:27:06 | 23:27:56 |
| node5 | 23:27:13 | 23:28:01 |

Los cuatro arrancaron **antes** de tener su génesis.

### Y esto ya estaba escrito

En `SIETE-VALIDADORES-20-AGO.md`, sobre el apagado de la 8532:

> «El watchdog se apagó primero: si no, reanima el servicio a los tres minutos
> y el apagado no dura.»

Estaba en nuestra propia documentación, de cinco días antes, y no lo apliqué.
El plan de reinicio tampoco lo mencionaba. **Una lección escrita que no entra
en el procedimiento no sirve de nada**, y ésta se quedó en un documento en vez
de estar en el paso 3.

### La segunda cosa que falló: la comprobación que no existía

El procedimiento decía comprobar la huella md5 del génesis en cada nodo —y se
comprobó, y salió bien en los siete—. Pero **no decía comprobar, después de
arrancar, que los siete tuvieran el mismo bloque 0**.

Esa es la comprobación que importa: el archivo puede estar bien y el nodo
puede estar corriendo otra cosa. Sin ella, la red partida se veía «sana» nodo a
nodo — cada uno respondía, cada uno tenía altura, cada uno tenía pares. Sólo
comparándolos entre sí aparecía el problema.

### Cómo se arregló

1. **El vigía primero**: `systemctl stop ogb-vigia.timer` y deshabilitado, en
   los siete.
2. Parar Besu, vaciar `nodo/` conservando `key`.
3. Poner el génesis y comprobar en cada máquina, **antes de arrancar**: md5,
   que el `extraData` mida 376 caracteres —el de siete validadores; el viejo
   mide 240—, y que el servicio esté parado de verdad.
4. Arrancar los siete.
5. **Comprobar que el bloque 0 es idéntico en los siete.** Lo es:
   `0x56b3cf56…` en las siete máquinas, un solo génesis en la red.
6. Reactivar el vigía.

Coste del error: unos quince minutos, y ninguna pérdida — la cadena vieja ya
estaba respaldada y el estado no se había movido.

---

## El procedimiento corregido, para la próxima

```
0. Apagar el vigia (ogb-vigia.timer) en los siete.  <-- el paso que faltaba
1. Foto final y su huella al acta.
2. Parar Besu en los siete y comprobar que no queda proceso vivo.
3. Vaciar nodo/ CONSERVANDO nodo/key.
4. Repartir el genesis y comprobar EN CADA NODO: md5, largo del extraData,
   y que el servicio siga parado.
5. Arrancar los siete.
6. Comprobar que el bloque 0 es IDENTICO en los siete.  <-- el otro que faltaba
7. Comprobar desde fuera: altura, validadores, saldos, contratos.
8. Reactivar el vigia.
```

Los pasos 0 y 6 son los que este corte tuvo que aprender a golpes.

---

## La vuelta atrás, que no hizo falta

Quedó preparada y sigue en las siete máquinas:

| Archivo | Qué devuelve |
|---|---|
| `/opt/og5550-real/genesis-viejo.json` | el génesis original, md5 `89a1ec6b…` |
| `/opt/og5550-real/genesis-vuelta-atras.json` | **el estado exacto de hoy**, sin consolidar: cada saldo, cada token, cada nonce. md5 `20ab56ff…` |

El segundo es el que importa: restaurar el génesis viejo devolvería la cadena a
como estaba hace diez días y perdería las 23 transacciones. El de vuelta atrás
devuelve el estado tal como estaba justo antes del corte.

Todo el respaldo sigue en
`s3://og-5550-arranque-548380372606/respaldo-reinicio-2026-08-25/`.

---

## Lo que queda

- **Avisar a quien haya usado MetaMask** con la 5550: tiene que borrar datos de
  actividad, porque guarda el nonce. A la app no le pasa: el backend lee el
  nonce de la cadena en cada envío.
- **Chainlist: nada que hacer.** Se conservó el 5550 y las mismas URLs.
- Actualizar el informe PDF de las cadenas con las cifras nuevas.
- Los comprobantes de pago viejos del chat apuntan a hashes que ya no existen.
