# -*- coding: utf-8 -*-
"""Documento de inversión de Orden Global.

Regla que gobierna este documento: todo lo que se presenta como logrado está
medido, y todo lo que es proyección va rotulado como proyección. Un documento
de inversión que exagera no vende más — vende una vez, y luego cuesta la
relación.

Las cifras de mercado llevan su fuente al pie de la propia página.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))

VERDE, VERDE2, VERDE3 = "#04191A", "#072526", "#0C3335"
ORO, ORO_OSC, CLARO, CLARO2 = "#C9A961", "#9A7B2E", "#EAF3F2", "#9FBDBA"
SUAVE, LINEA, OK, GRAVE = "#5C6B68", "#123E3F", "#2FA37A", "#A32B22"

FECHA = "Agosto de 2026"

SELLO = f'''<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="22" fill="none" stroke="{ORO}" stroke-width="1.6"/>
  <circle cx="24" cy="24" r="17" fill="none" stroke="{ORO}" stroke-width=".8" opacity=".6"/>
  <path d="M24 7 L24 41" stroke="{ORO}" stroke-width="1.4"/>
  <path d="M12 15 Q24 24 36 15" fill="none" stroke="{ORO}" stroke-width="1.5"/>
  <path d="M12 33 Q24 24 36 33" fill="none" stroke="{ORO}" stroke-width="1.5"/>
  <circle cx="24" cy="24" r="3.4" fill="{ORO}"/>
</svg>'''

PUNTA = f'''<defs><marker id="p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5"
  markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{ORO}"/></marker>
  <marker id="pc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5"
  markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{ORO_OSC}"/></marker></defs>'''


def hoja(contenido, n, total=14, oscura=False, titulo=""):
    clase = "hoja oscura" if oscura else "hoja"
    pie = (f'<div class="folio"><span>Orden Global · {titulo}</span>'
           f'<span>{n} / {total}</span></div>') if n else ""
    return f'<section class="{clase}">{contenido}{pie}</section>'


def caja(x, y, w, h, t, s="", color=ORO, relleno="none", ts=10):
    txt = (f'<text x="{x+w/2}" y="{y+(h/2 if not s else h/2-4)}" text-anchor="middle" '
           f'font-size="{ts}" font-family="Helvetica" font-weight="600" fill="{color}">{t}</text>')
    if s:
        txt += (f'<text x="{x+w/2}" y="{y+h/2+9}" text-anchor="middle" font-size="7.5" '
                f'font-family="Helvetica" fill="{CLARO2}">{s}</text>')
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{relleno}" '
            f'stroke="{color}" stroke-width="1.3"/>{txt}')


# ═══ 1 · PORTADA ═════════════════════════════════════════════════════════════
p1 = f'''
  <div class="marca">{SELLO}<div><b>ORDEN GLOBAL</b><span>Chain 8532 · Token ORIGEN</span></div></div>
  <div class="crece"></div>
  <div class="filete"></div>
  <h1>La infraestructura<br>financiera que<br><em>Centroamérica</em><br>no tiene.</h1>
  <p class="entrada">Una cadena de bloques propia, con identidad verificada incorporada
  desde el primer bloque. No un token sobre la cadena de otro: infraestructura, en
  producción, con usuarios reales.</p>
  <div class="crece"></div>
  <div style="border-top:1px solid {LINEA};padding-top:14px;display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font:700 9pt Helvetica;letter-spacing:.2em;color:{ORO};text-transform:uppercase">Documento de inversión</div>
      <div style="font-size:9pt;color:{CLARO2};margin-top:5px">{FECHA} · Confidencial</div>
    </div>
    <span class="pastilla viva">● Red en funcionamiento</span>
  </div>'''

# Dependencia de las remesas en la región, en % del PIB (cierre 2025).
_REG = [("Honduras", 30.4), ("Nicaragua", 30.0), ("El Salvador", 27.3), ("Guatemala", 21.4)]
_ANCHO = 300
BARRAS_REG = f"""<svg viewBox="0 0 620 132" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="9" font-size="8" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1.5">REMESAS COMO PORCENTAJE DEL PIB · CIERRE 2025</text>
  {"".join(
    f'<text x="0" y="{34 + i*26}" font-size="10" font-family="Helvetica" fill="{VERDE}">{n}</text>'
    f'<rect x="96" y="{24 + i*26}" width="{_ANCHO}" height="13" rx="6.5" fill="#E8EEEC"/>'
    f'<rect x="96" y="{24 + i*26}" width="{_ANCHO*v/32:.1f}" height="13" rx="6.5" fill="{ORO if i else ORO_OSC}"/>'
    f'<text x="{104 + _ANCHO*v/32:.0f}" y="{34 + i*26}" font-size="9.5" font-family="Helvetica" '
    f'font-weight="{"700" if not i else "400"}" fill="{VERDE if not i else SUAVE}">{str(v).replace(".", ",")} %</text>'
    for i, (n, v) in enumerate(_REG))}
  <text x="0" y="128" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">Cuatro países vecinos con el mismo problema y la misma solución posible. Honduras es el caso extremo de América Latina.</text>
