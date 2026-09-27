#!/usr/bin/env python3
"""Animática de «Abrir» sin GPU: la película con sus tiempos reales, su voz real
y, en cada toma, lo más parecido que ya existe.

- Donde hay algo parecido (un clip de «Un martes», una foto de la presentación,
  el archivo de Bukele), sale eso, con el rótulo REFERENCIA.
- Donde no hay nada, sale una tarjeta con lo que se va a filmar: POR FILMAR.

Encima van los textos de pantalla del plan, la narración de Lucía con su
subtítulo, la cortina, la campana de pago y una cama musical provisional. Sirve
para aprobar la historia y el ritmo antes de encender la GPU.

    python3 montaje/animatica_abrir.py --scratch DIR -o animatica_abrir.mp4
"""
from __future__ import annotations

import argparse, json, shutil, subprocess, tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
W, H, FPS = 1080, 1920, 30
CREMA, ORO, TINTA = (243, 236, 217), (214, 178, 94), (14, 12, 9)

# Qué referencia usa cada toma. clip: (archivo, desde) · img: (página, cx, cy, alto) · fit: página entera
REF = {
    "s01": ("clip", "p4/bukele_clip.mp4", 0.55, "archivo recibido (recorte de TikTok)"),
    "s02": ("clip", "clips/00_taller_abre_f1_00001_.mp4", 0.0, "«Un martes»"),
    "s03": ("clip", "clips/00_taller_abre_f2_00001_.mp4", 0.0, "«Un martes»"),
    "s04": ("clip", "clips/00_taller_abre_f2_00001_.mp4", 1.7, "«Un martes»"),
    "s05": ("morazan",),
    "s06": ("fit", 3, CREMA, "presentación, lámina 3"),
    "s07": ("img", 8, 0.50, 0.33, 0.62, "presentación, lámina 8"),
    "s08": ("img", 4, 0.60, 0.50, 1.0, "presentación, lámina 4"),
    "s10": ("img", 1, 0.84, 0.36, 0.70, "presentación, lámina 1"),
    "s12": ("img", 6, 0.62, 0.50, 1.0, "presentación, lámina 6"),
    "s14": ("clip", "clips/17_manos_pago_r1_00001_.mp4", 0.2, "«Un martes»"),
    "s15": ("clip", "clips/18_proveedor_sync_s2_00001_.mp4", 0.0, "«Un martes»"),
    "s16": ("clip", "clips/17_manos_pago_r1_00001_.mp4", 1.4, "«Un martes»"),
    "s17": ("clip", "clips/18_proveedor_sync_s2_00001_.mp4", 1.9, "«Un martes»"),
    "s18": ("img", 2, 0.72, 0.62, 0.75, "presentación, lámina 2"),
    "s19": ("clip", "clips/14_taller_r1_00001_.mp4", 0.2, "«Un martes»"),
    "s22": ("clip", "clips/14_taller_t1_00001_.mp4", 0.0, "«Un martes»"),
    "s27": ("img", 5, 0.60, 0.55, 0.80, "presentación, lámina 5"),
    "s33": ("img", 6, 0.66, 0.45, 0.70, "presentación, lámina 6"),
    "s34": ("fit", 9, (10, 9, 7), "presentación, lámina 9"),
    "s41": ("clip", "clips/22_lucia_sonrie_r2_00001_.mp4", 0.0, "«Un martes»"),
    "s42": ("clip", "clips/00_taller_abre_f1_00001_.mp4", 0.0, "«Un martes», oscurecido"),
    "s46": ("mapas",),
    "s47": ("cierre",),
}
OSCURO = {"s42"}

