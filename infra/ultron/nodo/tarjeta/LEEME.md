# La tarjeta: que el modelo esté cargado y tibio

Dos piezas que viven en el nodo A10G y **no estaban en el repositorio**: se
habían instalado a mano y se habrían perdido con la máquina. Van acá para que
un nodo nuevo se arme igual.

## `ogb-precalentar` — que esté CARGADO (al arrancar)

La máquina tiene 15 GB de RAM y el modelo pesa 16. Nunca queda en la caché del
sistema, así que cada carga son dos minutos leyendo disco. El precalentador
hace una pregunta boba al arrancar, con `keep_alive: -1`, y deja los dos
modelos clavados en la tarjeta. Ese costo lo paga el arranque, no la junta.

## `ogb-tibio` — que esté TIBIO (cada tres minutos)

Medido el 5-sep en la máquina, con el modelo ya clavado en VRAM:

| | fichas | tiempo | velocidad |
|---|---|---|---|
| Primera pregunta tras un rato quieto | 20 | 6,98 s | **2,9 f/s** |
| La siguiente, con todo caliente | 20 | 0,35 s | **57,9 f/s** |

Veinte veces. Y no es ninguna de las sospechas obvias — se descartaron una por
una antes de tocar nada:

- **No es la tarjeta bajando a reposo.** Persistencia puesta, estado P0,
  1710 MHz de 1710, y 300 fichas seguidas a 38 f/s con 290 W.
- **No es cargar el modelo.** `ollama ps` lo da entero en VRAM
  (17,4 GB + 0,68 del de vectores, de 23 disponibles), y no hay nada más
  usando la tarjeta.
- **No es el prompt.** Evaluarlo va a unas 2 000 fichas/s, y en frío o en
  caliente cuesta lo mismo.

Es el arranque en frío de los núcleos de CUDA: se paga una vez y se pierde al
rato de no usarlos. Lo pagaba **siempre la primera pregunta de la junta**, que
es justo la que decide si esto parece que anda. Ahora lo paga un pulso de
cuatro fichas cada tres minutos, y de paso refresca el `keep_alive`.

Medido de punta a punta contra el panel en producción, la misma pregunta antes
y después:

| Pregunta | Antes | Después |
|---|---|---|
| «Hola, ¿cómo está?» (sin herramientas) | 24,5 s | 14,9 s |
| Altura de las cadenas + monedas de AuCorp + junta (tres herramientas) | 109 s | 20,6 s |

El salto grande de la segunda es de las dos cosas juntas: el pulso y que las
herramientas de una misma vuelta ahora corren a la vez.

## Instalar

```bash
sudo install -m755 ogb-precalentar.sh ogb-tibio.sh /usr/local/bin/
sudo install -m644 ogb-precalentar.service ogb-tibio.service ogb-tibio.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ogb-precalentar.service ogb-tibio.timer
```

Para ver si está haciendo su trabajo: `journalctl -t ogb-tibio -n 20`. Cada
vuelta escribe cuánto tardó el pulso, y grita si pasó de ocho segundos — eso
querría decir que algo se enfrió de verdad y hay que mirar.
