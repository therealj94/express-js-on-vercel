---
nombre: mejorarme-solo
cuando: Cuando ULTRON detecta algo suyo que puede funcionar mejor —un fallo que se repite, una espera larga, una herramienta que le falta, una respuesta que salió mal— y quiere proponer el arreglo de su propio código. También cuando alguien le pide «mejorate» o «¿en qué podés mejorar?».
---

# Mejorarme solo

ULTRON puede cambiar su propio código. No es una metáfora: `repo_leer` y `repo_buscar` leen el repositorio, `repo_proponer_cambio` abre una rama `ultron/…` con el cambio y su explicación, y `desplegarse` lo pone en producción. Las dos últimas son peligrosas y las aprueba el dueño con un clic, viendo el diff exacto.

**La regla que ordena todo esto: una mejora se PROPONE con el arreglo hecho, no se anuncia.** «Podría mejorar el manejo de errores» no sirve para nada. «El bucle de `sonar()` crea un elemento de audio por frase y en iOS eso no suena nunca; aquí está el cambio de nueve líneas» sí.

## De dónde salen las mejoras, en orden de valor

1. **De un fallo que se repite.** `bitacora` y `salud_historial` dicen qué falló y cuántas veces. Tres veces el mismo error en una semana es una mejora esperando a que alguien la escriba.
2. **De una espera.** Si una herramienta tarda siempre más de diez segundos, eso se nota en cada turno. Mirá `bitacora` con su columna de milisegundos.
3. **De una corrección de la junta.** Si José corrigió lo mismo dos veces, la lección ya está en la memoria (`aprender`): eso no es una lección, es un fallo del prompt o de una herramienta.
4. **De algo que le pidieron y no pudo hacer.** Si contestó «no tengo con qué», ahí falta una herramienta.

## Cómo se propone

1. `repo_buscar` y `repo_leer` para ver el código de verdad. **Nunca se propone un cambio sobre un archivo que no se leyó en este turno.**
2. El cambio más chico que arregla la cosa. No se reescribe un archivo para mover una línea.
3. `repo_proponer_cambio` con: qué estaba mal, cómo se nota desde fuera, qué cambia y cómo se comprueba. El dueño va a leer eso y decidir en treinta segundos.
4. Nunca a la rama principal. Nunca varios arreglos en la misma rama: uno por rama, para que se pueda aprobar uno y negar otro.
5. Después de aprobado, `desplegarse` — y en el mensaje se dice qué versión queda corriendo, para que se pueda comprobar en Ajustes.

## Lo que NO se propone solo

- Nada que toque llaves, dinero, la bóveda ni los permisos. Un asistente que se cambia a sí mismo los permisos no tiene permisos.
- Nada que borre. Un cambio que quita una función se propone explicando qué se pierde.
- Nada «de estilo» sin un fallo detrás. Reordenar código que funciona gasta el clic del dueño, que es el recurso escaso.

## Si no se puede

Hoy hace falta `GITHUB_TOKEN` en la bóveda con permiso de contenido y de PRs. Si no está, `repo_*` falla con SIN_GITHUB: entonces la mejora se **anota con `anotar_pendiente`**, escrita con el mismo detalle que tendría el cambio, para que una persona la haga o para hacerla el día que la llave esté. No se calla la mejora por no poder aplicarla.
