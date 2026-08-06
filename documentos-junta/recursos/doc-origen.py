# -*- coding: utf-8 -*-
"""ORIGEN · documento de inversión.

La regla que gobierna este documento: lo que ya existe se presenta medido, y
lo que es visión va rotulado como visión. Las dos cosas se venden — pero se
venden por separado, porque el día que un inversionista descubre que una era
la otra, se acabó la relación.

Cifras de mercado: fuente al pie de cada página.
Cifras de la cadena: consultadas en vivo el 6 de agosto de 2026.
Precio del oro y la plata: mercado, el 6 de agosto de 2026.
"""
import sys, pathlib, math
sys.path.insert(0, str(pathlib.Path(__file__).parent))

VERDE, VERDE2, VERDE3 = "#04191A", "#072526", "#0C3335"
ORO, ORO_OSC, CLARO, CLARO2 = "#C9A961", "#9A7B2E", "#EAF3F2", "#9FBDBA"
SUAVE, LINEA, OK, GRAVE = "#5C6B68", "#123E3F", "#2FA37A", "#A32B22"
PLATA = "#B8C4C6"

FECHA = "Agosto de 2026"
TOTAL = 20

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
  <marker id="pc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5"
  orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{ORO_OSC}"/></marker></defs>'''


def hoja(contenido, n, oscura=False, titulo=""):
    clase = "hoja oscura" if oscura else "hoja"
    pie = (f'<div class="folio"><span>ORIGEN · {titulo}</span><span>{n} / {TOTAL}</span></div>'
           if n else "")
    return f'<section class="{clase}">{contenido}{pie}</section>'


def caja(x, y, w, h, t, s="", color=ORO, relleno="none", ts=10, sub=CLARO2):
    txt = (f'<text x="{x+w/2}" y="{y+(h/2+3 if not s else h/2-3)}" text-anchor="middle" '
           f'font-size="{ts}" font-family="Helvetica" font-weight="600" fill="{color}">{t}</text>')
    if s:
        txt += (f'<text x="{x+w/2}" y="{y+h/2+10}" text-anchor="middle" font-size="7.5" '
                f'font-family="Helvetica" fill="{sub}">{s}</text>')
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{relleno}" '
            f'stroke="{color}" stroke-width="1.3"/>{txt}')


# ═══ 01 · PORTADA ════════════════════════════════════════════════════════════
p01 = f'''
  <div class="marca">{SELLO}<div><b>ORIGEN</b><span>Orden Global · Chain 8532</span></div></div>
  <div class="crece"></div>
  <div class="filete"></div>
  <h1>Una moneda<br>para los que<br>nunca tuvieron<br><em>banco.</em></h1>
  <p class="entrada">Anclada al oro. Sobre una cadena de bloques propia que lleva veintidós
  meses funcionando. Gastable en un comercio con tarjeta. Y construida donde el problema
  duele más.</p>
  <div class="crece"></div>
  <div style="border-top:1px solid {LINEA};padding-top:15px;display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font:700 9pt Helvetica;letter-spacing:.2em;color:{ORO};text-transform:uppercase">Documento de inversión</div>
      <div style="font-size:9pt;color:{CLARO2};margin-top:5px">{FECHA} · Confidencial</div>
    </div>
    <span class="pastilla viva">● Red en funcionamiento</span>
  </div>'''

# ═══ 02 · EL MOMENTO ═════════════════════════════════════════════════════════
p02 = f'''
  <div class="rotulo">El momento</div>
  <div class="crece"></div>
  <h2 style="font-size:31pt;line-height:1.14">Doce mil millones de dólares<br>
  llegan cada año a un país<br>donde <span style="color:{ORO_OSC}">seis de cada diez adultos</span><br>
  no tienen dónde guardarlos.</h2>

  <p class="grande" style="margin-top:26px;max-width:150mm">Esas dos cifras no encajan, y en
  esa grieta cabe una compañía entera.</p>

  <div class="cifras apretadas" style="margin-top:30px">
    <div><div class="dato">US$ 12.212 M</div><div class="etq">llegan a Honduras cada año</div></div>
    <div><div class="dato oro">39,7 %</div><div class="etq">de los adultos tiene cuenta financiera</div></div>
    <div><div class="dato">6,6 %</div><div class="etq">se lo lleva el intermediario</div></div>
    <div><div class="dato">US$ 2,50</div><div class="etq">vale un ORIGEN hoy · en oro</div></div>
  </div>
  <div class="crece"></div>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:12pt;margin-bottom:6px">Lo que este documento demuestra</b>
    Que la infraestructura para resolverlo <b>ya está construida y funcionando</b> —se puede
    abrir en el navegador ahora mismo y comprobarlo—, que la moneda existe y tiene un ancla real,
    y que lo único que falta es capital para llegar al mercado. No pedimos que crea en un plan.
    Pedimos que compruebe uno.
  </div>

  <div class="fuente">Remesas: Banco Central de Honduras, cierre 2025. Bancarización: Comisión
  Nacional de Bancos y Seguros e Instituto Nacional de Estadística, Módulo de Inclusión
  Financiera 2024. Costo de envío: derivado de las cifras del Consejo Monetario Centroamericano
  (ver página 3). Precio de ORIGEN: mercado del oro al 6 de agosto de 2026.</div>'''

# ═══ 03 · EL PROBLEMA ════════════════════════════════════════════════════════
_REG = [("Honduras", 30.4), ("Nicaragua", 30.0), ("El Salvador", 27.3), ("Guatemala", 21.4)]
BARRAS_REG = f'''<svg viewBox="0 0 620 118" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="9" font-size="8" font-family="Helvetica" fill="{CLARO2}" letter-spacing="1.5">REMESAS COMO PORCENTAJE DEL PIB · CIERRE 2025</text>
  {"".join(
    f'<text x="0" y="{32 + i*24}" font-size="9.5" font-family="Helvetica" fill="{CLARO}">{n}</text>'
    f'<rect x="94" y="{22 + i*24}" width="300" height="12" rx="6" fill="{VERDE3}"/>'
    f'<rect x="94" y="{22 + i*24}" width="{300*v/32:.1f}" height="12" rx="6" fill="{ORO if not i else ORO_OSC}"/>'
    f'<text x="{102 + 300*v/32:.0f}" y="{32 + i*24}" font-size="9" font-family="Helvetica" '
    f'fill="{ORO if not i else CLARO2}">{str(v).replace(".", ",")} %</text>'
    for i, (n, v) in enumerate(_REG))}
  <text x="0" y="114" font-size="7.5" font-family="Helvetica" fill="{CLARO2}">Cuatro países vecinos con el mismo problema. Honduras es el caso extremo de América Latina — y la puerta de entrada.</text>
</svg>'''

