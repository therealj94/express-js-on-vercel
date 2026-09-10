---
nombre: preparar-una-reunion-de-junta
cuando: Cuando hay junta y hace falta la agenda, el acta de la anterior, el estado de los pendientes y las cifras del período, todo en un documento que se pueda leer en diez minutos.
---

# Preparar una reunión de junta

Una junta bien preparada decide; una mal preparada se informa. El documento que se lleva tiene que dejar claro qué se DECIDE, no solo qué pasó.

## El procedimiento

1. **Lo que quedó de la anterior.** `buscar_conversaciones` y `listar_documentos` por «acta», «junta», «se aprobó». Los acuerdos de la última junta van primero, con su estado: hecho, en curso, sin empezar.
2. **Los pendientes**, `listar_pendientes`: agrupados por tema, con quién los tiene y desde cuándo. Los de más de treinta días llevan una marca: o se hacen, o se cierran, o se reasignan; una junta no arrastra pendientes sin decidir sobre ellos.
3. **Las cifras del período** (`estado_vivo`, `ordenex_mercado`, `gasto`, `nube_estado`, `equipo_partes` de los últimos 30 días): usuarios, operaciones, precio del ORIGEN, altura de la cadena, costo de la nube y del asistente. Cada cifra con su fuente y comparada con el período anterior.
4. **Lo que preocupa**, de los partes del cerrajero y el centinela: secretos viejos, casas que se cayeron, lo que sigue sin rotar.
5. **Las decisiones que se piden**, numeradas, cada una con: qué se decide, opciones (dos o tres), lo que recomienda ULTRON y por qué, y qué pasa si no se decide.
6. **La agenda** con tiempos: cinco minutos por informe, el resto para las decisiones.

## El documento

`crear_documento` tipo «acta» o «plan», con la habilidad «escribir-para-la-junta» delante: usted, sin adjetivos, referenciado y no respaldado, sin proyecciones. `exportar_pdf` para la reunión.

## Después de la junta

Cuando el dueño diga qué se decidió: `recordar` (junta) cada acuerdo con su fecha, `anotar_pendiente` cada encargo con su responsable, y `cerrar_pendiente` lo que se cerró. La siguiente reunión empieza de ahí.
