# Las pruebas del cerebro

Se corren con un Chromium de verdad, cargando el archivo local y simulando la
red. **Existen porque adivinar salió caro**: el 13-ago la voz no sonaba y estuve
suponiendo causas hasta que cargué la página en un navegador y el error salió
en una línea.

```
node infra/cerebro/pruebas/probar-voz.js
node infra/cerebro/pruebas/probar-conversacion.js
```

## `probar-voz.js`

Espía las llamadas a `speechSynthesis` y comprueba la **secuencia**, que es
donde estaba el fallo:

- en frío tiene que haber `speak` y **ningún `cancel` antes** —cancelar y
  hablar en el mismo tick deja mudo a Safari;
- al interrumpir, `speak → cancel → speak`, en ticks distintos;
- en español, la primera frase en `es-MX`.

Así se cazó el fallo de verdad: asignar `u.voice` **lanza** si el objeto no es
una `SpeechSynthesisVoice` válida, y la excepción salía antes de `speak()`.
`speak() llamado 0 veces`.

## `probar-conversacion.js`

Le habla como le hablaría José —23 frases en los dos idiomas— y comprueba tres
cosas de cada respuesta:

1. que conteste algo;
2. que conteste **en el idioma del selector**, aunque le hablen en el otro;
3. que la **voz vaya con el idioma del texto**, no con el del selector.

La tercera es la que atrapa la queja original: preguntar «cost» en inglés y que
conteste el parte del Contador, escrito en castellano, con voz inglesa.

Los fallos que encontró y que ya están arreglados: «The what it costs agent»
(un engendro, ahora *The accountant*), «cuánto cuesta» que no se reconocía, y
«chainlist» que caía en el patrón de «chain» porque lo contiene.

## `probar-invitado.js`

Lo que ve —y lo que NO ve— quien entra por `/demo` sin cuenta. Cuatro cosas:

1. **que no pida nada interno.** Una sola petición a `/rpc` o a `/partes.json`
   devuelve 401, y un 401 con `WWW-Authenticate` abre la ventana de contraseña
   del navegador encima de la presentación. Pasó dos veces: primero los
   temporizadores, después los iconos de `/img`. La prueba mira **todas** las
   peticiones durante 26 s y falla si alguna toca lo interno.
2. **que nada salga en rojo.** El invitado no puede leer los proxies, así que
   antes salía «CON FALLAS 10/13». Ahora los estados son descriptivos.
3. **que se pueda continuar.** Se para el recorrido a mitad, se comprueba que
   el botón pase a decir CONTINUAR y que al pulsarlo siga desde donde iba.
4. **el segundo acto.** Que narre lo de la capa uno, que vuelen las motas de
   ORIGEN y que la cifra grande aparezca en pantalla.

Las dos últimas se esperan **al hecho, no al reloj**: el oro se dispara cuando
la narración entra al ORIGEN (~12 s), y una espera fija de 11,5 s daba un fallo
que no existía en el producto.

## `probar-movil.js`

Carga el cerebro en un teléfono de verdad —393×851, táctil, con agente de
Android— porque la queja llegó con una foto y **la maquetación no se comprueba
leyendo CSS**. Deja las capturas en el directorio de trabajo.

Comprueba:

1. **que nada se salga de la pantalla.** Mide la caja de cada botón del muelle,
   de la cabecera y de la barra del recorrido, y falla si alguna cruza el borde
   o si aparece scroll lateral. Ese era el estado de la foto: siete botones en
   una fila, cortados por los dos lados.
2. **que la cabecera no se pise.** «J.A.R.V.I.S» a la izquierda y la chapa
   centrada no caben juntas en 393 px.
3. **que tocar un sistema a media narración NO reinicie el recorrido** —el
   fallo de la foto— y que no salte el sí/no ni se abra el panel grande.
4. **que se pueda saltar de capítulo** adelante y atrás, y parar y continuar.
5. **la voz**: que una frase con comas salga en varios trozos, que el tono
   baje hacia el final, que el modo DIRECTA la diga de un tirón, y que
   interrumpir **no** pinte «Fallo de la voz: interrupted».
6. **el segundo acto**, recorrido por capítulos, con captura de cada uno.

## Una regla que se repite

**Esperar al hecho, no al reloj.** Desde que la voz respira, cada frase sale en
varios trozos y todo llega un poco más tarde. Cuatro de estas pruebas dieron
fallos que no existían en el producto por medir a mitad de frase. Si una espera
fija falla, mira primero si estás midiendo antes de tiempo.