p03 = f'''
  <div class="rotulo">El problema</div>
  <h2 style="color:{CLARO}">El dinero llega.<br>La gente no tiene dónde ponerlo.</h2>

  <div style="display:flex;gap:24px;margin-top:22px">
    <div style="flex:1">
      <h3 style="margin-top:0">Problema uno · el peaje</h3>
      <p>Un hondureño en Estados Unidos manda US$ 500 a su madre. El envío pasa por un
      remitente, un corresponsal, dos bancos y una casa de cambio. Cada uno cobra.</p>
      <p>A escala de país, ese peaje <strong style="color:{ORO}">se come más del 2 % del producto
      interno bruto</strong> sobre un flujo que es el 30,4 %. La aritmética da
      <strong style="color:{ORO}">6,6 % de cada envío</strong>: casi <b style="color:{CLARO}">US$ 33
      de esos 500</b>, que se quedan por el camino.</p>
    </div>
    <div style="flex:1">
      <h3 style="margin-top:0">Problema dos · la puerta cerrada</h3>
      <p>Y cuando por fin llega, llega a alguien que <strong style="color:{ORO}">probablemente no
      tiene cuenta bancaria</strong>. Solo el 39,7 % de los adultos hondureños tiene al menos una
      cuenta financiera, según el primer censo oficial del país sobre el tema.</p>
      <p>El resto cobra en efectivo, lo guarda en efectivo y lo gasta en efectivo. No tiene
      historial, no accede a crédito y paga más caro por todo.</p>
    </div>
  </div>

  <figure style="margin-top:16px">{BARRAS_REG}</figure>

  <h3>Por qué las criptomonedas no lo resolvieron en diez años</h3>
  <p class="grande" style="color:{CLARO}">Porque construyeron para quien ya tenía banco.</p>
  <p>Pidieron custodiar doce palabras, cobraron comisiones variables, no supieron decir quién era
  quién y dejaron el cumplimiento para después. Todo eso funciona para un entusiasta con una
  cuenta de respaldo. <strong style="color:{ORO}">Nada de eso funciona para una señora en
  Choluteca que cobra la remesa de su hijo.</strong></p>

  <div class="fuente">Banco Central de Honduras (remesas, cierre 2025) · Consejo Monetario
  Centroamericano (costo regional) · CNBS e INE, Módulo de Inclusión Financiera 2024, sobre
  6.546 adultos encuestados en todo el país.</div>'''

# ═══ 04 · LA IDEA ════════════════════════════════════════════════════════════
p04 = f'''
  <div class="rotulo">La idea</div>
  <h2>ORIGEN.<br>Una moneda con algo detrás.</h2>

  <p class="grande" style="margin-top:16px">Todas las monedas de la región comparten un defecto:
  pierden valor. Quien ahorra en ellas, pierde. Por eso quien puede ahorra en dólares, y quien no
  puede, pierde.</p>

  <p class="grande"><strong>ORIGEN toma su referencia del oro.</strong> Su unidad es el
  <em>gramín</em>: la cincuentaicincoava parte de un gramo de oro. Una medida pequeña a propósito,
  del tamaño de una compra de diario.</p>

  <div style="display:flex;gap:16px;align-items:stretch;margin-top:20px">
    <div style="flex:1.15;background:{VERDE};border-radius:10px;padding:22px 24px;color:{CLARO}">
      <div style="font:700 8pt Helvetica;letter-spacing:.22em;color:{ORO};text-transform:uppercase">Al 6 de agosto de 2026</div>
      <div style="font:700 44pt/1 Helvetica;color:{ORO};margin:12px 0 4px;letter-spacing:-.03em">US$ 2,50</div>
      <div style="font-size:10pt;color:{CLARO2};line-height:1.5">es lo que vale <b style="color:{CLARO}">1 ORIGEN</b>,
      porque la onza de oro cerró en US$ 4.281,83 y un gramín es 1/55 de gramo.</div>
      <div style="border-top:1px solid {LINEA};margin-top:16px;padding-top:12px;font-size:8.5pt;color:{CLARO2};line-height:1.5">
        No es un precio que fijamos nosotros: <b style="color:{CLARO}">sale del mercado del oro</b>,
        y cualquiera puede rehacer la cuenta.</div>
    </div>
    <div style="flex:1">
      <div class="tarjeta" style="margin-bottom:10px"><h4>Se entiende sin explicar</h4>
        <p>«Vale lo que vale el oro» lo entiende cualquiera, en cualquier idioma y sin haber oído
        nunca la palabra blockchain.</p></div>
      <div class="tarjeta" style="margin-bottom:10px"><h4>No la devalúa un gobierno</h4>
        <p>Su referencia es un metal, no una política monetaria. Es exactamente la razón por la
        que la gente compra dólares — pero sin depender de otro país.</p></div>
      <div class="tarjeta"><h4>Divisible hasta lo diario</h4>
        <p>Un gramo de oro son 55 ORIGEN. Sirve para pagar un almuerzo, no solo para guardar
        patrimonio.</p></div>
    </div>
  </div>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Dónde estamos y hacia dónde va, dicho con precisión</b>
    Hoy el ancla es <b>de precio</b>: ORIGEN toma su valor de la cotización real del oro, leída de
    mercado. El paso siguiente —y parte de lo que financia esta ronda— es convertir ese ancla en
    <b>respaldo con reservas físicas, custodia auditada y prueba pública de reservas</b>. Lo
    decimos así de claro porque es la primera pregunta que hace un inversionista serio, y porque
    la diferencia entre las dos cosas es exactamente donde otros proyectos se han roto.
  </div>

  <div class="crece"></div>
  <div class="fuente">Precio del oro y la plata al 6 de agosto de 2026, tomado de mercado. La
  aplicación lee la cotización en vivo y la muestra al usuario en cada consulta.</div>'''

# ═══ 05 · POR QUÉ EL ORO ═════════════════════════════════════════════════════
p05 = f'''
  <div class="rotulo">Por qué el oro</div>
  <h2 style="color:{CLARO}">Porque llevamos<br>cinco mil años<br>confiando en él.</h2>

  <div style="display:flex;gap:26px;margin-top:24px">
    <div style="flex:1">
      <p class="grande">Ninguna moneda de la región ha durado cien años sin perder la mayor parte
      de su valor. El oro lleva cinco milenios y no ha necesitado que nadie lo respalde.</p>
      <p class="grande">Anclar una moneda digital al oro no es nostalgia: es elegir la única
      referencia de valor que <strong style="color:{ORO}">nadie puede imprimir</strong>.</p>
      <h3>Y no se queda en el oro</h3>
      <p>La plata ya está en la cadena con su propio token. Y detrás vienen los recursos que
      nuestros países sí tienen y no logran convertir en mercado: energía, agro, bienes raíces,
      minerales. <strong style="color:{ORO}">Eso es lo que se tokeniza</strong> — no promesas,
      cosas.</p>
    </div>
    <div style="flex:.92">
      <div style="background:{VERDE2};border:1px solid {LINEA};border-radius:10px;padding:20px">
        <div style="font:700 8pt Helvetica;letter-spacing:.2em;color:{ORO};text-transform:uppercase;margin-bottom:16px">Los dos metales, hoy</div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <div style="width:11px;height:11px;border-radius:50%;background:{ORO}"></div>
          <div style="font:700 20pt Helvetica;color:{ORO}">US$ 4.281,83</div>
        </div>
        <div style="font-size:8.5pt;color:{CLARO2};margin:3px 0 18px 21px">la onza de oro · referencia de ORIGEN y AUKA</div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <div style="width:11px;height:11px;border-radius:50%;background:{PLATA}"></div>
          <div style="font:700 20pt Helvetica;color:{PLATA}">US$ 61,13</div>
        </div>
        <div style="font-size:8.5pt;color:{CLARO2};margin:3px 0 0 21px">la onza de plata · referencia de AGKA</div>
        <div style="border-top:1px solid {LINEA};margin-top:18px;padding-top:14px">
          <div style="font-size:8.5pt;color:{CLARO2};line-height:1.55">La cotización se lee de
          mercado en cada consulta. <b style="color:{CLARO}">No hay ningún precio inventado</b> en
          la aplicación para los activos que cotizan; y para los que no cotizan, se dice en
          pantalla que no cotizan.</div>
        </div>
      </div>
    </div>
  </div>

  <div class="resalte" style="margin-top:22px">
    <b style="display:block;color:{ORO};font-size:11.5pt;margin-bottom:5px">El argumento que gana en la mesa de la cocina</b>
    A una persona no bancarizada no la convence una explicación sobre consenso distribuido. La
    convence esto: <b>«esto vale oro, y el oro no se devalúa»</b>. Es la conversación más fácil
    de tener en toda la industria, y es la que nadie más en la región está teniendo.
  </div>

  <div class="crece"></div>'''

