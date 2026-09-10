# El backend de Veta Wallet · copia versionada

Esto es el código que corre en Heroku (`vetawallet`), copiado aquí entero.

## Por qué existe esta carpeta

El 12-ago-2026 el clon local del backend estaba **semanas atrasado** respecto a
lo que había desplegado, y al empujar desde él se fueron de producción la
idempotencia, el puente Genesis ID y el login social. Duró cinco minutos, pero
sólo se pudo recuperar porque Heroku deja **descargar el paquete** de una
versión anterior. Esa es una red de seguridad que depende de Heroku y de que
la versión buena siga listada.

El repositorio git de Heroku **no es un respaldo**: se había quedado atrás
precisamente porque los despliegues se hacían con paquetes y no con `git push`.

Aquí queda una copia que no depende de nadie.

## Reglas

1. **Desplegar siempre con `git push heroku`**, nunca con un paquete. Así el
   repositorio de Heroku y el código real no se separan.
2. Antes de empujar, comprobar que lo local es lo que está corriendo:
   `git fetch` contra el remoto de Heroku y comparar.
3. Esta copia se refresca cuando cambie el backend. No es la fuente de verdad
   —esa es el remoto de Heroku— pero sí el respaldo.

## Lo que NO está aquí, a propósito

- `.env` y `config.json`, que llevan secretos.
- `node_modules`.

Las variables de configuración viven en Heroku. Las de cifrado y sesión están
descritas en `../veta-wallet-gas-y-precio/ROTAR-SECRETOS.md`, sin valores.
