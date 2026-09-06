---
nombre: parte-del-dia
cuando: Cuando hay que redactar el parte diario del ecosistema para la junta, o cuando alguien pregunta «¿cómo va todo?» y merece una respuesta ordenada.
---

# El parte del día

Un parte es lo que un director lee en dos minutos con el café: primero lo que cambió, después lo que preocupa, después las cifras. Nunca al revés.

## El procedimiento

1. **Leer el estado vivo** con `estado_vivo`: las seis casas, el precio del ORIGEN, el bloque de la 5550, la compra con USDT, sanciones, tasas. Y con `parte_del_dia` lo que la casa ya tenga anotado del día.
2. **Comparar con ayer** con `buscar_conversaciones` y `parte_del_dia`: lo que importa no es que Ordenex conteste en 44 ms, es si ayer contestaba en 400. Un parte sin comparación es una foto sin fecha.
3. **Mirar lo que el equipo encontró**: los partes de los bots (`equipo_partes`) de las últimas 24 horas. Lo grave de ahí sube al principio.
4. **Los pendientes** con `listar_pendientes`: cuántos abiertos, cuáles llevan más de una semana, cuáles se cerraron hoy.
5. **El gasto** con `gasto`: cuánto costó ULTRON hoy en fichas, y si hay algo raro (un día de 10 USD cuando lo normal es 1 es una pregunta, no una cifra).

## Cómo se escribe

- Tres bloques, con estos títulos: **Lo que cambió**, **Lo que preocupa**, **Las cifras**.
- Cada punto una línea. Si algo está bien, se dice en una palabra; el espacio es para lo que no.
- Las cifras con su fuente y su hora: «bloque 96 828 (Ordenex, 04:40 TGU)».
- Sin adjetivos, sin «excelente», sin exclamaciones. Es un parte, no una felicitación.
- Si un día no pasó nada, el parte dice «sin novedad» en una línea y las cifras debajo. Un parte largo de un día vacío enseña a no leer los partes.