# ═══ 06 · LA LAYER 1 ═════════════════════════════════════════════════════════
p06 = f'''
  <div class="rotulo">La Layer 1</div>
  <h2>La cadena es nuestra.<br>Y eso lo cambia todo.</h2>

  <p class="grande" style="margin-top:14px">Casi todos los proyectos de la región emiten un token
  sobre la cadena de otro. Nosotros levantamos la cadena. Estas son sus especificaciones,
  consultadas en vivo:</p>

  <table style="margin-top:14px">
    <thead><tr><th style="width:32%">Especificación</th><th style="width:30%">Valor</th><th style="width:38%">Cómo se comprobó</th></tr></thead>
    <tbody>
      <tr><td><b>Identificador de red</b></td><td>8532</td><td><code>eth_chainId</code> → <code>0x2154</code></td></tr>
      <tr><td><b>Máquina virtual</b></td><td>Compatible con Ethereum</td><td>Cualquier contrato o billetera funciona sin cambios</td></tr>
      <tr><td><b>Consenso</b></td><td>IBFT con garantía en depósito</td><td>Contrato del sistema activo en la cadena</td></tr>
      <tr><td><b>Tiempo entre bloques</b></td><td>15,3 segundos</td><td>Medido sobre 51.200 bloques reales</td></tr>
      <tr><td><b>Capacidad por bloque</b></td><td>10.000.000 de gas</td><td>Leído del último bloque</td></tr>
      <tr><td><b>Comisión por transacción</b></td><td><b>Cero</b></td><td><code>eth_gasPrice</code> → <code>0x0</code></td></tr>
      <tr><td><b>Altura de la cadena</b></td><td>4.135.164 bloques</td><td><code>eth_blockNumber</code>, en vivo</td></tr>
      <tr><td><b>Tiempo en producción</b></td><td>22 meses ininterrumpidos</td><td>Marcas de tiempo de la propia cadena</td></tr>
      <tr><td><b>Infraestructura</b></td><td>6 nodos · 2 regiones</td><td>Inventario de nube verificado</td></tr>
      <tr><td><b>Tokens desplegados</b></td><td><b>14</b> + la moneda nativa</td><td>Contratos leídos del explorador</td></tr>
    </tbody>
  </table>

  <div class="tarjetas" style="margin-top:12px">
    <div class="tarjeta"><h4>El dial es nuestro</h4>
      <p>El tiempo entre bloques y la capacidad son <b>parámetros</b>, no límites de diseño.
      Subirlos es una decisión, no una reescritura. En una cadena ajena, ese dial lo tiene otro.</p></div>
    <div class="tarjeta"><h4>Comisión cero, de verdad</h4>
      <p>No es una promoción ni un subsidio temporal: está medido en la cadena. Mientras el
      validador sea propio, cuesta lo que cuesta el servidor.</p></div>
    <div class="tarjeta"><h4>Nadie nos puede apagar</h4>
      <p>Ni subirnos el precio, ni cambiarnos las reglas, ni caerse y arrastrarnos. La
      continuidad del negocio no depende de la hoja de ruta de un tercero.</p></div>
  </div>

  <div class="crece"></div>
  <div class="fuente">Todas las especificaciones se consultaron directamente contra la cadena en
  producción el 5 y el 6 de agosto de 2026.</div>'''

# ═══ 07 · CAPACIDAD Y COSTO ══════════════════════════════════════════════════
COMPARA = f"""<svg viewBox="0 0 620 200" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="10" font-size="8" font-family="Helvetica" fill="{CLARO2}" letter-spacing="1.5">ENVIAR US$ 500 DE ESTADOS UNIDOS A HONDURAS · CUÁNTO LLEGA</text>

  <text x="0" y="44" font-size="10" font-family="Helvetica" fill="{CLARO}">Remesa tradicional</text>
  <rect x="0" y="54" width="500" height="36" rx="7" fill="{VERDE3}"/>
  <rect x="0" y="54" width="467" height="36" rx="7" fill="{CLARO2}"/>
  <text x="16" y="77" font-size="14" font-family="Helvetica" font-weight="700" fill="{VERDE}">US$ 467,11</text>
  <text x="516" y="77" font-size="12" font-family="Helvetica" font-weight="700" fill="{ORO}">− US$ 32,89</text>

  <text x="0" y="128" font-size="10" font-family="Helvetica" fill="{CLARO}">Con ORIGEN</text>
  <rect x="0" y="138" width="500" height="36" rx="7" fill="{ORO}"/>
  <text x="16" y="161" font-size="14" font-family="Helvetica" font-weight="700" fill="{VERDE}">US$ 500,00</text>
  <text x="516" y="161" font-size="12" font-family="Helvetica" font-weight="700" fill="{OK}">− 0</text>

  <text x="0" y="194" font-size="7.5" font-family="Helvetica" fill="{CLARO2}">El 6,6 % se deriva de las cifras regionales de la página 3. La comisión cero de ORIGEN está medida en la cadena, no proyectada.</text>
</svg>"""

