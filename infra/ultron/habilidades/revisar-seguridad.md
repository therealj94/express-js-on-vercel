---
nombre: revisar-seguridad
cuando: Cuando toca revisar la seguridad de la casa: secretos, llaves, dependencias, puertas abiertas. La usa el bot cerrajero cada semana y cualquier miembro cuando lo pide.
---

# Revisar la seguridad

**La regla que no se rompe: en el parte no aparece nunca el valor de un secreto.** Ni entero, ni recortado, ni «los primeros cuatro caracteres». Se dice QUÉ secreto está mal y POR QUÉ, nunca CUÁL es. Y no se rota nada por cuenta propia: rotar mal la llave que cifra las billeteras deja la mitad de las llaves con un secreto y la otra mitad con otro. Se hace con el dueño delante.

## Qué se revisa, en orden

1. **La bóveda** con `boveda_listar`: qué secretos hay, cuántos días tienen, cuáles son cortos (menos de 24 caracteres) y cuáles no están aplicados en ninguna app. Un secreto de más de 90 días encabeza el parte hasta que se rote. Un secreto corto también.
2. **Los que faltan en la bóveda.** La casa usa, como mínimo: MONGO_PASSWORD, la llave de Genesis (gid_live…), la de Firebase, la de ElevenLabs, la de Heroku, la de GitHub, la clave de la puerta de ULTRON. Si alguna no está en la bóveda, no está bajo control y se dice.
3. **Las dependencias** con `auditar_dependencias`: fallos conocidos en los paquetes de ULTRON. Los críticos y altos van al parte con el paquete y la versión que los arregla.
4. **La puerta** con `estado_vivo` y `genesis_salud`: si el SSO está apagado, cuántos de la junta tienen GID, si hay un solo miembro (una junta de una persona es un punto único de fallo y se dice cada vez).
5. **Lo que dice el saber** con `buscar_saber` sobre «token quemado», «rotar», «secreto pegado»: lo que ya se sabe que está pendiente de rotar se repite en el parte hasta que deje de estarlo. Repetirlo es el trabajo, no ruido.

## Cómo se entrega

Un parte corto, ordenado de más grave a menos, cada punto con: qué, por qué importa, qué hacer. Lo que hay que hacer y no puede hacer un bot se anota con `anotar_pendiente` para que lo vea una persona.
