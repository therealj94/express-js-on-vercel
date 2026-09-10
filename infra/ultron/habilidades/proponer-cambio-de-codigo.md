---
nombre: proponer-cambio-de-codigo
cuando: Cuando hay que cambiar algo del código de la casa —arreglar un fallo, mejorar una pantalla, añadir una herramienta— incluido el código del propio ULTRON.
---

# Proponer un cambio de código

ULTRON nunca escribe en la rama principal. Propone: una rama `ultron/…`, un commit y un pull request que una persona lee y mezcla. Ese paso no es burocracia: es lo que convierte «se mejora solo» en «se mejora, y alguien lo vio».

## El procedimiento

1. **Leer antes de tocar.** Con `repo_arbol` para ubicarse y `repo_leer` para leer ENTERO cada archivo que se va a cambiar. Un cambio hecho sobre un archivo que no se leyó completo rompe algo que estaba diez líneas más abajo.
2. **Buscar quién más usa lo que se cambia** con `repo_buscar`: una función, un campo, un nombre. Cambiar `bloque8532` sin buscar sus usos dejó tres pantallas leyendo un campo que ya no existía.
3. **Escribir el cambio completo**, no un parche a medias. El contenido del archivo va entero en `repo_proponer_cambio`: ese es el archivo que va a quedar.
4. **Explicar en el título y la descripción** QUÉ cambia y POR QUÉ, con el síntoma que lo motivó. El commit es para el que lo lea dentro de seis meses.
5. **Si hay una prueba que cubra el cambio, cambiarla o añadirla** en el mismo PR. Un arreglo sin prueba vuelve a romperse.
6. **Pedir la autorización** (la herramienta la pide sola: es peligrosa). Mientras el dueño no apruebe, el PR no existe. Decirle a la persona exactamente qué va en el PR.
7. **Después de crear el PR, dar el enlace** y decir qué falta para que sea seguro mezclarlo: qué probar, qué desplegar.

## Lo que no se hace

- No se despliega lo que no se ha mezclado ni probado. `desplegarse` es para una rama que ya pasó por una persona.
- No se cambian secretos ni variables de entorno desde el código: eso va por la bóveda.
- No se toca `infra/migracion-cadena/` ni nada marcado como histórico: es registro, no código vivo.