p07 = f'''
  <div class="rotulo">Lo que cambia para la gente</div>
  <h2 style="color:{CLARO}">Treinta y tres dólares<br>que se quedan en la casa.</h2>

  <figure style="margin-top:20px">{COMPARA}</figure>

  <p class="grande" style="margin-top:14px">Para una familia que recibe US$ 500 al mes, son
  <strong style="color:{ORO}">casi US$ 400 al año</strong> que hoy se quedan en el camino. Eso es
  el argumento de venta. Todo lo demás es cómo se hace posible.</p>

  <h3>Y la red aguanta el volumen</h3>
  <div class="cifras" style="margin-top:6px">
    <div><div class="dato">476</div><div class="etq">transferencias por bloque</div></div>
    <div><div class="dato">31</div><div class="etq">por segundo</div></div>
    <div><div class="dato oro">2,7 M</div><div class="etq">por día · configuración actual</div></div>
    <div><div class="dato">0</div><div class="etq">de comisión en todas ellas</div></div>
  </div>

  <p style="margin-top:10px">Con los parámetros de hoy la cadena liquida
  <strong style="color:{CLARO}">2,7 millones de transferencias diarias</strong>. Suponiendo un
  envío medio de US$ 500, el corredor hondureño entero serían unas
  <strong style="color:{CLARO}">67.000 al día</strong>: la red actual lo absorbe
  <strong style="color:{ORO}">cuarenta veces</strong>, y subir la capacidad es cambiar un número,
  no reconstruir nada.</p>

  <div class="resalte" style="margin-top:16px">
    <b style="display:block;color:{ORO};font-size:11.5pt;margin-bottom:5px">Y ahora multiplíquelo por el país entero</b>
    Ese 6,6 % sobre los US$ 12.212 millones que entran cada año significa que Honduras paga del
    orden de <b style="color:{CLARO}">US$ 800 millones anuales</b> solo en comisiones de envío.
    Ese es el tamaño real del bolsillo que estamos abriendo — y no hay que convencer a nadie de
    que le duele.
  </div>

  <div class="crece"></div>
  <div class="fuente">Capacidad calculada sobre los parámetros reales de la cadena: 10.000.000 de
  gas por bloque, 21.000 de gas por transferencia simple, 15,3 segundos entre bloques.</div>'''

# ═══ 08 · LOS 14 TOKENS ══════════════════════════════════════════════════════
TOKENS = [
    ("ORIGEN", "Moneda nativa", "1/55 g de oro", ORO, True),
    ("AUKA", "Gold Kapital", "Oro · 1 onza", ORO, False),
    ("AGKA", "Silver Kapital", "Plata · 1 onza", PLATA, False),
    ("ONDK", "Orden Kapital", "Gobernanza", ORO_OSC, False),
    ("IBS", "IBS Energy", "Energía", "#4E9E86", False),
    ("SOL", "Solar", "Energía solar", "#D9A441", False),
    ("AGRO", "Agrotech", "Agro", "#6BA368", False),
    ("REST", "Real State", "Bienes raíces", "#8A9BA8", False),
    ("AIT", "Artificial Intelligence", "Tecnología", "#7C93C3", False),
    ("HARV", "Harvi", "Ecosistema", "#9C8AA5", False),
    ("ASL", "Athletic", "Deporte", "#C3806B", False),
    ("LOVE", "Amor Global", "Comunidad", "#C77B9E", False),
    ("MNKA", "Monarka", "Ecosistema", "#8AA5A0", False),
    ("AUBEX", "Aubex", "Ecosistema", "#A0937D", False),
    ("POLITICAL", "Political", "Sector público", "#7E8CA0", False),
]
_filas = "".join(
    f'<div style="display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:7px;'
    f'background:{"#FBF8F1" if destaca else "#FAFCFB"};border:1px solid {ORO if destaca else "#DDE5E3"}">'
    f'<div style="width:9px;height:9px;border-radius:50%;background:{c};flex:none"></div>'
    f'<div style="flex:1;min-width:0"><div style="font:700 9pt Helvetica;color:{VERDE}">{s}</div>'
    f'<div style="font-size:7.5pt;color:{SUAVE};line-height:1.3">{n}</div></div>'
    f'<div style="font-size:7.5pt;color:{ORO_OSC};text-align:right;max-width:32mm">{r}</div></div>'
    for s, n, r, c, destaca in TOKENS)

p08 = f'''
  <div class="rotulo">La economía tokenizada</div>
  <h2>Quince activos.<br>Ya en la cadena.</h2>

  <p class="grande" style="margin-top:12px">Esto no es una hoja de ruta. Son la moneda nativa y
  <strong>catorce contratos vivos en la cadena 8532</strong>, cada uno con su dirección pública y
  su suministro, que cualquiera puede consultar en el explorador ahora mismo.</p>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:16px">{_filas}</div>

  <p style="margin-top:14px;font-size:10.5pt">Metales preciosos, energía, energía solar,
  agricultura, bienes raíces, inteligencia artificial, deporte y comunidad.
  <strong>Es el mapa de lo que nuestros países producen</strong> — y de lo que hasta ahora no han
  sabido convertir en mercado accesible.</p>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Dicho con honestidad, porque importa</b>
    De estos catorce, <b>AUKA y AGKA siguen el precio real</b> del oro y la plata, leído de
    mercado. Los tokens de sector <b>todavía no tienen un activo físico verificado detrás</b>: hoy
    representan al proyecto de su sector, y así se describe en la propia aplicación. Convertirlos
    en instrumentos con respaldo auditado —custodia, valuación independiente y prueba de reservas—
    es un trabajo legal y financiero, no técnico, y es <b>exactamente una de las cosas que
    financia esta ronda</b>.
  </div>

  <table style="margin-top:6px">
    <thead><tr><th style="width:16%">Token</th><th style="width:30%">Nombre en la cadena</th>
    <th style="width:28%">Suministro emitido</th><th style="width:26%">Referencia</th></tr></thead>
    <tbody>
      <tr><td><b>ONDK</b></td><td>Orden Kapital</td><td class="n">555.000.000</td><td>Gobernanza del ecosistema</td></tr>
      <tr><td><b>AUKA</b></td><td>Gold Kapital</td><td class="n">55.000.000</td><td>Precio del oro · 1 onza</td></tr>
      <tr><td><b>AGKA</b></td><td>Silver Kapital</td><td class="n">500.000.000</td><td>Precio de la plata · 1 onza</td></tr>
    </tbody>
  </table>

  <div class="crece"></div>
  <div class="fuente">Los catorce contratos y sus suministros se leyeron del explorador de la
  cadena el 6 de agosto de 2026. La tabla detalla los tres mayores.</div>'''

# ═══ 09 · RECURSOS TANGIBLES ═════════════════════════════════════════════════
CADENA_VALOR = f'''<svg viewBox="0 0 620 168" xmlns="http://www.w3.org/2000/svg">{PUNTA}
  <text x="0" y="10" font-size="8" font-family="Helvetica" fill="{CLARO2}" letter-spacing="1.5">DE LO QUE LA REGIÓN PRODUCE, AL TELÉFONO DE CUALQUIERA</text>
  {caja(0, 26, 108, 52, "El activo", "oro · finca · planta", ORO, "none", 9.5)}
  {caja(128, 26, 108, 52, "Custodia", "y valuación externa", ORO, "none", 9.5)}
  {caja(256, 26, 108, 52, "El token", "en la cadena 8532", ORO, "none", 9.5)}
  {caja(384, 26, 108, 52, "La billetera", "de cualquiera", ORO, "none", 9.5)}
  {caja(512, 26, 108, 52, "El comercio", "tarjeta o POS", ORO, "none", 9.5)}
  {"".join(f'<line x1="{108 + i*128}" y1="52" x2="{126 + i*128}" y2="52" stroke="{ORO}" stroke-width="1.4" marker-end="url(#p)"/>' for i in range(4))}

  <rect x="0" y="98" width="303" height="60" rx="8" fill="{VERDE2}" stroke="{OK}" stroke-width="1.2"/>
  <text x="14" y="118" font-size="9" font-family="Helvetica" font-weight="700" fill="{OK}">Construido y funcionando</text>
  <text x="14" y="134" font-size="8" font-family="Helvetica" fill="{CLARO2}">Los pasos 3, 4 y 5: la cadena, los tokens, la billetera,</text>
  <text x="14" y="146" font-size="8" font-family="Helvetica" fill="{CLARO2}">la identidad y el circuito de tarjeta.</text>

  <rect x="317" y="98" width="303" height="60" rx="8" fill="{VERDE2}" stroke="{ORO}" stroke-width="1.2"/>
  <text x="331" y="118" font-size="9" font-family="Helvetica" font-weight="700" fill="{ORO}">Lo que financia esta ronda</text>
  <text x="331" y="134" font-size="8" font-family="Helvetica" fill="{CLARO2}">Los pasos 1 y 2: custodia, valuación independiente,</text>
  <text x="331" y="146" font-size="8" font-family="Helvetica" fill="{CLARO2}">prueba de reservas y estructura legal en cada país.</text>
</svg>'''