TITULO = {
    "s09": "Honduras · el panadero", "s11": "Costa Rica · el cafetal", "s13": "Belice · la tienda",
    "s20": "De noche: el plan", "s21": "La evaluación", "s23": "La aguja arranca", "s24": "Primer día de Kevin",
    "s25": "Manos que enseñan", "s26": "Ingrid, geóloga", "s28": "El informe", "s29": "El mapa se despliega",
    "s30": "Mariela, ingeniera", "s31": "La línea del plano", "s32": "El tren en el valle", "s35": "Cambio de turno",
    "s36": "Fin de la jornada", "s37": "Camino a casa", "s38": "La mesa servida", "s39": "El cuaderno",
    "s40": "La calle en calma", "s40b": "Los niños juegan", "s43": "Ingrid", "s44": "Kevin y su hermana",
    "s45": "Mariela y el tren",
}

# Textos de pantalla del plan (los mismos de la película)
EDITORIAL = {
    "s04": ("grande", ["Una sola economía.", "Países soberanos."]),
    "s05": ("rotulo", ["FRANCISCO MORAZÁN (1792–1842)"]),
    "s08": ("rotulo", ["GUATEMALA"]), "s09": ("rotulo", ["HONDURAS"]), "s10": ("rotulo", ["NICARAGUA"]),
    "s11": ("rotulo", ["COSTA RICA"]), "s12": ("rotulo", ["PANAMÁ"]), "s13": ("rotulo", ["BELICE"]),
    "s15": ("rotulo", ["SAN PEDRO SULA, HONDURAS"]),
    "s17": ("monedas", ["quetzal · dólar beliceño · lempira", "dólar · córdoba · colón · balboa", "ORIGEN"]),
    "s20": ("grande", ["DBNX", "Un mercado para nuestras empresas."]),
    "s27": ("pasos", ["Conocer → Evaluar", "→ Estructurar → Buscar capital"]),
    "s39": ("grande", ["Una oportunidad para una empresa", "puede convertirse en una oportunidad", "para toda una familia."]),
    "s46": ("grande", ["¿Por qué no toda", "Latinoamérica?"]),
}


def ff(*a):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)


class F:
    def __init__(self, d: Path):
        self.serif = ImageFont.truetype(str(d / "Fraunces.ttf"), 76)
        self.serif_i = ImageFont.truetype(str(d / "FrauncesItalic.ttf"), 64)
        self.serif_s = ImageFont.truetype(str(d / "FrauncesItalic.ttf"), 52)
        self.mono = ImageFont.truetype(str(d / "JetBrainsMono.ttf"), 30)
        self.mono_g = ImageFont.truetype(str(d / "JetBrainsMono.ttf"), 40)
        self.sans = ImageFont.truetype(str(d / "Manrope.ttf"), 40)
        self.sans_m = ImageFont.truetype(str(d / "ManropeMedium.ttf"), 34)


def envolver(d, texto, f, ancho):
    lineas, l = [], ""
    for p in texto.split():
        prueba = (l + " " + p).strip()
        if d.textlength(prueba, font=f) <= ancho:
            l = prueba
        else:
            lineas.append(l); l = p
    if l:
        lineas.append(l)
    return lineas


def sombra_texto(img, xy, texto, f, fill, blur=8):
    s = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(s).text((xy[0], xy[1] + 3), texto, font=f, fill=(0, 0, 0, 230))
    img.alpha_composite(s.filter(ImageFilter.GaussianBlur(blur)))
    ImageDraw.Draw(img).text(xy, texto, font=f, fill=fill)


