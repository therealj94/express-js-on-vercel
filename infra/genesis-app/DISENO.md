# Orden Global · GENESIS — el plan, antes de escribir código

Acompaña a `ARQUITECTURA.md` (el porqué) y a `maqueta.html` (el cómo se ve).
Esto es **qué se toca, en qué orden y qué NO entra**, para no quemar semanas
descubriéndolo a mitad.

Ábrelo con la maqueta al lado: todo lo que está aquí escrito se puede pulsar
allí.

---

## 1 · El recorrido, en cuatro pantallas

```
   ABRIR ──▶ GENESIS ID ──▶ INICIO ──▶ «dime qué quieres» ──▶ DESTINO
             (la puerta)    (negro,     (barra de abajo,        (billetera,
                            menú        siempre visible)         cobro,
                            arriba,                              enviar…)
                            tabs abajo)
```

- **La puerta** es Genesis ID. Sin identidad no hay billetera; una sesión
  vale para todo el ecosistema. Es la pieza que justifica que sea *una* app.
- **El inicio** es la pantalla de Veta Wallet que ya existe. No cambia.
- **La barra de hablar** vive abajo en todas las pantallas, encima de las
  pestañas. Nunca desaparece.
- **El destino** es una entrada del mapa. Siempre.

---

## 2 · Inventario — lo que hay y lo que falta

`veta-wallet-app` tiene **31 pantallas** ya escritas y en producción (v1.33):

> splash · auth · kyc · seedview · genesisOffer · home · token · **send** ·
> receive · buy · swap · card · cardSettings · fundCard · deposit · activity ·
> notifs · settings · profile · **mytokenpay** · passport · blocked ·
> privatekey · scan · **contacts** · about · onboarding · watchOnly ·
> sessions · help · remesas

**Pantallas nuevas que hacen falta: tres.**

| Nueva | Qué es | Por qué no vale una existente |
|---|---|---|
| `asistente` | el panel grande de GENESIS: lo que oyó, lo que entendió, historial | hoy no hay nada parecido |
| `pay/cobrar` | MyTokenPay dentro (WebView en fase 1) | la ruta `mytokenpay` de hoy es un enlace afuera |
| `scan/tx` | explorador dentro (WebView) | hoy se sale de la app |

Todo lo demás **ya está**. Ése es el ahorro entero del proyecto.

---

## 3 · El mapa de rutas

| Dirección | Pantalla interna | Sesión | Firma |
|---|---|---|---|
| `og://id/verificar` | genesisOffer / kyc | — | — |
| `og://wallet/home` | home | sí | — |
| `og://wallet/dash` | home (vista billetera) | sí | — |
| `og://wallet/send?to=&amount=&token=` | **send** | sí | **sí** |
| `og://wallet/receive` | receive | sí | — |
| `og://wallet/card` | card | sí | — |
| `og://wallet/fondear?monto=` | fundCard | sí | sí |
| `og://wallet/swap` | swap | sí | sí |
| `og://wallet/activity` | activity | sí | — |
| `og://wallet/contactos` | contacts | sí | — |
| `og://pay/cobrar?monto=` | pay (nueva) | comercio | — |
| `og://scan/tx?hash=` | scan (nueva) | — | — |

**Reglas del mapa**
1. Si no está aquí, GENESIS no lo puede hacer.
2. Toda entrada con `firma:true` **abre la pantalla rellena y se detiene ahí**.
3. Las mismas direcciones sirven de enlace profundo (`vetawallet://` ya está
   registrado), de destino de notificación y de QR de cobro. Se escribe una
   vez, sirve para cuatro cosas.

---

## 4 · La gramática

Cuatro verbos. Todo lo demás es vocabulario.

| Verbo | Frases que lo disparan | Resuelve a |
|---|---|---|
| **abrir** | abre · quiero ver · llévame a · entra a | el destino nombrado |
| **enviar** | envía · mándale · transfiere · pásale | `wallet/send` con `to` y `amount` |
| **cobrar** | cóbrale · cobrar · quiero cobrar | `pay/cobrar` con `monto` |
| **mostrar** | muéstrame · enséñame · cuánto tengo | la pantalla que lo tiene |

**De dónde salen las entidades** — y esto importa, porque es lo que impide
que se inventen:

- **a quién** → `listContacts()` / `nameFor()` en `src/addressBook.js`. Si el
  nombre no está en la libreta, **no se adivina**: se dice.
- **cuánto** → del número dicho, normalizado con `normalizeAmtInput()`, que
  ya existe en `Trade.js`.
- **qué token** → `useTokens()`; por defecto ORIGEN.

**Los tres «no»**, comprobados en la maqueta:

| Se dice | GENESIS contesta |
|---|---|
| «compra un carro» | *no está en el mapa* → lo dice, no lo intenta |
| «envía 15 a Ramón» (no está en contactos) | *no tengo ese contacto* |
| «envíale a Juan» (sin monto) | *no entendí el monto* |