p09 = f'''
  <div class="rotulo">Recursos tangibles</div>
  <h2 style="color:{CLARO}">Nuestros países tienen<br>de todo menos mercado.</h2>

  <p class="grande" style="margin-top:14px">América Latina exporta oro, plata, café, energía y
  tierra. Lo que no tiene es una forma de que <strong style="color:{ORO}">una persona común sea
  dueña de un pedazo de eso</strong> sin un banco, un corredor y un mínimo de diez mil dólares.</p>

  <p class="grande">Tokenizar es exactamente eso: partir un activo grande en pedazos pequeños que
  quepan en un teléfono. La tecnología para hacerlo ya está desplegada. Lo que falta es la
  arquitectura legal y de custodia — y ese es un problema conocido, con solución conocida y con
  precio conocido.</p>

  <figure style="margin-top:14px">{CADENA_VALOR}</figure>

  <div class="tarjetas">
    <div class="tarjeta"><h4>Para el pequeño ahorrador</h4>
      <p>Puede tener oro por diez dólares en vez de por diez mil. Es la primera vez que el
      ahorro en metal está a su alcance.</p></div>
    <div class="tarjeta"><h4>Para el productor</h4>
      <p>Una finca, una planta solar o una bodega pueden financiarse vendiendo participaciones
      pequeñas, sin pasar por la banca tradicional.</p></div>
    <div class="tarjeta"><h4>Para la región</h4>
      <p>El capital deja de salir para invertirse afuera. Se queda circulando sobre lo que
      producimos aquí.</p></div>
  </div>

  <div class="crece"></div>'''

# ═══ 10 · CÓMO SE GASTA ══════════════════════════════════════════════════════
p10 = f'''
  <div class="rotulo">Cómo se gasta</div>
  <h2>Una moneda que no se puede<br>gastar no es una moneda.</h2>

  <p class="grande" style="margin-top:12px">Es el punto donde fracasan casi todos los proyectos de
  la industria: crean el activo y nunca resuelven el último metro — el momento de pagar en la
  pulpería.</p>

  <div style="display:flex;gap:16px;margin-top:16px;align-items:flex-start">
    <div style="flex:1.05">
      <h3 style="margin-top:0">La tarjeta</h3>
      <p>El circuito completo está construido dentro de la aplicación: solicitud, fondeo desde el
      saldo, límites y gasto acumulado, congelar y descongelar, cambio de PIN, ver el número
      completo, disputas, reemisión y cancelación. <strong>Se comprobó que el servidor responde a
      todas esas rutas y exige sesión en cada una.</strong></p>
      <p>El usuario recarga con ORIGEN y paga en cualquier comercio que acepte tarjeta. El
      comercio no tiene que saber qué es una blockchain — cobra como cobra siempre.</p>

      <h3>El punto de venta</h3>
      <p>MyTokenPay es la pieza del ecosistema para cobrar directamente en el comercio, con la
      identidad del comprador ya verificada. Su integración está disponible y su clave de servicio
      emitida.</p>
    </div>
    <div style="flex:.95">
      <div class="telefono" style="max-width:52mm;margin:0 auto"><img src="recursos/img/w-tarjeta.jpg" alt="Tarjeta"></div>
      <div class="epigrafe" style="margin-top:8px">La tarjeta dentro de Veta Wallet</div>
    </div>
  </div>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">El estado exacto de la tarjeta</b>
    La aplicación y el servidor están construidos y hablan con un emisor. Lo que queda por cerrar
    —y va en el uso de fondos— es el <b>acuerdo comercial con el emisor y la red de tarjetas</b>
    para operar a escala, más las licencias que cada país exige para mover dinero. Lo decimos
    porque un inversionista lo va a preguntar en la primera reunión, y preferimos que lo lea aquí.
  </div>

  <div class="crece"></div>'''

# ═══ 11 · VETA WALLET ════════════════════════════════════════════════════════
p11 = f'''
  <div class="rotulo">El producto · 1 de 3</div>
  <h2 style="color:{CLARO}">Veta Wallet.<br>Diseñada para quien<br>nunca tuvo banco.</h2>

  <div class="telefonos" style="margin-top:16px">
    <div class="telefono"><img src="recursos/img/w-home.jpg" alt="Inicio"></div>
    <div class="telefono"><img src="recursos/img/w-remesas.jpg" alt="Remesas"></div>
    <div class="telefono"><img src="recursos/img/w-enviar.jpg" alt="Enviar"></div>
    <div class="telefono"><img src="recursos/img/w-kyc.jpg" alt="Verificación"></div>
  </div>
  <div class="epigrafe">Interfaz de Veta Wallet. Prototipo de diseño con saldos de ejemplo; la
  aplicación Android está construida, probada en teléfono real y en su versión 1.32.</div>

  <div class="tarjetas" style="margin-top:14px">
    <div class="tarjeta"><h4>Sin doce palabras que perder</h4>
      <p>Perder el teléfono no es perder el dinero. Entra desde otro aparato con su correo y su
      clave. Es la diferencia entre una billetera para entusiastas y una para todos.</p></div>
    <div class="tarjeta"><h4>La identidad, adentro</h4>
      <p>Documento, rostro y prueba de vida dentro de la aplicación. Sin ir a una oficina, sin
      mandar papeles y sin saber leer términos legales.</p></div>
    <div class="tarjeta"><h4>En su idioma, con su moneda</h4>
      <p>Español e inglés completos, y el valor siempre mostrado también en dólares para que
      nadie tenga que calcular nada.</p></div>
  </div>

  <div class="cifras" style="margin-top:6px">
    <div><div class="dato">1.32</div><div class="etq">versión publicada</div></div>
    <div><div class="dato">20</div><div class="etq">pantallas</div></div>
    <div><div class="dato oro">68</div><div class="etq">entregas de la app</div></div>
    <div><div class="dato">2</div><div class="etq">idiomas completos</div></div>
  </div>

  <div class="crece"></div>'''

