---
nombre: desplegar-con-seguridad
cuando: Cuando hay que llevar un cambio a producción — de ULTRON o de otra casa en Heroku — y hay que hacerlo sin dejar la casa peor que antes.
---

# Desplegar con seguridad

Un despliegue es reversible solo si se sabe qué había antes y se comprueba qué hay después. Lo demás es cruzar los dedos.

## El procedimiento

1. **Saber qué se despliega.** La rama y el commit exactos (`repo_arbol`, `repo_leer` del cambio). Si es un PR de ULTRON, tiene que estar mezclado por una persona; ULTRON no se despliega a sí mismo cosas que nadie leyó.
2. **Saber qué hay ahora.** `heroku_apps`: la versión actual (v-número) y cuándo se desplegó. Ese número es el punto de vuelta.
3. **Las pruebas antes.** Desde una máquina con navegador: `npm run probar` en verde. `desplegarse` desde el propio dyno NO corre las pruebas del navegador y lo dice: es para una rama que ya pasó por ellas.
4. **Desplegar** (`desplegarse` para ULTRON; para otras casas, el `bin/desplegar.mjs` de cada una desde el taller). Pide autorización y el dueño ve la rama.
5. **Comprobar en un minuto**: `estado_vivo` (que conteste), `heroku_registro` (que no haya errores al arrancar), y la función concreta que cambió (una llamada real a la ruta o al panel).
6. **Si algo salió mal**: en Heroku, el rollback es volver a la versión anterior (`heroku releases:rollback vN` desde el taller con `terminal`, o desde el panel de Heroku). Primero se vuelve, después se investiga.
7. **Dejar rastro**: `recordar` con qué se desplegó, cuándo y a qué versión se puede volver.

## Lo que no se hace

- No se despliega un viernes por la tarde ni de madrugada sin alguien despierto para mirar.
- No se despliega con una prueba en rojo «porque es de otra cosa».
- No se cambia una variable de entorno y se despliega en el mismo paso: si falla, no se sabe cuál de los dos fue.
