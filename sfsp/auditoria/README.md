# Auditoría independiente del árbol SFSP

Aquí vive el paquete para que alguien de fuera revise este trabajo y pueda
decir que está mal. Está preparado para Codex, pero sirve igual para otro
modelo o para una persona: lo que cambia es quién lee, no qué se le pide.

```
auditoria/
  PROMPT-AUDITORIA.md          lo que recibe el auditor
  AFIRMACIONES-A-DESAFIAR.md   lo que el árbol afirma, fila por fila, con cómo romperlo
  correr-auditoria.sh          lanza la auditoría y guarda el informe fechado
  informes/                    los informes, uno por corrida, con fecha y commit
```

## Correrla

```bash
cd sfsp/auditoria
./correr-auditoria.sh              # auditoría completa del árbol
./correr-auditoria.sh --revision   # revisión de código de Codex sobre el diff
```

El informe queda en `informes/auditoria-<fecha>-<commit>.md`. El nombre lleva el
commit a propósito: una auditoría sin la versión que auditó no se puede
contrastar después.

## La credencial

El script **no recibe ninguna clave por argumento y no la imprime**. Codex toma
la suya de una de estas dos vías, y ninguna pasa por el chat ni por este
repositorio:

1. `OPENAI_API_KEY` definida en las variables de entorno del entorno de trabajo.
2. Una sesión hecha con `codex login` desde una terminal con navegador.

Si falta, el script para y lo explica. No hay una tercera vía, y no debería
haberla: una clave pegada en una conversación es una clave quemada.

## Por qué el paquete existe, y no sólo el prompt

Una auditoría que empieza con «revisá esto» produce una opinión. Una que empieza
con una lista de afirmaciones falsables produce hallazgos, y se puede repetir
dentro de un mes para comparar. Por eso el trabajo está en
`AFIRMACIONES-A-DESAFIAR.md`: cada fila dice qué se afirma, dónde comprobarlo y
qué contraejemplo la tumbaría.

También protege de la trampa contraria. Un auditor sin contexto marca como
defecto que falte el motor de reservas, que los parámetros estén en `null` o que
no haya privacidad. Nada de eso es un defecto: es una fase posterior, una regla
deliberada y una ausencia declarada. Pero **sí** es un defecto que alguna de esas
ausencias esté mal declarada, y eso el prompt lo pide expresamente.

## Qué hacer con el informe

1. Leerlo entero antes de tocar nada.
2. Separar defecto comprobado de sospecha. Un hallazgo sin caso concreto es una
   hipótesis, y se trata como tal.
3. Por cada hallazgo aceptado: corregir el código **o** retirar la afirmación.
   Las dos cosas cierran el hallazgo; dejar la frase y no arreglar el código, no.
4. Anotar el resultado en `sfsp/evidence/registro.md` con su estado de evidencia
   y el commit auditado.
5. Volver a correr `node sfsp/scripts/verificar-todo.mjs` después de cada
   corrección.

Un hallazgo que se responde discutiendo en vez de con un diff o con una frase
retirada sigue abierto.