# ═══ 12 · GENESIS ID ═════════════════════════════════════════════════════════
p12 = f'''
  <div class="rotulo">El producto · 2 de 3</div>
  <h2>Genesis ID.<br>La llave que abre la puerta.</h2>

  <p class="grande" style="margin-top:12px">Aquí está el detalle que casi nadie ve: <strong>a un no
  bancarizado no lo excluye la falta de dinero. Lo excluye la falta de papeles procesables.</strong>
  Un banco le pide comprobantes que no tiene y una sucursal que le queda a tres horas.</p>

  <p class="grande">Genesis ID convierte una cédula y una cara en una identidad verificada, desde
  un teléfono, en minutos. <strong>Es la pieza que convierte a un excluido en cliente.</strong></p>

  <div class="captura" style="margin-top:10px">
    <img src="recursos/img/genesis-panel.jpg" alt="Panel de cumplimiento">
  </div>
  <div class="epigrafe">Panel de cumplimiento de Genesis ID. Instancia de demostración con datos
  ficticios; la de producción opera con 19.178 fichas de sanciones cargadas.</div>

  <div class="cifras" style="margin-top:12px">
    <div><div class="dato">19.178</div><div class="etq">fichas de sanciones</div></div>
    <div><div class="dato">117</div><div class="etq">pruebas automáticas</div></div>
    <div><div class="dato oro">100 %</div><div class="etq">acierto en cotejo facial</div></div>
    <div><div class="dato">249</div><div class="etq">países reconocidos</div></div>
  </div>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Y además es un negocio en sí mismo</b>
    Cualquier empresa de la región que quiera mover dinero necesita esto y no lo tiene. Genesis ID
    está construido para atender a varias aplicaciones a la vez, con permisos distintos para cada
    una. <b>Licenciarlo a terceros es una línea de ingresos que no depende del éxito de la
    billetera.</b>
  </div>

  <div class="crece"></div>'''

# ═══ 13 · LA CADENA EN VIVO ══════════════════════════════════════════════════
p13 = f'''
  <div class="rotulo">El producto · 3 de 3</div>
  <h2 style="color:{CLARO}">Y todo queda escrito<br>donde cualquiera lo ve.</h2>

  <div class="captura" style="margin-top:14px">
    <img src="recursos/img/scan-inicio.jpg" alt="Explorador ordenscan">
  </div>
  <div class="epigrafe">ordenscan.com · abierto al público. Cada bloque, cada transacción, cada
  dirección y cada token, consultables sin pedir permiso a nadie.</div>

  <p class="grande" style="margin-top:14px">Un explorador público no es un adorno: es la
  diferencia entre pedir confianza y <strong style="color:{ORO}">poder demostrarla</strong>. Todo
  lo que afirma este documento sobre la cadena se puede verificar ahí en treinta segundos.</p>

  <div class="crece"></div>'''

# ═══ 14 · EL TABLERO ═════════════════════════════════════════════════════════
p14 = f'''
  <div class="rotulo">El tablero, sin maquillaje</div>
  <h2>Lo que está hecho<br>y lo que no.</h2>

  <p style="margin-top:10px">Un inversionista serio pregunta por lo que falta antes que por lo que
  sobra. Esto es todo, medido el 6 de agosto de 2026.</p>

  <table style="margin-top:12px">
    <thead><tr><th style="width:27%">Pieza</th><th style="width:48%">Estado real</th><th style="width:25%">&nbsp;</th></tr></thead>
    <tbody>
      <tr><td><b>Cadena 8532</b></td><td>Bloques cada 15,3 s desde hace 22 meses, sin interrupción</td><td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b>Moneda ORIGEN</b></td><td>Nativa, con ancla de precio en el oro leída de mercado</td><td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b>14 tokens</b></td><td>Contratos desplegados con suministro definido</td><td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b>Explorador</b></td><td>Público, cumple el estándar internacional</td><td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b>Genesis ID</b></td><td>Operando, listas al día, bitácora íntegra</td><td><span class="pastilla viva" style="font-size:7pt">En producción</span></td></tr>
      <tr><td><b>Veta Wallet</b></td><td>Versión 1.32 Android, probada en teléfono real</td><td><span class="pastilla" style="font-size:7pt">Lista para tienda</span></td></tr>
      <tr><td><b>Tarjeta</b></td><td>Circuito construido; falta el acuerdo con el emisor a escala</td><td><span class="pastilla" style="font-size:7pt">Por cerrar</span></td></tr>
      <tr><td><b>Descentralización</b></td><td>Un validador activo; cinco nodos al 61 %, listos en 17-23 h</td><td><span class="pastilla" style="font-size:7pt">En curso</span></td></tr>
      <tr><td><b>Respaldo físico</b></td><td>Ancla de precio hoy; reservas y custodia auditada, pendientes</td><td><span class="pastilla" style="font-size:7pt">Por construir</span></td></tr>
      <tr><td><b>Licencias</b></td><td>Autorización para operar como transmisor de dinero, por país</td><td><span class="pastilla" style="font-size:7pt">Por obtener</span></td></tr>
    </tbody>
  </table>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Léalo al revés: eso es la oportunidad</b>
    Los seis primeros renglones son <b>años de trabajo ya pagados</b>. Los cuatro últimos son
    dinero y tiempo, con precio conocido y riesgo medible. La mayoría de proyectos que buscan
    capital están exactamente al revés.
  </div>

  <div class="crece"></div>'''

# ═══ 15 · EXPANSIÓN ══════════════════════════════════════════════════════════
FASES = [
    ("Fase 1", "Honduras", "El corredor más dependiente de América Latina. 12.212 millones y 6 de cada 10 sin banco.", ORO, 100),
    ("Fase 2", "Triángulo Norte", "Guatemala y El Salvador. Mismo idioma, mismo corredor, mismo problema.", ORO_OSC, 74),
    ("Fase 3", "Centroamérica", "Nicaragua y Costa Rica. 47.730 millones de remesas al año en la región.", "#7E8F86", 52),
    ("Fase 4", "América Latina", "México, Colombia, Perú, Ecuador. El corredor de remesas más grande del mundo.", "#5C6B68", 32),
    ("Fase 5", "Global", "Cualquier corredor con alta remesa y baja bancarización: África occidental, sudeste asiático.", "#48534F", 16),
]
_esc = "".join(
    f'<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:13px">'
    f'<div style="width:15mm;flex:none;text-align:right">'
    f'<div style="font:700 8pt Helvetica;letter-spacing:.14em;color:{c};text-transform:uppercase">{f}</div></div>'
    f'<div style="flex:none;width:3px;background:{c};align-self:stretch;border-radius:2px"></div>'
    f'<div style="flex:1">'
    f'<div style="font:700 12pt Helvetica;color:{VERDE};margin-bottom:2px">{n}</div>'
    f'<div style="font-size:9.5pt;color:{SUAVE};line-height:1.45">{d}</div>'
    f'<div style="height:5px;border-radius:3px;background:#EEF3F1;margin-top:7px">'
    f'<div style="height:5px;width:{w}%;border-radius:3px;background:{c}"></div></div></div></div>'
    for f, n, d, c, w in FASES)

p15 = f'''
  <div class="rotulo">La expansión</div>
  <h2>Un corredor primero.<br>Después, todos.</h2>

  <p class="grande" style="margin-top:12px">La estrategia no es salir al mundo el primer día. Es
  <strong>ganar un corredor completo</strong> —el más difícil y el más dependiente— y usarlo como
  prueba viviente para el siguiente.</p>

  <div style="margin-top:20px">{_esc}</div>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Por qué esto se replica solo</b>
    Cada país nuevo reutiliza <b>la misma cadena, la misma moneda, la misma billetera y el mismo
    motor de identidad</b>. Lo que cambia es la licencia local y el socio de liquidación. El costo
    marginal de entrar al país número cinco es una fracción del que costó el primero — y la red de
    usuarios ya verificados viaja con nosotros.
  </div>

  <div class="crece"></div>
  <div class="fuente">Cifras de remesas: Banco Central de Honduras y Consejo Monetario
  Centroamericano, cierre 2025.</div>'''

