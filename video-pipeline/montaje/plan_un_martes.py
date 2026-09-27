#!/usr/bin/env python3
"""Escribe el plan de tiempos de «Un martes» (v5) para montaje/un_martes.py.

El plan se piensa por planos, no por segundos: cada capa (narración, tarjeta,
diálogo) se ancla a un plano y a un desfase dentro de él. Así, si un plano
cambia de largo, todo lo que viene detrás se mueve con él y nada se descuadra.
Las frases de la narración duran lo que dura su audio de verdad.

    python3 montaje/plan_un_martes.py --voces DIR [-o prompts/pelicula3_montaje.json]

Dos momentos están clavados a la música (tema compuesto a medida, 121 s):
- a los 87 s la música vuelve de golpe tras seis segundos de silencio: ahí
  cae el pago al proveedor;
- a los 113,6 s entra la ola final: ahí empieza el abrazo.
"""
from __future__ import annotations

import argparse, json
from pathlib import Path

import soundfile as sf

RAIZ = Path(__file__).resolve().parent.parent

# (plano, duración, extras). «desde» es dónde empieza el tramo dentro del clip.
PLANOS = [
    ("01_san_salvador", 4.4, {"desde": 0.2, "hora": "San Salvador, El Salvador · 6:40 a. m."}),
    ("00_taller_abre", 4.0, {"desde": 0.3}),
    ("02_cocina_nota", 4.6, {}),
    ("03_cocina_envia", 5.0, {"desde": 0.1}),
    ("04_mesa_boleto", 5.8, {"desde": 0.0}),
    ("05_calle_floristeria", 2.8, {"hora": "10:15 a. m."}),
    ("06_florista_ramo", 2.4, {}),
    ("07_qr_mostrador", 3.6, {}),
    ("08b_taller_pausa", 5.0, {"desde": 0.2, "hora": "12:10 p. m."}),
    ("14b_taller_mira", 5.6, {"desde": 0.0}),
    ("09_regalo", 4.4, {"hora": "1:30 p. m."}),
    ("10_llega_cuenta", 2.6, {}),
    ("11_un_qr_cada_uno", 4.4, {}),
    ("12_amiga_habla", 4.4, {"desde": 0.1, "audio_clip": 1.0}),
    ("12b_incredulo", 3.4, {"desde": 0.0, "audio_clip": 1.0}),
    ("13_dueno_pulgar", 4.2, {"desde": 0.25, "audio_clip": 0.7}),
    ("12c_convencido", 2.2, {"desde": 2.6}),
    ("14_taller", 2.8, {"hora": "3:40 p. m."}),
    ("16_bodega", 3.4, {"hora": "San Pedro Sula, Honduras · 3:40 p. m."}),
    ("16_honduras_llama", 5.4, {"desde": 0.2, "audio_clip": 1.0}),
    ("15_lucia_responde", 5.0, {"desde": 0.2, "audio_clip": 1.0, "hora": "San Salvador"}),
    ("17_manos_pago", 4.2, {}),
    ("18_proveedor_sync", 4.8, {"desde": 0.25, "audio_clip": 1.0, "hora": "San Pedro Sula"}),
    ("20_sofa_noche", 3.0, {"hora": "9:10 p. m."}),
    ("21_hija_sync", 6.2, {"desde": 0.25, "audio_clip": 1.0, "hora": "Madrid, España · 5:10 a. m."}),
    ("22_lucia_sonrie", 4.8, {"desde": 0.2}),
    ("23a_aeropuerto", 5.2, {"desde": 0.0, "hora": "San Salvador · 18 de diciembre"}),
    ("23b_abrazo", 4.4, {}),
    ("cierre", 5.0, {"tipo": "cierre"}),
]

# Lo que cuenta Lucía: (frase, plano, desfase dentro del plano)
NARRA = [
    ("n01", "01_san_salvador", 1.1), ("n02", "01_san_salvador", 2.3),
    ("n03", "00_taller_abre", 1.0),
    ("n04", "03_cocina_envia", 1.9), ("n05", "04_mesa_boleto", 1.8),
    ("n06", "05_calle_floristeria", 0.6),
    ("n07", "08b_taller_pausa", 0.3), ("n07b", "14b_taller_mira", 2.6),
    ("n08", "09_regalo", 0.5), ("n09", "10_llega_cuenta", 0.1), ("n10", "11_un_qr_cada_uno", 0.8),
    ("n11", "12_amiga_habla", 2.6), ("n12", "13_dueno_pulgar", 0.1),
    ("n13", "14_taller", 0.9), ("n14", "15_lucia_responde", 2.1),
    ("n15", "20_sofa_noche", 0.6), ("n16", "cierre", 0.6),
]

TARJETAS = [
    # pantalla, recortes, pie, plano, desfase, duración, sonido
    ("A_enviar.png", [[20, 400, 1060, 1010]], "Enviado a Sofía", "03_cocina_envia", 1.8, 2.8, "pago"),
    ("B_tarjeta.png", [[20, 20, 1060, 780], [20, 1440, 1060, 1650]], "El boleto de diciembre", "04_mesa_boleto", 2.0, 2.8, "pago"),
    ("C_pagar.png", [[20, 520, 1060, 1180], [20, 1450, 1060, 1620]], "Pagado", "07_qr_mostrador", 1.0, 2.4, "pago"),
    ("J_ondk.png", [[20, 20, 1060, 720]], "Su parte de Orden Global", "08b_taller_pausa", 2.3, 6.0, "tink"),
    ("E_dividir_pagado.png", [[20, 520, 1060, 1180], [20, 1450, 1060, 1620]], "Cada quien, lo suyo", "11_un_qr_cada_uno", 1.4, 2.6, "pago"),
    ("G_comprobante.png", [[20, 20, 1060, 690], [20, 1470, 1060, 1610]], "Pagado a Honduras", "17_manos_pago", 1.6, 2.4, "pago"),
]

