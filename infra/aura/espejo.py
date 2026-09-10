# El espejo: Jose escribe «charlas» y ve que hablo AU-RA con la gente.
#
# ── LA IDEA ─────────────────────────────────────────────────────────────────
#
# Lo pidio Jose asi: «alguien me escribe, poder ver lo que contesto seria de
# ayuda — pero solo yo». Es la herramienta que faltaba para confiar en el bot:
# hoy la unica forma de saber que dijo AU-RA era entrar al panel del
# proveedor, y nadie entra a un panel desde la fila del banco.
#
#   charlas        → el resumen: quien escribio en el ultimo dia y el ultimo
#                    intercambio de cada uno
#   charla 2176    → esa persona en detalle, por las ultimas 4 cifras del
#                    numero: los ultimos mensajes, de los dos lados
#
# ── SOLO YO ─────────────────────────────────────────────────────────────────
#
# La misma lista que el parte: AURA_PARTE_PARA, via `vistazo.puede_pedirlo`.
# No es celo de mas. El espejo muestra numeros de telefono y conversaciones
# privadas de gente real; que lo abra cualquiera que adivine la palabra seria
# regalar la agenda y las charlas de los clientes.
#
# Y por lo mismo, EL QUE MIRA NO SALE EN EL ESPEJO: sus propias charlas con
# AU-RA no se listan, que para eso ya tiene su WhatsApp.
#
# ── LO QUE EL ESPEJO NO HACE ────────────────────────────────────────────────
#
# No resume con el motor ni opina: muestra TEXTUAL, recortado. Un resumen
# hecho por el modelo seria el modelo contandole a Jose que cree haber dicho
# — y si el problema es justamente que dijo algo raro, el resumen lo taparia.
# El espejo existe para ver lo que salio, no lo que el motor recuerda.

import time

DIA_MS = 24 * 3600 * 1000
TOPE = 950            # el mismo techo que el parte: si no cabe, se recorta


def _linea(texto, largo):
    t = ' '.join((texto or '').split())
    return t if len(t) <= largo else t[:largo - 1] + '…'


def _nombre(c):
    return (c.get('nombre') or '').strip() or '…' + (c.get('correo') or '')[-4:]


def resumen(rel, quien_mira, ahora_ms=None):
    """Las charlas del ultimo dia, la mas nueva primero.

    Cada una: nombre, numero, y el ultimo par pregunta→respuesta. Se leen las
    bandejas de verdad, no un recuerdo: el espejo muestra lo que SALIO.
    """
    ahora = ahora_ms or int(time.time() * 1000)
    filas = []
    for c in rel.conversaciones():
        numero = c.get('correo') or ''
        if not numero or numero == quien_mira:
            continue
        cuando = (c.get('ultimo') or {}).get('cuando') or 0
        if ahora - cuando > DIA_MS:
            continue
        charla = rel.bandeja(numero)
        ult_persona = next((m for m in reversed(charla)
                            if m.get('de') != 'aura'), None)
        ult_aura = next((m for m in reversed(charla)
                         if m.get('de') == 'aura'), None)
        filas.append({
            'nombre': _nombre(c),
            'numero': numero,
            'cuando': cuando,
            'dijo': (ult_persona or {}).get('texto') or '',
            'contesto': (ult_aura or {}).get('texto') or '',
        })
    filas.sort(key=lambda f: -f['cuando'])
    return filas


def texto_resumen(filas):
    if not filas:
        return ('Nadie escribió en las últimas 24 horas.\n\n'
                'Para ver a alguien puntual: «charla» y las últimas cifras de '
                'su número — por ejemplo «charla 2176».')
    partes = [f'{len(filas)} charla(s) en las últimas 24h:\n']
    for f in filas:
        partes.append(
            f"👤 {f['nombre']} · …{f['numero'][-4:]}\n"
            f"   dijo: {_linea(f['dijo'], 60)}\n"
            f"   AU-RA: {_linea(f['contesto'], 80)}\n")
    partes.append('El detalle: «charla» y las últimas cifras — «charla '
                  f"{filas[0]['numero'][-4:]}».")
    t = '\n'.join(partes)
    return t if len(t) <= TOPE else t[:TOPE - 1].rsplit('\n', 1)[0] + '\n…'


def detalle(rel, sufijo, quien_mira, cuantos=6):
    """Una charla en concreto, por las ultimas cifras del numero."""
    sufijo = ''.join(ch for ch in str(sufijo) if ch.isdigit())
    if len(sufijo) < 2:
        return 'Decime al menos dos cifras del final del número.'
    candidatos = [c for c in rel.conversaciones()
                  if (c.get('correo') or '').endswith(sufijo)
                  and c.get('correo') != quien_mira]
    if not candidatos:
        return f'No encuentro ninguna charla que termine en {sufijo}.'
    if len(candidatos) > 1:
        lista = ' · '.join('…' + c['correo'][-4:] for c in candidatos)
        return f'Hay varias que terminan así: {lista}. Dame una cifra más.'

    c = candidatos[0]
    charla = rel.bandeja(c['correo'])[-cuantos:]
    partes = [f"👤 {_nombre(c)} · {c['correo']} — lo último:\n"]
    for m in charla:
        voz = 'AU-RA' if m.get('de') == 'aura' else 'dijo'
        partes.append(f'{voz}: {_linea(m.get("texto"), 110)}')
    t = '\n'.join(partes)
    return t if len(t) <= TOPE else t[:TOPE - 1].rsplit('\n', 1)[0] + '\n…'
