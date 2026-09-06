---
nombre: diagnosticar-una-casa-caida
cuando: Cuando una casa (Ordenex, AuCorp, Veta Wallet, Genesis, OrdenScan, ordenglobal.org) no contesta, contesta con error, o va lenta. Antes de reiniciar nada.
---

# Diagnosticar una casa caída

Reiniciar sin saber por qué es lo primero que se le ocurre a todo el mundo y lo que borra la evidencia. El orden es: mirar, entender, y solo entonces tocar.

## El procedimiento

1. **Confirmar que está caída y desde cuándo.** `estado_vivo`: qué dice la lectura (HTTP, tiempo, error) y el vigía (`desde`). Una casa que falló una vez no está caída; dos lecturas seguidas sí.
2. **¿Es la casa o es el camino?** Si TODAS están caídas a la vez, no son las casas: es la red de ULTRON o Heroku entero. `heroku_apps` lo dice: si los dynos están `up` y la lectura falla, mirar la red; si están `crashed`, es la app.
3. **El registro antes que nada.** `heroku_registro` con la app, 200 líneas. Lo que se busca: `Error`, `Cannot`, `ECONNREFUSED`, `MongoServerError`, `R14` (memoria), `H12` (timeout), `H10` (app caída). La última línea antes del silencio suele ser la causa.
4. **Si el registro habla de Mongo**: la base no contesta o la clave cambió. `heroku_variables` para ver si MONGODB_URI está y su largo; `mongo_consultar` con esa app y una colección pequeña para probar la conexión desde aquí.
5. **Si el registro habla de memoria (R14) o de tiempo (H12)**: la app está viva pero ahogada. Reiniciar la alivia un rato; la causa es de código y hay que anotarla como pendiente con el trozo del registro.
6. **Si es una casa de la cadena (OrdenScan, RPC)**: `nodos` para ver si los nodos están `running`, y `cadena_altura` para ver si avanza. Un explorador atrasado no está caído: está indexando.
7. **Reiniciar, con motivo.** `heroku_reiniciar` pide autorización: en el motivo va lo que dijo el registro. Después de un minuto, `estado_vivo` otra vez para confirmar.
8. **Dejar rastro.** `anotar_pendiente` con la causa y lo que falta, y `recordar` si se aprendió algo del comportamiento de esa casa.

## Lo que no se hace

- No se reinicia dos veces seguidas: si el primer reinicio no levantó la casa, el problema no es de proceso y hay que leer el registro otra vez.
- No se toca una variable de entorno en caliente por probar: eso reinicia la app y borra la pista.
- No se dice «ya está» sin la lectura que lo confirme.
