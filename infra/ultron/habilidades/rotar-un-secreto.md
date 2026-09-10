---
nombre: rotar-un-secreto
cuando: Cuando hay que cambiar una llave, una contraseña o un token de la casa — porque es vieja, porque es corta, o porque se quemó (se pegó en un chat, salió en un registro).
---

# Rotar un secreto

Rotar mal es peor que no rotar: una app con la llave nueva y otra con la vieja es una casa a medias. El orden importa y el valor no pasa por ULTRON en ningún paso.

## El procedimiento

1. **Saber quién lo usa.** `boveda_listar` dice en qué apps está aplicado; `heroku_variables` de cada app confirma que la variable existe ahí. Si el secreto NO está en la bóveda, primero se guarda (el dueño, desde el panel) con `yaEn` diciendo dónde vive hoy.
2. **Generar el valor nuevo FUERA de la conversación.** Nunca se pide pegado en el chat. El dueño lo genera (32 caracteres al azar como mínimo para un secreto de firma) y lo guarda en la bóveda con el mismo nombre: eso lo rota adentro.
3. **Cambiarlo en el origen si lo hay.** Una clave de Mongo se cambia en Atlas; una de ElevenLabs, en su panel; una de Heroku, creando una autorización nueva. La bóveda guarda la copia; el origen manda.
4. **Aplicar en cada app**, una por una, con `boveda_aplicar` (pide autorización por app). Empezar por la menos crítica. Después de cada una: `estado_vivo` y `heroku_registro` para confirmar que levantó con la llave nueva.
5. **Revocar la vieja** en el origen SOLO cuando todas las apps estén con la nueva y comprobadas.
6. **Dejar escrito** con `recordar` (alcance junta): qué se rotó, cuándo, por qué, y quién. Sin el valor.

## Casos especiales

- **PASS_ADM de Veta Wallet** cifra las llaves de los usuarios: NO se rota con este procedimiento. Hace falta recifrar las llaves con la nueva antes de cambiarla; se hace con el dueño delante y un respaldo de la base.
- **Llaves privadas de billeteras** (HOT_KEY, GAS_KEY, VENTA_KEY, TREASURY_*): no se rotan, se sustituyen moviendo los fondos a una billetera nueva. No entran en la bóveda de ULTRON.
- **ULTRON_BOVEDA_LLAVE**: rotarla deja ilegible todo lo guardado. Antes hay que volver a guardar cada secreto con la llave nueva.
