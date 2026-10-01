"""Narración de «El cuaderno» con la voz clonada de José (ElevenLabs v4, etiquetas de audio).
Las tomas se generan en el flujo de ElevenLabs (la voz vive en ese workspace, no en la
clave de la API). Este archivo es el guion de referencia; main() solo sirve con una clave
del mismo workspace. Tomas elegidas (transcritas con faster-whisper): todas v1 salvo P02 v2.
Genera y mide cada página: python3 montaje/guion_cuaderno.py DIR"""
import json, os, subprocess, sys, urllib.request
from pathlib import Path

VOZ = "5rpOswWClIYBLr0xKelj"  # «Jose latam», clon profesional de José
# Español neutro de tú: nada de voseo (sabés, tenés, querés…), que suena rioplatense.
L = [
    ("P00", "[softly] Esta no es la típica historia de éxito que ves en Netflix… o que lees en un libro. [pause] [serious] Es la historia real de un sueño… [whispers] que todavía puede perderse."),
    ("P01", "[warmly] Tú y yo sabemos lo difícil que es salir adelante solo… cuando sabes que tienes algo que puede cambiar vidas. [short pause] Y hasta ayudar a desarrollar países."),
    ("P02", "[nostalgic] Todo empezó hace cuatro años. Una familia dedicada a la minería de oro. [short pause] Riqueza en la tierra… [sad] y pobreza alrededor."),
    ("P03", "[frustrated] Pero esos proyectos nunca terminaron de despegar. Faltaron leyes claras. Faltó apoyo. [sighs] [softly] Quizás a ti también te pasó."),
    ("P04", "[determined] Entonces decidimos estudiar el dinero: los bancos, las criptomonedas… [warmly] y construir una alternativa para la gente."),
    ("P05", "[warmly] Primero fuimos una familia. Después se unió otra. Llegaron personas que sabían de finanzas, de tecnología… un programador que creyó en esto. [emotional] Y muchos que confiaron en nosotros desde el principio."),
    ("P06", "[tired] Fueron cuatro años. Pusimos lo que teníamos. La primera versión no alcanzaba… y la volvimos a hacer. [trembling voice] Hubo cansancio. Hubo lágrimas. [softly] Y quienes creyeron en nosotros desde el principio… también cargaron este cansancio. [pause] [determined] Pero seguimos."),
    ("P07", "[proud] Hoy existe ORIGEN: una moneda digital para Latinoamérica, referenciada al precio del oro. El sistema ya funciona. Una transacción en la red cuesta… un centavo de dólar."),
    ("P08", "[serious] Pero el sistema está hecho para que todo siga igual. [pause] [softly] Y solos… ya no podemos dar el siguiente paso."),
    ("P09", "[warmly] Por eso hoy te cuento cómo empezó. Porque de ti depende que este sueño no se pierda como tantos otros. [pause] [emotional] Este sueño ya no es solo mío… es tuyo, que estás viendo esto."),
    ("P10", "[warmly] Si quieres ser parte, hablemos. Si conoces a quien debe escuchar esta historia… compártela. [pause] [softly] ¿Qué vas a hacer?"),
]


def main(d: Path):
    d.mkdir(parents=True, exist_ok=True)
    import soundfile as sf
    out = []
    for i, txt in L:
        mp3, wav = d / f"{i}.mp3", d / f"{i}.wav"
        if not wav.exists():
            body = json.dumps({"text": txt, "model_id": "eleven_v4", "language_code": "es"}).encode()
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ}?output_format=mp3_44100_192", body,
                                       {"xi-api-key": os.environ["EL_KEY"], "Content-Type": "application/json"})
            mp3.write_bytes(urllib.request.urlopen(r, timeout=300).read())
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-af",
                            "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                            "-ar", "48000", str(wav)], check=True)
        dur = sf.info(str(wav)).duration
        out.append({"id": i, "texto": txt, "dur": round(dur, 2)})
        print(f"{i} {dur:5.2f}s")
    (d / "lineas.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("total", round(sum(x["dur"] for x in out), 1))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
