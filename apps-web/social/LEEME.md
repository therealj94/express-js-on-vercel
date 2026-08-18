# Piezas de redes

```
node apps-web/social/armar.mjs
```

Cada pieza es un HTML con su tamaño exacto en el `body`; `armar.mjs` la abre en
el navegador y la fotografía al doble de resolución. Cuando cambie el eslogan,
el logo o la captura, se edita una línea y se vuelve a correr — las dos salen
iguales. Un PNG editado a mano hay que volver a maquetarlo entero, y el día que
haya prisa saldrá peor que la vez anterior.

| Archivo | Tamaño | Para |
|---|---|---|
| `tarjeta.html` → `veta-tarjeta-1080x1920.png` | 1080×1920 | historia / reel |
| `dolares-a-oro.html` → `og-dolares-a-oro-1080x1080.png` | 1080×1080 | feed |

## Sobre parecerse a otras marcas

Las referencias que se usaron de punto de partida son azul eléctrico con lima y
tipografía condensada gritada la primera, y negro con rojo la segunda. Estas dos
van por el lado contrario a propósito: pozo verde-negro, oro, la serif de la
casa. La ESTRUCTURA —un producto con puntos alrededor; un antes y un después a
izquierda y derecha— es de toda la publicidad financiera desde hace treinta años
y no es de nadie. Lo que sí sería copiar es el color, la tipografía y el tono, y
de eso no hay nada.

El mensaje también es propio. La referencia vende «recibí tu remesa y pagá», que
lo hace cualquiera. Lo único que hace esta casa es que el saldo sea ORO, así que
el titular es exactamente eso.

## Dos reglas que se respetaron

**El teléfono lleva una captura real** de la web de Veta Wallet, no una maqueta
dibujada. Una interfaz inventada en un anuncio es una promesa que después no
está en la app cuando la persona la abre.

**Ninguna cifra de conversión.** No se pone «500 USD = 0,29 AUKA». El precio del
oro se mueve todos los días y una cifra impresa en una imagen queda vieja el
mismo día que se publica — y una cifra vieja en un anuncio de dinero no es un
detalle, es una queja.

## Las piezas de origen

`piezas/` tiene los logos con el fondo pasado a transparente y recortados a su
contenido, las fuentes de la casa, y la captura de la app. Se generan una vez;
si el logo cambia, hay que volver a pasarlos.
