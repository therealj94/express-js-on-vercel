#!/usr/bin/env python3
"""Recoge una tanda de Hugging Face, la verifica y arma las hojas para elegir.

El pod entrega cada clip a HF al salir; esto es la vuelta. Baja lo que empiece
por los prefijos pedidos, comprueba cada fichero contra el SHA-256 que HF
guarda de él (si no cuadra, no existe), y arma hojas JPG pensadas para verse en
un móvil: números grandes, una hoja por plano.

    python3 tools/recoger.py --sesion 1 --dest /ruta/recogida
    python3 tools/recoger.py --sesion 2 --dest /ruta/recogida
    python3 tools/recoger.py --local /carpeta/con/mp4 --sesion 1 --dest /ruta   # sin HF

Sesión 1: casting (una hoja por personaje), stills (una hoja por plano, 1-4) y
la prueba i2v contra t2v (primer y último fotograma lado a lado).
Sesión 2: tomas de vídeo (hoja_video.py: primer y último fotograma por toma).
"""
from __future__ import annotations

import argparse, hashlib, json, os, re, subprocess, sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
F = next((p for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                      "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf") if Path(p).exists()), None)
PREFIJOS = {1: ("casting_", "still_", "prueba_", "manifest.json"),
            2: ("manifest.json",)}  # la sesión 2 se filtra por los ids de su cola


def fuente(tam: int):
    return ImageFont.truetype(F, tam) if F else ImageFont.load_default()


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def bajar(repo: str, prefijos: tuple, ids: set, dest: Path) -> list[Path]:
    from huggingface_hub import HfApi, hf_hub_download
    api = HfApi(token=os.environ.get("HF_TOKEN"))
    todos = api.list_repo_files(repo, repo_type="dataset")
    quiero = [f for f in todos if "/" not in f and
              (f.startswith(prefijos) or any(f.startswith(i + "_") for i in ids))]
    info = {i.path: i for i in api.get_paths_info(repo, quiero, repo_type="dataset")} if quiero else {}
    dest.mkdir(parents=True, exist_ok=True)
    buenos, malos = [], []
    for f in sorted(quiero):
        local = dest / f
        esperado = getattr(getattr(info.get(f), "lfs", None), "sha256", None)
        if not (local.exists() and esperado and sha256(local) == esperado):
            hf_hub_download(repo, f, repo_type="dataset", local_dir=dest,
                            token=os.environ.get("HF_TOKEN"))
        if esperado and sha256(local) != esperado:
            malos.append(f); local.unlink(missing_ok=True); continue
        buenos.append(local)
    print(f"HF {repo}: {len(buenos)} ficheros verificados"
          + (f", {len(malos)} NO cuadran y se descartan: {malos[:5]}" if malos else ""))
    return buenos


def fotograma(mp4: Path, cual: str = "primero") -> Image.Image:
    """Primer o último fotograma de un mp4 como imagen PIL."""
    args = ["ffmpeg", "-loglevel", "error"]
    if cual == "ultimo":
        args += ["-sseof", "-0.2"]
    args += ["-i", str(mp4), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]
    out = subprocess.run(args, capture_output=True, check=True).stdout
    from io import BytesIO
    return Image.open(BytesIO(out)).convert("RGB")


def hoja(titulo: str, fotos: list[tuple[str, Image.Image]], dst: Path, ancho: int = 360) -> None:
    """Fotos verticales en fila de 2, número grande encima. Legible en un móvil."""
    cols = 2
    alto = int(ancho * 16 / 9)
    filas = -(-len(fotos) // cols)
    cab = 90
    img = Image.new("RGB", (cols * ancho + (cols + 1) * 12, cab + filas * (alto + 70)), (12, 12, 14))
    d = ImageDraw.Draw(img)
    d.text((14, 22), titulo, fill=(240, 236, 226), font=fuente(34))
    for k, (etq, im) in enumerate(fotos):
        im = ImageOps.contain(im, (ancho, alto))
        x = 12 + (k % cols) * (ancho + 12)
        y = cab + (k // cols) * (alto + 70)
        d.text((x + 4, y + 8), etq, fill=(255, 214, 90), font=fuente(44))
        img.paste(im, (x, y + 62))
    img.save(dst, quality=88)


def sesion1(ficheros: list[Path], guion: dict, dest: Path) -> list[Path]:
    hojas = dest / "hojas"; hojas.mkdir(exist_ok=True)
    por_nombre = {p.name: p for p in ficheros if p.suffix == ".mp4"}
    hechas = []

    casting: dict[str, list] = {}
    for n, p in sorted(por_nombre.items()):
        m = re.match(r"casting_(?P<quien>[a-z]+)_(?P<n>\d+)_\d+_\.mp4$", n)
        if m:
            casting.setdefault(m["quien"], []).append((m["n"].lstrip("0"), fotograma(p)))
    for quien, fotos in casting.items():
        dst = hojas / f"00_casting_{quien}.jpg"
        hoja(f"Casting · {quien} · ¿cuál es?", fotos, dst); hechas.append(dst)

    for shot in guion["shots"]:
        fotos = []
        for i in range(1, int(shot.get("stills", 4)) + 1):
            p = next((v for k, v in por_nombre.items()
                      if k.startswith(f"still_{shot['id']}_{i:02d}_")), None)
            if p:
                fotos.append((str(i), fotograma(p)))
        if fotos:
            dst = hojas / f"{shot['id']}.jpg"
            hoja(f"{shot['id']} · {shot.get('escena', '')}", fotos, dst); hechas.append(dst)

    prueba = [(n, p) for n, p in sorted(por_nombre.items()) if n.startswith("prueba_")]
    if prueba:
        fotos = []
        for n, p in prueba:
            metodo = "i2v" if "i2v" in n else "t2v"
            fotos += [(f"{metodo} inicio", fotograma(p)), (f"{metodo} final", fotograma(p, "ultimo"))]
        dst = hojas / "99_prueba_metodo.jpg"
        hoja("¿i2v o t2v? Mismo plano", fotos, dst); hechas.append(dst)

    faltan = [s["id"] for s in guion["shots"] if not (hojas / f"{s['id']}.jpg").exists()]
    print(f"{len(hechas)} hojas en {hojas}" + (f" · sin stills: {', '.join(faltan)}" if faltan else ""))
    return hechas


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sesion", type=int, choices=(1, 2), required=True)
    ap.add_argument("--dest", required=True)
    ap.add_argument("--repo", default=os.environ.get("HF_REPO", "Therealjose54/orden-global-videos"))
    ap.add_argument("--guion", default=str(RAIZ / "prompts/pelicula3_un_martes.json"))
    ap.add_argument("--cola", help="sesión 2: la cola, para saber qué ids bajar")
    ap.add_argument("--local", help="carpeta con los mp4 ya bajados (salta HF)")
    a = ap.parse_args()

    dest = Path(a.dest)
    guion = json.loads(Path(a.guion).read_text())
    ids = set()
    if a.cola:
        ids = {j["id"] for j in json.loads(Path(a.cola).read_text())["jobs"]}
    if a.local:
        ficheros = sorted(Path(a.local).glob("*"))
    else:
        if not os.environ.get("HF_TOKEN"):
            sys.exit("Falta HF_TOKEN en el entorno.")
        ficheros = bajar(a.repo, PREFIJOS[a.sesion], ids, dest / "hf")

    if a.sesion == 1:
        sesion1(ficheros, guion, dest)
    else:
        carpeta = Path(a.local) if a.local else dest / "hf"
        subprocess.run([sys.executable, str(RAIZ / "tools/hoja_video.py"),
                        str(carpeta), str(dest / "hojas")], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
