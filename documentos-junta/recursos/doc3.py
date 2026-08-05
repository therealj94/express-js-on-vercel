# -*- coding: utf-8 -*-
"""Documento 3 · Veta Wallet.

Las cifras del código salen de contar el código; las de producción, de llamar
a los servidores reales; las de la migración de claves, del informe que dejó
la propia migración al ejecutarse.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from piezas import *

FECHA = "5 de agosto de 2026"

# ── Diagrama 1: quién habla con quién ───────────────────────────────────────
ARQUITECTURA = f'''<svg viewBox="0 0 560 250" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">QUIÉN HABLA CON QUIÉN</text>

  {caja(6, 66, 118, 78, "Veta Wallet", "el teléfono", VERDE)}
  {caja(178, 66, 130, 78, "Servidor de la app", "guarda las llaves", ORO, "#FBF8F1")}

  {caja(374, 18, 180, 50, "Cadena 8532", "saldos y envíos", VERDE2)}
  {caja(374, 88, 180, 50, "Genesis ID", "identidad y sanciones", VERDE2)}
  {caja(374, 158, 180, 50, "Base de datos", "cuentas · sellos · sesiones", SUAVE)}

  <line x1="126" y1="96" x2="176" y2="96" stroke="{ORO}" stroke-width="1.3" marker-end="url(#punta)"/>
  <text x="151" y="90" text-anchor="middle" font-size="7" font-family="Helvetica" fill="{ORO}">sesión</text>
  <line x1="176" y1="118" x2="126" y2="118" stroke="{SUAVE}" stroke-width="1.1" marker-end="url(#punta)"/>
  <text x="151" y="132" text-anchor="middle" font-size="7" font-family="Helvetica" fill="{SUAVE}">saldos</text>

  <path d="M 310 88 L 340 88 L 340 43 L 372 43" fill="none" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <line x1="310" y1="113" x2="372" y2="113" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <path d="M 310 128 L 340 128 L 340 183 L 372 183" fill="none" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>

  <rect x="6" y="164" width="302" height="46" rx="6" fill="#F4F7F6" stroke="{LINEA}"/>
  <text x="18" y="182" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{VERDE}">El teléfono nunca habla directo con la cadena.</text>
  <text x="18" y="196" font-size="8" font-family="Helvetica" fill="{SUAVE}">Ni con Genesis ID. Todo pasa por el servidor de la app, que responde por él.</text>
</svg>'''

# ── Diagrama 2: dónde vive la llave ─────────────────────────────────────────
CUSTODIA = f'''<svg viewBox="0 0 560 172" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">DÓNDE VIVE LA LLAVE QUE MUEVE EL DINERO</text>

  {caja(6, 26, 160, 44, "La llave privada", "y la frase de recuperación", VERDE)}
  <line x1="168" y1="48" x2="196" y2="48" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  {caja(198, 26, 160, 44, "Se cifran", "con la clave del servidor", ORO, "#FBF8F1")}
  <line x1="360" y1="48" x2="388" y2="48" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  {caja(390, 26, 164, 44, "Se guardan cifradas", "en la base de datos", VERDE2)}

  <rect x="6" y="88" width="264" height="76" rx="6" fill="#F0F7F4" stroke="{OK}" stroke-width="1"/>
  <text x="18" y="106" font-size="9" font-family="Helvetica" font-weight="600" fill="{OK}">Lo que esto le da al usuario</text>
  <text x="18" y="122" font-size="8" font-family="Helvetica" fill="{SUAVE}">Perder el teléfono no es perder el dinero.</text>
  <text x="18" y="136" font-size="8" font-family="Helvetica" fill="{SUAVE}">Entra desde otro aparato con su correo y su clave.</text>
  <text x="18" y="150" font-size="8" font-family="Helvetica" fill="{SUAVE}">No tiene que custodiar doce palabras él solo.</text>

  <rect x="290" y="88" width="264" height="76" rx="6" fill="#FBF8F1" stroke="{ORO_CL}" stroke-width="1"/>
  <text x="302" y="106" font-size="9" font-family="Helvetica" font-weight="600" fill="{ORO}">Lo que exige de la organización</text>
  <text x="302" y="122" font-size="8" font-family="Helvetica" fill="{SUAVE}">La clave que cifra todo tiene que ser fuerte de verdad.</text>
  <text x="302" y="136" font-size="8" font-family="Helvetica" fill="{SUAVE}">Un volcado de la base más una clave débil</text>
  <text x="302" y="150" font-size="8" font-family="Helvetica" fill="{SUAVE}">es el vaciado de todas las cuentas a la vez.</text>
</svg>'''

# ── Diagrama 3: el doble envío ──────────────────────────────────────────────
DOBLE = f'''<svg viewBox="0 0 560 214" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">DOS PETICIONES IDÉNTICAS LLEGAN A LA VEZ</text>

  {caja(6, 26, 120, 38, "Toque 1", "envía 100 ORIGEN", VERDE2, "#fff", True)}
  {caja(6, 106, 120, 38, "Toque 2", "el mismo envío", VERDE2, "#fff", True)}

  {caja(166, 62, 150, 46, "Un sello único", "reservado ANTES de firmar", ORO, "#FBF8F1")}
  <line x1="128" y1="45" x2="164" y2="72" stroke="{SUAVE}" stroke-width="1.1" marker-end="url(#punta)"/>
  <line x1="128" y1="125" x2="164" y2="98" stroke="{SUAVE}" stroke-width="1.1" marker-end="url(#punta)"/>

  <line x1="318" y1="74" x2="366" y2="52" stroke="{OK}" stroke-width="1.3" marker-end="url(#punta)"/>
  <line x1="318" y1="96" x2="366" y2="120" stroke="{GRAVE}" stroke-width="1.3" marker-end="url(#punta)"/>

  <rect x="368" y="28" width="186" height="46" rx="6" fill="#F0F7F4" stroke="{OK}" stroke-width="1.2"/>
  <text x="461" y="47" text-anchor="middle" font-size="9.5" font-family="Helvetica" font-weight="600" fill="{OK}">Pasa uno solo</text>
  <text x="461" y="61" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">se firma y se envía una vez</text>

  <rect x="368" y="98" width="186" height="46" rx="6" fill="#FCF3F2" stroke="{GRAVE}" stroke-width="1.2"/>
  <text x="461" y="117" text-anchor="middle" font-size="9.5" font-family="Helvetica" font-weight="600" fill="{GRAVE}">El otro rebota</text>
  <text x="461" y="131" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">recibe el mismo comprobante</text>

  <rect x="6" y="162" width="548" height="44" rx="6" fill="#F4F7F6" stroke="{LINEA}"/>
  <text x="18" y="180" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{VERDE}">La protección no es «buscar y, si no existe, crear»: entre buscar y crear caben las dos peticiones.</text>
  <text x="18" y="195" font-size="8" font-family="Helvetica" fill="{SUAVE}">Es la base de datos la que rechaza el duplicado, y esa negativa es la señal de que alguien ya está con este envío.</text>
</svg>'''

# ── Diagrama 4: la migración de la clave ────────────────────────────────────
MIGRACION = f'''<svg viewBox="0 0 560 170" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">CAMBIAR LA CLAVE SIN QUE NADIE PIERDA SU DINERO</text>
  {caja(0, 26, 172, 54, "1 · Entender las dos", "cifra con la nueva, lee ambas", VERDE2, "#fff", True)}
  {caja(194, 26, 172, 54, "2 · Recifrar todo", "804 campos, uno por uno", ORO, "#FBF8F1", True)}
  {caja(388, 26, 172, 54, "3 · Borrar el respaldo", "y retirar la clave vieja", VERDE2, "#fff", True)}
  <line x1="174" y1="53" x2="192" y2="53" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <line x1="368" y1="53" x2="386" y2="53" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>

  <rect x="388" y="98" width="172" height="66" rx="6" fill="#FCF3F2" stroke="{GRAVE}" stroke-width="1.2"/>
  <text x="398" y="115" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{GRAVE}">El paso que cierra el agujero</text>
  <text x="398" y="129" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">El respaldo guardaba las mismas</text>
  <text x="398" y="140" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">llaves con la clave vieja. Mientras</text>
  <text x="398" y="151" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">existiera, recifrar no servía de nada.</text>
  <line x1="474" y1="82" x2="474" y2="96" stroke="{GRAVE}" stroke-width="1.1"/>

  <rect x="0" y="98" width="366" height="66" rx="6" fill="#F0F7F4" stroke="{OK}" stroke-width="1"/>
  <text x="12" y="115" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{OK}">Cinco redes bajo el trapecio, en cada registro</text>
  <text x="12" y="129" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">Simulacro primero · respaldo antes de escribir · ida y vuelta antes de guardar</text>
  <text x="12" y="140" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">relectura desde la base después de guardar · restauración automática si algo no cuadra</text>
  <text x="12" y="153" font-size="7.5" font-family="Helvetica" font-weight="600" fill="{OK}">Resultado: 804 de 804 descifran al MISMO texto que antes. Cero pérdidas.</text>
</svg>'''

# ── Diagrama 5: el alta ─────────────────────────────────────────────────────
ALTA = f'''<svg viewBox="0 0 560 118" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">EL ALTA DE UNA PERSONA, DE PRINCIPIO A FIN</text>
  {"".join(
    caja(i * 114, 26, 104, 52, t, s, ORO if i == 4 else VERDE2, "#FBF8F1" if i == 4 else "#fff", True)
    for i, (t, s) in enumerate([
      ("1 · Datos", "nombre, fecha, país"),
      ("2 · Perfil", "los datos del AML"),
      ("3 · Documento", "las dos caras"),
      ("4 · Rostro", "gestos al azar"),
      ("5 · Decisión", "la toma una persona"),
    ]))}
  {"".join(f'<line x1="{104 + i*114}" y1="52" x2="{112 + i*114}" y2="52" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>' for i in range(4))}
  <text x="0" y="98" font-size="8" font-family="Helvetica" fill="{SUAVE}">Ningún paso se puede saltar, y la aplicación no puede aprobar por su cuenta: el paso 5 es siempre humano.</text>
  <text x="0" y="111" font-size="8" font-family="Helvetica" fill="{SUAVE}">Los pasos 1 a 4 ocurren dentro de Veta Wallet; el 5, dentro de Genesis ID. El detalle completo está en el documento 4.</text>
</svg>'''

cuerpo = portada(
    "Veta Wallet",
    "De una página web a una aplicación móvil completa. Qué hace, cómo está construida, "
    "cómo se conecta con la cadena y con Genesis ID, qué se reparó y qué queda abierto.",
    "La billetera", FECHA, "3 de 4")

cuerpo += f'''
<h2>1 · Qué es Veta Wallet</h2>

<p>Es la <strong>billetera del ecosistema</strong>: donde una persona guarda sus ORIGEN, los
envía, los recibe, ve su historial y —cuando lo necesita— acredita quién es. Hasta hace poco
existía solo como <strong>página web</strong>. Hoy existe además como <strong>aplicación
móvil completa</strong> para Android, construida desde cero, en producción y lista para
entregar.</p>

{cifras(("1.32.0", "versión publicada"), ("68", "entregas de la app"),
        ("20", "pantallas"), ("63", "despliegues del servidor"))}

<h3>Cómo está montada</h3>
<p>Tres piezas, y la separación entre ellas es deliberada:</p>
<ul>
<li><strong>La aplicación</strong> en el teléfono. Muestra, pide y explica. No guarda nada que
mueva dinero.</li>
<li><strong>El servidor de la app.</strong> Es quien tiene las llaves, quien firma los envíos
y quien habla con todo lo demás.</li>
<li><strong>Lo que hay detrás:</strong> la cadena, Genesis ID y la base de datos.</li>
</ul>

<figure class="mediana">{ARQUITECTURA}
<figcaption>Un teléfono es un aparato que se pierde, se presta y se rompe. Cuanto menos
sepa, menos hay que proteger en él.</figcaption></figure>

{nota("Por qué la aplicación no habla directo con la cadena ni con Genesis ID",
 "Hablar con Genesis ID exige una clave de servicio. Si esa clave viajara dentro de la "
 "aplicación, cualquiera podría extraerla —un archivo de aplicación se descomprime con una "
 "orden— y crear identidades a nombre de otras personas. Por eso vive solo en el servidor, "
 "que ya sabe quién es el usuario porque él mismo lo autenticó.")}

<h2>2 · Dónde estaba y dónde está</h2>

{comparar(
 ["Solo existía versión web. No había aplicación.",
  "Una interrupción de red podía enviar el mismo pago dos veces.",
  "Las llaves privadas y las frases de recuperación se cifraban con una clave de <b>7 caracteres</b>.",
  "La frase de recuperación se mostraba sin pedir nada: bastaba tener el teléfono desbloqueado.",
  "Sin verificación de identidad real.",
  "Precios y datos con inconsistencias entre pantallas.",
  "Sin forma de que el usuario cerrara sesiones abiertas ni borrara su cuenta."],
 ["Aplicación móvil completa, en Android, lista para tienda.",
  "Sello de idempotencia: el mismo envío no puede ejecutarse dos veces.",
  "804 campos recifrados con una clave fuerte y verificados uno a uno.",
  "Pide la contraseña de la cuenta antes de mostrar la frase o la llave privada.",
  "Verificación real con Genesis ID: documento, rostro y prueba de vida.",
  "Auditoría aplicada y desplegada.",
  "Pantallas propias de sesiones activas y de baja de cuenta."])}

<h3>Lo que hay dentro de la aplicación</h3>
{tabla(["Grupo", "Qué resuelve", "Pantallas"], [
  ["<b>Dinero</b>", "Ver saldos, enviar, recibir, historial, detalle de cada token",
   "Inicio · Enviar y cambiar · Depósito · Detalle de token · Escanear"],
  ["<b>Identidad</b>", "El alta completa con Genesis ID y la credencial que resulta",
   "Alta guiada · Más → credencial"],
  ["<b>Tarjeta</b>", "Solicitud, fondeo, límites, congelar, PIN, disputas, reemisión",
   "Tarjeta · Ajustes de tarjeta · Fondear"],
  ["<b>Personas</b>", "Libreta de direcciones y envíos a contactos",
   "Contactos · Remesas"],
  ["<b>Seguridad</b>", "Bloqueo, sesiones activas, baja de cuenta, ayuda",
   "Bloqueo · Sesiones · Borrar cuenta · Ayuda · Acerca de"],
  ["<b>Solo mirar</b>", "Seguir una dirección sin tener sus llaves",
   "Modo observador"],
])}

<p style="font-size:9pt;color:#5C6B68">La aplicación son unas 15.300 líneas de código propio.
Está traducida completa a dos idiomas y trae su propio historial de novedades, visible dentro
de la app, para que el usuario sepa qué cambió en cada entrega.</p>

<div class="salto"></div>
<h2>3 · El riesgo que se cerró primero: enviar dos veces</h2>

<p>Mandar dinero es la única operación de una billetera que <strong>no se puede repetir sin
consecuencias</strong>. Y se repite sola con facilidad: el usuario toca dos veces el botón, la
red va lenta y el teléfono reintenta, o la respuesta se pierde de vuelta y nadie sabe si la
transferencia salió. En los tres casos llega al servidor una <strong>segunda orden idéntica</strong>.</p>

<p>La aplicación ya mandaba un sello para que el servidor pudiera reconocer el duplicado.
<strong>El servidor no lo miraba.</strong> Leía el destinatario, el monto y la contraseña,
firmaba, y emitía una segunda transferencia. El dinero salía dos veces.</p>

<figure>{DOBLE}</figure>

<h3>La regla que lo resuelve: reservar antes de firmar</h3>
<p>El sello se reserva <strong>antes</strong> de emitir la transacción, nunca después. Si se
reservara después, dos peticiones simultáneas pasarían las dos la comprobación y las dos
transferirían, que es justo lo que hay que impedir. Y se reserva <strong>después</strong> de
validar la contraseña, para que una contraseña mal escrita no queme el sello del usuario.</p>

<h3>Qué pasa cuando algo falla</h3>
<p>Aquí está la decisión más delicada del sistema, y depende de una sola pregunta:
<em>¿la transacción pudo haber salido?</em></p>

{tabla(["Situación", "Qué hace el sistema", "Por qué"], [
  ["Falló <b>antes</b> de emitir<br><span style='font-size:8.5pt;color:#5C6B68'>saldo insuficiente, dato inválido</span>",
   "Libera el sello. Reintentar es seguro",
   "Es seguro que no salió nada: repetir no puede duplicar"],
  ["Falló de forma <b>dudosa</b><br><span style='font-size:8.5pt;color:#5C6B68'>se cortó la red al emitir</span>",
   "Marca el sello en duda. Un reintento <b>no</b> vuelve a transferir: pide verificar primero",
   "Se prefiere molestar al usuario con una comprobación antes que arriesgar su dinero"],
])}

<p>Todo lo que no esté expresamente en la lista de fallos previos al envío se trata como
dudoso. La regla es equivocarse siempre hacia el lado seguro.</p>

<h3>Lo que ve el usuario</h3>
{tabla(["Caso", "Respuesta"], [
  ["Primera vez", "Su comprobante, como siempre"],
  ["Vuelve a intentar algo que ya salió", "<b>El mismo comprobante.</b> Para él funcionó — y es verdad: funcionó la primera vez"],
  ["Hay otro intento en curso", "«Ya hay un envío en marcha»"],
  ["Un intento anterior quedó en duda", "«Verificá en la cadena antes de repetir»"],
  ["El mismo sello con datos distintos", "Se rechaza"],
])}

<p>Devolver el comprobante original en un reintento es deliberado: un mensaje de error solo
invitaría al usuario a intentarlo otra vez, que es exactamente lo que hay que evitar.</p>

{nota("Dos fallos que aparecieron al releer el código, no al escribirlo",
 "El primero: si la anotación final de «esto ya salió» fallaba, el usuario recibía un error "
 "por un envío que <b>ya estaba en su historial</b> —el peor resultado posible, porque lo "
 "invita a repetirlo—. Ahora esa anotación no puede tumbar la respuesta. El segundo: el sello "
 "se usaba tal como llegaba del teléfono, sin normalizar. Ahora se fuerza a texto y se recorta. "
 "Ninguno de los dos se vio al escribir el código; salieron al releerlo buscando fallos.")}

<p style="font-size:9pt;color:#5C6B68">Verificado con 27 comprobaciones en el módulo aislado y
8 más contra la base real, incluida la única que de verdad zanja el asunto: dos reservas
simultáneas, pasa exactamente una. Desplegado en producción el 5 de agosto.</p>

{nota("Lo que sigue abierto",
 "La versión <b>web</b> de la billetera no manda el sello al transferir tokens. Su código no "
 "está en el repositorio al que se tiene acceso, así que no se pudo corregir. Mientras siga "
 "así, el riesgo de doble envío existe de verdad para quien use la web. La aplicación móvil "
 "sí está protegida. Se necesita acceso a ese repositorio para cerrarlo.", "riesgo")}

<div class="salto"></div>
<h2>4 · El riesgo mayor: la clave de siete caracteres</h2>

<p>La llave privada y la frase de recuperación de cada usuario son <strong>lo único que
permite mover sus fondos</strong>. No hay otra copia en ningún lado. Ambas se guardan cifradas
en la base de datos, y la clave que las cifraba tenía <strong>siete caracteres</strong>.</p>

<figure>{CUSTODIA}</figure>

<p>Siete caracteres se rompen por fuerza bruta en un rato con una tarjeta gráfica cualquiera.
Es decir: quien consiguiera una copia de la base de datos podía <strong>vaciar todas las
cuentas</strong>. No hacía falta entrar al servidor ni conocer ninguna contraseña de usuario;
bastaba con la copia y tiempo de cómputo barato.</p>

<h3>Por qué no se cambia de golpe</h3>
<p>Cambiar la clave y recifrar todo en un solo paso tiene dos formas de salir mal, y las dos
son irreversibles: si el recifrado se corta a la mitad, la mitad de los registros queda en una
clave y la aplicación configurada con la otra —esos usuarios pierden el acceso a sus fondos—;
y si alguien se registra mientras corre, su cuenta nace con una clave y se lee con otra. Por
eso fue en tres etapas.</p>

<figure>{MIGRACION}</figure>

<h3>El paso que de verdad cerró el agujero</h3>
<p>Antes de sobrescribir cada registro, la migración guardaba el cifrado original como
respaldo. Esa fue la decisión correcta —era la vuelta atrás— pero tiene una consecuencia que
es fácil pasar por alto: <strong>ese respaldo está cifrado con la clave de siete caracteres y
contiene exactamente las mismas llaves privadas</strong>. Mientras existiera, una copia de la
base seguía valiendo lo mismo que antes. Recifrar, por sí solo, no arreglaba nada. Borrar los
respaldos fue lo que cerró el riesgo, y se hizo comprobando registro por registro que el valor
nuevo descifrara correctamente antes de eliminar el viejo.</p>

<h3>El resultado, paso por paso</h3>
{tabla(["Paso", "Resultado"], [
  ["Verificación previa", "402 llaves y 402 frases legibles con la clave vieja"],
  ["Simulacro", "804 campos a recifrar, 0 fallos"],
  ["Migración", "804 migrados, 0 fallos, 0 restauraciones"],
  ["<b>Comparación</b>", "<b>804 de 804 descifran al MISMO texto que antes</b>"],
  ["Limpieza de respaldos", "804 borrados, 0 conservados"],
  ["Retirada de la clave vieja", "Desplegada y verificada"],
  ["Verificación final", "402 cuentas legibles solo con la clave nueva"],
])}

{nota("Por qué la comparación es el único paso que prueba algo",
 "Que un registro se descifre con la clave nueva y dé algo con forma de llave privada "
 "<b>no prueba que dé lo mismo que antes</b>: una llave distinta también tiene forma de llave, "
 "y llevaría a una cuenta que no es la del usuario. Mientras el respaldo seguía en su sitio se "
 "pudo comprobar de verdad —descifrar el original con la clave vieja, el actual con la nueva, y "
 "compararlos carácter por carácter—. Los 804 coinciden.", "bien")}

{nota("Dos campos que ya estaban rotos antes",
 "De los 806 campos cifrados, 804 se migraron y 2 no: los de un mismo usuario. Están rotos "
 "<b>desde antes</b> de todo esto —no se descifraban ni con la clave original—, así que la "
 "migración no los tocó ni intentó arreglarlos. Es un problema anterior e independiente. "
 "Conviene revisar si esa dirección tiene saldo en la cadena y, si lo tiene, tratarlo aparte.")}

<div class="salto"></div>
<h2>5 · La verificación de identidad dentro de la app</h2>

<p>Es la conexión entre Veta Wallet y Genesis ID, y ocurre entera dentro de la aplicación
salvo el último paso.</p>

<figure>{ALTA}</figure>

<h3>Los pasos, y qué se resolvió en cada uno</h3>
{tabla(["Paso", "Qué hace la app", "El problema que resuelve"], [
  ["<b>Datos</b>", "Nombre, fecha de nacimiento y país. El país se elige de una lista de 249 por su nombre, con búsqueda que no distingue tildes",
   "Antes pedía el código del país. «HND» no le dice nada a nadie"],
  ["<b>Perfil</b>", "Teléfono, dirección, ocupación, origen de los fondos, propósito de la cuenta, volumen esperado y si tiene cargo público",
   "Es lo único contra lo que se puede comparar un movimiento si algún día salta una alerta"],
  ["<b>Documento</b>", "Fotografía de las <b>dos caras</b>. La app lee el reverso con reconocimiento de texto y comprueba la aritmética del estándar internacional",
   "Antes había que teclear a mano una línea de signos imposible de escribir sin equivocarse"],
  ["<b>Rostro</b>", "Una secuencia de gestos que sortea el servidor, con guía animada, cuenta atrás y captura automática",
   "Impide que una fotografía impresa o un vídeo grabado pasen por una persona viva"],
  ["<b>Decisión</b>", "Nada: la toma un operador dentro de Genesis ID",
   "Ninguna aplicación puede aprobarse a sí misma"],
])}

<h3>Tres detalles que costaron trabajo y explican mucho</h3>
<ul>
<li><strong>Los nombres cortados.</strong> En las credenciales de Honduras el reverso trunca
el nombre a un ancho fijo: «JOSE» aparece como «JOS». No es un error de lectura, es cómo está
impreso el documento —se verificó en varias credenciales distintas—. La app pide también el
anverso, donde el nombre sí está completo, y usa esa cara para confirmar.</li>
<li><strong>Los gestos imposibles.</strong> «Cerrá los ojos y luego tocá el botón» no se puede
hacer. Ni girar la cabeza mientras se mira la pantalla. Los gestos se rediseñaron con captura
automática, aviso por vibración y una tolerancia medida sobre intentos reales.</li>
<li><strong>Las fotografías que no llegaban.</strong> Bajar la calidad de una imagen no la hace
más pequeña de forma proporcional; hay que <em>redimensionarla</em>. Ocho fotogramas sin
redimensionar superaban el límite del servidor y la verificación moría con un error que en el
teléfono se veía como «no se pudo enviar la foto», sin más explicación.</li>
</ul>

<p>El detalle completo de qué comprueba Genesis ID con cada uno de esos datos está en el
documento 4.</p>

<h2>6 · Lo que protege al usuario dentro de la app</h2>

{tabla(["Protección", "Cómo funciona"], [
  ["<b>Bloqueo de la app</b>", "Se puede exigir huella, rostro del teléfono o clave para abrirla"],
  ["<b>Clave antes de los secretos</b>", "Ver la frase de recuperación o la llave privada pide la contraseña de la cuenta. Antes bastaba con tener el teléfono desbloqueado"],
  ["<b>Sesiones activas</b>", "El usuario ve desde dónde está abierta su cuenta y puede cerrarlas"],
  ["<b>Baja de cuenta</b>", "Pantalla propia para darse de baja, con lo que eso implica explicado antes"],
  ["<b>Aviso de respaldo</b>", "La app insiste, sin bloquear, en que guarde su frase de recuperación"],
  ["<b>Modo observador</b>", "Seguir una dirección sin tener sus llaves, para consultar sin exponer nada"],
  ["<b>Red de contención</b>", "Un fallo inesperado muestra una pantalla de disculpa en vez de cerrarse de golpe"],
])}

<h3>La tarjeta</h3>
<p>La aplicación incluye el circuito completo de tarjeta: solicitud, fondeo desde la billetera,
consulta de límites y gasto acumulado, congelar y descongelar, cambio de PIN, ver el número
completo, disputas, reemisión y cancelación. Se comprobó que el servidor responde a estas
rutas y que <strong>exige sesión</strong> en todas ellas.</p>

<h2>7 · Estado de entrega</h2>

{tabla(["Qué", "Estado"], [
  ["Aplicación Android", "Versión 1.32.0, entrega 68. Instalable y probada en teléfono real"],
  ["Servidor", "Desplegado. Último despliegue el 5 de agosto"],
  ["Conexión con Genesis ID", "<b>Verificada en producción:</b> las rutas responden y exigen sesión"],
  ["Envíos protegidos contra duplicado", "En producción"],
  ["Claves de usuario", "Migradas a clave fuerte y verificadas"],
  ["Textos legales", "Redactados: política de privacidad y términos"],
  ["Publicación en tiendas", "<b>Pendiente</b>"],
])}

{nota("Antes de publicar en las tiendas",
 "Google y Apple exigen que la política de privacidad y los términos estén accesibles en una "
 "<b>dirección pública y estable</b>, sin necesidad de iniciar sesión. Los textos están "
 "redactados, pero al preparar este documento no respondieron en las direcciones probadas. "
 "Hay que confirmar dónde quedan publicados y que abran sin cuenta — es un requisito que "
 "bloquea la publicación por sí solo.")}

<div class="salto"></div>
<h2>8 · Qué falta</h2>

<h3>Depende de la Dirección</h3>
{tabla(["Qué", "Por qué importa"], [
  ["Acceso al repositorio de la billetera <b>web</b>",
   "Es lo único que impide cerrar el riesgo de doble envío en la versión web"],
  ["Confirmar dónde se publican los textos legales",
   "Sin una dirección pública y estable, las tiendas rechazan la aplicación"],
  ["Decidir si se publica en tiendas ahora o tras probar el alta en campo",
   "El flujo de verificación conviene rodarlo con usuarios reales antes de exponerlo a escala"],
])}

<h3>Trabajo técnico pendiente</h3>
<ul>
<li><strong>Revisar los dos campos rotos de antes</strong> y comprobar si esa dirección tiene
saldo en la cadena.</li>
<li><strong>Versión para iPhone.</strong> La aplicación está preparada —los permisos y las
declaraciones de privacidad de Apple ya están escritos— pero no se ha compilado ni enviado.</li>
<li><strong>Rodar el alta con usuarios reales</strong> antes de abrirla a escala: la lectura
de documentos varía mucho de un país a otro.</li>
</ul>

{nota("Cómo se obtuvo cada cifra de este documento",
 "Las cifras del código salen de contar el código. Las de producción, de llamar a los "
 "servidores reales: se comprobó una por una que las rutas de envío, de tarjeta y de Genesis ID "
 "existen y exigen sesión. Las de la migración de claves salen del informe que la propia "
 "migración dejó al ejecutarse, incluida la comparación de los 804 campos.", "bien")}

<div class="pie-doc">Orden Global · Veta Wallet · {FECHA} · Documento 3 de 4.
El documento 2 detalla la cadena; el 4, Genesis ID.</div>
'''

pathlib.Path(__file__).parent.parent.joinpath("03-Veta-Wallet.html").write_text(
    documento("Orden Global · Veta Wallet", "recursos/estilo.css", cuerpo), encoding="utf-8")
print("03 escrito")
