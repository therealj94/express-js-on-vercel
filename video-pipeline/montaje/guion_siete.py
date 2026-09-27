"""Guion de «Siete» (película 4): siete personas, siete países, siete pagos en un mismo día.
Cada personaje habla con una voz de su país. Genera y mide cada línea."""
import json, os, subprocess, sys, urllib.request
from pathlib import Path

VOCES = {  # personaje: (voice_id, idioma, de dónde es la voz)
    "AURELIO": ("F1SMDtOTbvqlHI6wVNVa", "es", "biblioteca: acento guatemalteco"),
    "MARCUS": ("1sl7XMHkUEezwYy9NbJU", "en", "biblioteca: caribeño (inglés, como en Belice)"),
    "LUCÍA": ("kpkIWF2LeM9oDdqQfXRX", "es", "diseñada: salvadoreña, 42"),
    "CHEPE": ("QNPx1i744KpcLkKTDeZg", "es", "biblioteca: hondureño"),
    "MERCEDES": ("O5rgeXK2ZQX7aAmbzc35", "es", "diseñada: nicaragüense de Somoto, 27"),
    "ANDRÉS": ("DU6CgMQyKnGKapn9a2St", "es", "biblioteca: costarricense"),
    "ROSA": ("Mg6QeayOabivXP4ppWjV", "es", "diseñada: panameña, 40"),
}
# id, quién, cómo se dice, cómo se subtitula (si difiere), a cámara (True) o en off
L = [
    ("P1", "AURELIO", "Soy Aurelio. Café de Huehuetenango, Guatemala.", None, True),
    ("P2", "MARCUS", "I'm Marcus, a fisherman from Dangriga, Belize.", "Soy Marcus. Pescador, de Dangriga, Belice.", True),
    ("P3", "LUCÍA", "Soy Lucía. Tapicera, de San Salvador.", None, True),
    ("P4", "CHEPE", "Me dicen Chepe. Telas y lonas, San Pedro Sula.", None, True),
    ("P5", "MERCEDES", "Soy Mercedes. Rosquillas de Somoto, Nicaragua.", None, True),
    ("P6", "ANDRÉS", "Soy Andrés. Transporte de carga, Liberia, Costa Rica.", None, True),
    ("P7", "ROSA", "Soy Rosa. Uniformes, Ciudad de Panamá.", None, True),
    ("N1", "LUCÍA", "Siete países. Siete monedas. Y entre nosotros, una moneda digital en común: Origen.", "Siete países. Siete monedas. Y entre nosotros, una moneda digital en común: ORIGEN.", False),
    ("N2", "LUCÍA", "No reemplaza la de nadie. Sigue el precio del oro, y su fórmula es pública.", None, False),
    ("N3", "LUCÍA", "Para entrar, Génesis ai-dí: tu identidad digital. Te verificás una vez, y te aprueba una persona.", "Para entrar, Genesis ID: tu identidad digital. Te verificás una vez, y te aprueba una persona.", False),
    ("T1a", "AURELIO", "Marcus, ya te pagué el flete de las muestras.", None, True),
    ("T1b", "MARCUS", "Got it! Loading them now.", "¡Ya me llegó! Ya las estoy cargando.", True),
    ("N4", "LUCÍA", "Un centavo de dólar de comisión. Y llegó en segundos.", None, False),
    ("T2a", "MARCUS", "Chepe, I just paid for the nets.", "Chepe, ya pagué las redes.", True),
    ("T2b", "CHEPE", "¡Ya me cayó! Van en el camión de las diez.", None, True),
    ("T3a", "CHEPE", "Doña Lucía, ya le pagué los sillones.", None, True),
    ("T3b", "LUCÍA", "Ya me llegó, don Chepe. El jueves se los devuelvo como nuevos.", None, True),
    ("T4a", "LUCÍA", "Mercedes, te pagué las dos cajas de rosquillas.", None, True),
    ("T4b", "MERCEDES", "¡Ya me cayó! Mañana te llegan.", None, True),
    ("T5a", "MERCEDES", "Andrés, ya te pagué el viaje.", None, True),
    ("T5b", "ANDRÉS", "Diay, ya me llegó. Salgo a las tres.", None, True),
    ("T6a", "ANDRÉS", "Rosa, pagué las doce camisas.", None, True),
    ("T6b", "ROSA", "¡Ya entró! El viernes te llegan.", None, True),
    ("T7a", "ROSA", "Don Aurelio, le pagué el café del taller.", None, True),
    ("T7b", "AURELIO", "Recibido, doña Rosa. Ya va para allá.", None, True),
    ("N5", "LUCÍA", "En un solo día, Origen pasó por siete países. Siete pagos, en segundos.", "En un solo día, ORIGEN pasó por siete países. Siete pagos, en segundos.", False),
    ("N6", "LUCÍA", "Si fuera de otra manera... ¿cuánto tardaría en moverse tu dinero?", None, False),
    ("N7", "LUCÍA", "Morasán luchó por unirnos. Hoy nos unimos sin dejar de ser siete: cada país, con sus leyes y su moneda.", "Morazán luchó por unirnos. Hoy nos unimos sin dejar de ser siete: cada país, con sus leyes y su moneda.", False),
    ("N8", "LUCÍA", "Y pensá en grande: nuestras empresas podrían abrir una parte, en digital, al capital del mundo.", None, False),
    ("N9", "LUCÍA", "Eso es tokenizar: cada parte con su pasaporte, y adentro las reglas de cada país.", None, False),
    ("N10", "LUCÍA", "El capital, del mundo. El trabajo, aquí. Las reglas, de casa.", None, False),
    ("F1", "LUCÍA", "Esto lo hicimos por vos. Para unir Centroamérica.", None, True),
    ("F2", "LUCÍA", "¿Y mañana... Latinoamérica?", None, False),
]


def main(dst: Path):
    dst.mkdir(parents=True, exist_ok=True)
    import soundfile as sf
    out = []
    for i, q, dicho, escrito, camara in L:
        vid, lang, _ = VOCES[q]
        o = dst / f"{i}.mp3"
        if not o.exists():
            body = json.dumps({"text": dicho, "model_id": "eleven_v3", "language_code": lang,
                               "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}}).encode()
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128", body,
                                       {"xi-api-key": os.environ["EL_KEY"], "Content-Type": "application/json"})
            o.write_bytes(urllib.request.urlopen(r).read())
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(o), "-af",
                            "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                            "-ar", "48000", str(o.with_suffix(".wav"))], check=True)
        d = sf.info(str(o.with_suffix(".wav"))).duration
        out.append({"id": i, "quien": q, "dicho": dicho, "escrito": escrito or dicho, "a_camara": camara, "dur": round(d, 2)})
        print(f"{i:4} {q:9} {d:5.2f}s  {'CÁMARA' if camara else 'off   '}  {escrito or dicho}")
    (dst / "lineas.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
