# El ecosistema, para quien hace mercadeo

**27-sep-2026.** Estudio de los dos repos, todas las ramas, para escribir
vídeos que vendan la visión sin prometer lo que aún no está. Las fuentes con su
rama están al final. Donde dos documentos se contradicen, se dice.

Regla de uso: **la visión se cuenta; el estado se respeta.** Un vídeo puede
rodarse hoy sobre lo que se está terminando, pero **se publica cuando cada cosa
que enseña funcione con gente real**. Por eso cada escena lleva su condición
(§5).

---

## 1. La visión, en palabras del equipo

De la portada de ordenglobal.org (`main`, 27-sep):

> Tu abuela ahorró toda la vida, y un día alguien decidió que ese ahorro valía la mitad.
> Tu hijo te manda plata desde afuera. Tarda días, y en cada frontera se queda un pedazo.
> Y cuando preguntás dónde está, te piden que confíes.
> Así que hicimos el sistema entero, desde la cadena hasta tu teléfono, con cada regla a la vista.

Y de la página de historia: *«No es caridad. Es infraestructura.»* El encargo
del fundador para los vídeos (Documento 9): *«Gente real. Que inspire.»* y
*«de Latinoamérica para Latinoamérica y el mundo»*.

**Lo que eso significa para un vídeo:** el enemigo no es el banco ni la
cripto; es **tener que confiar a ciegas**. La promesa de marca es la
comprobación, y la frase de cierre lo dice: *Orden Global. Un sistema
financiero que se puede comprobar.*

---

## 2. Las piezas, en una línea cada una

| Pieza | Qué hace para una persona normal | Hoy |
|---|---|---|
| **Veta Wallet** | La app: guardar, mandar y recibir ORIGEN de celular a celular, con tarjeta y chat | Viva (web y APK). Sin Play Store ni iPhone. Custodia: el servidor guarda la llave |
| **ORIGEN** | La moneda. Un ORIGEN es un gramín: 1/55 de gramo; **sigue el precio del oro** | Viva en la cadena 5550 |
| **Genesis ID** | Te verificás una vez y esa identidad te abre todo | Viva. Desbloquea tarjeta, chat, AuCorp |
| **Tarjeta Visa** | Virtual, para pagar en línea. Cuesta 5 USD en ORIGEN, pide Genesis ID | Viva, 24 emitidas. **Sin Apple/Google Pay.** Ver §4 |
| **MyTokenPay** | Un negocio cobra con un QR, divide la cuenta de la mesa (2-4) y pasa lo cobrado a lempiras | API viva; app con datos de muestra; retiro manual, solo lempiras, 8 bancos |
| **OrdenScan** | Cualquiera abre ordenscan.com y comprueba un movimiento, sin pedir permiso | Viva desde el 5-ago |
| **Ordenex** | Casa de cambio entre personas | Viva, **nunca ha operado** |
| **AuCorp** | La cuenta en moneda local, el puente a lempiras | Código probado; **el puente no opera** |
| **PULSE2CHAT** | Chat 1:1 dentro de la billetera | Vivo a medias: sin grupos ni avisos |
| **AU-RA** | Asistente por WhatsApp, dice el precio en vivo | Viva, una conversación con alguien de fuera |

**Velocidad:** un bloque cada 10 s. **Coste de red:** ~0,002 ORIGEN por envío.
**Comisión de servicio:** decidida por la dirección el 26-sep (0,01 USD), **sin
acta**: ninguna pantalla puede afirmar un costo hasta D02.

**Uso real hoy:** 481 cuentas en Veta, 4 con correo confirmado; cero
transacciones en 300 bloques el 1-sep; ningún comercio real encontrado. La
frase honesta del propio equipo: *«Está construido y funciona. Todavía no lo
usa nadie.»*

---

## 3. Lo que aprendimos del público (y cómo lo usa «Un martes»)

| El público dijo | Lo que hace la película |
|---|---|
| «Parece de una secta» (el dorado, el logo formándose) | Cero dorado, cero logo animado. El logo solo al final, quieto |
| «Me huele a estafa de criptomonedas» | Ni cadena, ni monedas, ni gráficas. Gente, casas, un taller |
| «No entendí ni un carajo» (explicar la moneda) | No se explica nada. Se ve cómo se vive |
| «Un catálogo de servicios» | Cada app sale porque la historia la pide, nunca al revés |
| 0,001 $ como alarde: último en credibilidad | El costo no se dice. Si D02 se aprueba, es una línea del comprobante |
| **«Yo no voy a ser el primer tonto»** | Nadie en la película es la primera. En el almuerzo, el escéptico pregunta «¿y cómo sé que le llegó?», y la respuesta es un comprobante y el dueño asintiendo desde la caja |
| Jurado de Lima: «ninguno me muestra a alguien sacando su plata» | El florista, al cerrar, pasa lo del día a su cuenta en lempiras |
| «La hija está fuera, le manda a la mamá y le llega completo» | Es el hilo de la película |
| El vozarrón de tráiler «suena a entidad financiera» | Sin locutor. Solo voces de teléfono |

---

## 4. Tres cosas que José tiene que saber, fuera del vídeo

1. **Recargas de tarjeta que cobraron y no entregaron.** Las dos únicas
   recargas registradas cobraron **82 ORIGEN** y no dieron saldo
   (`documentos/aucorp-puente-fiat.md`, rama `sfsp410-ondk-saldos`). Si eso es
   de clientes reales, es un reclamo esperando a pasar.
2. **La web pública dice cosas que la lista de prohibiciones veta.** La
   página de historia promete «de un país a otro» y «te cuida el valor»; la
   portada dice que con ONDK «se vota». Y el Documento 9 propone el aviso
   «ORIGEN está respaldado por metal en bóveda», que contradice la regla de la
   Junta del 14-08 («referenciado, nunca respaldado; no hay oro en bóveda»).
