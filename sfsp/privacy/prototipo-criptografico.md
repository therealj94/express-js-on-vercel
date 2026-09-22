# Prototipo criptográfico: dominio confidencial con divulgación selectiva

**Estado: NO IMPLEMENTADO.** Descripción de diseño para evaluar D06. No hay construcción elegida, no hay código, no hay auditoría y no hay despliegue.

---

## 1. Qué es

Un dominio de transferencias **confidenciales** dentro de la cadena. Los importes y, según la construcción, las partes, quedan ocultos en el estado público. La corrección se demuestra con pruebas verificables, no con la visibilidad de los datos. Quien deba ver algo lo ve mediante **divulgación selectiva**: una clave de visualización o una prueba dirigida.

```
Estado público:  compromisos + anuladores + pruebas
Lo que se ve:    que las reglas se cumplen
Lo que no:       cuánto y, según construcción, entre quiénes
```

## 2. Piezas que hay que definir antes de escribir una línea

1. **Construcción criptográfica**, seleccionada entre las **auditadas y publicadas**. No se inventa criptografía.
2. **Compromisos**: qué oculta cada compromiso, con qué aleatorización y con qué propiedades de enlace.
3. **Prevención de doble gasto**: anuladores o equivalente, con su conjunto de anonimato explícito.
4. **Sistema de pruebas**: qué se demuestra exactamente, qué tamaño tiene la prueba, cuánto cuesta verificarla y si requiere una configuración de confianza.
5. **Claves de visualización y de acceso**: quién puede ver qué, cómo se otorga y cómo se retira.
6. **Pérdida de claves**: qué ocurre con los fondos si el usuario pierde la clave de gasto o la de visualización. En un dominio confidencial, perder la clave de visualización puede significar perder la capacidad de **demostrar** lo que se posee.
7. **Revocación y divulgación autorizada**: cómo se responde a un requerimiento legítimo sin entregar una llave maestra universal.
8. **Disponibilidad de datos**: quién guarda las notas o los secretos necesarios para gastar, y qué pasa si se pierden. Una prueba no sirve si el dato que la sostiene desapareció.
9. **Rendimiento**: coste de gas por operación, tiempo de generación de la prueba en el dispositivo del usuario y capacidad de la red.

## 3. Garantías reales posibles

Con una construcción adecuada y correctamente implementada:

- **Confidencialidad de importes** frente al observador de la cadena.
- Según la construcción, **ocultación de la relación** entre origen y destino, limitada por el tamaño del conjunto de anonimato.
- **Verificabilidad sin revelación**: cualquiera comprueba que no se creó valor de la nada, sin ver las cantidades.
- **Divulgación selectiva** hacia un auditor o una autoridad, sin abrir el dominio entero.
- **Sin custodio.** El usuario conserva el control, a diferencia del prototipo custodial.

## 4. Límites, sin adornos

- **No oculta metadatos de red ni tiempos.** Cuándo se envía una transacción, desde qué dirección IP y con qué patrón sigue siendo observable. Ver `amenazas.md`, 2.4 y 2.8.
- **El conjunto de anonimato es finito y a menudo pequeño al principio.** Con pocos usuarios, la confidencialidad estadística es débil aunque la criptografía sea correcta.
- **Las entradas y las salidas del dominio son visibles.** Como en el caso custodial, quien entra y sale queda enlazado por importe y momento.
- **El gas y el tamaño de la prueba revelan** qué operación se hizo (ver `amenazas.md`, 2.6).
- **No protege frente a la plataforma** si el usuario usa una interfaz que ve sus datos en claro antes de construir la prueba.
- **La pérdida de claves puede ser irrecuperable** y afecta también a la capacidad de demostrar la propiedad, no sólo de gastar.
- **No se aplica a los activos legacy existentes.** Sus balances actuales ya son públicos y seguirán siéndolo. Llevarlos al dominio confidencial sería una migración, con todo lo que eso implica (ADR-008).
- **Complejidad de auditoría.** Un error en el circuito o en la verificación puede permitir crear valor sin que se note. Es el modo de fallo más grave del diseño.

## 5. Lo que este diseño nunca puede anunciarse como

- "Anonimato total". El conjunto de anonimato tiene un tamaño y hay que publicarlo.
- "Privacidad de todo el sistema". Alcanza al dominio confidencial y a nada más.
- "Ya implementado" mientras no exista, esté auditado y haya pasado la prueba de fuga.
- Nunca se presenta una **interfaz de cifrado de documentos** como prueba de saldos confidenciales. Son cosas distintas.

## 6. Requisitos previos si D06 lo eligiera

1. Selección de una construcción auditada y publicada, con su referencia.
2. **Auditoría especializada del circuito y del verificador, antes de cualquier fondo real.** No negociable.
3. Diseño de recuperación de claves y de disponibilidad de datos, probado.
4. Presupuesto de rendimiento medido en el dispositivo real del usuario.
5. Protocolo de acceso para auditoría y autoridad, sin llave maestra universal.
6. Prueba de fuga: comprobar empíricamente qué se puede inferir del dominio en funcionamiento.
7. Publicación de límites, incluido el tamaño del conjunto de anonimato.

## 7. Prohibiciones durante cualquier prototipo

- No inventar criptografía ni modificar una construcción auditada sin auditar el cambio.
- No poner fondos reales antes de la auditoría.
- No anunciar la capacidad antes de que la prueba confirme exactamente la garantía prometida.
- No prometer recuperación de claves que el diseño no tenga.

## 8. Bloqueo

**D06** decide si este diseño se desarrolla. Sin D06 no hay selección tecnológica, ni presupuesto de auditoría, ni alcance. Mientras tanto: descripción, nada más.
