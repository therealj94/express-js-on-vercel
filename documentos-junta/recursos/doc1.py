# -*- coding: utf-8 -*-
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from piezas import *

FECHA = "5 de agosto de 2026"

# ── Diagrama del ecosistema ──────────────────────────────────────────────────
ECOSISTEMA = f'''<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg">{DEFS}
  <text x="280" y="14" text-anchor="middle" font-size="9" font-family="Helvetica" fill="{SUAVE}">LAS TRES PIEZAS Y CÓMO SE SOSTIENEN</text>

  {caja(20, 34, 150, 52, "Veta Wallet", "app móvil + web", VERDE)}
  {caja(205, 34, 150, 52, "MyTokenPay", "punto de venta", SUAVE)}
  {caja(390, 34, 150, 52, "ordenscan", "explorador público", VERDE)}

  {caja(150, 130, 260, 58, "GENESIS ID", "identidad · KYC · KYB · AML · sesión única", ORO, "#FBF8F1")}

  {caja(150, 226, 260, 56, "CADENA ORDEN GLOBAL", "chain 8532 · 6 nodos · token ORIGEN", VERDE, "#F4F7F6")}

  {flecha(110, 86, 200, 128, "identidad")}
  {flecha(280, 86, 280, 128, "identidad")}
  {flecha(465, 86, 360, 128, "¿verificado?")}
  {flecha(280, 188, 280, 224, "GID en cadena", ORO, True)}
  <path d="M 60 86 L 60 254 L 148 254" fill="none" stroke="{VERDE2}" stroke-width="1.2" marker-end="url(#punta)"/>
  <text x="66" y="176" font-size="7.5" font-family="Helvetica" fill="{VERDE2}">transacciones</text>
</svg>'''

# ── Estado por pieza ─────────────────────────────────────────────────────────
SEMAFORO = f'''<svg viewBox="0 0 560 170" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="12" font-size="9" font-family="Helvetica" fill="{SUAVE}">ESTADO DE CADA PIEZA, HOY</text>
  {"".join(
    f'<circle cx="14" cy="{40 + i*42}" r="8" fill="{c}"/>'
    f'<text x="34" y="{36 + i*42}" font-size="11" font-family="Helvetica" font-weight="600" fill="{VERDE}">{t}</text>'
    f'<text x="34" y="{50 + i*42}" font-size="9" font-family="Helvetica" fill="{SUAVE}">{d}</text>'
    for i, (c, t, d) in enumerate([
      (OK,     "Genesis ID",   "En producción y operando. Verifica identidades reales hoy."),
      (OK,     "Veta Wallet",  "App móvil funcionando; backend endurecido y desplegado."),
      (ALERTA, "Cadena 8532",  "Funciona, pero con UN solo validador. Es el riesgo mayor abierto."),
    ]))}
</svg>'''

cuerpo = portada(
    "Dónde estábamos,<br>dónde estamos<br>y qué falta",
    "Un balance del ecosistema Orden Global: la cadena, la billetera y la identidad digital. "
    "Qué existía, qué se construyó, qué está en producción y qué decisiones quedan pendientes.",
    "Resumen ejecutivo", FECHA, "1 de 4")

