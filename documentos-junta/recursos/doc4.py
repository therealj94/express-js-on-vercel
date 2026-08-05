# -*- coding: utf-8 -*-
"""Documento 4 · Genesis ID.

Las cifras de estado salen de consultar el panel de cumplimiento en producción
la noche del 5 de agosto de 2026. Las del código, de contar y ejecutar el
código.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from piezas import *

FECHA = "5 de agosto de 2026"

# ── Diagrama 1: la puerta única ─────────────────────────────────────────────
PUERTA = f'''<svg viewBox="0 0 560 226" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">LA ÚNICA PUERTA A «VERIFICADA»</text>

  {caja(0, 26, 140, 40, "Veta Wallet", "", SUAVE, "#fff", True)}
  {caja(0, 74, 140, 40, "MyTokenPay", "", SUAVE, "#fff", True)}
  {caja(0, 122, 140, 40, "ordenscan", "", SUAVE, "#fff", True)}

  {caja(190, 62, 150, 64, "GENESIS ID", "recibe, comprueba, guarda", ORO, "#FBF8F1")}

  {"".join(f'<line x1="142" y1="{46 + i*48}" x2="188" y2="{80 + i*8}" stroke="{SUAVE}" stroke-width="1.1" marker-end="url(#punta)"/>' for i in range(3))}

  <rect x="380" y="26" width="180" height="60" rx="6" fill="#FCF3F2" stroke="{GRAVE}" stroke-width="1.3"/>
  <text x="470" y="48" text-anchor="middle" font-size="10" font-family="Helvetica" font-weight="600" fill="{GRAVE}">Ninguna app aprueba</text>
  <text x="470" y="63" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">por válida que sea su clave,</text>
  <text x="470" y="74" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">no existe ninguna ruta que lo permita</text>

  <rect x="380" y="102" width="180" height="76" rx="6" fill="#F0F7F4" stroke="{OK}" stroke-width="1.3"/>
  <text x="470" y="122" text-anchor="middle" font-size="10" font-family="Helvetica" font-weight="600" fill="{OK}">Un operador identificado</text>
  <text x="470" y="137" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">con permiso para aprobar</text>
  <text x="470" y="149" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">sin bloqueos pendientes</text>
  <text x="470" y="161" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">o con justificación escrita</text>
  <text x="470" y="173" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">que queda firmada para siempre</text>

  <line x1="342" y1="80" x2="378" y2="60" stroke="{GRAVE}" stroke-width="1.2" marker-end="url(#punta)"/>
  <line x1="342" y1="106" x2="378" y2="130" stroke="{OK}" stroke-width="1.2" marker-end="url(#punta)"/>

  <text x="0" y="200" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{VERDE}">El identificador de identidad no existe antes de esa decisión.</text>
  <text x="0" y="216" font-size="8" font-family="Helvetica" fill="{SUAVE}">Antes, una dirección web pública sin contraseña emitía identidades verificadas a quien las pidiera.</text>
</svg>'''

# ── Diagrama 2: las piezas por dentro ───────────────────────────────────────
PIEZAS_SVG = f'''<svg viewBox="0 0 560 268" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">LAS PIEZAS DE GENESIS ID Y CÓMO SE APOYAN</text>

  <rect x="0" y="22" width="560" height="66" rx="7" fill="#FBF8F1" stroke="{ORO_CL}"/>
  <text x="10" y="38" font-size="8" font-family="Helvetica" fill="{ORO}" letter-spacing="1">PERSONAS · KYC</text>
  {caja(10, 44, 128, 36, "Documento", "MRZ y aritmética", VERDE2, "#fff", True)}
  {caja(148, 44, 128, 36, "Rostro", "cotejo con el documento", VERDE2, "#fff", True)}
  {caja(286, 44, 128, 36, "Prueba de vida", "gestos al azar", VERDE2, "#fff", True)}
  {caja(424, 44, 126, 36, "Perfil", "los datos del AML", VERDE2, "#fff", True)}

  <rect x="0" y="98" width="274" height="66" rx="7" fill="#F4F7F6" stroke="{LINEA}"/>
  <text x="10" y="114" font-size="8" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1">EMPRESAS · KYB</text>
  {caja(10, 120, 122, 36, "Documentación", "seis piezas exigidas", VERDE2, "#fff", True)}
  {caja(142, 120, 122, 36, "Beneficiarios", "quién está detrás", VERDE2, "#fff", True)}

  <rect x="286" y="98" width="274" height="66" rx="7" fill="#F4F7F6" stroke="{LINEA}"/>
  <text x="296" y="114" font-size="8" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1">CUMPLIMIENTO · AML</text>
  {caja(296, 120, 122, 36, "Tamizado", "listas de sanciones", VERDE2, "#fff", True)}
  {caja(428, 120, 122, 36, "Monitoreo", "reglas sobre movimientos", VERDE2, "#fff", True)}

  <rect x="0" y="174" width="560" height="60" rx="7" fill="#F4F7F6" stroke="{LINEA}"/>
  <text x="10" y="190" font-size="8" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1">CIMIENTOS</text>
  {caja(10, 196, 128, 32, "Bitácora encadenada", "", ORO, "#FBF8F1", True)}
  {caja(148, 196, 128, 32, "Operadores y roles", "", VERDE2, "#fff", True)}
  {caja(286, 196, 128, 32, "Claves de cada app", "", VERDE2, "#fff", True)}
  {caja(424, 196, 126, 32, "Sesión única", "", VERDE2, "#fff", True)}

  <text x="0" y="252" font-size="8" font-family="Helvetica" fill="{SUAVE}">Todo lo de arriba escribe en la bitácora, y nada de arriba puede aprobar: la decisión vive fuera, en el panel de cumplimiento.</text>
  <text x="0" y="264" font-size="8" font-family="Helvetica" fill="{SUAVE}">Unas 8.100 líneas de código propio, con 117 pruebas automáticas que se ejecutan de una sola orden.</text>
</svg>'''

# ── Diagrama 3: el dígito de control ────────────────────────────────────────
DIGITO = f'''<svg viewBox="0 0 560 190" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">POR QUÉ NO SIRVE CAMBIAR UNA FECHA EN EL DOCUMENTO</text>

  <rect x="0" y="24" width="560" height="52" rx="6" fill="#F0F7F4" stroke="{OK}" stroke-width="1.2"/>
  <text x="12" y="42" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{OK}">El documento real</text>
  <text x="12" y="62" font-size="13" font-family="Courier New, monospace" fill="{VERDE}">…  9  0  0  4  1  5   <tspan fill="{OK}" font-weight="bold">2</tspan>  …</text>
  <text x="232" y="50" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">fecha de nacimiento</text>
  <text x="232" y="62" font-size="7.5" font-family="Helvetica" fill="{OK}">y su dígito de control: cuadra</text>

  <rect x="0" y="90" width="560" height="52" rx="6" fill="#FCF3F2" stroke="{GRAVE}" stroke-width="1.2"/>
  <text x="12" y="108" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{GRAVE}">Alguien cambia un dígito para aparentar otra edad</text>
  <text x="12" y="128" font-size="13" font-family="Courier New, monospace" fill="{VERDE}">…  9  0  0  4  1  <tspan fill="{GRAVE}" font-weight="bold">8</tspan>   <tspan fill="{GRAVE}" font-weight="bold">2</tspan>  …</text>
  <text x="232" y="116" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">el dígito de control ya no corresponde</text>
  <text x="232" y="128" font-size="7.5" font-family="Helvetica" font-weight="600" fill="{GRAVE}">se detecta al instante</text>

  <text x="0" y="164" font-size="8" font-family="Helvetica" fill="{SUAVE}">El estándar internacional cifra cada campo con su propio dígito de comprobación, y uno más que cubre a todos juntos.</text>
  <text x="0" y="178" font-size="8" font-family="Helvetica" fill="{SUAVE}">Genesis ID los recalcula TODOS, incluido el compuesto. Verificado contra los ejemplos oficiales del estándar.</text>
</svg>'''

# ── Diagrama 4: el reto de vivacidad ────────────────────────────────────────
VIVACIDAD = f'''<svg viewBox="0 0 560 200" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">CÓMO SE COMPRUEBA QUE HAY ALGUIEN DELANTE DE LA CÁMARA</text>

  {caja(0, 24, 132, 44, "1 · El servidor sortea", "la secuencia de gestos", ORO, "#FBF8F1", True)}
  {caja(144, 24, 132, 44, "2 · La manda al teléfono", "caduca en dos minutos", VERDE2, "#fff", True)}
  {caja(288, 24, 132, 44, "3 · La persona los hace", "con guía y cuenta atrás", VERDE2, "#fff", True)}
  {caja(432, 24, 128, 44, "4 · Se comprueba", "gesto a gesto, en orden", VERDE2, "#fff", True)}
  {"".join(f'<line x1="{132 + i*144}" y1="46" x2="{142 + i*144}" y2="46" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>' for i in range(3))}

  <rect x="0" y="86" width="274" height="102" rx="6" fill="#F0F7F4" stroke="{OK}" stroke-width="1"/>
  <text x="12" y="104" font-size="9" font-family="Helvetica" font-weight="600" fill="{OK}">Lo que sí detiene</text>
  <text x="12" y="122" font-size="8" font-family="Helvetica" fill="{SUAVE}">Una fotografía impresa.</text>
  <text x="12" y="136" font-size="8" font-family="Helvetica" fill="{SUAVE}">Una fotografía mostrada en otra pantalla.</text>
  <text x="12" y="150" font-size="8" font-family="Helvetica" fill="{SUAVE}">Un vídeo grabado de antemano.</text>
  <text x="12" y="164" font-size="8" font-family="Helvetica" fill="{SUAVE}">El mismo fotograma repetido.</text>
  <text x="12" y="178" font-size="8" font-family="Helvetica" fill="{SUAVE}">La postura que no cambia entre tomas.</text>

  <rect x="286" y="86" width="274" height="102" rx="6" fill="#FBF8F1" stroke="{ORO_CL}" stroke-width="1"/>
  <text x="298" y="104" font-size="9" font-family="Helvetica" font-weight="600" fill="{ORO}">Lo que NO detiene</text>
  <text x="298" y="122" font-size="8" font-family="Helvetica" fill="{SUAVE}">A quien genere vídeo en tiempo real con</text>
  <text x="298" y="134" font-size="8" font-family="Helvetica" fill="{SUAVE}">el rostro de la víctima y lo inyecte en</text>
  <text x="298" y="146" font-size="8" font-family="Helvetica" fill="{SUAVE}">la cámara. Contra eso hacen falta señales</text>
  <text x="298" y="158" font-size="8" font-family="Helvetica" fill="{SUAVE}">del propio aparato.</text>
  <text x="298" y="176" font-size="8" font-family="Helvetica" font-weight="600" fill="{ORO}">Por eso todo lo dudoso va a revisión humana.</text>
</svg>'''

# ── Diagrama 5: la bitácora encadenada ──────────────────────────────────────
BITACORA = f'''<svg viewBox="0 0 560 160" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">LA BITÁCORA: CADA ENTRADA SELLA A LA ANTERIOR</text>
  {"".join(
    caja(i * 116, 26, 100, 44, f"Entrada {i+1}", "sello anterior ✓", OK if i != 2 else GRAVE,
         "#fff" if i != 2 else "#FCF3F2", True)
    for i in range(5))}
  {"".join(f'<line x1="{100 + i*116}" y1="48" x2="{114 + i*116}" y2="48" stroke="{OK if i < 1 else GRAVE}" stroke-width="1.2" marker-end="url(#punta)"/>' for i in range(4))}
  <text x="232" y="86" text-anchor="middle" font-size="8" font-family="Helvetica" font-weight="600" fill="{GRAVE}">alguien altera esta</text>
  <rect x="0" y="100" width="560" height="52" rx="6" fill="#F4F7F6" stroke="{LINEA}"/>
  <text x="12" y="118" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{VERDE}">Alterar o borrar una entrada vieja rompe el sello de TODAS las posteriores, y el sistema señala exactamente dónde.</text>
  <text x="12" y="134" font-size="8" font-family="Helvetica" fill="{SUAVE}">No impide la manipulación a quien controle la base de datos —podría recalcular la cadena entera— pero sí la hace evidente.</text>
  <text x="12" y="147" font-size="8" font-family="Helvetica" fill="{SUAVE}">Para hacerla irreversible hay que publicar el último sello fuera del sistema: en la cadena 8532, que es lo natural aquí.</text>
</svg>'''

cuerpo = portada(
    "Genesis ID",
    "La identidad digital del ecosistema: quién es cada persona, qué empresa hay detrás de "
    "cada cuenta, y qué se comprueba antes de decir que sí. Cómo está construido, qué verifica "
    "de verdad y qué no puede afirmar.",
    "La identidad", FECHA, "4 de 4")

cuerpo += f'''
<h2>1 · De dónde viene esto</h2>

<p>Genesis ID <strong>ya existía de nombre</strong>. Lo que existía era una dirección web
abierta a internet <strong>sin ninguna credencial</strong>. Comprobado desde fuera, sin
contraseña, cualquiera podía:</p>

{tabla(["Lo que permitía la versión anterior", "Consecuencia"], [
  ["Volcar todas las personas registradas", "Nombre, documento y nacionalidad de cada una, al descubierto"],
  ["<b>Emitir una identidad verificada sin verificar nada</b>", "El sello de «persona comprobada» se regalaba a quien lo pidiera"],
  ["Inyectar un pasaporte a cualquier correo", "Nombre legal, número de documento y foto, a nombre de otro"],
  ["Borrar la base entera", "Con una sola llamada"],
])}

<p>Una de las aplicaciones del ecosistema llamaba a esa dirección <strong>directamente desde
el teléfono</strong>, así que cada identidad «verificada» del sistema lo estaba sin
comprobación alguna.</p>

{nota("Lo único bueno de aquello",
 "No había datos de nadie. Los pocos registros eran de demostración y el almacén era un "
 "archivo sobre un disco que se borraba en cada despliegue. Era un arma cargada, pero todavía "
 "no había nadie enfrente. Se rehízo entero antes de que lo hubiera.", "bien")}

<h2>2 · La idea que sostiene todo el diseño</h2>

<p style="font-size:13pt;color:#0A3436;font-weight:600;margin:14px 0">Ninguna identidad se
verifica sola.</p>

<figure>{PUERTA}</figure>

<p>El estado «verificada» tiene <strong>una sola puerta</strong>, y esa puerta exige tres
cosas a la vez: un operador identificado con permiso para aprobar; que no queden bloqueos
—documento válido, tamizado hecho contra listas realmente cargadas, biometría resuelta—; y si
el operador aprueba <em>a pesar</em> de un bloqueo, una justificación escrita que queda
marcada para siempre en el expediente y en la bitácora.</p>

<h3>Y la regla que evita el falso verde</h3>
<p>Un sistema que dice «sin coincidencias» cuando en realidad <strong>no tiene listas
cargadas</strong> es peor que uno que no comprueba nada: el equipo ve verde y cree estar
cumpliendo. Por eso las listas vienen <strong>vacías de fábrica</strong> y el motor distingue
«sin coincidencias» de «sin comprobar». Sin listas cargadas, nadie se aprueba sin una anulación
expresa y firmada.</p>

<p>Lo mismo con el rostro: sin proveedor configurado, el estado no es «correcto», es «sin
configurar» — y obliga a que una persona coteje la cara y responda por ello.</p>

<h2>3 · Cómo está construido</h2>

<figure>{PIEZAS_SVG}</figure>

{cifras(("117", "pruebas automáticas"), ("8.100", "líneas de código propio"),
        ("19.178", "fichas de sanciones"), ("249", "países reconocidos"))}

<h2>4 · El recorrido de una persona</h2>

<h3>Paso 1 · Los datos que declara</h3>
<p>Nombre completo, fecha de nacimiento y país de residencia. Nada de esto se cree: es lo que
después se contrasta contra el documento.</p>

<h3>Paso 2 · El perfil de cumplimiento</h3>
<p>Teléfono, dirección, ocupación, <strong>origen de los fondos</strong>, propósito de la
cuenta, volumen que espera mover y si ocupa o ha ocupado un cargo público.</p>

{nota("Por qué esto no es papeleo",
 "El origen de los fondos y la ocupación son <b>lo único contra lo que se puede comparar un "
 "movimiento</b> el día que salte una alerta. Sin ese perfil, una transferencia perfectamente "
 "normal —un aguinaldo, la venta de un carro— es indistinguible de una anómala, y termina "
 "bloqueando la cuenta de alguien que no hizo nada malo. Con el perfil declarado, se contrasta "
 "y se archiva sin molestar a nadie. Por eso <b>sin ocupación y sin origen de fondos la "
 "verificación no se puede aprobar</b>: es el estándar de cualquier revisión seria.")}

<h3>Paso 3 · El documento</h3>
<p>La persona fotografía <strong>las dos caras</strong>. La franja de signos del reverso —esa
línea de mayúsculas y símbolos que aparece en pasaportes y cédulas— sigue un estándar
internacional y no es decorativa: <strong>lleva su propia aritmética de comprobación</strong>.</p>

<figure>{DIGITO}</figure>

<p>Genesis ID recalcula todos los dígitos de control, incluido el que cubre a los demás. Se
verificó contra los ejemplos oficiales del estándar y contra manipulaciones deliberadas.
Además comprueba la vigencia, la edad mínima, el país emisor y la coherencia entre el nombre
declarado y el del documento.</p>

{nota("El detalle que descubrió la realidad hondureña",
 "En las credenciales de Honduras el reverso <b>trunca el nombre a un ancho fijo</b>: «JOSE» "
 "aparece impreso como «JOS». No es un error de lectura —se comprobó en varias credenciales "
 "distintas—, es cómo está hecho el documento. Un sistema rígido rechazaría a todos esos "
 "titulares por «el nombre no coincide». Por eso se pide también el anverso, donde el nombre "
 "está completo, y esa cara se usa para confirmar. Cuando el anverso confirma, la discrepancia "
 "del reverso deja de ser un bloqueo y pasa a ser una anotación.")}

<h3>Paso 4 · El rostro</h3>
<p>Dos comprobaciones distintas, y conviene no confundirlas:</p>
<ul>
<li><strong>Que la cara sea la del documento.</strong> Se compara el retrato en vivo con la
fotografía del documento. Medido: dos retratos distintos de la misma persona dan
<strong>100 %</strong>; dos personas diferentes, <strong>1 %</strong>. El umbral de aceptación
está en 88 %, muy lejos de ambos extremos.</li>
<li><strong>Que haya alguien vivo delante de la cámara.</strong> Es un problema distinto:
una fotografía del documento también «coincide» consigo misma.</li>
</ul>

<figure>{VIVACIDAD}</figure>

<p>La secuencia de gestos <strong>la sortea el servidor, no la aplicación</strong>. Si la
eligiera el teléfono, quien lo controle elegiría siempre la que ya tiene grabada. El reto
caduca a los dos minutos y sirve una sola vez.</p>

<h3>Paso 5 · La decisión</h3>
<p>La toma una persona, dentro del panel de cumplimiento, y queda firmada con su nombre.
Ninguna aplicación del ecosistema tiene forma de saltarse este paso: <strong>no existe la
ruta</strong>.</p>

<div class="salto"></div>
<h2>5 · El tamizado de sanciones</h2>

<p>Cada alta se coteja contra las listas de personas y entidades sancionadas. Hoy hay
<strong>19.178 fichas</strong> cargadas de la lista de la OFAC, la del Departamento del Tesoro
de Estados Unidos.</p>

<h3>Por qué comparar nombres es difícil</h3>
<p>Un sancionado no se registra con su nombre escrito exactamente como en la lista. La
comparación tolera:</p>
{tabla(["Variación", "Ejemplo"], [
  ["Orden distinto de los nombres", "«Pérez Gómez, Juan» frente a «Juan Gómez Pérez»"],
  ["Tildes y signos", "«Muñoz» frente a «Munoz»"],
  ["Errores de escritura", "una letra cambiada o de más"],
  ["Alias declarados", "los nombres alternativos que la propia lista registra"],
  ["Transliteraciones", "«Mohammed», «Muhammad», «Mohamed»"],
])}

<p>El resultado se ajusta por fecha de nacimiento cuando la ficha la trae.</p>

{nota("Un fallo de diseño que encontró una prueba",
 "Con el <b>nombre exacto</b> de un sancionado pero <b>otra fecha de nacimiento</b>, la "
 "coincidencia desaparecía por completo. Y usar una fecha falsa es justamente una de las formas "
 "de esquivar el tamizado. Ahora esa coincidencia <b>se mantiene visible para el analista</b> "
 "aunque deje de contar como coincidencia fuerte. Lo encontró una prueba automática, no una "
 "revisión manual.")}

<h3>Direcciones sancionadas</h3>
<p>Además de personas, las listas incluyen <strong>direcciones de criptomonedas</strong>. El
cotejo es exacto y es el control más directo de todo el ecosistema: se puede consultar
<strong>antes de firmar cada envío</strong> de Veta Wallet, para no mandar fondos a una
dirección de una lista.</p>

<h3>Jurisdicciones de riesgo</h3>
<p>Se mantienen además las listas del organismo internacional que evalúa a los países en
materia de blanqueo. Estado actual del sistema:</p>
{tabla(["Categoría", "Cuántos", "Qué implica"], [
  ["Alto riesgo", "3 países", "Coincidencia de jurisdicción de máxima severidad"],
  ["Bajo vigilancia", "22 países", "Riesgo elevado, requiere diligencia reforzada"],
])}
<p style="font-size:9pt;color:#5C6B68">Listas vigentes de la reunión plenaria del 19 de junio
de 2026. El sistema avisa solo cuando envejecen: ese organismo se reúne unas tres veces al año,
y una lista vieja da una tranquilidad falsa.</p>

<div class="salto"></div>
<h2>6 · El monitoreo de movimientos</h2>

<p>Las aplicaciones envían a Genesis ID los movimientos de cada persona verificada. Ocho
reglas los examinan:</p>

{tabla(["Regla", "Qué busca"], [
  ["Umbral por operación", "Un movimiento único por encima del límite de reporte"],
  ["Acumulado", "Muchos movimientos pequeños que juntos superan el límite"],
  ["Fraccionamiento", "Montos justo por debajo del umbral, repetidos — el patrón clásico de quien conoce el límite"],
  ["Velocidad", "Un ritmo de operaciones que no encaja con el perfil declarado"],
  ["Contraparte sancionada", "La otra punta del movimiento aparece en una lista"],
  ["Jurisdicción de riesgo", "Origen o destino en un país señalado"],
  ["Cuenta de paso", "Entra y sale casi lo mismo, casi de inmediato"],
  ["Cuenta nueva con volumen alto", "Movimiento grande en una cuenta recién abierta"],
])}

<p>Lo que salta abre un <strong>caso</strong> que un analista asigna, anota y cierra, y del que
se puede generar un informe. Los casos y sus notas quedan en la bitácora.</p>

{nota("Al usuario nunca se le dice que saltó una alerta",
 "Ni la aplicación ni el sistema se lo comunican. Saber que un movimiento disparó una regla le "
 "enseña exactamente cómo esquivarla la próxima vez, y en muchas jurisdicciones avisarle está "
 "<b>expresamente prohibido</b>. Es una decisión de diseño, no un olvido.")}

<h2>7 · Empresas: por qué se insiste en los beneficiarios</h2>

<p>Una empresa no se puede mirar a la cara. Una sociedad se constituye en un día y sirve
perfectamente de pantalla, así que <strong>verificar la empresa sin saber quién está detrás no
verifica nada</strong>.</p>

<p>Un negocio no se aprueba si:</p>
<ul>
<li>falta alguno de los <strong>seis documentos</strong> exigidos;</li>
<li>no hay beneficiarios declarados, o no cubren al menos el <strong>75 % de la propiedad</strong>;</li>
<li>alguien con <strong>25 % o más</strong> no tiene su propia identidad personal verificada;</li>
<li>un beneficiario tiene coincidencia fuerte en listas de sanciones;</li>
<li>el representante legal no está verificado.</li>
</ul>

<p>Si nadie llega al 25 %, hay que identificar a quien controle por otra vía o a la
administración. Es lo que exige la normativa, y el motor lo pide.</p>

<p>Se validan además los identificadores fiscales por su dígito verificador en España,
Guatemala, Argentina y Chile. Para los demás países solo se comprueba la forma, y
<strong>el resultado lo dice</strong>, para que nadie confunda «bien escrito» con «existe».</p>

<div class="salto"></div>
<h2>8 · Sesión única: un GID vale en las tres apps</h2>

<p>Una persona verificada en Veta Wallet no repite el trámite en MyTokenPay ni en ordenscan.
La aplicación que ya la autenticó pide un token a Genesis ID y cualquier otra lo valida. Si la
identidad se suspende, <strong>los tokens vivos dejan de valer en el acto</strong>.</p>

{nota("Un límite que conviene tener presente",
 "Es un modelo de <b>cliente de confianza</b>: Genesis ID comprueba que la cuenta esté atada a "
 "ese GID, pero no vuelve a autenticar a la persona — de eso responde la aplicación con su "
 "clave. Vale porque las tres apps son del mismo ecosistema y del mismo dueño. "
 "<b>No sería aceptable para aplicaciones de terceros</b>, y si algún día se abre a terceros "
 "hay que rehacer esta parte.")}

<h2>9 · La bitácora</h2>

<figure>{BITACORA}</figure>

<p>De la bitácora se omiten siempre las contraseñas, los tokens, las claves y las fotografías.
Es un registro que se lee, se exporta y se enseña a auditores externos: un descuido ahí
convierte el registro de seguridad en una filtración.</p>

<h2>10 · Las tres superficies, con credenciales que no se mezclan</h2>

{tabla(["Superficie", "Quién entra", "Qué puede"], [
  ["<b>Panel de cumplimiento</b>", "Operadores con usuario y contraseña",
   "Decidir sobre identidades, negocios y casos. Es la única que aprueba"],
  ["<b>Apps del ecosistema</b>", "Clave de servicio, una por aplicación",
   "Crear y consultar identidades. <b>Ninguna ruta aprueba nada</b>"],
  ["<b>Consulta pública de verificación</b>", "Clave de servicio limitada",
   "Preguntar si un identificador está verificado. Nada más"],
])}

<p>Cada aplicación tiene solo los permisos que necesita: el explorador público únicamente puede
preguntar si un identificador está verificado; no puede crear identidades ni leer datos
personales. El acceso al panel se bloquea 15 minutos tras cinco intentos fallidos.</p>

<h3>Los cuatro roles del panel</h3>
{tabla(["Rol", "Puede"], [
  ["Administrador", "Todo, incluidos los operadores y las claves de las aplicaciones"],
  ["Cumplimiento", "Decidir sobre identidades, negocios y casos"],
  ["Revisor", "Preparar y recomendar — <b>no</b> aprobar"],
  ["Auditor", "Leerlo todo, no tocar nada"],
])}

<h2>11 · Qué NO puede afirmar Genesis ID</h2>

<p>Esta sección importa más que la lista de funciones. Un sistema de cumplimiento que exagera
lo que comprueba es un riesgo, no una garantía.</p>

{tabla(["No puede afirmar", "Por qué", "Qué haría falta"], [
  ["Que el documento sea <b>auténtico</b>",
   "Que la aritmética cuadre prueba que está bien formado, no que lo emitiera un país",
   "Leer el chip sin contacto del documento y validar su firma contra el directorio internacional"],
  ["Que la prueba de vida sea <b>infalible</b>",
   "Detiene fotos, pantallas y vídeos grabados. No a quien inyecte vídeo generado en tiempo real",
   "Señales del propio teléfono; ninguna biblioteca del lado del servidor las sustituye"],
  ["Que un identificador fiscal <b>esté dado de alta</b>",
   "El dígito verificador solo prueba que está bien construido",
   "Consulta al registro de cada país"],
  ["Nada de lo anterior <b>sin proveedor configurado</b>",
   "Sin credenciales de reconocimiento facial el estado es «sin configurar», que no es «correcto»",
   "Que una persona coteje el rostro y firme la decisión"],
])}

<p>Por eso el resultado del rostro es una <strong>puntuación que queda en el expediente</strong>,
y todo lo que no llega al umbral cae en la cola de revisión de una persona. El sistema está
diseñado para <em>dudar en voz alta</em>, no para dar por bueno lo que no comprobó.</p>

<div class="salto"></div>
<h2>12 · Estado hoy, medido en producción</h2>

{tabla(["Comprobación", "Estado"], [
  ["Almacenamiento", "Base de datos permanente. <b>No efímera:</b> un despliegue ya no borra nada"],
  ["Listas de sanciones", "19.178 fichas cargadas, descargadas hoy"],
  ["Jurisdicciones de riesgo", "Vigentes al 19 de junio de 2026"],
  ["Reconocimiento facial", "Activo y verificado contra el proveedor real"],
  ["Sesión única", "Configurada"],
  ["Bitácora", "<b>Íntegra.</b> 201 entradas, cadena sin roturas"],
  ["Aplicaciones registradas", "3, cada una con sus propios permisos"],
  ["Pruebas automáticas", "117, todas en verde"],
])}

<h3>Las identidades registradas</h3>
{tabla(["", "Cuántas"], [
  ["Verificadas", "1"],
  ["<b>En revisión</b>", "<b>0</b>"],
  ["Rechazadas", "36"],
  ["Suspendidas", "0"],
])}

{nota("Qué son esas 36 rechazadas",
 "Son identidades <b>de prueba</b>, creadas durante la puesta en marcha para ejercitar el "
 "circuito completo, y rechazadas una por una con su motivo escrito. No corresponden a personas "
 "reales. La única verificada sí es real y recorrió el trámite entero: documento, rostro, "
 "prueba de vida y decisión de un operador. La cola de revisión está en cero, que es como debe "
 "estar cuando no hay trabajo pendiente.")}

<h2>13 · Qué falta</h2>

<h3>Depende de la Dirección</h3>
{tabla(["Qué", "Por qué importa"], [
  ["<b>Cambiar la contraseña del administrador</b>",
   "Sigue siendo la inicial. Es la llave del panel que aprueba identidades"],
  ["Crear más operadores con sus roles",
   "Hoy hay <b>un solo operador</b>. Quien aprueba no debería ser también quien administra"],
  ["Decidir si MyTokenPay entra al ecosistema ahora",
   "Su clave está emitida y sin usar"],
])}

<h3>Trabajo técnico</h3>
<ul>
<li><strong>Refrescar las listas de sanciones cada mes.</strong> El sistema avisa solo a los
30 días, pero la descarga hay que hacerla.</li>
<li><strong>Publicar el sello de la bitácora en la cadena 8532.</strong> Es lo que la vuelve
irreversible: hoy es evidente que alguien la alteró, pero quien controle la base podría
recalcularla entera. Conviene hacerlo cuando la cadena tenga más de un validador.</li>
<li><strong>Mover los retos de prueba de vida a la base de datos</strong> si algún día Genesis
ID corre en más de una máquina. Hoy viven en memoria, que es correcto con una sola.</li>
<li><strong>Rodar el alta con más personas reales.</strong> La lectura de documentos varía
mucho de un país a otro, y cada país trae su propia sorpresa — el nombre truncado de las
credenciales hondureñas es el ejemplo.</li>
</ul>

{nota("Cómo se obtuvo cada cifra de este documento",
 "El estado de producción —listas, bitácora, identidades, casos, aplicaciones y proveedor de "
 "reconocimiento facial— se consultó <b>al panel de cumplimiento en vivo</b> la noche del 5 de "
 "agosto. Las 117 pruebas se ejecutaron al preparar este documento y pasaron todas. Los "
 "porcentajes de cotejo facial se midieron con retratos reales. Lo que no está comprobado está "
 "en la sección 11, dicho con todas las letras.", "bien")}

<div class="pie-doc">Orden Global · Genesis ID · {FECHA} · Documento 4 de 4.
El documento 1 resume el ecosistema; el 2 detalla la cadena y el 3, Veta Wallet.</div>
'''

pathlib.Path(__file__).parent.parent.joinpath("04-Genesis-ID.html").write_text(
    documento("Orden Global · Genesis ID", "recursos/estilo.css", cuerpo), encoding="utf-8")
print("04 escrito")