</svg>"""

# ═══ 2 · LA TESIS ════════════════════════════════════════════════════════════
p2 = f'''
  <div class="rotulo">La tesis</div>
  <h2>Doce mil millones de dólares<br>cruzan una frontera cada año.<br>Nadie los mueve bien.</h2>

  <p class="grande" style="margin-top:16px">En 2025 llegaron a Honduras <strong>US$ 12.212 millones</strong>
  en remesas — el <strong>30,4 % del producto interno bruto</strong>, la proporción más alta de
  América Latina. Es la primera fuente de divisas del país: más que las exportaciones y más que
  toda la inversión extranjera junta.</p>

  <p class="grande">Ese dinero llega por tuberías caras, lentas y ajenas. <strong>El costo de
  moverlo equivale a poco más del 2 % del PIB hondureño</strong>, un peaje que pagan las
  familias que menos pueden pagarlo.</p>

  <div class="cifras apretadas" style="margin-top:22px">
    <div><div class="dato">US$ 12.212 M</div><div class="etq">Remesas a Honduras · 2025</div></div>
    <div><div class="dato">30,4 %</div><div class="etq">del PIB · la más alta de la región</div></div>
    <div><div class="dato oro">+25,3 %</div><div class="etq">crecimiento contra 2024</div></div>
    <div><div class="dato">US$ 47.730 M</div><div class="etq">Remesas a Centroamérica · 2025</div></div>
  </div>

  <div class="resalte" style="margin-top:20px">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Lo que proponemos</b>
    Mover ese dinero sobre <b>infraestructura propia</b>, con la identidad de cada persona
    verificada dentro del sistema y no comprada a un tercero. Quien controla la cadena y la
    identidad controla el costo, la velocidad y el cumplimiento — y no depende de nadie para
    seguir operando.
  </div>

  <figure style="margin-top:14px">{BARRAS_REG}</figure>

  <div class="crece"></div>
  <div class="fuente">Cifras del Banco Central de Honduras (cierre 2025) y del Consejo Monetario
  Centroamericano, recogidas por Proceso Digital, La Tribuna, EFE/Swissinfo e Infobae.
  Consultadas el 6 de agosto de 2026.</div>'''

# ═══ 3 · EL PROBLEMA ═════════════════════════════════════════════════════════
p3 = f'''
  <div class="rotulo">El problema</div>
  <h2 style="color:{CLARO}">El dinero llega.<br>El peaje se queda.</h2>

  <div style="display:flex;gap:26px;margin-top:26px;align-items:flex-start">
    <div style="flex:1.1">
      <p class="grande">Un hondureño en Estados Unidos manda dinero a su madre. Ese envío pasa
      por un remitente, un corresponsal, dos bancos y una casa de cambio. Cada uno cobra. Cada
      uno tarda.</p>
      <p class="grande">Al final del recorrido, entre comisión explícita y tipo de cambio, se ha
      quedado por el camino una parte que <strong style="color:{ORO}">a escala de país supera el
      2 % del PIB</strong>.</p>
      <p class="grande">Las criptomonedas prometieron resolver esto hace diez años y no lo
      hicieron. La razón no es técnica.</p>
    </div>
    <div style="flex:.9">
      <div class="tarjeta" style="margin-bottom:11px">
        <h4>1,8 millones</h4>
        <p>de hondureños viven en Estados Unidos, de donde sale el <b style="color:{CLARO}">98,46 %</b>
        de las remesas del país.</p>
      </div>
      <div class="tarjeta" style="margin-bottom:11px">
        <h4>Toda la región</h4>
        <p>Nicaragua 30 % del PIB · El Salvador 27,3 % · Guatemala 21,4 %. El mismo problema,
        cuatro veces.</p>
      </div>
      <div class="tarjeta">
        <h4>Y creciendo</h4>
        <p>El primer cuatrimestre de 2026 cerró <b style="color:{CLARO}">14,3 % por encima</b>
        del mismo período del año anterior.</p>
      </div>
    </div>
  </div>

  <h3 style="margin-top:30px">Por qué las criptomonedas no lo resolvieron</h3>
  <p class="grande" style="color:{CLARO}">Porque para mover dinero de verdad hay que saber quién
  lo mueve. Un banco no puede recibir fondos de una dirección anónima. Un comercio no puede
  cobrar sin saber a quién. Un regulador no autoriza lo que no puede rastrear.</p>
  <p class="grande">La industria construyó redes rapidísimas y sin identidad, y luego intentó
  pegarle el cumplimiento por fuera, con proveedores externos, a un costo por consulta y sin
  control sobre los datos. <strong style="color:{ORO}">Ese remiendo es el cuello de botella</strong>,
  y es exactamente donde entra Orden Global.</p>

  <div class="crece"></div>
  <div class="fuente">Fuentes: Banco Central de Honduras; Consejo Monetario Centroamericano;
  informe anual del BID sobre remesas a Centroamérica, febrero de 2026.</div>'''

# ═══ 4 · LA SOLUCIÓN ═════════════════════════════════════════════════════════
DIAG_SOL = f'''<svg viewBox="0 0 620 250" xmlns="http://www.w3.org/2000/svg">{PUNTA}
  <text x="0" y="10" font-size="8.5" font-family="Helvetica" fill="{SUAVE}" letter-spacing="1.5">LAS DOS CAPAS, CONSTRUIDAS JUNTAS</text>

  <rect x="0" y="26" width="620" height="86" rx="10" fill="#FBF8F1" stroke="{ORO}" stroke-width="1.4"/>
  <text x="16" y="46" font-size="8" font-family="Helvetica" fill="{ORO_OSC}" letter-spacing="1.6">CAPA DE IDENTIDAD · GENESIS ID</text>
  {caja(16, 56, 138, 44, "Documento", "estándar OACI", ORO_OSC, "#fff", 9.5)}
  {caja(166, 56, 138, 44, "Rostro y vida", "biometría real", ORO_OSC, "#fff", 9.5)}
  {caja(316, 56, 138, 44, "Sanciones", "19.178 fichas", ORO_OSC, "#fff", 9.5)}
  {caja(466, 56, 138, 44, "Monitoreo", "8 reglas AML", ORO_OSC, "#fff", 9.5)}

  <rect x="0" y="146" width="620" height="86" rx="10" fill="{VERDE}" stroke="{VERDE3}" stroke-width="1.4"/>
  <text x="16" y="166" font-size="8" font-family="Helvetica" fill="{ORO}" letter-spacing="1.6">CAPA DE LIQUIDACIÓN · CADENA 8532</text>
  {caja(16, 176, 138, 44, "Bloque / 15,3 s", "y sin comisión", ORO, "none", 9.5)}
  {caja(166, 176, 138, 44, "Token ORIGEN", "moneda propia", ORO, "none", 9.5)}
  {caja(316, 176, 138, 44, "6 nodos", "en dos regiones", ORO, "none", 9.5)}
  {caja(466, 176, 138, 44, "Explorador", "todo auditable", ORO, "none", 9.5)}

  <line x1="310" y1="114" x2="310" y2="144" stroke="{ORO}" stroke-width="1.6" marker-end="url(#p)"/>
  <line x1="250" y1="144" x2="250" y2="114" stroke="{ORO}" stroke-width="1.6" marker-end="url(#pc)"/>
  <text x="326" y="134" font-size="7.5" font-family="Helvetica" fill="{ORO_OSC}">quién eres</text>
  <text x="150" y="134" font-size="7.5" font-family="Helvetica" fill="{ORO_OSC}">qué hiciste</text>
</svg>'''

p4 = f'''
  <div class="rotulo">La solución</div>
  <h2>Una cadena propia<br>con la identidad dentro.</h2>

  <p class="grande" style="margin-top:14px">Orden Global no es una aplicación sobre la cadena de
  otro. Es <strong>una cadena entera</strong> —la 8532, con su moneda ORIGEN— y encima, integrada
  desde el diseño y no pegada después, <strong>una capa de identidad verificada</strong>.</p>

  <figure>{DIAG_SOL}</figure>

  <div class="tarjetas" style="margin-top:6px">
    <div class="tarjeta">
      <h4>Para el usuario</h4>
      <p>Se verifica <b>una vez</b>. Esa identidad le sirve en la billetera, en el comercio y en
      el explorador, sin repetir el trámite ni volver a mandar su documento.</p>
    </div>
    <div class="tarjeta">
      <h4>Para el comercio</h4>
      <p>Cobra sabiendo a quién le cobra, y puede comprobar antes de firmar si una dirección
      está sancionada.</p>
    </div>
    <div class="tarjeta">
      <h4>Para el regulador</h4>
      <p>Cada decisión de aprobación queda firmada por una persona en una bitácora que, si se
      altera, lo delata.</p>
    </div>
  </div>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">La diferencia que importa</b>
    La mayoría de proyectos compra el cumplimiento a un proveedor externo, paga por consulta y no
    controla ni el dato ni la regla. Aquí <b>el cumplimiento es parte del producto</b>: se puede
    ajustar, auditar, licenciar a terceros y —cuando toque— defender ante un regulador con el
    código en la mano.
  </div>'''

# ═══ 5 · POR QUÉ LAYER 1 ═════════════════════════════════════════════════════
p5 = f'''
  <div class="rotulo">Por qué Layer 1</div>
  <h2 style="color:{CLARO}">La diferencia entre<br>ser dueño y ser inquilino.</h2>

  <p class="grande" style="margin-top:14px">Emitir un token sobre una cadena ajena es rápido y
  barato el primer día. El precio se paga después, y se paga siempre.</p>

  <table style="margin-top:18px">
    <thead><tr><th style="width:26%">&nbsp;</th><th style="width:37%">Token sobre cadena ajena</th>
    <th style="width:37%">Layer 1 propia · lo que tenemos</th></tr></thead>
    <tbody>
      <tr><td><b style="color:{CLARO}">Comisiones</b></td>
        <td>Las fija otro. Suben cuando su red se congestiona, por motivos que nada tienen que ver con tu negocio</td>
        <td><b>Las fijás vos.</b> Hoy están en cero, medido en la cadena</td></tr>
      <tr><td><b style="color:{CLARO}">Reglas</b></td>
        <td>Cambian sin avisar y sin voto tuyo</td>
        <td>Las define la organización</td></tr>
      <tr><td><b style="color:{CLARO}">Identidad</b></td>
        <td>Ajena a la red. Se compra por consulta a un proveedor externo</td>
        <td><b>Nativa.</b> El dato es propio y la regla también</td></tr>
      <tr><td><b style="color:{CLARO}">Ingresos de red</b></td>
        <td>Se los queda la cadena anfitriona</td>
        <td>Se quedan en el ecosistema</td></tr>
      <tr><td><b style="color:{CLARO}">Continuidad</b></td>
        <td>Si la cadena anfitriona falla o cambia de rumbo, arrastra tu producto</td>
        <td>El destino es propio</td></tr>
      <tr><td><b style="color:{CLARO}">Activo</b></td>
        <td>Una aplicación</td>
        <td><b>Infraestructura.</b> Se licencia, se conecta y se valora distinto</td></tr>
    </tbody>
  </table>

  <div class="resalte" style="margin-top:16px">
    <b style="display:block;color:{ORO};font-size:11.5pt;margin-bottom:5px">Y lo más difícil ya está hecho</b>
    Lanzar una cadena es el trabajo de un fin de semana. <b>Sostenerla veintidós meses sin
    detenerse</b>, con explorador público, nodos en dos regiones y respaldo, es otra cosa
    completamente distinta — y es lo que separa un anuncio de una infraestructura.
  </div>

  <div class="crece"></div>'''

# ═══ 6 · LA PRUEBA: LA CADENA ════════════════════════════════════════════════
p6 = f'''
  <div class="rotulo">La prueba · 1 de 3</div>
  <h2>No es una promesa.<br>Está corriendo.</h2>

  <div class="cifras" style="margin-top:16px">
    <div><div class="dato">4,1 M</div><div class="etq">bloques producidos</div></div>
    <div><div class="dato">15,3 s</div><div class="etq">entre bloque y bloque</div></div>
    <div><div class="dato oro">22</div><div class="etq">meses de historia en cadena</div></div>
    <div><div class="dato">6</div><div class="etq">nodos · dos regiones</div></div>
  </div>

  <div class="captura" style="margin-top:6px">
    <img src="recursos/img/scan-inicio.jpg" alt="Explorador ordenscan.com">
  </div>
  <div class="epigrafe">ordenscan.com · el explorador público de la cadena, en funcionamiento.
  Cualquiera puede consultar cada bloque, cada transacción y cada dirección.</div>

  <div class="tarjetas" style="margin-top:12px">
    <div class="tarjeta"><h4>Ritmo verificado</h4>
      <p>Los 15,3 segundos entre bloques se midieron sobre <b style="color:{VERDE}">51.200 bloques
      reales</b> —más de nueve días de historia— y salieron constantes en todos los tramos.</p></div>
    <div class="tarjeta"><h4>Compatible con Ethereum</h4>
      <p>Cualquier billetera, contrato o herramienta del mundo Ethereum funciona sobre ella sin
      modificaciones. No hay que reeducar a nadie.</p></div>
    <div class="tarjeta"><h4>Auditable de fábrica</h4>
      <p>Explorador público que cumple el estándar internacional. Lo que pasa en la cadena lo
      puede comprobar cualquiera, sin pedir permiso.</p></div>
  </div>

  <div class="crece"></div>
  <div class="fuente">Cifras consultadas directamente contra la cadena en producción el 5 y 6 de
  agosto de 2026: identificador de red, altura, tiempo entre bloques y capacidad por bloque.</div>'''

# ═══ 7 · LA PRUEBA: VETA WALLET ══════════════════════════════════════════════
p7 = f'''
  <div class="rotulo">La prueba · 2 de 3</div>
  <h2>Veta Wallet:<br>la puerta de entrada.</h2>

  <p class="grande" style="margin-top:12px">Donde una persona guarda su dinero, lo envía, lo
  recibe y acredita quién es. Hace un año existía solo como página web. Hoy es una
  <strong>aplicación móvil completa</strong>, construida desde cero y en su versión 1.32.</p>

  <div class="telefonos" style="margin-top:4px">
    <div class="telefono"><img src="recursos/img/w-home.jpg" alt="Pantalla de inicio"></div>
    <div class="telefono"><img src="recursos/img/w-remesas.jpg" alt="Remesas"></div>
    <div class="telefono"><img src="recursos/img/w-tarjeta.jpg" alt="Tarjeta"></div>
    <div class="telefono"><img src="recursos/img/w-kyc.jpg" alt="Verificación de identidad"></div>
  </div>
  <div class="epigrafe">Interfaz de Veta Wallet. Prototipo de diseño con saldos de ejemplo; la
  aplicación Android está construida, probada en teléfono real y en su versión 1.32.</div>

  <div class="tarjetas" style="margin-top:12px">
    <div class="tarjeta"><h4>Remesas a la tarjeta</h4>
      <p>Recibir dinero del exterior y gastarlo con una tarjeta, sin pasar por una casa de
      cambio. Es el caso de uso que mueve los doce mil millones.</p></div>
    <div class="tarjeta"><h4>Identidad incorporada</h4>
      <p>La verificación ocurre dentro de la aplicación: documento, rostro y prueba de vida.
      No hay que mandar papeles a nadie.</p></div>
    <div class="tarjeta"><h4>Custodia asistida</h4>
      <p>Perder el teléfono no es perder el dinero. Es la diferencia entre una billetera para
      entusiastas y una para todos.</p></div>
  </div>

  <div class="crece"></div>'''

# ═══ 8 · LA PRUEBA: GENESIS ID ═══════════════════════════════════════════════
p8 = f'''
  <div class="rotulo">La prueba · 3 de 3</div>
  <h2 style="color:{CLARO}">Genesis ID:<br>la ventaja difícil de copiar.</h2>

  <p class="grande" style="margin-top:12px">Una cadena la copia cualquiera. Un sistema de
  cumplimiento que funcione, no.</p>

  <div class="captura" style="margin-top:10px">
    <img src="recursos/img/genesis-panel.jpg" alt="Panel de cumplimiento de Genesis ID">
  </div>
  <div class="epigrafe">Panel de cumplimiento de Genesis ID. Instancia de demostración con datos
  ficticios; la instancia de producción opera con 19.178 fichas de sanciones cargadas.</div>

  <div class="cifras" style="margin-top:14px">
    <div><div class="dato">19.178</div><div class="etq">fichas de sanciones</div></div>
    <div><div class="dato">117</div><div class="etq">pruebas automáticas</div></div>
    <div><div class="dato oro">100 %</div><div class="etq">acierto en cotejo facial</div></div>
    <div><div class="dato">249</div><div class="etq">países reconocidos</div></div>
  </div>

  <h3>Qué comprueba, de verdad</h3>
  <p style="color:{CLARO2}">La aritmética del documento según el estándar internacional —cambiar
  una fecha para aparentar otra edad rompe las cuentas y se detecta—. Que el rostro sea el del
  documento. Que haya alguien <em>vivo</em> delante de la cámara, con una secuencia de gestos que
  sortea el servidor. Que el nombre no aparezca en las listas de sanciones, tolerando alias,
  tildes, errores de escritura y transliteraciones. Y ocho reglas sobre cada movimiento.</p>

  <div class="resalte">
    <b style="display:block;color:{ORO};font-size:11.5pt;margin-bottom:5px">Por qué esto es un foso, no una función</b>
    El cumplimiento no se compra hecho: se construye, se prueba contra casos reales y se defiende.
    Genesis ID ya <b>descubrió y resolvió problemas que solo aparecen operando</b> —los nombres
    truncados de las credenciales hondureñas, los gestos que ningún usuario puede completar, el
    sancionado que se escondía cambiando su fecha de nacimiento—. Ese conocimiento no está en
    ningún manual, y es lo que un competidor tendría que volver a aprender desde cero.
  </div>

  <div class="crece"></div>'''

# ═══ 9 · EL ECOSISTEMA ═══════════════════════════════════════════════════════
DIAG_ECO = f'''<svg viewBox="0 0 620 236" xmlns="http://www.w3.org/2000/svg">{PUNTA}
  {caja(0, 20, 186, 52, "Veta Wallet", "guardar, enviar, recibir", VERDE3, "#fff", 10.5)}
  {caja(217, 20, 186, 52, "MyTokenPay", "cobrar en el comercio", VERDE3, "#fff", 10.5)}
  {caja(434, 20, 186, 52, "ordenscan", "verificar en público", VERDE3, "#fff", 10.5)}

  <rect x="140" y="106" width="340" height="56" rx="9" fill="#FBF8F1" stroke="{ORO}" stroke-width="1.6"/>
  <text x="310" y="129" text-anchor="middle" font-size="12" font-family="Helvetica" font-weight="700" fill="{ORO_OSC}">GENESIS ID</text>
  <text x="310" y="145" text-anchor="middle" font-size="8" font-family="Helvetica" fill="{SUAVE}">una identidad · tres productos · cero trámites repetidos</text>

  <rect x="140" y="188" width="340" height="44" rx="9" fill="{VERDE}" stroke="{VERDE3}" stroke-width="1.4"/>
  <text x="310" y="207" text-anchor="middle" font-size="11" font-family="Helvetica" font-weight="700" fill="{ORO}">CADENA 8532 · ORIGEN</text>
  <text x="310" y="221" text-anchor="middle" font-size="8" font-family="Helvetica" fill="{CLARO2}">donde todo queda escrito</text>

  <line x1="93" y1="72" x2="180" y2="104" stroke="{ORO_OSC}" stroke-width="1.3" marker-end="url(#pc)"/>
  <line x1="310" y1="72" x2="310" y2="104" stroke="{ORO_OSC}" stroke-width="1.3" marker-end="url(#pc)"/>
  <line x1="527" y1="72" x2="440" y2="104" stroke="{ORO_OSC}" stroke-width="1.3" marker-end="url(#pc)"/>
  <line x1="310" y1="162" x2="310" y2="186" stroke="{ORO_OSC}" stroke-width="1.3" marker-end="url(#pc)"/>
</svg>'''

p9 = f'''
  <div class="rotulo">El efecto de red</div>
  <h2>Verificate una vez.<br>Servite en todo.</h2>

  <p class="grande" style="margin-top:12px">Cada producto nuevo del ecosistema arranca con toda
  la base de usuarios ya verificada. No hay que volver a pedirle el documento a nadie, y el
  usuario no vuelve a pasar por el trámite que más gente abandona.</p>

  <figure style="margin-top:4px">{DIAG_ECO}</figure>

  <div class="tarjetas">
    <div class="tarjeta"><h4>Para el usuario</h4>
      <p>Un solo trámite en toda su vida dentro del ecosistema. El punto donde la mayoría de las
      aplicaciones financieras pierde a sus usuarios.</p></div>
    <div class="tarjeta"><h4>Para el ecosistema</h4>
      <p>Cada producto nuevo nace con la base verificada. El costo de adquisición baja con cada
      pieza que se suma, en vez de repetirse.</p></div>
    <div class="tarjeta"><h4>Para terceros</h4>
      <p>La misma identidad se puede licenciar a otras empresas de la región. El sistema ya está
      construido para atender a varias aplicaciones a la vez.</p></div>
  </div>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Y no es teórico</b>
    Las tres aplicaciones están <b>dadas de alta hoy</b> en Genesis ID, cada una con sus propios
    permisos: el explorador público solo puede preguntar si una identidad está verificada, nunca
    leer datos personales. La sesión única está configurada y en funcionamiento.
  </div>

  <div class="crece"></div>'''

# ═══ 10 · MODELO DE NEGOCIO ══════════════════════════════════════════════════
p10 = f'''
  <div class="rotulo">Cómo gana dinero</div>
  <h2>Cuatro fuentes.<br>Tres ya construidas.</h2>

  <table style="margin-top:16px">
    <thead><tr><th style="width:23%">Fuente</th><th style="width:47%">De qué se cobra</th>
    <th style="width:30%">Estado</th></tr></thead>
    <tbody>
      <tr><td><b>Remesas y cambio</b></td>
        <td>Diferencial sobre el envío internacional y su conversión a moneda local. El volumen
        del mercado son los doce mil millones de la página 2</td>
        <td><span class="pastilla viva" style="font-size:7pt">Producto construido</span></td></tr>
      <tr><td><b>Tarjeta</b></td>
        <td>Emisión, recarga desde la billetera y comisión de intercambio en cada compra</td>
        <td><span class="pastilla viva" style="font-size:7pt">Producto construido</span></td></tr>
      <tr><td><b>Comercios</b></td>
        <td>Cobro en el punto de venta con MyTokenPay, con la identidad del comprador verificada</td>
        <td><span class="pastilla" style="font-size:7pt">Clave emitida · sin activar</span></td></tr>
      <tr><td><b>Identidad como servicio</b></td>
        <td>Licenciar Genesis ID a otras empresas de la región que necesitan cumplimiento y no
        quieren construirlo</td>
        <td><span class="pastilla" style="font-size:7pt">Motor listo · sin comercializar</span></td></tr>
    </tbody>
  </table>

  <h3>La palanca que casi nadie tiene</h3>
  <p class="grande">Hoy usar la cadena <strong>no cuesta nada</strong>: la comisión está en cero,
  y eso está medido, no estimado. Es una decisión, no una limitación — y se puede cambiar el día
  que convenga. Mientras tanto es un argumento comercial que ninguna red ajena puede igualar,
  porque en una red ajena el precio lo pone otro.</p>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Lo que este documento no dice</b>
    No hay aquí proyecciones de ingresos, de usuarios ni de valoración. No las hay porque no
    están medidas, y este documento solo afirma lo que se puede comprobar. Las proyecciones se
    presentan aparte, con sus supuestos a la vista y sujetas a discusión.
  </div>

  <div class="crece"></div>'''

# ═══ 11 · DÓNDE ESTAMOS ══════════════════════════════════════════════════════
p11 = f'''
  <div class="rotulo">Dónde estamos hoy</div>
  <h2 style="color:{CLARO}">El tablero completo,<br>sin maquillaje.</h2>

  <p class="grande" style="margin-top:12px">Un inversionista serio pregunta por lo que falta antes
  que por lo que sobra. Esto es todo, medido el 6 de agosto de 2026.</p>

  <table style="margin-top:14px">
    <thead><tr><th style="width:30%">Pieza</th><th style="width:46%">Estado real</th>
    <th style="width:24%">&nbsp;</th></tr></thead>
    <tbody>
      <tr><td><b style="color:{CLARO}">Cadena 8532</b></td>
        <td>Produciendo bloques cada 15,3 s desde hace 22 meses, sin interrupción</td>
        <td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b style="color:{CLARO}">Descentralización</b></td>
        <td>Un validador activo. Cinco nodos más al 61 % de sincronización, listos en 17-23 h</td>
        <td><span class="pastilla" style="font-size:7pt">En curso</span></td></tr>
      <tr><td><b style="color:{CLARO}">Explorador</b></td>
        <td>Público, reconstruido, cumple el estándar internacional</td>
        <td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b style="color:{CLARO}">Veta Wallet</b></td>
        <td>Versión 1.32 para Android, probada en teléfono real</td>
        <td><span class="pastilla" style="font-size:7pt">Lista para tienda</span></td></tr>
      <tr><td><b style="color:{CLARO}">Genesis ID</b></td>
        <td>Operando, con listas de sanciones al día y bitácora íntegra</td>
        <td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b style="color:{CLARO}">MyTokenPay</b></td>
        <td>Integración disponible; su clave está emitida y todavía sin usar</td>
        <td><span class="pastilla" style="font-size:7pt">Por decidir</span></td></tr>
    </tbody>
  </table>

  <h3>Los próximos doce meses</h3>
  <table>
    <thead><tr><th style="width:22%">Cuándo</th><th>Qué</th></tr></thead>
    <tbody>
      <tr><td><b style="color:{CLARO}">Semana 1</b></td><td>De 1 a 5 validadores. Se acaba el punto único de falla — los nodos ya están, falta la decisión de tesorería</td></tr>
      <tr><td><b style="color:{CLARO}">Mes 1</b></td><td>Registro de la red en el directorio internacional de cadenas: cualquier billetera del mundo la añade con un clic</td></tr>
      <tr><td><b style="color:{CLARO}">Mes 1-3</b></td><td>Publicación en Google Play y App Store. Primeros usuarios reales de remesas</td></tr>
      <tr><td><b style="color:{CLARO}">Mes 3-6</b></td><td>Activación de MyTokenPay y primeros comercios cobrando</td></tr>
      <tr><td><b style="color:{CLARO}">Mes 6-12</b></td><td>Genesis ID como servicio para terceros; expansión a los países vecinos, que tienen el mismo problema</td></tr>
    </tbody>
  </table>

  <div class="crece"></div>'''

# ═══ 12 · LA INVERSIÓN ═══════════════════════════════════════════════════════
p12 = f'''
  <div class="rotulo">La inversión</div>
  <h2>Dónde se aplica<br>el capital.</h2>

  <p class="grande" style="margin-top:12px">La infraestructura ya está construida y pagada. Lo que
  el capital compra no es desarrollo desde cero: es <strong>llegar al mercado</strong> con un
  producto que ya funciona.</p>

  <table style="margin-top:16px">
    <thead><tr><th style="width:30%">Destino</th><th style="width:52%">Para qué</th>
    <th style="width:18%">Del total</th></tr></thead>
    <tbody>
      <tr><td><b>Licencias y cumplimiento</b></td>
        <td>Autorizaciones para operar como transmisor de dinero en cada país, auditoría externa
        del sistema de cumplimiento y asesoría regulatoria</td><td>—</td></tr>
      <tr><td><b>Adquisición de usuarios</b></td>
        <td>Captación en los corredores de remesas, empezando por Estados Unidos–Honduras</td><td>—</td></tr>
      <tr><td><b>Liquidez operativa</b></td>
        <td>Fondo para liquidar remesas en el momento, sin hacer esperar al receptor</td><td>—</td></tr>
      <tr><td><b>Equipo</b></td>
        <td>Cumplimiento, soporte al usuario y desarrollo del comercio</td><td>—</td></tr>
      <tr><td><b>Infraestructura</b></td>
        <td>Más validadores, respaldos automáticos y auditoría de seguridad independiente</td><td>—</td></tr>
    </tbody>
  </table>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Por qué el riesgo técnico ya pasó</b>
    La mayoría de proyectos de este tipo pide capital para <i>construir</i>. Aquí la cadena lleva
    veintidós meses produciendo bloques, la billetera está en su versión 1.32 y el sistema de
    identidad opera con 19.178 fichas de sanciones cargadas. <b>Lo que queda es comercial y
    regulatorio</b>, que es un riesgo distinto y mucho más medible.
  </div>

  <h3>Lo que la organización aporta</h3>
  <div class="tarjetas">
    <div class="tarjeta"><h4>Infraestructura</h4><p>Cadena, billetera, identidad y explorador,
    construidos y en producción.</p></div>
    <div class="tarjeta"><h4>Conocimiento del mercado</h4><p>El corredor de remesas más
    dependiente de América Latina, conocido desde dentro.</p></div>
    <div class="tarjeta"><h4>Cumplimiento propio</h4><p>El activo que los competidores alquilan
    y aquí es de la casa.</p></div>
  </div>

  <div class="crece"></div>'''

# ═══ 13 · POR QUÉ AHORA ══════════════════════════════════════════════════════
p13 = f'''
  <div class="rotulo">Por qué ahora</div>
  <h2 style="color:{CLARO}">Tres cosas coinciden<br>por primera vez.</h2>

  <div style="margin-top:24px">
    <div style="display:flex;gap:20px;margin-bottom:24px;align-items:flex-start">
      <div class="enorme" style="line-height:.85;min-width:70px">1</div>
      <div>
        <h3 style="margin:0 0 5px">El mercado crece a dos dígitos</h3>
        <p style="color:{CLARO2};margin:0">Las remesas a Honduras subieron <b style="color:{CLARO}">25,3 %</b>
        en 2025 y el primer cuatrimestre de 2026 cerró <b style="color:{CLARO}">14,3 %</b> por
        encima del año anterior. No es un mercado que haya que crear: ya está ahí, creciendo, y
        mal atendido.</p>
      </div>
    </div>

    <div style="display:flex;gap:20px;margin-bottom:24px;align-items:flex-start">
      <div class="enorme" style="line-height:.85;min-width:70px">2</div>
      <div>
        <h3 style="margin:0 0 5px">La tecnología dejó de ser el obstáculo</h3>
        <p style="color:{CLARO2};margin:0">La cadena está corriendo, la billetera está construida
        y la identidad opera. Hace dos años esto habría sido una presentación con un plan. Hoy es
        una presentación con <b style="color:{CLARO}">un explorador público que cualquiera puede
        abrir ahora mismo</b> y comprobar.</p>
      </div>
    </div>

    <div style="display:flex;gap:20px;align-items:flex-start">
      <div class="enorme" style="line-height:.85;min-width:70px">3</div>
      <div>
        <h3 style="margin:0 0 5px">El cumplimiento pasó de estorbo a ventaja</h3>
        <p style="color:{CLARO2};margin:0">Mientras el sector trataba la identidad como un trámite
        que retrasa, aquí se construyó como parte del producto. Ahora que ningún operador serio
        puede mover dinero sin ella, <b style="color:{CLARO}">lo que parecía el camino lento
        resultó ser el único que llega</b>.</p>
      </div>
    </div>
  </div>

  <div class="crece"></div>
  <div class="resalte">
    <b style="display:block;color:{ORO};font-size:11.5pt;margin-bottom:5px">La pregunta que deja este documento</b>
    No es si esto se puede construir — ya está construido y se puede comprobar en público. Es
    <b>cuánto tarda alguien más en construir lo mismo</b>, y si para entonces el corredor de
    remesas más grande de la región ya tiene dueño.
  </div>'''

# ═══ 14 · CIERRE ═════════════════════════════════════════════════════════════
p14 = f'''
  <div class="marca">{SELLO}<div><b>ORDEN GLOBAL</b><span>Chain 8532 · Token ORIGEN</span></div></div>
  <div class="crece"></div>
  <div class="filete"></div>
  <h1 style="font-size:34pt">Doce mil millones<br>buscan un camino<br><em>mejor.</em></h1>
  <p class="entrada" style="margin-top:18px">La cadena está corriendo. La billetera está
  construida. La identidad opera. Lo que falta es llevarlo al mercado — y esa es la conversación
  que proponemos.</p>

  <div class="crece"></div>
  <div style="border-top:1px solid {LINEA};padding-top:16px">
    <div style="font:700 9pt Helvetica;letter-spacing:.2em;color:{ORO};text-transform:uppercase;margin-bottom:10px">Compruébelo usted mismo</div>
    <table style="margin:0">
      <tbody>
        <tr><td style="border:0;padding:5px 0;color:{CLARO2};width:38%">El explorador de la cadena</td>
            <td style="border:0;padding:5px 0;color:{CLARO}"><b style="color:{ORO}">ordenscan.com</b></td></tr>
        <tr><td style="border:0;padding:5px 0;color:{CLARO2};background:none">La red, en directo</td>
            <td style="border:0;padding:5px 0;background:none"><b style="color:{ORO}">ordenglobal-rpc.com</b></td></tr>
      </tbody>
    </table>
    <div style="font-size:8.5pt;color:#3E5C5A;margin-top:16px;line-height:1.55">
      {FECHA} · Documento confidencial, para uso exclusivo del destinatario.<br>
      Las cifras de este documento provienen de mediciones sobre los sistemas en producción y de
      fuentes públicas citadas en cada página. No contiene proyecciones financieras.
    </div>
  </div>'''

PAGINAS = [
    (p1, 0, True, ""), (p2, 2, False, "La tesis"), (p3, 3, True, "El problema"),
    (p4, 4, False, "La solución"), (p5, 5, True, "Por qué Layer 1"),
    (p6, 6, False, "La prueba"), (p7, 7, False, "Veta Wallet"),
    (p8, 8, True, "Genesis ID"), (p9, 9, False, "El efecto de red"),
    (p10, 10, False, "Modelo de negocio"), (p11, 11, True, "Dónde estamos"),
    (p12, 12, False, "La inversión"), (p13, 13, True, "Por qué ahora"),
    (p14, 0, True, ""),
]

cuerpo = "".join(hoja(c, n, 14, osc, tit) for c, n, osc, tit in PAGINAS)

html = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Orden Global · Documento de inversión</title>
<link rel="stylesheet" href="recursos/estilo-inversion.css">
</head><body>{cuerpo}</body></html>'''

pathlib.Path(__file__).parent.parent.joinpath("05-Orden-Global-Inversion.html").write_text(
    html, encoding="utf-8")
print("inversión escrito")
