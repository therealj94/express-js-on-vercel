# Reproducir la verificación desde cero (P11)

El primer auditor no pudo ejecutar las pruebas de contratos porque Hardhat y el
compilador no estaban disponibles. Esto es lo que hace falta para que la próxima
vez sí pueda, y es el punto P11.

Cinco comandos, sin credenciales, sin nodo y sin cuenta en ningún sitio.

```bash
git clone <repo> && cd <repo>/sfsp

# 1 · dependencias de desarrollo (lo único que necesita red, junto con el paso 2)
for p in sdk contracts indexer dbnx-api pruebas-adversarias; do (cd $p && npm install); done

# 2 · el compilador fijado, una sola vez
node contracts/compilador/preparar.mjs

# 3 · la verificación completa
node scripts/verificar-todo.mjs
```

A partir de ahí, **nada necesita red**. El paso 3 se puede repetir con la
conexión apagada.

## Qué tiene que salir

```
sdk                  PROBADO_AISLADO
contracts            PROBADO_AISLADO
indexer              PROBADO_AISLADO
dbnx-api             PROBADO_AISLADO
pruebas-adversarias  PROBADO_AISLADO
tipos sdk / indexer / dbnx-api   OK

árbol limpio: sí
parámetros económicos con valor: 0
cobertura: VERIFICACION_COMPLETA
```

Si sale `VERIFICACION_PARCIAL`, el propio verificador imprime la lista de
motivos con su código. Esa lista es parte de lo que hay que auditar: un
verificador que da verde con una suite ausente fue el hallazgo H22.

## Comprobaciones sueltas

```bash
node scripts/conformidad.mjs --estricto   # especificación contra código
node contracts/compilador/comprobar-compilador.mjs   # que el compilador es el fijado
cd contracts && npx hardhat test          # sólo los contratos
cd sdk && npm test                        # incluye las trece pruebas de concurrencia
```

## Requisitos

Node 22 o posterior. Las pruebas de concurrencia usan `node:sqlite`, que viene
con Node y está marcado como experimental: emite un aviso por consola y no
necesita instalar nada. Crean su base en un directorio temporal y lo borran al
terminar.

## Lo que esta reproducción NO acredita

Que las suites pasen no dice nada sobre un servicio desplegado, sobre la red
5550 ni sobre un saldo real. El estado que emite el verificador es
`PROBADO_AISLADO`, y `VERIFICADO_RUNTIME` exige accesos que nadie ha dado
todavía.