---

## 5 · Lo visual

Nada nuevo que inventar: **la paleta es la que ya está** en
`veta-wallet-app/src/theme.js`.

| | |
|---|---|
| Fondo | `#021B1C` sobre la fotografía de marca velada |
| Vidrio | paneles `rgba(6,40,42,.82)` con desenfoque |
| Oro | `#C9A961`, claro `#EAD79C`, alto `#F8EFCF` |
| Texto | `#F3ECD9` · secundario `#AEC7C3` · terciario `#6E938F` |
| Sube / baja | `#3ED9A0` / `#F0776B` |

**La barra de hablar** es lo único con lenguaje propio:

- micrófono redondo dorado, 44 px, con pulso mientras escucha;
- encima, una línea con **lo que oyó** y, debajo en monoespaciada, **a dónde
  resolvió** — el usuario normal no la lee y quien duda la agradece;
- si toca dinero, dos botones: **SÍ, ABRE** / **NO**.

---

## 6 · Qué se toca de `veta-wallet-app`, fichero por fichero

Aquí es donde se ve que esto es un añadido, no una reescritura.

| Fichero | Cambio | Tamaño |
|---|---|---|
| `src/rutas.js` | **nuevo** — el mapa: dirección → ruta interna, params, sesión, firma | ~80 líneas |
| `src/intencion.js` | **nuevo** — el traductor: frase → entrada del mapa | ~150 líneas |
| `src/BarraGenesis.js` | **nuevo** — la barra de hablar | ~180 líneas |
| `App.js` | montar la barra encima de las tabs; `abrir(uri)` que llama al `go()` que ya existe | ~30 líneas |
| `src/screens/Pay.js` | **nueva** — MyTokenPay en WebView | ~90 líneas |
| `src/screens/Scan2.js` | **nueva** — explorador en WebView | ~60 líneas |
| `app.json` | nombre → Orden Global, esquema `og` junto a `vetawallet` | 4 líneas |
| `src/screens/Trade.js` | **nada** — ya acepta `to` y `amount` | 0 |
| las otras 30 pantallas | **nada** | 0 |

---

## 7 · Las fases

**Fase 0 · el mapa — ≈1 semana.** `rutas.js`, `abrir(uri)`, esquema `og://`,
y una pantalla de pruebas donde se teclea una dirección y se abre. **Sin voz
y sin traductor.** Al final: los enlaces profundos funcionan y el mapa está
demostrado. *Se corta aquí si algo no cuadra, y se ha gastado una semana.*

**Fase 1 · el traductor y la barra — ≈2 semanas.** `intencion.js`,
`BarraGenesis.js`, los cuatro verbos, confirmación en lo que toca dinero.
Escrito primero, voz después: el reconocimiento se enchufa el último día,
porque es lo único que obliga a compilar fuera de Expo Go. **Al final de esta
fase ya se puede enseñar en una reunión.**

**Fase 2 · el resto del ecosistema — ≈2 semanas.** Genesis ID como puerta con
sesión única, `Pay.js` y `Scan2.js` en WebView, «abre X» para todo.

**Fase 3 · lo nativo y lo que sobre.** Cobro nativo, frases grabadas dentro
del paquete para que hable sin red, y —si la Junta aprueba el crédito— el
modelo de lenguaje como respaldo del traductor. Nunca de la firma.

---

## 8 · Lo que NO entra en la primera versión

Escrito a propósito, porque la forma de quemar un proyecto es que esta lista
no exista:

- **Modelo de lenguaje.** La gramática cubre lo que se va a enseñar.
- **Conversación.** GENESIS ejecuta órdenes; no charla. Preguntar «¿cuánto
  cuesta operar esto?» es el cerebro, y el cerebro es otra pantalla.
- **Voz en inglés.** Español primero. La app ya tiene `i18n.js`; se añade
  cuando el español esté bien.
- **Cobrar por voz en el comercio.** Cobrar es un flujo de dos personas y
  necesita su propio diseño.
- **Fusionar el código de MyTokenPay.** WebView. Se reescribe cuando haya
  motivo, no antes.

---

## 9 · Antes de empezar

1. **Cerrar el PASS_TOKEN de 7 caracteres** (tarea #27). Una sola sesión para
   todo el ecosistema multiplica lo que protege esa clave.
2. **Decidir el nombre en la tienda.** ¿«Orden Global» sustituye a «Veta
   Wallet» en la misma ficha —conserva instalaciones y reseñas— o es una app
   nueva? Cambiar el nombre de una ficha existente es lo barato; publicar una
   nueva empieza de cero.
3. **Interruptor remoto de GENESIS.** Si la barra falla, la app tiene que
   seguir siendo una billetera. Se decide antes, no después del primer susto.
