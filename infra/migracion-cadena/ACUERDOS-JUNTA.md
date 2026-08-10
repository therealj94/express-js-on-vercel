# Lo que la Junta tiene que autorizar · migración de la cadena

Redactado el 10-ago-2026, para acompañar al Documento 6. Los números de aquí
salen de mediciones sobre la cadena real, no de estimaciones: ver
`HALLAZGOS-2026-08-10.md`.

## Lo que NO necesita autorización

Las etapas 1 a 3 —inventario, construcción del génesis, y ensayo con una cadena
de prueba— **no tocan producción, no mueven fondos y no interrumpen el
servicio**. Se pueden ejecutar mientras la Junta delibera, y de hecho conviene:
son las que producen la información con la que se decide.

Coste: unas máquinas temporales, del orden de decenas de dólares al mes.

## Lo que SÍ necesita autorización

### Acuerdo 1 · El corte

Congelar la escritura de la billetera, tomar la foto final del estado, arrancar
la cadena nueva con ese estado y mover el DNS.

Por qué necesita acuerdo: **interrumpe el servicio** durante la ventana del
corte, y a partir de ese momento **el registro oficial de saldos pasa a ser la
cadena nueva**. Eso es una decisión de la sociedad, no de la ingeniería.

La cadena vieja **no se apaga ni se borra**: queda encendida como respaldo, y
volver atrás es reapuntar el DNS. Esa vuelta atrás devuelve el estado al
momento del congelamiento, o sea que se pierde lo ocurrido después del corte.

### Acuerdo 2 · El cambio de identificador de red

La cadena nueva es **5533**, no 8532. La de pruebas es **5534**.

Por qué necesita acuerdo: **toda persona que use la billetera tiene que
actualizar**. Quien agregó la red a mano en su MetaMask la vuelve a agregar;
quien no actualice la aplicación queda hablándole a la cadena vieja. Es un
cambio visible para el usuario y requiere una comunicación preparada.

Por qué se hace igual: conservar el 8532 obligaría a **apagar la cadena vieja**
en el corte, porque con el mismo identificador una transacción firmada para una
red vale en la otra, en los dos sentidos y mientras las dos existan. Apagarla
convierte el respaldo de minutos en uno de horas — y un remedio que duele horas,
en la práctica, no se usa.

### Acuerdo 3 · El alcance de lo que viaja

Decisión tomada por la dirección: **viaja todo**.

Lo que eso significa, medido: la cadena tiene **332 cuentas, 173 de ellas
contratos** y 1.385 ranuras de almacenamiento. De esos contratos:

- **130 están completos** y listos para viajar hoy.
- **11 de los 14 tokens oficiales**, completos. A los otros tres les faltan
  doce ranuras en total.
- **Las 159 billeteras de personas, completas al 100 %.** Ningún saldo de
  ninguna persona queda fuera.
- Los **43 restantes** son los pares y pools del intercambio, más despliegues
  repetidos de pruebas — `HARV` aparece quince veces en direcciones distintas,
  `COFFEE` cinco, `TKNA` cuatro.

Migrar los 130 completos es cuestión de días. Migrar los 43 restantes exige
reconstruir la disposición interna de cada contrato del intercambio, y eso no
se puede fechar con honestidad hasta tener a la vista el código fuente de esos
contratos.

**Lo que la Junta debe saber al aprobar «todo»:** el corte no puede fecharse
mientras esos 43 no estén cerrados. Si en algún momento se prefiere salir antes,
la alternativa es cortar con los 130 —que incluyen todo el valor de las
personas y de los tokens oficiales— y retirar formalmente el resto.

### Acuerdo 4 · Los 10 ORIGEN retenidos por el contrato de staking

El contrato de staking de la tecnología vieja retiene 10 ORIGEN en garantía.
Ese contrato **no viaja**: en la cadena nueva los validadores se gestionan por
voto y no hace falta depositar nada.

Esos 10 ORIGEN se devuelven a la dirección validadora en el génesis. Es un
movimiento de fondos, aunque sea pequeño, y por eso va en el acta.

### Acuerdo 5 · El registro público de la red

Inscribir 5533 y 5534 en el registro público de cadenas, que es lo que alimenta
a Chainlist y a las billeteras.

Por qué necesita acuerdo: es un **compromiso hacia afuera**. Declara
públicamente la red, su explorador y su moneda. Y no hay forma de reservar un
número: se toma cuando se fusiona la solicitud, así que se hace en cuanto cada
red esté viva.

### Acuerdo 6 · La red de pruebas permanente

Tres máquinas más, un grifo de monedas sin valor y el dominio
`testnet.ordenscan.com`.

Por qué conviene: es la red barata donde equivocarse. Si el génesis o el
volcado tienen un fallo, aparece ahí y no en producción.

Su moneda es `tORIGEN` **sin valor**, y su estado **nace vacío**: no lleva los
saldos reales. Copiarlos sería repartir algo que parece dinero.

## El riesgo mayor que sigue abierto, y no es de la migración

La cadena tiene **un solo validador**, confirmado en la instantánea IBFT: la
llave está en la máquina `node1`. Mientras eso siga así, esa máquina *es* la
cadena — si se pierde su disco, no se produce un bloque más.

Hoy hay respaldo cifrado de esa llave, así que el escenario catastrófico está
cubierto. Pero la solución de fondo es tener varios validadores, y eso es
justamente lo que la tecnología nueva permite sin depositar fondos. Es la
etapa 5, posterior al corte.
