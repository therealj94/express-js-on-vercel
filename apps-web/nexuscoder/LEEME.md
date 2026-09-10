# Nexus Coder · el sitio del estudio

```
# ver en local
python3 -m http.server 8080 --directory apps-web/nexuscoder
```

Un HTML y un JS. Sin marco, sin compilar, sin dependencias — que es justo lo
que la página dice que hacemos, y un estudio que predica una cosa y publica
otra se nota.

## El dominio

Comprobados contra RDAP, que es el registro de verdad, el 18 de agosto de 2026:

| Dominio | Estado |
|---|---|
| **nexuscoder.dev** | libre ← recomendado |
| **nexuscoder.io** | libre |
| nexuscoder.ai · .app · .studio · .tech · .co · .eu · .de | libres |
| nexuscoder.com | **acaparador** — redirige a un perfil de Dynadot llamado «i-buy-too-many-domains» |
| nexus-coder.com | ocupado (desde 2025-10-02) |
| nexuscoder.net | ocupado (desde 2025-03-24) |

**Por qué `.dev` y no el `.com`.** El `.com` no lo tiene un negocio: lo tiene un
revendedor, y a un revendedor se le paga cuatro cifras por una letra que no
mejora nada. `.dev` es de Google, va con HTTPS obligatorio de fábrica (está en
la lista de precarga de HSTS, así que no existe la versión insegura del sitio),
cuesta como quince dólares al año, y para un estudio de ingeniería dice
exactamente lo que hacemos.

Conviene tomar también `.io` y `.co` como defensa: son baratos y evitan que
alguien monte algo parecido al lado.

## Lo que falta completar

Está marcado en la página con `[COMPLETAR: …]` y en violeta, a la vista, para
que nadie publique sin darse cuenta:

- El correo de contacto
- La razón social y el registro para el pie
- Si se quiere: equipo, año de fundación y otros clientes

**No se inventó ninguno.** Un estudio que se presenta con «+50 clientes
satisfechos» sin poder nombrar uno es un estudio al que no le van a creer el
resto de la página.

## Las decisiones de diseño

**El neón es del logotipo, no de la moda.** El cian y el violeta salen de la N
de circuito que ya existía. No se eligieron porque «lo oscuro con un acento
neón se ve moderno»; se eligieron porque son los colores de la marca, y una web
que no se parece a su propio logotipo es una web que alguien va a tener que
rehacer.

**El titular va en monoespaciada.** Un estudio de ingeniería que se presenta con
la misma tipografía de agencia que todos los demás está diciendo, sin querer,
que es una agencia más.

**El riel.** Una traza de circuito baja por el borde izquierdo con un nodo en
cada sección. Sale de la misma N y ata la página a su marca en vez de decorarla.

**La prueba son direcciones, no capturas.** Las tres fichas «en producción»
llevan a sitios que se pueden abrir ahora mismo. Cualquiera puede poner
capturas de pantalla.

**El manifiesto es el argumento de venta.** Las cinco reglas no son un ideario:
son conclusiones de incidentes concretos —incluido el del 12 de agosto— y están
escritas dentro del código que entregamos. Eso no lo puede copiar una agencia
que no ha roto nada todavía.