def capa_toma(s, fuente_ref, T: F) -> Image.Image:
    """Rótulo de la toma arriba y los textos de pantalla del plan."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    estado = "POR FILMAR" if fuente_ref is None else "REFERENCIA"
    txt = f"ANIMÁTICA · {s['id']} · {estado}"
    tw = d.textlength(txt, font=T.mono)
    d.rounded_rectangle([40, 60, 40 + tw + 40, 60 + 56], 28, fill=(0, 0, 0, 150))
    d.text((60, 70), txt, font=T.mono, fill=ORO + (255,) if estado == "POR FILMAR" else CREMA + (235,))
    if fuente_ref:
        d.text((62, 126), f"imagen de {fuente_ref}", font=T.mono, fill=CREMA + (190,))
    tipo, lineas = EDITORIAL.get(s["id"], (None, []))
    if tipo == "grande":
        f = T.serif_i if len(lineas) > 2 else T.serif
        y = 560 - len(lineas) * 45
        for l in lineas:
            sombra_texto(img, ((W - ImageDraw.Draw(img).textlength(l, font=f)) / 2, y), l, f, CREMA + (255,))
            y += 96 if f is T.serif else 84
    elif tipo in ("rotulo", "pasos"):
        y = 250
        for l in lineas:
            sombra_texto(img, (72, y), l, T.mono_g, CREMA + (245,), 6); y += 60
        ImageDraw.Draw(img).line([(72, y + 6), (136, y + 6)], fill=ORO + (230,), width=3)
    elif tipo == "monedas":
        y = 380
        for i, l in enumerate(lineas):
            f = T.mono_g if i < 2 else T.serif
            x = (W - ImageDraw.Draw(img).textlength(l, font=f)) / 2
            sombra_texto(img, (x, y + (30 if i == 2 else 0)), l, f, (ORO + (255,)) if i == 2 else CREMA + (240,), 6)
            y += 64
    return img


def tarjeta(s, T: F) -> Image.Image:
    """Toma que aún no existe: qué se va a ver, cómo y con qué luz."""
    img = Image.new("RGBA", (W, H), (18, 16, 12, 255))
    d = ImageDraw.Draw(img)
    for i in range(0, H, 6):   # grano muy leve para que no parezca una diapositiva
        d.line([(0, i), (W, i)], fill=(22, 20, 15, 255))
    titulo = TITULO.get(s["id"], s["id"])
    y = 560
    for l in envolver(d, titulo, T.serif, W - 160):
        d.text((80, y), l, font=T.serif, fill=CREMA + (255,)); y += 92
    d.line([(80, y + 18), (150, y + 18)], fill=ORO + (255,), width=3)
    y += 60
    for l in envolver(d, s["accion"], T.sans, W - 160):
        d.text((80, y), l, font=T.sans, fill=(214, 206, 188, 255)); y += 56
    y += 30
    for l in envolver(d, s["camara"], T.mono, W - 160):
        d.text((80, y), l, font=T.mono, fill=(150, 140, 120, 255)); y += 42
    return img


def cierre(logo: Path, T: F) -> Image.Image:
    img = Image.new("RGBA", (W, H), (10, 9, 7, 255))
    lg = Image.open(logo).convert("RGBA"); lg.thumbnail((520, 520))
    img.alpha_composite(lg, ((W - lg.width) // 2, 560))
    d = ImageDraw.Draw(img)
    y = 560 + lg.height + 110
    for l, f, c in (("ORDEN GLOBAL", T.mono_g, CREMA), ("Sistema Financiero Social", T.serif_s, ORO), ("ordenglobal.org", T.mono, CREMA)):
        d.text(((W - d.textlength(l, font=f)) / 2, y), l, font=f, fill=c + (255,)); y += 86
    chico = "Material informativo; no constituye oferta de valores ni de inversión. Imágenes ilustrativas."
    fch = ImageFont.truetype(T.sans.path, 24)
    d.text(((W - d.textlength(chico, font=fch)) / 2, H - 170), chico, font=fch, fill=(150, 140, 120, 255))
    return img


def recorte(pagina: Image.Image, cx, cy, alto) -> Image.Image:
    pw, ph = pagina.size
    h = int(ph * alto); w = int(h * 9 / 16)
    x0 = int(min(max(pw * cx - w / 2, 0), pw - w)); y0 = int(min(max(ph * cy - h / 2, 0), ph - h))
    return pagina.crop((x0, y0, x0 + w, y0 + h)).resize((W, H), Image.LANCZOS)


def encajar(pagina: Image.Image, fondo) -> Image.Image:
    img = Image.new("RGB", (W, H), fondo)
    p = pagina.copy(); p.thumbnail((W, H))
    img.paste(p, (0, (H - p.height) // 2))
    return img


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scratch", required=True, help="carpeta con clips/, p4/, pantallas/, fuentes/, logo/")
    ap.add_argument("--plan", default=str(RAIZ / "prompts/pelicula4_abrir.json"))
    ap.add_argument("--pdf", required=True)
    ap.add_argument("-o", "--salida", required=True)
    a = ap.parse_args()
    S = Path(a.scratch)
    plan = json.loads(Path(a.plan).read_text())
    T = F(S / "fuentes")
    tmp = Path(tempfile.mkdtemp(prefix="animatica_abrir_"))
    clips, voces = tmp / "clips", tmp / "voces"
    clips.mkdir(); voces.mkdir()

    import pymupdf
    doc = pymupdf.open(a.pdf)
    paginas = {}

    def pagina(n):
        if n not in paginas:
            pix = doc[n - 1].get_pixmap(dpi=220)
            paginas[n] = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        return paginas[n]

    tomas_json = {}
    for s in plan["tomas"]:
        sid, dur = s["id"], s["dur"]
        ref = REF.get(sid)
        fuente_ref = ref[-1] if ref and ref[0] in ("clip", "img", "fit") else ("presentación, láminas 9 y 10" if ref and ref[0] == "mapas" else ("Commons (dominio público)" if ref and ref[0] == "morazan" else None))
        if ref and ref[0] == "cierre":
            fuente_ref = "logo de Orden Global"
        capa = capa_toma(s, fuente_ref, T)
        pc = tmp / f"capa_{sid}.png"; capa.save(pc)
        out = clips / f"{sid}.mp4"
        N = round(dur * FPS)
        if ref and ref[0] == "clip":
            _, arch, desde, _ = ref
            vf = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}"
                  + (",eq=brightness=-0.18:saturation=0.8,colorbalance=bs=0.12:bm=0.06" if sid in OSCURO else "")
                  + ",tpad=stop_mode=clone:stop=-1[v];[v][1:v]overlay=0:0")
            comun = ["-frames:v", str(N), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS)]
            if sid == "s01":   # el archivo de Bukele conserva su audio
                ff("-ss", str(desde), "-t", f"{dur}", "-i", str(S / arch), "-i", str(pc), "-filter_complex", vf + "[o]",
                   "-map", "[o]", "-map", "0:a", *comun, "-c:a", "aac", str(out))
            else:
                ff("-ss", str(desde), "-t", f"{dur}", "-i", str(S / arch), "-i", str(pc), "-filter_complex", vf,
                   *comun, "-an", str(out))
        else:
            if ref is None:
                base = tarjeta(s, T).convert("RGB")
            elif ref[0] == "img":
                base = recorte(pagina(ref[1]), ref[2], ref[3], ref[4])
            elif ref[0] == "fit":
                base = encajar(pagina(ref[1]), ref[2])
            elif ref[0] == "morazan":
                m = Image.open(S / "p4/morazan.jpg").convert("RGB")
                base = Image.new("RGB", (W, H), (20, 16, 11))
                m2 = m.resize((W, int(m.height * W / m.width)), Image.LANCZOS)
                base.paste(m2, (0, (H - m2.height) // 2))
            elif ref[0] == "mapas":
                base = encajar(pagina(9), (10, 9, 7))
            else:
                base = cierre(S / "logo/og_oro_4000.png", T).convert("RGB")
            pb = tmp / f"base_{sid}.png"
            comp = base.convert("RGBA"); comp.alpha_composite(capa); comp.convert("RGB").save(pb)
            if ref is not None and ref[0] in ("img", "morazan"):
                z = f"zoompan=z='1+0.06*on/{N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={N}:s={W}x{H}:fps={FPS}"
                ff("-loop", "1", "-i", str(pb), "-vf", f"scale={int(W*1.5)}:{int(H*1.5)},{z}", "-frames:v", str(N),
                   "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(out))
            elif ref is not None and ref[0] == "mapas":
                b2 = encajar(pagina(10), (10, 9, 7)).convert("RGBA"); b2.alpha_composite(capa)
                pb2 = tmp / f"base_{sid}_b.png"; b2.convert("RGB").save(pb2)
                mitad = dur / 2
                ff("-loop", "1", "-t", f"{mitad + 0.6}", "-i", str(pb), "-loop", "1", "-t", f"{mitad + 0.6}", "-i", str(pb2),
                   "-filter_complex", f"[0:v][1:v]xfade=transition=fade:duration=1.2:offset={mitad - 0.6},fps={FPS},format=yuv420p",
                   "-frames:v", str(N), "-c:v", "libx264", "-crf", "18", str(out))
            else:
                ff("-loop", "1", "-framerate", str(FPS), "-i", str(pb), "-frames:v", str(N), "-c:v", "libx264", "-crf", "18",
                   "-pix_fmt", "yuv420p", str(out))
        tomas_json[sid] = out.name
        print(f"  {sid:5} {dur:4.1f}s  {'REFERENCIA' if fuente_ref else 'POR FILMAR'}", flush=True)

    # plan con el formato de montaje/un_martes.py
    for v in plan["voz"]:
        shutil.copy(S / "p4/voz" / f"{v['linea']}.wav", voces / f"{v['linea']}.wav")
    shutil.copy(S / "p4/cortina.wav", voces / "cortina.wav")
    t0 = {s["id"]: s["t"] for s in plan["tomas"]}
    bloques = [{"plano": s["id"], "t": s["t"], "dur": s["dur"], "desde": 0.0, **({"audio_clip": 1.0} if s["id"] == "s01" else {})}
               for s in plan["tomas"]]
    capas = [{"tipo": "narra", "t": v["t"], "dur": round(v["dur"] + 0.3, 2), "voz": v["linea"], "texto": v["texto"]} for v in plan["voz"]]
    for x, y in zip(capas, capas[1:]):
        x["dur"] = round(min(x["dur"], y["t"] - x["t"] - 0.05), 2)
    capas.append({"tipo": "narra", "t": 0.3, "dur": 2.7, "texto": "«Ya llegó el momento de que unamos Centroamérica.»"})
    capas.append({"tipo": "tarjeta", "t": round(t0["s16"] + 0.6, 2), "dur": 2.3, "pantalla": "G_comprobante.png",
                  "recortes": [[20, 20, 1060, 420]], "pie": "Pagado a Honduras", "sonido": "pago"})
    capas.append({"tipo": "tarjeta", "t": round(t0["s41"] + 0.3, 2), "dur": 2.4, "pantalla": "A_enviar.png",
                  "recortes": [[0, 0, 1080, 150], [20, 400, 1060, 790]], "pie": "Veta Wallet", "sonido": "tink"})
    un = {"_nota": "Animática de «Abrir» (sin GPU).", "salida": {"ancho": W, "alto": H, "fps": FPS, "dur_s": plan["dur_s"]},
          "bloques": bloques, "capas": capas,
          "efectos": [{"tipo": "sonido", "archivo": "cortina", "t": round(t0["s02"] + 0.35, 2), "vol": 1.0, "salida": 0.4}]}
    pj = tmp / "plan.json"; pj.write_text(json.dumps(un, ensure_ascii=False))
    tj = tmp / "tomas.json"; tj.write_text(json.dumps(tomas_json))
    subprocess.run(["python3", str(RAIZ / "montaje/un_martes.py"), "--plan", str(pj), "--tomas", str(tj), "--clips", str(clips),
                    "--pantallas", str(S / "pantallas"), "--voces", str(voces), "--musica", str(S / "p4/cama_abrir.wav"),
                    "--logo", str(S / "logo/og_oro_4000.png"), "--fuentes", str(S / "fuentes"), "-o", a.salida], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
