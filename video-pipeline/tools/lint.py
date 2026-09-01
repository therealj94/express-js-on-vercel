#!/usr/bin/env python3
"""Revisa un guion contra los fallos que ya pagamos, antes de encender nada.

Cada regla de aquí corresponde a un error real, con su factura. No son buenas
prácticas leídas en ningún sitio: son las quince formas concretas en que este
modelo nos ha fallado, convertidas en comprobaciones automáticas.

    python3 tools/lint.py -g prompts/og_solucion_60.json

Salida: PARA (no generes esto), REVISA (probablemente falle) y NOTA (mejorable).
"""
from __future__ import annotations

import argparse, json, re, sys
from pathlib import Path

PARA, REVISA, NOTA = "PARA ", "REVISA", "NOTA  "

# Cada entrada: (patrón, gravedad, qué pasó de verdad)
TRAMPAS_TEXTO = [
    (r"chip(ped)? (on )?(one )?(front )?tooth|crooked teeth|missing tooth|broken tooth",
     PARA, "pediste un diente picado y salió una mujer sin medio incisivo (plano 06, 31-ago)"),
    (r"\b(logo|monogram|embroidered|badge|brand)\b",
     PARA, "ningún modelo dibuja un logo real: inventa manchas con forma de letras. "
           "Va compuesto en montaje sobre un pecho liso"),
    (r"\b(sign|signage|label|poster|screen) (with|showing) .*(text|words|numbers)",
     PARA, "el texto legible sale como garabatos"),
    (r"(?<!without )\b(speaks|speaking|saying|talks|talking|says)\b|three short sentences",
     REVISA, "H3 genera su propio audio y labial: se inventó un idioma (plano 06, 31-ago). "
             "Solo si es EL plano que habla, y aun así conviene boca cerrada y doblar después"),
    (r"\btwo (people|men|women)\b.*\bone\b|\bcrowd\b",
     REVISA, "varias personas en cuadro multiplica las caras que puede deformar"),
]

# Palabras que en NEGATIVO empujan justo hacia lo que quieres evitar.
NEGATIVOS_TRAICIONEROS = [
    ("perfect teeth", "prohibirlo empuja al modelo a dientes feos. Prohíbe "
                      "'crooked teeth' y 'deformed teeth' en su lugar"),
    ("young", "prohibir edades deforma las caras entre planos"),
]

MOVIMIENTOS = {"static", "handheld", "push", "pan", "tilt", "track"}


def revisa_plano(shot: dict, defaults: dict, fmt: dict) -> list[tuple[str, str]]:
    avisos: list[tuple[str, str]] = []
    texto = f"{shot.get('still','')} {shot.get('motion','')}"
    bajo = texto.lower()
    seg = shot.get("segundos", defaults.get("duration_s", 5))

    for patron, nivel, motivo in TRAMPAS_TEXTO:
        if re.search(patron, bajo):
            avisos.append((nivel, motivo))

    # Deriva de identidad: medida, no supuesta.
    # "no face in frame" contenía la palabra "face" y marcaba como riesgo los
    # planos de manos, que son justo los seguros. Un revisor que grita en falso
    # se acaba ignorando, y entonces no sirve para nada.
    sin_cara = re.search(r"no faces? in frame|no people|no human", bajo)
    cara = re.search(r"\b(face|portrait|medium close)\b|close on a \d+ year old", bajo)
    if cara and not sin_cara and seg > 8:
        avisos.append((REVISA,
            f"{seg}s con una cara en primer plano. En el plano 06 la cara se "
            f"ensanchó y envejeció visiblemente en 10 s. Por encima de 8 s el "
            f"modelo pierde la identidad"))

    # Zoom sin freno: el push del plano 06 cerró un 61% en diez segundos.
    if shot.get("move") == "push" and not re.search(r"very slow|barely|almost imperceptible", bajo):
        avisos.append((NOTA,
            "'push' sin acotar cerró un 61% en 10 s y dejó fuera el pecho, "
            "donde va el logo. Escribe 'very slow push' o usa 'static'"))

    if shot.get("move") not in MOVIMIENTOS:
        avisos.append((NOTA, f"movimiento '{shot.get('move')}' no está en el "
                             f"vocabulario probado: {sorted(MOVIMIENTOS)}"))

    # Dos movimientos a la vez producen deriva.
    if sum(m in bajo for m in ("pans", "tilts", "pushes in", "tracks", "zooms")) > 1:
        avisos.append((REVISA, "dos movimientos de cámara en un plano: produce morphing"))

    # El fallo que costó nueve clips vacíos.
    if len(shot.get("still", "")) < 250:
        avisos.append((PARA, f"la descripción tiene {len(shot.get('still',''))} "
                             f"caracteres. La tanda del 30-ago se generó con 45 y "
                             f"salieron túneles vacíos. Por debajo de 250 desconfía"))

    if re.search(r"[áéíóúñ¿¡]", shot.get("still", "") + shot.get("motion", "")):
        avisos.append((NOTA, "hay español en el prompt: el modelo entiende "
                             "bastante mejor el inglés"))

    # 4n+1: si no cuadra, el VAE recorta o falla.
    fps = fmt.get("fps", 24)
    if (round(seg * fps / 4) * 4 + 1) != seg * fps + 1:
        avisos.append((NOTA, f"{seg}s a {fps}fps no cae en 4n+1; el runner lo "
                             f"redondea, así que el clip no durará exactamente {seg}s"))
    return avisos


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("-g", "--guion", required=True)
    a = a.parse_args()
    g = json.loads(Path(a.guion).read_text())
    dfl, fmt = g.get("defaults", {}), g.get("formato", {})

    total = {PARA: 0, REVISA: 0, NOTA: 0}

    neg = dfl.get("negative", "")
    for palabra, motivo in NEGATIVOS_TRAICIONEROS:
        if palabra in neg:
            print(f"  {REVISA}  negativo global: '{palabra}' — {motivo}")
            total[REVISA] += 1

    if fmt.get("gen_w", 0) * fmt.get("gen_h", 0) > 720 * 1280:
        print(f"  {NOTA}  {fmt['gen_w']}x{fmt['gen_h']}: medido un 22% más lento "
              f"que 720x1280 sin ganancia real, porque el máster se sube aparte")
        total[NOTA] += 1

    # Los retratos del casting también, y no es un detalle: el diente picado
    # que arruinó el plano 06 estaba escrito AHÍ, no en el plano. Revisar solo
    # los planos deja fuera el texto que se inyecta en todos ellos.
    for ficha in g.get("casting", []):
        bajo = ficha.get("retrato", "").lower()
        for patron, nivel, motivo in TRAMPAS_TEXTO:
            if re.search(patron, bajo):
                print(f"  {nivel}  casting {ficha['id']}: {motivo}")
                total[nivel] += 1

    for shot in g.get("shots", []):
        avisos = revisa_plano(shot, dfl, fmt)
        if not avisos:
            print(f"\n{shot['id']}  ok")
            continue
        print(f"\n{shot['id']}")
        for nivel, motivo in avisos:
            print(f"  {nivel}  {motivo}")
            total[nivel] += 1

    print(f"\n{'='*66}")
    print(f"PARA {total[PARA]}   REVISA {total[REVISA]}   NOTA {total[NOTA]}")
    if total[PARA]:
        print("Hay PARA: no enciendas la máquina hasta corregirlos.")
    return 1 if total[PARA] else 0


if __name__ == "__main__":
    sys.exit(main())
