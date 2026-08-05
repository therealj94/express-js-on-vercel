# -*- coding: utf-8 -*-
"""Documento 2 · La cadena Orden Global.

Todas las cifras salen de mediciones hechas contra la cadena en vivo la noche
del 5 de agosto de 2026, salvo las alturas de los nodos, que llevan su propia
hora indicada.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from piezas import *

FECHA = "5 de agosto de 2026"

# ── Diagrama 1: la red tal como está montada ────────────────────────────────
TOPOLOGIA = f'''<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">LA RED, TAL COMO ESTÁ MONTADA HOY</text>

  {caja(150, 22, 160, 34, "ordenglobal-rpc.com", "puerta pública HTTPS", VERDE)}
  {caja(370, 22, 170, 34, "ordenscan.com", "explorador público", VERDE)}
  {caja(150, 80, 160, 32, "Balanceador OrdenKapital", "", SUAVE)}

  <rect x="14" y="132" width="336" height="148" rx="8" fill="#F4F7F6" stroke="{LINEA}" stroke-width="1"/>
  <text x="24" y="148" font-size="8" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1">REGIÓN us-east-1 · VIRGINIA</text>

  <rect x="364" y="132" width="182" height="148" rx="8" fill="#F4F7F6" stroke="{LINEA}" stroke-width="1"/>
  <text x="374" y="148" font-size="8" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1">REGIÓN us-east-2 · OHIO</text>

  {caja(28, 160, 152, 46, "node1 · VALIDADOR", "23.23.205.33 · produce bloques", ORO, "#FBF8F1")}
  {caja(190, 160, 148, 46, "node3", "54.205.125.99", VERDE2)}
  {caja(28, 222, 152, 46, "node5", "18.211.40.149", VERDE2)}
  {caja(190, 222, 148, 46, "node6", "3.224.143.231", VERDE2)}
  {caja(378, 160, 154, 46, "node2", "18.190.14.28", VERDE2)}
  {caja(378, 222, 154, 46, "node4", "18.226.95.184", VERDE2)}

  <line x1="230" y1="56" x2="230" y2="78" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <line x1="230" y1="112" x2="150" y2="158" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <path d="M 455 56 L 455 100 L 330 100 L 250 100" fill="none" stroke="{VERDE2}" stroke-width="1.1" stroke-dasharray="4 3" marker-end="url(#punta)"/>

  <line x1="180" y1="183" x2="190" y2="183" stroke="{SUAVE}" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="104" y1="206" x2="104" y2="222" stroke="{SUAVE}" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="264" y1="206" x2="264" y2="222" stroke="{SUAVE}" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="180" y1="245" x2="190" y2="245" stroke="{SUAVE}" stroke-width="1" stroke-dasharray="3 2"/>
  <path d="M 338 176 L 358 176 L 358 176 L 378 176" stroke="{SUAVE}" stroke-width="1" stroke-dasharray="3 2" fill="none"/>
  <path d="M 338 252 L 358 252 L 358 238 L 378 238" stroke="{SUAVE}" stroke-width="1" stroke-dasharray="3 2" fill="none"/>

  <text x="14" y="296" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">Línea continua: tráfico público.  Línea punteada gris: red entre nodos (p2p).  Línea punteada verde: lectura del explorador.</text>
</svg>'''

# ── Diagrama 2: la vida de un bloque ────────────────────────────────────────
VIDA_BLOQUE = f'''<svg viewBox="0 0 560 150" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">CÓMO NACE UN BLOQUE, CADA 15,3 SEGUNDOS</text>
  {caja(0, 28, 96, 48, "1 · Alguien firma", "una transacción", VERDE2, "#fff", True)}
  {caja(116, 28, 96, 48, "2 · Sala de espera", "la mempool", VERDE2, "#fff", True)}
  {caja(232, 28, 96, 48, "3 · El validador", "arma el bloque", ORO, "#FBF8F1", True)}
  {caja(348, 28, 96, 48, "4 · Se reparte", "a todos los nodos", VERDE2, "#fff", True)}
  {caja(464, 28, 96, 48, "5 · Se indexa", "ordenscan lo muestra", VERDE2, "#fff", True)}
  <line x1="98" y1="52" x2="114" y2="52" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <line x1="214" y1="52" x2="230" y2="52" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <line x1="330" y1="52" x2="346" y2="52" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <line x1="446" y1="52" x2="462" y2="52" stroke="{ORO}" stroke-width="1.2" marker-end="url(#punta)"/>
  <rect x="232" y="94" width="328" height="44" rx="6" fill="#FCF3F2" stroke="{GRAVE}" stroke-width="1"/>
  <text x="244" y="110" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{GRAVE}">El paso 3 lo hace UN SOLO servidor.</text>
  <text x="244" y="124" font-size="8" font-family="Helvetica" fill="{SUAVE}">Si ese servidor se detiene, los pasos 4 y 5 no tienen qué repartir ni qué mostrar.</text>
  <line x1="280" y1="78" x2="280" y2="92" stroke="{GRAVE}" stroke-width="1.1"/>
</svg>'''

# ── Diagrama 3: el bucle del syncer ─────────────────────────────────────────
SYNCER = f'''<svg viewBox="0 0 560 230" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="0" y="10" font-size="9" font-family="Helvetica" fill="{SUAVE}">POR QUÉ LOS NODOS SE QUEDABAN TRABADOS</text>

  <rect x="20" y="26" width="290" height="182" rx="8" fill="#F4F7F6" stroke="{LINEA}"/>
  <text x="32" y="44" font-size="8" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1">EL BUCLE DEL SINCRONIZADOR</text>

  {caja(46, 58, 238, 44, "Espera un aviso", "y se queda dormido hasta que llegue", VERDE2)}
  {caja(46, 132, 238, 44, "Trae miles de bloques", "tarda segundos · nadie escucha avisos", ORO, "#FBF8F1")}

  <path d="M 165 102 L 165 130" stroke="{ORO}" stroke-width="1.3" marker-end="url(#punta)"/>
  <path d="M 284 154 L 306 154 L 306 80 L 286 80" fill="none" stroke="{ORO}" stroke-width="1.3" marker-end="url(#punta)"/>

  {caja(346, 58, 200, 44, "Avisos de otros nodos", "«tengo bloques nuevos»", VERDE2)}
  <rect x="346" y="132" width="200" height="44" rx="6" fill="#FCF3F2" stroke="{GRAVE}" stroke-width="1.3"/>
  <text x="446" y="152" text-anchor="middle" font-size="10" font-family="Helvetica" font-weight="600" fill="{GRAVE}">Se tiran a la basura</text>
  <text x="446" y="165" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">si llegan mientras está ocupado</text>

  <path d="M 446 102 L 446 130" stroke="{GRAVE}" stroke-width="1.3" marker-end="url(#punta)"/>
  <path d="M 344 80 L 288 80" stroke="{VERDE2}" stroke-width="1.2" marker-end="url(#punta)"/>
  <text x="316" y="74" text-anchor="middle" font-size="7" font-family="Helvetica" fill="{VERDE2}">despierta</text>

  <text x="20" y="224" font-size="8" font-family="Helvetica" fill="{GRAVE}">Resultado: si el último aviso se pierde y no llega otro, el nodo duerme para siempre. Sin error, sin alarma, con los vecinos conectados.</text>
</svg>'''

# ── Diagrama 4: uno contra varios validadores ───────────────────────────────
# Los cinco validadores van en pentágono, no en fila: en fila las líneas de la
# malla se superponen unas con otras y atraviesan los círculos del medio.
import math as _m
_ANI = [(-90 + i * 72) * _m.pi / 180 for i in range(5)]
_PENT = [(425 + 46 * _m.cos(a), 82 + 46 * _m.sin(a)) for a in _ANI]
_MALLA = "".join(
    f'<line x1="{_PENT[a][0]:.1f}" y1="{_PENT[a][1]:.1f}" x2="{_PENT[b][0]:.1f}" '
    f'y2="{_PENT[b][1]:.1f}" stroke="{OK}" stroke-width="0.8" opacity="0.45"/>'
    for a in range(5) for b in range(a + 1, 5))
_NODOS_OK = "".join(
    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="14" fill="#fff" stroke="{OK}" stroke-width="1.4"/>'
    f'<text x="{x:.1f}" y="{y + 3:.1f}" text-anchor="middle" font-size="8" '
    f'font-family="Helvetica" font-weight="600" fill="{OK}">n{i + 1}</text>'
    for i, (x, y) in enumerate(_PENT))

VALIDADORES = f'''<svg viewBox="0 0 560 206" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <rect x="0" y="18" width="270" height="182" rx="8" fill="#FCF3F2" stroke="{GRAVE}" stroke-width="1"/>
  <text x="14" y="12" font-size="9" font-family="Helvetica" font-weight="600" fill="{GRAVE}">HOY · UN VALIDADOR</text>
  {"".join(f'<line x1="{34 + i*50}" y1="120" x2="135" y2="80" stroke="{SUAVE}" stroke-width="0.8" stroke-dasharray="2 2"/>' for i in range(5))}
  {caja(87, 38, 96, 42, "node1", "produce todo", GRAVE, "#fff", True)}
  {"".join(f'<circle cx="{34 + i*50}" cy="133" r="13" fill="#fff" stroke="{SUAVE}" stroke-width="1"/><text x="{34 + i*50}" y="136" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">n{i+2}</text>' for i in range(5))}
  <text x="135" y="168" text-anchor="middle" font-size="8" font-family="Helvetica" fill="{SUAVE}">los otros cinco solo copian</text>
  <text x="135" y="186" text-anchor="middle" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{GRAVE}">si node1 cae, la cadena se detiene</text>

  <rect x="290" y="18" width="270" height="182" rx="8" fill="#F0F7F4" stroke="{OK}" stroke-width="1"/>
  <text x="304" y="12" font-size="9" font-family="Helvetica" font-weight="600" fill="{OK}">DESPUÉS · VARIOS VALIDADORES</text>
  {_MALLA}{_NODOS_OK}
  <text x="425" y="152" text-anchor="middle" font-size="8" font-family="Helvetica" fill="{SUAVE}">se turnan para producir y se controlan entre sí</text>
  <text x="425" y="170" text-anchor="middle" font-size="8.5" font-family="Helvetica" font-weight="600" fill="{OK}">la cadena sigue aunque caiga uno</text>
  <text x="425" y="188" text-anchor="middle" font-size="8" font-family="Helvetica" fill="{SUAVE}">con cinco, tolera uno caído y aun así exige acuerdo de cuatro</text>
</svg>'''

PROGRESO = barra_progreso([
    ("node2", 61.0, "2.523.115 · 61,0 %"),
    ("node3", 57.5, "2.379.256 · 57,5 %"),
    ("node4", 61.0, "2.522.836 · 61,0 %"),
    ("node5", 61.0, "2.522.785 · 61,0 %"),
    ("node6", 61.0, "2.522.865 · 61,0 %"),
])

cuerpo = portada(
    "La cadena<br>Orden Global",
    "Cómo funciona la cadena 8532, cómo está montada, qué se reparó, en qué estado "
    "se encuentra cada nodo y cuál es el único riesgo que no se puede cerrar sin una "
    "decisión de la Junta.",
    "La infraestructura", FECHA, "2 de 4")

cuerpo += f'''
<h2>1 · Qué es la cadena Orden Global</h2>

<p>Es un <strong>libro de contabilidad compartido</strong>. Cada quince segundos se cierra
una página —un <em>bloque</em>— con todo lo que ocurrió en ese lapso, y esa página queda
sellada con la anterior. Cambiar algo escrito hace un mes obligaría a reescribir todas las
páginas posteriores en todos los servidores a la vez. Por eso lo que queda anotado no se
puede alterar en silencio.</p>

<p>La cadena de Orden Global es <strong>propia</strong>, no alquilada: corre en servidores
de la organización y sus reglas las fija la organización. Es compatible con Ethereum, lo que
significa que cualquier billetera, contrato o herramienta del mundo Ethereum funciona sobre
ella sin modificaciones.</p>

{tabla(["Dato", "Valor", "Cómo se comprobó"], [
  ["Identificador de la red", "8532", "<code>eth_chainId</code> → <code>0x2154</code>"],
  ["Moneda propia", "ORIGEN · 18 decimales", "declarada en la red y en el registro público"],
  ["Un bloque cada", "15,3 segundos", "medido sobre 51.200 bloques reales"],
  ["Altura de la cadena", "4.135.164 bloques", "<code>eth_blockNumber</code>, 23:51 UTC"],
  ["Capacidad por bloque", "10.000.000 de gas", "leído del último bloque"],
  ["Coste de transacción", "0", "<code>eth_gasPrice</code> → <code>0x0</code>"],
  ["Consenso", "IBFT con garantía en depósito", "contrato del sistema activo en la cadena"],
  ["Servidores", "6 nodos · 2 regiones de AWS", "inventario verificado en la nube"],
])}

<figure class="mediana">{TOPOLOGIA}
<figcaption>Todo el tráfico público entra por un solo dominio, pasa por el balanceador y
termina en node1. Los otros cinco todavía no reciben tráfico.</figcaption></figure>

{nota("Sobre el coste de transacción en cero",
 "Hoy usar la cadena no cuesta nada: la comisión está en cero. Eso hace la experiencia "
 "inmejorable para el usuario, y es viable mientras el único validador sea propio. Cuando "
 "haya validadores de terceros habrá que decidir si se les remunera de algún modo, porque "
 "sin comisión ni recompensa nadie externo tiene motivo económico para sostener un nodo.")}

<h2>2 · Cómo funciona, paso a paso</h2>

<figure>{VIDA_BLOQUE}</figure>

<h3>Los cinco pasos</h3>
<ol>
<li><strong>Alguien firma una transacción.</strong> Puede ser un envío de ORIGEN desde Veta
Wallet, un cobro en MyTokenPay o la llamada a un contrato. La firma se hace con la llave
privada del titular y prueba matemáticamente que la orden salió de él.</li>
<li><strong>La transacción entra en la sala de espera</strong> (la <em>mempool</em>) de cada
nodo que la recibe, y de ahí se propaga a los demás.</li>
<li><strong>El validador arma el bloque.</strong> Toma las transacciones pendientes,
comprueba que cada una sea válida —que quien firma tenga saldo, que no repita una orden ya
ejecutada—, las ordena y cierra el bloque enlazándolo con el anterior.</li>
<li><strong>El bloque se reparte</strong> por la red entre nodos. Cada uno lo verifica por su
cuenta antes de aceptarlo: nadie confía, todos comprueban.</li>
<li><strong>Se indexa.</strong> El explorador <code>ordenscan.com</code> lee los bloques y
los guarda en una base de datos consultable, para que cualquiera pueda buscar una
transacción por su código, una dirección o un número de bloque.</li>
</ol>

<h3>Qué es un validador y qué es la garantía</h3>
<p>Un <strong>validador</strong> es el nodo con permiso para escribir páginas nuevas del
libro. No cualquiera puede serlo: para entrar hay que <strong>depositar ORIGEN en garantía</strong>
en un contrato del sistema, y ese depósito queda bloqueado mientras se ejerza el cargo. Si el
validador se porta mal, la garantía está ahí para responder. Ese depósito es lo que hace
costoso atacar la red: para manipular la cadena habría que controlar la mayoría de los
validadores, y cada uno cuesta su garantía.</p>

<p>Los otros nodos —los que solo copian— <strong>no son decorativos</strong>. Cada uno guarda
una copia completa e independiente del libro, y verifica cada bloque que recibe. Son los que
permiten que la cadena se lea aunque el validador esté ocupado, y son los candidatos naturales
a convertirse en validadores cuando terminen de ponerse al día.</p>

<div class="salto"></div>
<h2>3 · El riesgo crítico: un solo validador</h2>

<p>Esto no es una sospecha ni una estimación. Se consultó directamente el contrato del
sistema que lleva el registro de validadores, y devolvió lo siguiente:</p>

{tabla(["Pregunta al contrato", "Respuesta"], [
  ["¿Quién es el validador número 1?", "<code>0xf777de57…46fd4d0</code>"],
  ["¿Quién es el validador número 2?", "<b>No existe.</b> La consulta falla: la lista tiene un solo elemento"],
  ["¿Cuánto ORIGEN hay en garantía en total?", "10 ORIGEN"],
  ["¿Cuánto exige la red como mínimo por validador?", "<b>1 ORIGEN</b>"],
  ["¿Cuántos validadores admite la red como máximo?", "Sin límite práctico"],
])}

<figure>{VALIDADORES}</figure>

{nota("Lo que esto significa en la práctica",
 "La cadena entera depende de un servidor. Si node1 se apaga —por una falla de hardware, "
 "una actualización mal aplicada o un corte en su zona de AWS— <b>la cadena deja de producir "
 "bloques</b>. Las billeteras seguirían mostrando saldos, porque los saldos ya están escritos, "
 "pero <b>ninguna transacción nueva podría confirmarse</b> hasta que ese servidor vuelva. "
 "No hay reemplazo automático: los otros cinco nodos no tienen permiso para escribir.", "riesgo")}

<h3>Las tres decisiones que lo cierran</h3>
<p>El trabajo técnico para resolverlo <strong>ya está hecho</strong>: los cinco nodos existen,
están corriendo y se están poniendo al día. Lo que falta no es construcción, son tres
decisiones que no corresponde tomar por vía técnica.</p>

{tabla(["Decisión", "Qué hay que resolver", "Dato útil para decidir"], [
  ["<b>Cuántos validadores activar</b>",
   "Cuántos de los cinco nodos pasan a producir bloques",
   "Con 5 validadores la red tolera 1 caído y sigue exigiendo acuerdo de 4. Con 3, tolera 0 y exige 3. Más validadores = más resistencia"],
  ["<b>Cuánto ORIGEN en garantía</b>",
   "Cuánto se deposita por cada validador nuevo",
   "El mínimo que la red exige es <b>1 ORIGEN</b>. El validador actual tiene 10. Cuanto mayor la garantía, más caro atacar la red"],
  ["<b>Desde qué billetera sale</b>",
   "De qué cuenta de tesorería salen esos fondos",
   "Es un movimiento de tesorería y debe quedar asentado. La dirección elegida queda registrada en la cadena, a la vista de cualquiera"],
])}

<p>Con esas tres respuestas, activar cada validador es un procedimiento de minutos: el nodo
deposita su garantía en el contrato del sistema y desde el bloque siguiente entra en el turno
de producción. <strong>No requiere detener la cadena.</strong></p>

<h2>4 · Dónde estaba la infraestructura y dónde está</h2>

{comparar(
 ["Un nodo produciendo, cinco apagados o rotos.",
  "Los nodos se trababan sincronizando, sin error visible.",
  "IP que cambiaban en cada reinicio: la red no se rearmaba sola.",
  "Un nodo anunciaba la IP de otro por un copiar-pegar mal hecho.",
  "Dos nodos con discos de 8 GB — no les cabía la cadena.",
  "Nadie vigilaba: un nodo detenido podía estar días así.",
  "Ni un solo respaldo de la cadena. El único de la cuenta era de 2023.",
  "Sin registro de auditoría de la cuenta de nube."],
 ["Seis nodos desplegados y corriendo; cinco poniéndose al día.",
  "Causa raíz diagnosticada en el código y neutralizada.",
  "IP fijas en los seis; la red se rearma sola tras un reinicio.",
  "Las seis direcciones anunciadas corregidas y verificadas.",
  "Discos ampliados a 40 GB en los dos que estaban cortos.",
  "Vigilante automático cada 3 minutos en los cinco nodos.",
  "Primer respaldo de la cadena completa tomado y etiquetado.",
  "Registro de auditoría y detección de amenazas activados."])}

<h3>El inventario, nodo por nodo</h3>
{tabla(["Nodo", "Región", "Dirección fija", "Disco", "Papel"], [
  ["node1", "Virginia", "23.23.205.33", "30 GB", "<b>Validador.</b> Produce todos los bloques"],
  ["node2", "Ohio", "18.190.14.28", "30 GB", "Copia · sincronizando"],
  ["node3", "Virginia", "54.205.125.99", "30 GB", "Copia · sincronizando"],
  ["node4", "Ohio", "18.226.95.184", "30 GB", "Copia · sincronizando"],
  ["node5", "Virginia", "18.211.40.149", "40 GB", "Copia · sincronizando"],
  ["node6", "Virginia", "3.224.143.231", "40 GB", "Copia · sincronizando"],
])}
<p style="font-size:9pt;color:#5C6B68">Estado de las seis máquinas verificado esta noche:
las cinco que sincronizan están encendidas y con los controles de salud de AWS en verde.
Tener nodos en <b>dos regiones distintas</b> no es un detalle: si una región de AWS tiene una
caída, los de la otra siguen en pie.</p>

<h2>5 · El problema que costó semanas: el sincronizador</h2>

<p>Los cinco nodos nuevos se quedaban <strong>trabados</strong>. Paraban en un bloque exacto y
no volvían a avanzar. Lo desconcertante era que <em>no había ningún error</em>: los registros
estaban limpios, los vecinos seguían conectados, el proceso vivo. Reiniciar el servicio los
destrababa, pero volvían a trabarse a las horas.</p>

<h3>Cómo se encontró la causa</h3>
<p>Se descartó primero lo evidente —disco, memoria, red, vecinos— y todo estaba bien. La
pista definitiva fue una <strong>ausencia</strong>: cuando un nodo se trababa, no aparecía
ninguna de las líneas de error que el propio programa escribe cuando algo le sale mal. La
sincronización terminaba <em>limpia</em>. El nodo no había fallado; simplemente se había
dormido y nadie lo despertaba.</p>

<figure>{SYNCER}</figure>

<h3>Qué pasa exactamente</h3>
<p>El sincronizador funciona en dos tiempos: <strong>duerme esperando un aviso</strong> de que
algún vecino tiene bloques nuevos, y cuando lo recibe <strong>se pone a traerlos</strong>, lo
que le lleva varios segundos. El defecto está en la costura entre ambos: los avisos que llegan
<em>mientras está trayendo bloques</em> se descartan en silencio, porque no hay nadie
escuchando y el programa no los guarda en cola. Termina la tanda, vuelve a dormirse, y si el
último aviso se perdió en esa ventana, ya no llega otro. El nodo queda detenido
indefinidamente.</p>

<p>No existe una opción de configuración para corregirlo, ni un reintento periódico en el
programa. El binario en uso es de octubre de 2023 y esa variante ya no recibe mantenimiento
del proyecto original, así que <strong>modificar el código fuente no era razonable</strong>
para un sistema en producción.</p>

<h3>La solución: un vigilante</h3>
<p>Se instaló en cada nodo un vigilante que corre <strong>cada 3 minutos</strong>. Compara la
altura actual con la de la revisión anterior; si el nodo no avanzó, reinicia el servicio y lo
vuelve a conectar con el validador —la combinación que se comprobó que lo destraba. Reiniciar
estos nodos es barato: no producen bloques, solo copian.</p>

<h3>El validador lleva un vigilante distinto, y más prudente</h3>
<p>node1 sí produce bloques: mientras se reinicia, <strong>la cadena entera deja de avanzar</strong>.
Por eso su vigilante está diseñado para equivocarse hacia el lado de <em>no</em> actuar, con
tres frenos que el otro no tiene:</p>

{tabla(["Freno", "Cómo funciona", "Por qué"], [
  ["Doble confirmación", "Exige dos revisiones seguidas sin avance (unos 6 minutos)",
   "El validador produce un bloque cada 15 segundos: seis minutos sin uno no es lentitud, es una falla"],
  ["Tope de reintentos", "Máximo 2 reinicios por hora; pasado eso deja de intentar y registra una alerta",
   "Si reiniciar no resuelve, insistir cada 3 minutos solo impide cualquier recuperación que necesite tiempo"],
  ["No toca la red", "No agrega vecinos a la fuerza",
   "El validador es el origen de los bloques, no el destino: no necesita que nadie le mande nada"],
])}

<p>El vigilante del validador se instaló <strong>sin reiniciar node1</strong>: la cadena no se
detuvo en ningún momento durante la instalación.</p>

<h2>6 · La red que no se rearmaba: las direcciones</h2>

<p>Detrás de varios problemas había una sola causa: <strong>ninguna de las direcciones
públicas era fija</strong>. AWS asigna una dirección nueva cada vez que una máquina se apaga y
enciende. Cada nodo tenía anotada a mano la dirección con la que debía anunciarse a los
demás, y esa anotación quedaba desactualizada al primer reinicio: el nodo seguía diciendo
«búsquenme aquí» en una dirección que ya no era suya.</p>

<p>El caso más ilustrativo fue node3, que anunciaba <code>18.191.232.121</code> —la dirección
vieja de <strong>node2</strong>—. Un copiar-pegar mal hecho en la configuración original, que
dejaba al nodo incomunicado sin que nada lo señalara. El validador también estaba mal
configurado del mismo modo.</p>

<h3>Lo que se hizo</h3>
<ul>
<li><strong>Dirección fija para los seis nodos.</strong> Dos ya estaban reservadas y sin usar
en la cuenta —se pagaban igual—; las otras se reservaron nuevas.</li>
<li><strong>Se reescribió la lista de contactos</strong> de cada nodo con las cinco
direcciones estables de sus compañeros.</li>
<li><strong>Se verificó de la única manera que vale:</strong> se reiniciaron los cinco nodos
<em>sin reconectar nada a mano</em> y volvieron a encontrarse solos. Antes, un reinicio los
dejaba aislados y había que reconectarlos uno por uno.</li>
</ul>

{nota("El coste: cero",
 "Desde febrero de 2024 AWS cobra por toda dirección pública, sea fija o cambiante. Pasar de "
 "direcciones cambiantes a fijas <b>no cambió la factura</b> y eliminó una familia entera de "
 "fallas.", "bien")}

<p>Tocar el validador exigió reiniciarlo dos veces. En ambas volvió a responder en unos dos
segundos y siguió produciendo bloques. Antes de hacerlo se comprobó que el balanceador
registra a node1 <strong>por identificador de máquina, no por dirección</strong>, de modo que
cambiarle la dirección pública no afectaba al servicio. Se confirmó después: el dominio
público respondió sin interrupción.</p>

<h2>7 · Discos y respaldos</h2>

<p>Dos de los nodos tenían discos de <strong>8 GB</strong>. La cadena no les cabía: se
llenaban antes de terminar de copiarla, y un disco lleno no da un error claro, da fallas
raras. Se ampliaron a 40 GB en caliente, sin apagarlos.</p>

<h3>El primer respaldo de la historia de la cadena</h3>
<p>Antes de este trabajo <strong>no existía ningún respaldo de la cadena</strong>. El único
respaldo en toda la cuenta de nube era de 2023 y de otro sistema. Se tomó el primero, del
disco de node1 —el validador, el que tiene la cadena completa— y quedó etiquetado para poder
localizarlo. Los respaldos de este tipo son incrementales y se pueden tomar con el servidor
funcionando, sin detener nada.</p>

{nota("Pendiente: automatizarlos",
 "Programar respaldos diarios automáticos requiere crear un permiso en la consola de AWS, y "
 "las credenciales temporales con las que se trabajó tienen esa función bloqueada. Es una "
 "acción de <b>una sola vez</b>: EC2 → Lifecycle Manager → crear política diaria sobre la "
 "etiqueta <code>Proposito = backup-cadena-8532</code>, con retención de 7 a 14 copias. "
 "Mientras no exista, cada respaldo hay que pedirlo a mano.", "riesgo")}

<h2>8 · Estado de la sincronización</h2>

<p>Los cinco nodos están copiando el historial completo de la cadena desde el bloque uno.
Es un proceso largo por su propia naturaleza: hay más de cuatro millones de bloques y cada
uno se verifica al recibirlo.</p>

<figure>{PROGRESO}
<figcaption>Alturas leídas directamente en cada nodo el 5 de agosto a las 23:51 UTC, contra
una altura de cadena de 4.135.164 bloques verificada en ese mismo minuto.</figcaption></figure>

{cifras(("15,3 s", "un bloque cada"), ("4.135.164", "altura de la cadena"),
        ("~1.570", "bloques copiados por minuto"), ("17-23 h", "para terminar"))}

<p>Al ritmo medido les quedan unas <strong>17 horas</strong> de copia a cuatro de ellos, y
unas 23 a node3, que va algo más atrás. El detalle que hace esto viable: la cadena avanza a
unos <strong>4 bloques por minuto</strong> y los nodos copian a <strong>1.570 por minuto</strong>.
Van unas cuatrocientas veces más rápido que la meta, así que la alcanzan sin discusión.</p>

{nota("La salud de los cinco, leída en la misma medición",
 "Cada nodo ve a los otros <b>cinco</b> vecinos: la red está completa y ninguno quedó aislado. "
 "El vigilante registra «avanzando ok» en las tres últimas revisiones de los cinco, así que "
 "<b>no ha tenido que intervenir ni una vez</b> en esta tanda. De disco van holgados: los de "
 "30 GB usan 8,7 y los de 40 GB, 6,6 — sobra sitio para el resto de la cadena.", "bien")}

<h2>9 · Cómo se llega a la cadena desde afuera</h2>

{tabla(["Pieza", "Dirección", "Para qué sirve", "Estado"], [
  ["Puerta pública", "<code>ordenglobal-rpc.com</code>",
   "Por aquí entran las billeteras y cualquier programa que quiera hablar con la cadena",
   "Funcionando · HTTPS"],
  ["Balanceador", "OrdenKapital",
   "Reparte el tráfico entre los nodos disponibles",
   "Funcionando · apunta a un solo nodo"],
  ["Explorador", "<code>ordenscan.com</code>",
   "Buscar transacciones, bloques y direcciones. Es la cara pública y auditable de la cadena",
   "Reconstruido y funcionando"],
  ["Registro público", "Chainlist",
   "Que cualquier billetera del mundo pueda añadir la red con un clic",
   "<b>Pendiente</b>"],
])}

<h3>El explorador</h3>
<p>El explorador se reconstruyó por completo, servidor y pantallas. Cumple el estándar
internacional que los demás sistemas esperan de un explorador —direcciones del tipo
<code>/block/…</code>, <code>/tx/…</code>, <code>/address/…</code>—, lo que permite que
cualquier billetera enlace directamente a él. Indexa bloques, transacciones, direcciones y
movimientos de tokens.</p>

<h3>El registro público de redes</h3>
<p>Chainlist es el directorio que usan las billeteras del mundo para añadir una red nueva.
Registrarse consiste en enviar una ficha con los datos de la red al repositorio público que lo
alimenta. <strong>Los requisitos técnicos ya están verificados y en verde</strong>: la red
responde con el identificador correcto, el acceso público funciona por HTTPS, permite
consultas desde el navegador y el explorador cumple el estándar. La ficha está redactada y
lista para enviar.</p>

<p>Faltan dos cosas, y ninguna es técnica:</p>
<ol>
<li><strong>El logotipo</strong> en formato PNG cuadrado de al menos 512×512 píxeles. Es el
único requisito que no se puede resolver sin la marca.</li>
<li><strong>Conviene esperar a tener más validadores.</strong> Registrar una red pública que
depende de un solo servidor la expone: cualquiera puede ver ese estado. Además el registro
exige que el acceso público esté en pie cuando el sistema automático lo revise; con más de un
nodo atendiendo, esa comprobación es mucho más segura.</li>
</ol>

<div class="salto"></div>
<h2>10 · Qué falta</h2>

<h3>Decisiones de la Junta</h3>
{tabla(["Qué", "Cuándo", "Si no se hace"], [
  ["Cuántos validadores activar", "Al terminar la sincronización (17-23 h)", "La cadena sigue con un único punto de falla"],
  ["Cuánto ORIGEN en garantía por validador", "Con lo anterior", "No se puede activar ninguno"],
  ["Desde qué billetera sale ese ORIGEN", "Con lo anterior", "No se puede activar ninguno"],
  ["Si se registra la red en Chainlist ahora o después", "Tras activar validadores", "La red no aparece en las billeteras del mundo"],
])}

<h3>Tareas administrativas</h3>
{tabla(["Qué", "Quién", "Si no se hace"], [
  ["Credencial de nube permanente o de solo lectura", "Administrador de la nube",
   "No se puede seguir midiendo el avance de los nodos desde afuera"],
  ["Permiso para respaldos automáticos diarios", "Administrador de la nube",
   "Cada respaldo de la cadena hay que pedirlo a mano"],
  ["Logotipo PNG de 512×512", "Marca", "La red no puede registrarse en el directorio público"],
])}

<h3>Trabajo técnico ya planificado</h3>
<ul>
<li><strong>Sumar nodos al balanceador.</strong> Hoy la puerta pública apunta a un solo nodo.
Cuando los demás terminen de sincronizar, entran al reparto y el acceso público deja de
depender de una sola máquina.</li>
<li><strong>Anclar en la cadena el sello de la bitácora de Genesis ID</strong>, para que el
registro de quién aprobó qué identidad quede sellado en un libro que nadie puede reescribir.
Conviene hacerlo cuando haya más de un validador.</li>
<li><strong>Revisar la política de comisiones</strong> antes de admitir validadores que no
sean de la organización.</li>
</ul>

{nota("Cómo se obtuvo cada cifra de este documento",
 "Identificador de red, altura, tiempo entre bloques, capacidad, coste, lista de validadores, "
 "garantía depositada y mínimo exigido se consultaron <b>directamente contra la cadena en vivo</b> "
 "la noche del 5 de agosto. Los 15,3 segundos entre bloques se midieron comparando marcas de tiempo "
 "de bloques separados hasta 51.200 posiciones —más de nueve días— y salió constante en todos los "
 "tramos. Máquinas y discos, contra el inventario de la nube.", "bien")}

<div class="pie-doc">Orden Global · La cadena · {FECHA} · Documento 2 de 4.
El documento 1 resume el ecosistema completo; el 3 detalla Veta Wallet y el 4, Genesis ID.</div>
'''

pathlib.Path(__file__).parent.parent.joinpath("02-Blockchain-Orden-Global.html").write_text(
    documento("Orden Global · La cadena", "recursos/estilo.css", cuerpo), encoding="utf-8")
print("02 escrito")
