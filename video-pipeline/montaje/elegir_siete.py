#!/usr/bin/env python3
"""Baja las tomas de «Siete» de Hugging Face y elige la mejor de cada plano.

Para los planos con diálogo, cada toma se transcribe (ElevenLabs scribe) y se
compara con la frase del guion: gana la que la dice completa y bien. Esa misma
transcripción da dónde empieza y acaba la voz, que el montaje usa para cortar.
Para todos los planos arma una hoja con tres fotogramas por toma, para revisar
a ojo manos, caras y cuerpos antes de dar la elección por buena.

    HF_TOKEN=... ELEVEN_API_KEY=... python3 montaje/elegir_siete.py --dir DIR
    python3 montaje/elegir_siete.py --dir DIR --fijar g03=2 o02=1   # elección a ojo

Deja DIR/elegidas.json y DIR/hojas/<plano>.jpg.
"""
from __future__ import annotations

import argparse, difflib, json, os, re, subprocess, unicodedata
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
P = json.loads((RAIZ / "prompts/pelicula4_siete.json").read_text())
VOZ = {v["id"]: v for v in P["voz"]}
REPO = "Therealjose54/orden-global-videos"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())


def duracion(c: Path) -> float:
    e = subprocess.run(["ffmpeg", "-i", str(c)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", e).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def bajar(dest: Path) -> None:
    from huggingface_hub import HfApi, hf_hub_download
    api = HfApi(token=os.environ["HF_TOKEN"])
    for f in api.list_repo_files(REPO, repo_type="dataset"):
        if f.startswith("s7_") and f.endswith(".mp4") and not (dest / f).exists():
            hf_hub_download(REPO, f, repo_type="dataset", token=os.environ["HF_TOKEN"], local_dir=dest)


def stt(clip: Path, cache: Path, idioma: str) -> dict:
    o = cache / (clip.stem + ".json")
    if o.exists():
        return json.loads(o.read_text())
    mp3 = cache / (clip.stem + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(clip), "-vn", "-ac", "1",
                    "-b:a", "64k", str(mp3)], check=True)
    r = requests.post("https://api.elevenlabs.io/v1/speech-to-text",
                      headers={"xi-api-key": os.environ["ELEVEN_API_KEY"]},
                      data={"model_id": "scribe_v1", "language_code": idioma,
                            "timestamps_granularity": "word"},
                      files={"file": mp3.open("rb")}, timeout=120).json()
    o.write_text(json.dumps(r, ensure_ascii=False))
    return r


def hoja(tomas: list[Path], out: Path, notas: list[str], tramos=None) -> None:
    f = ImageFont.load_default()
    filas = []
    for c in tomas:
        dur = duracion(c)
        # Con diálogo se mira dentro del tramo que se usa (la voz), no la toma entera.
        t0, t1 = (tramos or {}).get(c.name, (0.0, dur))
        t1 = min(t1, dur - 0.1)
        cuadros = []
        for frac in (0.1, 0.5, 0.9):
            png = out.parent / f"_{c.stem}_{frac}.png"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t0 + frac * (t1 - t0):.2f}", "-i", str(c),
                            "-frames:v", "1", "-vf", "scale=300:-1", str(png)], check=True)
            cuadros.append(Image.open(png).convert("RGB"))
            png.unlink()
        filas.append(cuadros)
    w, h = filas[0][0].size
    img = Image.new("RGB", (w * 3, (h + 40) * len(filas)), (12, 12, 12))
    d = ImageDraw.Draw(img)
    for i, (fila, nota) in enumerate(zip(filas, notas)):
        for j, im in enumerate(fila):
            img.paste(im, (j * w, i * (h + 40) + 40))
        d.text((8, i * (h + 40) + 8), f"{i + 1}  {nota}"[:140], fill=(255, 220, 80), font=f)
    img.save(out, quality=85)


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--dir", required=True, type=Path)
    a.add_argument("--sin-bajar", action="store_true")
    a.add_argument("--fijar", nargs="*", default=[])
    a = a.parse_args()
    clips, cache, hojas = a.dir / "clips", a.dir / "stt", a.dir / "hojas"
    for d in (clips, cache, hojas):
        d.mkdir(parents=True, exist_ok=True)
    if not a.sin_bajar:
        bajar(clips)
    fijo = dict(x.split("=") for x in a.fijar)
    salida = a.dir / "elegidas.json"
    elegidas = json.loads(salida.read_text()) if salida.exists() else {}

    grupos: dict[str, list[Path]] = {}
    for c in sorted(clips.glob("s7_*_t*_00001_.mp4")):
        plano = re.match(r"s7_(.+)_t\d+_00001_", c.name).group(1)
        grupos.setdefault(plano, []).append(c)

    for plano, tomas in grupos.items():
        linea = next((t["linea"] for t in P["tomas"] if t["id"] == plano and t["voz_ref"]), None)
        notas, cand = [], []
        for c in tomas:
            if linea:
                idioma = "eng" if plano in ("g02",) else "spa"
                r = stt(c, cache, idioma)
                ws = [w for w in r.get("words", []) if w.get("type") == "word"]
                texto = r.get("text", "")
                # La frase contra la que se compara es la que se le pidió decir al modelo.
                pedido = re.search(r"<d>\[\w+\] (.*?)</d>", next(t["prompt"] for t in P["tomas"] if t["id"] == plano)).group(1)
                sim = difflib.SequenceMatcher(None, norm(pedido), norm(texto)).ratio()
                ini, fin = (ws[0]["start"], ws[-1]["end"]) if ws else (0.0, 0.0)
                # Si la voz acaba pegada al último fotograma, la última sílaba puede quedar cortada.
                margen = duracion(c) - fin
                cand.append({"clip": c.name, "sim": round(sim, 3), "voz": [ini, fin], "texto": texto,
                             "margen": round(margen, 2), "nota": round(sim - (0.08 if margen < 0.2 else 0), 3)})
                notas.append(f"{sim:.2f} {ini:.1f}-{fin:.1f}s {texto}")
            else:
                cand.append({"clip": c.name})
                notas.append("")
        tramos = {x["clip"]: (max(0, x["voz"][0] - 0.3), x["voz"][1] + 0.3) for x in cand if x.get("voz")}
        hoja(tomas, hojas / f"{plano}.jpg", notas, tramos)
        if plano in fijo:
            mejor = cand[int(fijo[plano]) - 1]
        elif plano in elegidas and elegidas[plano].get("a_ojo"):
            continue
        else:
            mejor = max(cand, key=lambda x: x.get("nota", 0))
        elegidas[plano] = dict(mejor, a_ojo=plano in fijo, tomas=cand)
        print(f"{plano:14} -> {mejor['clip']}  {mejor.get('sim', '')}  {mejor.get('texto', '')[:70]}")
    salida.write_text(json.dumps(elegidas, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