cuerpo += f'''
<h2>En una página</h2>

<p>Orden Global tiene <strong>tres piezas</strong>: una cadena de bloques propia, una billetera
y un sistema de identidad. Hasta hace poco funcionaban por separado y ninguna estaba
terminada. Hoy las tres existen, están conectadas entre sí, y dos de ellas operan en
producción con usuarios reales.</p>

{cifras(("3", "sistemas en producción"), ("19.178", "fichas de sanciones activas"),
        ("117", "pruebas automáticas"), ("1", "riesgo crítico abierto"))}

<figure class="mediana">{ECOSISTEMA}
<figcaption>Genesis ID es la pieza central: las tres aplicaciones preguntan a él quién es
cada persona, y la cadena registra lo que esas personas hacen.</figcaption></figure>

<figure class="mediana">{SEMAFORO}</figure>

{nota("Lo que la Junta debe saber, en una frase",
 "El ecosistema pasó de tener piezas sueltas a tener una arquitectura conectada y verificable. "
 "Lo que queda no es construcción, sino <b>tres decisiones de negocio</b> —cuántos validadores, "
 "cuánto se pone en garantía y desde qué billetera— y un puñado de tareas administrativas.")}

<div class="salto"></div>
<h2>1 · La cadena Orden Global</h2>

{comparar(
 ["Un solo nodo produciendo bloques, sin respaldo.",
  "Los nodos perdían conexión entre sí y se detenían solos.",
  "Direcciones IP que cambiaban al reiniciar: la red no se rearmaba.",
  "Dos nodos con discos de 8 GB — no les cabía la cadena.",
  "Sin vigilancia: un nodo detenido podía estar días sin que nadie lo supiera.",
  "Sin registro de auditoría de la cuenta de nube."],
 ["Seis nodos desplegados, cinco sincronizando ahora mismo.",
  "Causa raíz del estancamiento diagnosticada y reparada.",
  "IP fijas en los seis nodos; la red se rearma sola tras un reinicio.",
  "Discos ampliados de 8 GB a 40 GB: de 2 GB libres a 34 GB.",
  "Vigilante automático cada 3 minutos en los cinco nodos.",
  "Registro de auditoría y detección de amenazas activados."])}

<h3>Dónde está exactamente</h3>
<p>Los cinco nodos nuevos están descargando el historial de la cadena. Última medición:</p>
{tabla(["Nodo", "Bloque", "Avance", "Estado"], [
  ["node2", "2.523.115", "61,0 %", "avanzando"],
  ["node3", "2.379.256", "57,5 %", "avanzando"],
  ["node4", "2.522.836", "61,0 %", "avanzando"],
  ["node5", "2.522.785", "61,0 %", "avanzando"],
  ["node6", "2.522.865", "61,0 %", "avanzando"],
])}
<p style="font-size:9pt;color:#5C6B68">Alturas leídas en cada nodo el 5 de agosto a las 23:51 UTC,
contra una altura de cadena de 4.135.164 bloques verificada en ese mismo minuto. Los cinco
copian a unos 1.570 bloques por minuto y ninguno ha necesitado que el vigilante intervenga.</p>

{nota("El riesgo crítico abierto",
 "La cadena funciona con <b>un solo validador</b>. Si ese nodo se detiene, la cadena se detiene: "
 "no hay quien produzca bloques. Cuatro de los cinco nodos nuevos estarán listos en unas 17 horas y el quinto en unas 23, pero "
 "activarlos exige tres decisiones que corresponden a la Junta —cuántos validadores, cuánto "
 "ORIGEN en garantía y desde qué billetera— y no pueden tomarse por vía técnica.", "riesgo")}

<div class="salto"></div>
<h2>2 · Veta Wallet</h2>

{comparar(
 ["Solo existía versión web.",
  "Una interrupción de red podía enviar el mismo pago dos veces.",
  "Las claves privadas de los usuarios se cifraban con una contraseña de 7 caracteres.",
  "La frase de recuperación se mostraba sin pedir nada.",
  "Sin verificación de identidad real.",
  "Precios y datos con inconsistencias."],
 ["Aplicación móvil completa, en Android, lista para tienda.",
  "Sello de idempotencia: el mismo envío no puede cobrarse dos veces.",
  "Claves migradas a una clave fuerte; 804 registros verificados uno a uno.",
  "Pide contraseña antes de mostrar la frase o la clave privada.",
  "Verificación real con Genesis ID: documento, rostro y prueba de vida.",
  "Auditoría aplicada y desplegada."])}

{cifras(("1.32.0", "versión publicada"), ("804", "claves migradas y verificadas"),
        ("63", "despliegues del servidor"), ("0", "pérdidas de datos"))}

{nota("Un riesgo que sigue abierto",
 "La versión <b>web</b> de la billetera no envía el sello de idempotencia al transferir tokens. "
 "Su código no está en el repositorio al que tenemos acceso, así que no se pudo corregir. "
 "Mientras siga así, existe riesgo real de doble envío de tokens si a un usuario se le corta "
 "la conexión a mitad de una operación. La app móvil sí está protegida.", "riesgo")}

<div class="salto"></div>
<h2>3 · Genesis ID</h2>

<p>Es la pieza que no existía y que sostiene a las demás. Antes había un sistema que
<strong>emitía identidades verificadas sin comprobar nada</strong>: una dirección web
pública ponía el estado en «verificado» y entregaba un identificador. Cualquiera podía
llamarla.</p>

{comparar(
 ["Una dirección pública sin contraseña emitía identidades verificadas.",
  "Ningún documento se comprobaba.",
  "Ninguna lista de sanciones se consultaba.",
  "Ninguna persona respondía por la decisión.",
  "Sin registro de quién aprobó qué."],
 ["Solo un operador identificado puede aprobar, y queda firmado.",
  "El documento se valida con la aritmética del estándar internacional.",
  "19.178 fichas de la OFAC, cotejadas en cada alta.",
  "Rostro comparado con el documento y prueba de vida contra fotografías.",
  "Bitácora encadenada: alterar un registro rompe la cadena y se detecta."])}

{cifras(("19.178", "fichas de sanciones"), ("249", "países reconocidos"),
        ("100 %", "acierto en cotejo facial"), ("22", "jurisdicciones GAFI vigiladas"))}

<p>La verificación de una persona real recorre cinco pasos: declara sus datos, completa su
perfil de cumplimiento, fotografía las dos caras de su documento, supera una prueba de vida
con gestos elegidos al azar, y espera la decisión de un operador. <strong>Ningún paso se
puede saltar y ninguna aplicación puede aprobar por su cuenta.</strong></p>

<div class="salto"></div>
<h2>Qué falta, y de quién depende</h2>

<h3>Decisiones de la Junta</h3>
{tabla(["Decisión", "Por qué importa", "Plazo"], [
  ["Cuántos validadores activar", "Hoy hay uno solo: un único punto de fallo para toda la cadena", "Al terminar la sincronización (17-23 h)"],
  ["Cuánto ORIGEN en garantía por validador", "Define el coste de atacar la red", "Con lo anterior"],
  ["Desde qué billetera sale ese ORIGEN", "Es un movimiento de tesorería", "Con lo anterior"],
  ["Si MyTokenPay entra al ecosistema ahora", "Su clave está emitida y sin usar", "Cuando se decida"],
])}

<h3>Tareas administrativas pendientes</h3>
{tabla(["Tarea", "Quién", "Consecuencia de no hacerlo"], [
  ["Cambiar la contraseña del administrador de Genesis ID", "Dirección", "La clave del panel de cumplimiento sigue siendo la inicial"],
  ["Crear credencial permanente de nube para los nodos", "Administrador de la nube", "El seguimiento de los nodos se interrumpe"],
  ["Permisos para copias de seguridad automáticas", "Administrador de la nube", "Los nodos no tienen respaldo automático"],
  ["Logotipo de la red en formato PNG", "Marca", "La red no puede publicarse en directorios públicos"],
  ["Acceso al repositorio de la billetera web", "Dirección", "El riesgo de doble envío en web sigue abierto"],
])}

<h3>Trabajo técnico en curso</h3>
<ul>
  <li>Actualizar las listas de sanciones cada mes — el sistema avisa a los 30 días.</li>
  <li>Anclar el sello de la bitácora en la propia cadena, cuando haya más de un validador.</li>
  <li>Publicar la aplicación en las tiendas cuando el flujo de verificación se valide en campo.</li>
</ul>

{nota("Sobre la honestidad de estas cifras",
 "Todos los números provienen de mediciones sobre los sistemas en producción, no de estimaciones. "
 "Los porcentajes de sincronización se leyeron en los nodos; el cotejo facial del 100 % se midió "
 "con dos retratos distintos de la misma persona, y el 1 % con dos personas diferentes. "
 "Donde algo no está comprobado, este documento lo dice.", "bien")}

<div class="pie-doc">Orden Global · Resumen ejecutivo · {FECHA} · Documento 1 de 4.
Los documentos 2, 3 y 4 detallan cada sistema por separado.</div>
'''

pathlib.Path(__file__).parent.parent.joinpath("01-Resumen-Ejecutivo.html").write_text(
    documento("Orden Global · Resumen ejecutivo", "recursos/estilo.css", cuerpo), encoding="utf-8")
print("01 escrito")
