# El saber de la casa · Genesis y AU-RA

Dos cerebros, y una puerta entre ellos.

| | **Genesis** | **AU-RA** |
|---|---|---|
| Dónde | `cerebro.ordenscan.com` · con contraseña | dentro de la billetera · público |
| Con quién habla | con nosotros | con cualquiera |
| Qué sabe | **todo** el ecosistema | solo lo que Genesis dejó salir |
| Para qué | revisar, vigilar y entrenar | asistir a quien usa el producto |

Genesis sabe la infraestructura, los pendientes, lo que se está arreglando y lo
que se está probando. AU-RA le habla a un desconocido que acaba de abrir la
aplicación. **Nada de lo primero puede llegar a lo segundo por accidente**, y
por eso no se confía en que nadie se acuerde: se confía en una puerta con un
programa y una prueba.

---

## Dónde se escribe

`conocimiento/saber.json`. **Es el único sitio.** Cada cosa que la casa sabe es
una ficha:

```json
{
  "id": "boveda",
  "tema": "La bóveda y el respaldo",
  "publico": true,
  "revisadoPor": "jose@ordenglobal.org",
  "revisadoEn": "2026-08-16",
  "palabras": ["boveda", "vault", "respaldo", "certificado"],
  "es": "Por cada ORIGEN en circulación hay un gramin de oro guardado…",
  "en": "For every ORIGEN in circulation there is a gramin of gold stored…"
}
```

`palabras` son las formas en que alguien pediría eso. Gana la ficha que
comparta más con la pregunta, así que «la bóveda del oro» va a la bóveda y no a
ORIGEN, aunque las dos hablen de oro.

---

## Cómo sale

```sh
node infra/cerebro/publicar-saber.mjs           # publica
node infra/cerebro/publicar-saber.mjs --probar  # solo comprueba
```

Genera `apps-web/veta-wallet/saber.js`, que viaja con la billetera. **Ese
archivo no se edita a mano**: se regenera entero en cada publicación.

Sin correr el publicador, AU-RA no se entera de nada. Es a propósito: cada
cambio de lo que AU-RA dice en público queda en un commit que alguien puede
leer antes de que salga.

---

## Las cuatro reglas de la puerta

**1 · Privado es el valor de partida.** Una ficha sin `publico` no sale. Con
`publico` en `"true"`, `1` o `"sí"` tampoco: o es el booleano `true`, o no
cuenta. Lo que no está marcado a mano, se queda en casa.

**2 · Se filtra al publicar, no al leer.** El archivo que llega al navegador se
construye desde cero, ficha por ficha, con las claves contadas. Lo interno no
viaja nunca — ni oculto, ni marcado para no enseñarse. Mandarlo con una marca
de «no lo enseñes» sería regalarle el texto a cualquiera que abra el código
fuente.

**3 · Marcada no basta.** Un barrido busca llaves, tokens, direcciones IP,
máquinas de AWS y nombres de servidores internos en el texto que se iba a
publicar. Si encuentra algo, **no se publica nada** — ni esa ficha ni las
demás. Falla ruidoso, para que nadie lo pase por alto.

**4 · Una ficha pública está terminada o no es pública.** Los dos idiomas, sus
palabras, quién la revisó y cuándo. Media ficha traducida es AU-RA contestando
en español a quien preguntó en inglés.

---

## Que no se rompa

```sh
node infra/cerebro/pruebas/probar-frontera.mjs
```

Comprueba lo que importa, que no es que el programa funcione sino que **se
niegue**: que lo interno no cruce, que las cuatro formas de marcar mal no
cuelen, que seis clases de secreto corten la publicación entera, y que las
fichas internas que hay hoy en Genesis no estén en el `saber.js` que se está
sirviendo ahora mismo.

Un publicador que en la duda publica es peor que no tener ninguno, porque deja
la sensación de que hay una frontera.

---

## Lo que AU-RA sigue trayendo puesto

En `app.js` quedan las respuestas de fábrica. Si una ficha de Genesis habla del
mismo tema, **gana la de Genesis** — es la que alguien revisó hoy. Y si
`saber.js` no llegó, AU-RA contesta con las suyas: quedarse muda porque no bajó
un archivo de texto sería cambiar una respuesta vieja por ninguna.

---

## Lo que todavía no es

Esto es la **curaduría**, no el entrenamiento. AU-RA no aprende sola de las
conversaciones: aprende de lo que una persona escribe aquí y marca. Es
deliberado mientras sea un asistente encima de una billetera — un modelo que
aprende solo de lo que le dicen los usuarios es un modelo al que se le puede
enseñar a decir cualquier cosa.

El siguiente paso natural, cuando se quiera: que Genesis recoja **qué se le
preguntó a AU-RA y no supo contestar**, y lo deje como fichas en blanco
esperando a que alguien las escriba. Ahí el entrenamiento lo siguen guiando
personas, pero el trabajo lo propone el uso real.