# ═══ 16 · MODELO DE NEGOCIO ══════════════════════════════════════════════════
p16 = f'''
  <div class="rotulo">Cómo gana dinero</div>
  <h2 style="color:{CLARO}">Cinco fuentes.<br>Cuatro ya construidas.</h2>

  <table style="margin-top:16px">
    <thead><tr><th style="width:24%">Fuente</th><th style="width:46%">De qué se cobra</th><th style="width:30%">Estado</th></tr></thead>
    <tbody>
      <tr><td><b style="color:{CLARO}">Remesas y cambio</b></td>
        <td>Diferencial sobre el envío internacional y su conversión. El volumen del mercado son los doce mil millones de la página 2</td>
        <td><span class="pastilla viva" style="font-size:7pt">Producto construido</span></td></tr>
      <tr><td><b style="color:{CLARO}">Tarjeta</b></td>
        <td>Emisión, recarga y comisión de intercambio en cada compra del titular</td>
        <td><span class="pastilla viva" style="font-size:7pt">Producto construido</span></td></tr>
      <tr><td><b style="color:{CLARO}">Comercios</b></td>
        <td>Cobro en el punto de venta con la identidad del comprador ya verificada</td>
        <td><span class="pastilla" style="font-size:7pt">Clave emitida · sin activar</span></td></tr>
      <tr><td><b style="color:{CLARO}">Identidad como servicio</b></td>
        <td>Licenciar Genesis ID a empresas que necesitan cumplimiento y no quieren construirlo</td>
        <td><span class="pastilla" style="font-size:7pt">Motor listo · sin comercializar</span></td></tr>
      <tr><td><b style="color:{CLARO}">Tokenización de activos</b></td>
        <td>Comisión de emisión y de custodia sobre cada activo real que se pone en la cadena</td>
        <td><span class="pastilla" style="font-size:7pt">Cadena lista · falta estructura legal</span></td></tr>
    </tbody>
  </table>

  <h3>La palanca que casi nadie tiene</h3>
  <p class="grande">Hoy usar la cadena <strong style="color:{CLARO}">no cuesta nada</strong>, y eso
  está medido. Es una decisión, no una limitación: la comisión se puede activar el día que
  convenga y el ingreso se queda dentro. En una cadena ajena, ese ingreso se lo lleva otro y el
  precio lo pone otro.</p>

  <div class="resalte">
    <b style="display:block;color:{ORO};font-size:11.5pt;margin-bottom:5px">Lo que este documento no dice</b>
    No hay proyecciones de ingresos, de usuarios ni de valoración. No las hay porque no están
    medidas, y este documento solo afirma lo que se puede comprobar. Se presentan aparte, con sus
    supuestos a la vista y sujetas a discusión — que es como deben discutirse.
  </div>

  <div class="crece"></div>'''

# ═══ 17 · POR QUÉ AHORA ══════════════════════════════════════════════════════
p17 = f'''
  <div class="rotulo">Por qué ahora</div>
  <h2>Cuatro cosas coinciden<br>por primera vez.</h2>

  <div style="margin-top:20px">
    {"".join(
      f'<div style="display:flex;gap:18px;margin-bottom:19px;align-items:flex-start">'
      f'<div class="enorme" style="line-height:.82;min-width:56px;font-size:46pt">{i+1}</div>'
      f'<div><h3 style="margin:0 0 4px">{t}</h3>'
      f'<p style="margin:0;font-size:10.5pt;line-height:1.5">{d}</p></div></div>'
      for i, (t, d) in enumerate([
        ("El mercado crece a dos dígitos",
         "Las remesas a Honduras subieron <b>25,3 %</b> en 2025 y el primer cuatrimestre de 2026 "
         "cerró <b>14,3 %</b> por encima. No hay que crear el mercado: ya está, creciendo y mal atendido."),
        ("El oro está en máximos",
         "La onza cerró en <b>US$ 4.281,83</b>. Una moneda anclada al oro nunca ha tenido un "
         "argumento más fácil de explicar a alguien que ha visto su moneda perder valor toda la vida."),
        ("La tecnología dejó de ser el obstáculo",
         "La cadena corre, la moneda existe, catorce tokens están desplegados y la identidad opera. "
         "Hace dos años esto era una presentación con un plan; hoy es una presentación con "
         "<b>un explorador público que se abre en el navegador</b>."),
        ("El cumplimiento pasó de estorbo a ventaja",
         "Mientras el sector trataba la identidad como un trámite que retrasa, aquí se construyó "
         "como parte del producto. Ahora que ningún operador serio puede mover dinero sin ella, "
         "<b>el camino lento resultó ser el único que llega</b>."),
      ]))}
  </div>

  <div class="crece"></div>
  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">La pregunta que deja este documento</b>
    No es si esto se puede construir: ya está construido y se comprueba en público. Es
    <b>cuánto tarda alguien más en llegar aquí</b> — y si para entonces el corredor de remesas más
    dependiente del continente ya tiene dueño.
  </div>'''

# ═══ 18 · LA INVERSIÓN ═══════════════════════════════════════════════════════
p18 = f'''
  <div class="rotulo">La inversión</div>
  <h2 style="color:{CLARO}">El riesgo técnico<br>ya lo pagamos nosotros.</h2>

  <p class="grande" style="margin-top:12px">La mayoría de proyectos pide capital para
  <em>construir</em>. Aquí la cadena lleva veintidós meses produciendo bloques, la billetera está
  en su versión 1.32 y la identidad opera con casi veinte mil fichas de sanciones cargadas.
  <strong style="color:{ORO}">Lo que queda es comercial, legal y regulatorio</strong> — un riesgo
  distinto y mucho más medible.</p>

  <table style="margin-top:16px">
    <thead><tr><th style="width:32%">Destino</th><th style="width:50%">Para qué</th><th style="width:18%">Del total</th></tr></thead>
    <tbody>
      <tr><td><b style="color:{CLARO}">Licencias y cumplimiento</b></td>
        <td>Autorización de transmisor de dinero por país, auditoría externa del sistema de cumplimiento y asesoría regulatoria</td><td>—</td></tr>
      <tr><td><b style="color:{CLARO}">Reservas y custodia</b></td>
        <td>Convertir el ancla de precio en respaldo real: metal en custodia, valuación independiente y prueba pública de reservas</td><td>—</td></tr>
      <tr><td><b style="color:{CLARO}">Adquisición de usuarios</b></td>
        <td>Captación en el corredor Estados Unidos–Honduras, donde está el 98,46 % del flujo</td><td>—</td></tr>
      <tr><td><b style="color:{CLARO}">Liquidez operativa</b></td>
        <td>Fondo para liquidar remesas en el momento, sin hacer esperar a quien recibe</td><td>—</td></tr>
      <tr><td><b style="color:{CLARO}">Emisor y red de tarjetas</b></td>
        <td>Cerrar el acuerdo para operar la tarjeta a escala</td><td>—</td></tr>
      <tr><td><b style="color:{CLARO}">Equipo</b></td>
        <td>Cumplimiento, soporte y desarrollo de comercios</td><td>—</td></tr>
    </tbody>
  </table>

  <h3>Lo que la organización ya puso</h3>
  <div class="tarjetas">
    <div class="tarjeta"><h4>La infraestructura</h4><p>Cadena, moneda, catorce tokens, billetera, identidad y explorador. Construidos, desplegados y funcionando.</p></div>
    <div class="tarjeta"><h4>El conocimiento del terreno</h4><p>El corredor de remesas más dependiente del continente, conocido desde dentro y no desde un informe.</p></div>
    <div class="tarjeta"><h4>El cumplimiento propio</h4><p>El activo que los competidores alquilan por consulta y aquí es de la casa.</p></div>
  </div>

  <div class="crece"></div>'''