DIALOGO = [
    # quien, texto, plano, desfase, duración
    ("amiga", "¡Ya no hay «te lo paso luego»!", "12_amiga_habla", 0.2, 2.2),
    ("amigo", "¿Y cómo sé que le llegó?", "12b_incredulo", 0.15, 2.4),
    ("Don Chepe", "Doña Lucía, el camión sale a las cuatro. Si me entra el pago hoy, la tela le llega el jueves.",
     "16_honduras_llama", 0.2, 5.0),
    ("Lucía", "Ya se lo mando, don Chepe.", "15_lucia_responde", 0.7, 1.8),
    ("Don Chepe", "Ya me cayó. ¡Súbanla!", "18_proveedor_sync", 0.6, 4.0),
    ("Sofía", "Ma, ya pagué la renta. Y ya vi el vuelo… ¡llego el dieciocho! ¿Cómo te fue hoy?", "21_hija_sync", 0.1, 5.9),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voces", required=True, help="carpeta con n01.wav… y hija_1.wav")
    ap.add_argument("--textos", help="lineas.json de la narración (si no, sale sin subtítulo)")
    ap.add_argument("-o", "--salida", default=str(RAIZ / "prompts/pelicula3_montaje.json"))
    a = ap.parse_args()

    bloques, t0 = [], {}
    t = 0.0
    for plano, dur, extra in PLANOS:
        b = {"plano": plano, "t": round(t, 3), "dur": dur}
        b.update(extra)
        bloques.append(b); t0[plano] = t; t += dur
    total = round(t, 3)
    textos = json.loads(Path(a.textos).read_text()) if a.textos else {}

    def largo(voz: str) -> float:
        i = sf.info(str(Path(a.voces) / f"{voz}.wav"))
        return i.frames / i.samplerate

    capas = [{"tipo": "nota", "t": 8.5, "dur": round(largo("hija_1"), 2), "quien": "Sofía", "voz": "hija_1",
              "texto": "Ma, buen día… ya me cobraron la renta de este mes. Y fijate que los vuelos de diciembre todavía están baratos."}]
    for voz, plano, off in NARRA:
        texto = textos.get(voz, "")
        for tag in ("[warmly] ", "[softly] ", "[cheerfully] ", "[amused] "):
            texto = texto.replace(tag, "")
        capas.append({"tipo": "narra", "t": round(t0[plano] + off, 3), "dur": round(largo(voz) + 0.35, 2),
                      "voz": voz, "texto": texto})
    # Un subtítulo se va cuando entra el siguiente: nunca dos frases a la vez.
    narras = [c for c in capas if c["tipo"] == "narra"]
    for x, y in zip(narras, narras[1:]):
        x["dur"] = round(min(x["dur"], y["t"] - x["t"] - 0.05), 2)
    # La última frase es la del cierre, que ya la dice la pantalla: solo voz.
    narras[-1]["texto"] = ""
    for pant, rec, pie, plano, off, dur, son in TARJETAS:
        capas.append({"tipo": "tarjeta", "t": round(t0[plano] + off, 3), "dur": dur, "pantalla": pant,
                      "recortes": rec, "pie": pie, "sonido": son, **({"fuerza": 1.4} if pie == "Pagado a Honduras" else {})})
    for quien, texto, plano, off, dur in DIALOGO:
        capas.append({"tipo": "dialogo", "t": round(t0[plano] + off, 3), "dur": dur, "quien": quien, "texto": texto})
    capas.append({"tipo": "chat", "t": round(t0["22_lucia_sonrie"] + 0.6, 3), "dur": 4.0, "burbujas": [
        {"lado": "entra", "texto": "¿Cómo te fue hoy?", "hora": "9:12 p. m.", "t": 0.0},
        {"lado": "sale", "texto": "Bien, mija. Un martes.", "hora": "9:18 p. m.", "t": 1.6}]})

    plan = {
        "_nota": "v5: narración de Lucía, Honduras con el proveedor a cámara, el incrédulo, tema musical a medida. "
                 "Generado por montaje/plan_un_martes.py: no editar a mano.",
        "cierre": {"frase": "Orden Global. Un sistema financiero que se puede comprobar.", "direccion": "ordenglobal.org"},
        "salida": {"ancho": 1080, "alto": 1920, "fps": 30, "dur_s": total},
        "bloques": bloques,
        "capas": capas,
        "efectos": [{"tipo": "timbre", "t": round(t0["14_taller"] + 0.3, 3)}],
    }
    Path(a.salida).write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    print(f"{a.salida}: {len(bloques)} planos, {len(capas)} capas, {total:.1f} s")
    pago = t0["17_manos_pago"] + 1.6
    abrazo = t0["23b_abrazo"]
    print(f"  pago al proveedor en {pago:.2f} s (música: 87.0) · abrazo en {abrazo:.2f} s (música: 113.6)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
