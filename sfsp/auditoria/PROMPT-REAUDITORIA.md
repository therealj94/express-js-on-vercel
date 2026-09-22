# Prompt de re-auditoría

Para la segunda vuelta, **después** de aplicar las correcciones de la primera.

Dos reglas de proceso antes del texto:

1. **La hace otro auditor, no el mismo.** Un auditor que ya revisó este árbol
   tiene puntos ciegos correlacionados con los de la primera vuelta: vuelve a
   mirar donde ya miró y da por buenas las zonas que dio por buenas. Ese fue el
   punto C10 de la auditoría interna.
2. **A Codex se le pide otra cosa**: exactamente lo que la primera vez no pudo
   hacer, y que está nombrado en la sección 7 de su propio informe. Las 74
   pruebas de contratos, el verificador oficial completo y la compilación
   estricta de TypeScript. Eso no es una auditoría nueva: es cerrar la suya.

---

Sos un auditor independiente. Este árbol ya pasó una auditoría, y las
correcciones están aplicadas. **Tu trabajo no es comprobar que se corrigieron
bien.** Eso lo dicen las pruebas. Tu trabajo es encontrar lo que la primera
auditoría no vio.

Un hallazgo nuevo vale más que confirmar veinticinco viejos.

## Lo que ya se sabe, para que no lo repitas

Leé, en este orden:

1. `sfsp/auditoria/informes/` · el informe de la primera vuelta, con sus 25
   hallazgos.
2. `sfsp/auditoria/PLAN-DE-CORRECCION.md` · los 46 puntos de trabajo, incluidos
   los 11 que el primer auditor dejó sin numerar y los 10 que encontró una
   auditoría interna del propio trabajo.
3. `sfsp/auditoria/AFIRMACIONES-A-DESAFIAR.md` · las 48 afirmaciones con el
   veredicto de la primera vuelta y la prueba que hoy fija cada una.
4. `sfsp/INVARIANTES.md` · los invariantes comprobables, con cuáles tienen
   prueba y cuáles no.
5. `sfsp/CONTRATO-INTERNO.md` · la fuente única de tipos.

Un hallazgo que sólo repita uno de los 25 anteriores no aporta. Uno que
demuestre que una corrección **no** cerró lo que dice cerrar, sí, y mucho.

## Por dónde entrar, que es donde nadie ha mirado

La primera auditoría se movió por el código que había. Estas zonas cambiaron
mucho o nunca se revisaron:

- **Las correcciones mismas.** Cada una introdujo código nuevo. Las copias
  defensivas, la validación de invariantes al restaurar, la aritmética exacta y
  el patrón de autorización son piezas nuevas que nadie de fuera ha atacado.
- **Lo que declara `INVARIANTES.md` como SIN PRUEBA.** Son huecos admitidos.
  Comprobá si alguno es peor de lo que parece.
- **Las costuras entre piezas.** El primer informe encontró que contratos e
  indexador no hablaban el mismo idioma. Buscá otras: SDK contra API de
  admisión, especificación contra código, esquema de eventos contra los ABI
  reales.
- **El proceso de verificación.** Ahora el verificador se niega a emitir
  evidencia con el árbol sucio y distingue verificación completa de parcial.
  Intentá conseguir un `VERIFICACION_COMPLETA` que no debería darse.
- **La concurrencia.** El modelo está escrito en `scripts/concurrencia.md` y las
  pruebas que lo demostrarían **no existen**. Leé el modelo y decí si cierra las
  carreras que dice cerrar.
- **Lo que se declaró fuera de alcance.** Comprobá que lo esté de verdad y que
  esté bien declarado.

## Cómo reproducir

```bash
cd sfsp
node contracts/compilador/preparar.mjs   # una vez, si falta el compilador
node scripts/verificar-todo.mjs
```

Ese comando corre las cinco suites, comprueba tipos, integridad del archivo de
decisiones y procedencia. Si no dice `VERIFICACION_COMPLETA`, imprime por qué, y
esos motivos son parte de lo que tenés que evaluar.

Si no podés correr algo, decilo en «qué quedó sin cubrir» en vez de darlo por
bueno. La primera auditoría hizo eso y fue lo mejor de su informe.

## Reglas del informe

Las mismas de la primera vuelta: archivo y línea, qué afirma el código, por qué
es falso o peligroso, un caso concreto, y la gravedad. Separá defecto comprobado
de sospecha. No modifiques ningún archivo.

Añadí dos secciones que la primera no tenía:

- **Correcciones que no cierran lo que dicen cerrar.** Por cada una, cuál y por
  qué.
- **Zonas que miraste y encontraste sanas.** Con qué buscaste. Sirve para saber
  qué quedó cubierto de verdad, y para que la tercera vuelta no repita.
