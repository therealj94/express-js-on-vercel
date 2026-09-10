# El equipo · siete agentes que vigilan solos

## Por qué existe

Casi nada de lo que salió mal en este proyecto fue difícil de arreglar. Fue
difícil de **notar**:

| Lo que pasó | Cuánto duró sin que nadie lo viera |
|---|---|
| Un nombre RPC sirviendo bloque 0 | hasta que un script preguntó seis veces |
| Los seis nodos con el gas en 0 | semanas, con el acuerdo escrito y sin aplicar |
| Polygon caído, con el fondeo de tarjeta muerto | horas, en bucle en el log |
| El precio del ORIGEN mal | dos horas, y se salvó por suerte |
| El clon del backend desfasado semanas | hasta que borró funciones de producción |
| El símbolo de la moneda con siete caracteres | lo habría dicho Chainlist semanas después |

Cada agente de este equipo existe por una fila de esa tabla. No es un catálogo
de buenas prácticas: es la lista de lo que ya nos pasó.

## Quiénes son

| Agente | Qué mira | Cada |
|---|---|---|
| **VIGÍA** | las cadenas: altura, chainId por cada nombre, suelo de gas, pares, la 8532 congelada | hora |
| **CENTINELA** | el dinero: precio del ORIGEN, tesoro, comisión, Polygon, caminos de pago | 2 horas |
| **ESCUDERO** | Chainlist: las dos solicitudes, y el CI real corrido contra nuestros archivos | 6 horas |
| **CIRUJANO** | que lo desplegado sea lo escrito, y que ningún endpoint desapareció | día |
| **CRONISTA** | junta todos los partes y redacta el que la voz lee | día |
| **CERRAJERO** | seguridad: secretos, llaves, puertos, dependencias, GuardDuty | semana |
| **CONTADOR** | lo que cuesta, lo que se paga sin usar, el plan de retirada | semana |

## La regla que ninguno rompe

**Miran y avisan. No actúan sobre producción.**

Ninguno mueve fondos, despliega, reinicia un nodo, cambia una variable de
configuración ni rota un secreto. Lo encuentran, lo miden, lo escriben en su
parte, y decide José.

Esto no es prudencia de más. El peor incidente de la sesión del 12-ago fue
exactamente **un despliegue hecho con buena intención desde un árbol
desfasado**. Un agente con permiso de desplegar habría hecho eso mismo, a las
tres de la mañana, sin nadie mirando.

Lo que sí pueden: preparar el arreglo en una rama `equipo/<agente>/<fecha>`
para que se revise. Rama, nunca producción.

Y una regla del Centinela y del Cerrajero que no admite matices: **el valor de
un secreto no se escribe nunca en un parte.** Ni recortado, ni «los primeros
cuatro». Se dice qué está mal, no cuál es. `parte.py` lo comprueba y rechaza el
parte si detecta algo con forma de credencial — llaves de AWS, tokens, llaves
privadas, cadenas de conexión con contraseña, frases semilla.

## Cómo reportan

Cada agente termina llamando a `parte.py`:

```
python3 infra/equipo/parte.py --agente vigia --veredicto bien \
  --resumen "una frase, la que se lee en voz alta" \
  --hallazgo "lo que se midió, CON NÚMEROS" \
  --escala "lo que necesita a José"
```

Eso hace tres cosas: guarda el parte en S3, **rearma el índice completo con los
partes de todos** —así cualquier agente que corra refresca la vista entera— y
lo baja al servidor del cerebro comprobando que llegó.

Los veredictos son tres: `bien`, `aviso`, `falla`. El cerebro muestra **el
peor**: si un solo agente encontró una falla, el equipo entero sale en rojo. Un
tablero que promedia esconde justo lo que hay que ver.

## Dónde se ve

En `cerebro.ordenscan.com`, región **EL EQUIPO**. La ficha muestra cada agente
con su veredicto y cuánto hace que reportó; el parte del día lista aparte **lo
que necesita a José**, sacado de los `escala` de todos.

Y la voz lo lee: primero las fallas, después los avisos, después lo que
requiere una mano. Si un agente lleva más de tres días callado, lo dice — un
vigilante mudo no está vigilando, y eso no se ve en ningún tablero que solo
muestre lo último que dijo.

## Lo que cuesta

Cada revisión es una sesión corta. Con las frecuencias de arriba salen unas
cuarenta al día. Si sale caro, lo primero que se baja es la frecuencia del
Vigía y del Centinela —de una hora a tres— sin perder casi nada: las averías
que persiguen duran horas, no minutos.

## Añadir uno nuevo

1. Un archivo en `.claude/agents/<nombre>.md` con lo que mira, lo que **no**
   hace, y cuándo escala.
2. Su nombre en el diccionario `EQUIPO` de `parte.py`.
3. Una tarea programada con su frecuencia.
4. Una línea en la ficha EL EQUIPO del cerebro.

Y la prueba de si merece existir: **¿qué cosa concreta que ya pasó habría
evitado?** Si no hay respuesta, no hace falta.