3. **Quién emite la tarjeta.** Los términos dicen CryptoMate; el reverso de la
   tarjeta en la app dice «Emitida por Orden Global Corp».

---

## 5. Qué hace falta para publicar cada escena de «Un martes»

La película se puede **rodar ya**: los planos humanos no dependen del
producto, y las pantallas se capturan al final, de la app real. Lo que no se
puede es **publicarla** hasta que cada escena sea verdad.

| Escena | Enseña | Se publica cuando… |
|---|---|---|
| 6:40 envío a la hija | Veta: mandar ORIGEN a otro país | …la hija pueda **usar** lo que recibe allá: el puente a moneda local de su país (AuCorp/Ordenex) opera con gente real. Hoy la lista veta «remesas» y «tu familia lo cobra en efectivo» |
| 6:40 boleto | Visa virtual en línea | …la tarjeta recarga bien (§4.1), D15 aprobada y se confirma el emisor |
| 10:15 floristería | MyTokenPay: QR | …hay al menos un comercio real cobrando. Mejor aún: **ese comercio sale en el vídeo** |
| 13:30 almuerzo | Dividir la cuenta | …igual que la floristería |
| 15:40 proveedor | Pago a otro país | …el proveedor pueda pasarlo a su moneda en su país |
| 18:30 florista cierra | Retiro a lempiras | …el retiro deja de ser manual o, si sigue manual, llega el mismo día |
| 12:10 ONDK | Tenerlo y ver el acta | …la ficha de ONDK en Veta enseña el acta sin cifras |
| 21:10 historial | Comprobante y ordenscan | **Ya se puede**: ordenscan está vivo |
| Cierre | «…se puede comprobar» | Ya se puede |

**Lo que se puede decir hoy sin esperar a nada:** mandar ORIGEN de celular a
celular dentro de la app, en segundos, y comprobarlo en ordenscan.com. Si hace
falta una pieza **ya**, es esa: dos personas y un comprobante que cualquiera
puede abrir.

---

## 6. Palabras

**Sí:** «sigue el precio del oro» (solo si hace falta, y mejor no), «de
celular a celular», «comprobar», «comprobante», «gramín», «cuenta en moneda
local», voseo, frases cortas.

**Nunca:** respaldado/a, bóveda, garantizado, regulado, registrado, licenciado
o el nombre de cualquier regulador; banco; sin intermediarios; sin comisiones;
no pierde valor, ganancia, rendimiento, inversión, precios futuros; remesas,
«tu familia lo cobra en efectivo», «sin controles de cambio»; «tu llave, tu
dinero» (es custodia); «de la gente y para la gente», social, DAO, votar;
ahorro en grupo; el directorio o el mapa de comercios; «cambiá en Ordenex»;
«hablá con AU-RA por WhatsApp»; Web5; «meter/sacar plata» con ORIGEN; la
construcción «no es X, es Y»; ONDK con precio o invitación a comprar. Y el
costo por operación, hasta D02.

**ONDK, para vender:** es la pieza con más fuerza aspiracional: una persona
normal dueña de un pedazo de algo grande, con un acta que lo respalda y que se
puede abrir. Se cuenta así: que **lo tiene** y que **lo puede comprobar**. Sin
cifra, sin gráfica y sin «comprá» en pantalla. Que no se mueva entre actas es
un argumento a favor frente a la montaña rusa de las cripto.

---

## 7. Marca

- Fondos `#07091A` / `#0B0E22`, crema `#F3ECD9`. El oro de la paleta
  (`#C9A961`) **no entra** en las piezas para público frío.
- Tipos: Fraunces (titulares), Manrope o Karla (rótulos), JetBrains Mono
  (datos). Cinzel solo en la marca.
- Voseo. Nadie sonríe a cámara. «Usado, no deteriorado».
- El logo se compone en posproducción, nunca lo genera la IA.
- Sin logo vectorial: los PNG de monedas pesan 2-3 KB. Hace falta un SVG.

---

## Fuentes (rama → fichero)

- `main`: `sitio-ordenglobal/index.html`, `sitio-ordenglobal/historia/index.html`, `assets/portada.css`
- `claude/sfsp410-ondk-saldos-ox2fba`: `ECOSISTEMA-ORDEN-GLOBAL.md`, `sfsp/adr/ADR-004-modelo-de-precio-y-fee.md`, `sfsp/DECISIONES-SFSP.json`, `sfsp/deploy/SALIDA-A-VIVO-2026-09-27.md`, `documentos/aucorp-puente-fiat.md`, `infra/mytokenpay-api/*`, `infra/aucorp-api/LEEME.md`, `entregables/video-orden-global/GUION-ORDEN-GLOBAL.md`
- `claude/veta-wallet-phantom-design-7syah8`: `documentos-junta/03-Veta-Wallet.html`, `04-Genesis-ID.html`, `veta-wallet-legal/terminos.html`, `infra/cerebro/conocimiento/legal-*.md`, `PLAN-MAESTRO-OGFP-2026-09-22.md`, `apps-web/veta-wallet/*`, `veta-wallet-app/*`
- `claude/p2p-marketplace-latam-9rfd9g`: `documentos-junta/08-Revision-Sistema-SFSP.html`, `09-Trailer-Pesalo.html`, `ordenexchange/README.md`
- `claude/minimax-wan-video-pipeline-vkugaz`: `CLAUDE.md`
- `claude/orden-global-auditoria-doc-wc2okv`: `entregables/trailer-mytokenpay/LEEME.md`
- ULTRON-APP `main`: `README.md`, `docs/*`