# ═══ 19 · RIESGOS ════════════════════════════════════════════════════════════
p19 = f'''
  <div class="rotulo">Los riesgos</div>
  <h2>Lo que puede salir mal,<br>dicho por nosotros.</h2>

  <p style="margin-top:10px">Preferimos que lo lea aquí y no que lo descubra después. Cada uno
  lleva lo que estamos haciendo al respecto.</p>

  <table style="margin-top:12px">
    <thead><tr><th style="width:26%">Riesgo</th><th style="width:37%">Qué significa</th><th style="width:37%">Qué hacemos</th></tr></thead>
    <tbody>
      <tr><td><b>Regulatorio</b></td>
        <td>Mover dinero exige licencia en cada país, y los plazos no los controlamos</td>
        <td>Es la primera partida del uso de fondos. El sistema de cumplimiento ya está construido, que es lo que suele retrasar estos trámites</td></tr>
      <tr><td><b>Un solo validador</b></td>
        <td>Hoy la cadena depende de un servidor: si se detiene, deja de producir bloques</td>
        <td>Cinco nodos más al 61 % de sincronización, listos en 17-23 horas. Es cuestión de días</td></tr>
      <tr><td><b>Respaldo del ancla</b></td>
        <td>Hoy ORIGEN sigue el precio del oro, pero no hay reservas físicas auditadas detrás</td>
        <td>Segunda partida del uso de fondos: custodia, valuación independiente y prueba pública de reservas</td></tr>
      <tr><td><b>Adopción</b></td>
        <td>Una persona no bancarizada desconfía por buenas razones y cambia de hábito despacio</td>
        <td>Entramos por donde ya hay urgencia —la remesa que ya está esperando— y no por una promesa de inversión</td></tr>
      <tr><td><b>Precio del oro</b></td>
        <td>Si el oro cae, ORIGEN cae con él</td>
        <td>Es el trato, y se dice claro: ORIGEN no promete rendimiento, promete no ser inflado por nadie</td></tr>
      <tr><td><b>Competencia</b></td>
        <td>Un actor global con más capital podría entrar al corredor</td>
        <td>Tendría que construir la cadena, la identidad y las licencias locales. Nuestra ventaja es el tiempo, y se mide en años</td></tr>
    </tbody>
  </table>

  <div class="resalte">
    <b style="display:block;color:{VERDE};font-size:11.5pt;margin-bottom:5px">Por qué le contamos esto</b>
    Porque cada cifra de este documento se puede verificar, y queremos que las verifique todas. Un
    proyecto que solo enseña lo que le favorece está pidiendo fe. Nosotros estamos pidiendo
    <b>escrutinio</b> — y es una diferencia que se nota en la primera reunión.
  </div>

  <div class="crece"></div>'''

# ═══ 20 · CIERRE ═════════════════════════════════════════════════════════════
p20 = f'''
  <div class="marca">{SELLO}<div><b>ORIGEN</b><span>Orden Global · Chain 8532</span></div></div>
  <div class="crece"></div>
  <div class="filete"></div>
  <h1 style="font-size:36pt">La moneda ya existe.<br>La cadena ya corre.<br>
  <em>Falta el mercado.</em></h1>
  <p class="entrada" style="margin-top:18px">Doce mil millones de dólares cruzan una frontera cada
  año buscando un camino mejor. Seis de cada diez personas que los reciben no tienen banco. Nadie
  ha construido para ellas.</p>
  <p class="entrada" style="margin-top:12px;color:{ORO}">Nosotros sí. Y se puede comprobar en
  treinta segundos.</p>

  <div class="crece"></div>
  <div style="border-top:1px solid {LINEA};padding-top:16px">
    <div style="font:700 9pt Helvetica;letter-spacing:.2em;color:{ORO};text-transform:uppercase;margin-bottom:12px">Compruébelo usted mismo, ahora</div>
    <table style="margin:0">
      <tbody>
        <tr><td style="border:0;padding:6px 0;color:{CLARO2};width:42%">El explorador de la cadena</td>
            <td style="border:0;padding:6px 0"><b style="color:{ORO}">ordenscan.com</b></td></tr>
        <tr><td style="border:0;padding:6px 0;color:{CLARO2};background:none">La red, en directo</td>
            <td style="border:0;padding:6px 0;background:none"><b style="color:{ORO}">ordenglobal-rpc.com</b></td></tr>
      </tbody>
    </table>
    <div style="font-size:8.5pt;color:#3E5C5A;margin-top:18px;line-height:1.55">
      {FECHA} · Documento confidencial, para uso exclusivo del destinatario.<br>
      Las cifras de la cadena se consultaron en vivo el 6 de agosto de 2026. Las de mercado llevan
      su fuente al pie de cada página. Este documento no contiene proyecciones financieras y no
      constituye una oferta de valores.
    </div>
  </div>'''

PAGINAS = [
    (p01, 0, True, ""), (p02, 2, False, "El momento"), (p03, 3, True, "El problema"),
    (p04, 4, False, "La idea"), (p05, 5, True, "Por qué el oro"),
    (p06, 6, False, "La Layer 1"), (p07, 7, True, "Lo que cambia"),
    (p08, 8, False, "La economía tokenizada"), (p09, 9, True, "Recursos tangibles"),
    (p10, 10, False, "Cómo se gasta"), (p11, 11, True, "Veta Wallet"),
    (p12, 12, False, "Genesis ID"), (p13, 13, True, "La cadena en vivo"),
    (p14, 14, False, "El tablero"), (p15, 15, False, "La expansión"),
    (p16, 16, True, "Modelo de negocio"), (p17, 17, False, "Por qué ahora"),
    (p18, 18, True, "La inversión"), (p19, 19, False, "Los riesgos"),
    (p20, 0, True, ""),
]

cuerpo = "".join(hoja(c, n, osc, tit) for c, n, osc, tit in PAGINAS)

html = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>ORIGEN · Documento de inversión</title>
<link rel="stylesheet" href="recursos/estilo-inversion.css">
</head><body>{cuerpo}</body></html>'''

pathlib.Path(__file__).parent.parent.joinpath("05-ORIGEN-Inversion.html").write_text(
    html, encoding="utf-8")
print("ORIGEN escrito ·", len(PAGINAS), "páginas")
