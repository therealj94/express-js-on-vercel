#!/usr/bin/env python3
"""Cinco shorts de promoción a partir de «Siete», sin GPU: mismas tomas, mismas
voces igualadas, y un gancho nuevo en la voz de Lucía al principio de cada uno.

Cada short tiene UNA idea, gancho en el primer segundo (texto grande + voz),
subtítulos siempre (en redes casi todo se ve sin sonido) y cierre con llamada
a la acción. Ninguno usa la voz de Bukele: se pueden publicar sin ese permiso.

    EL_KEY=... python3 montaje/shorts_siete.py --tomas DIR --voces DIR --musica M \
        --fuentes DIR --logo PNG --morazan JPG --out DIR [--solo NOMBRE]
"""
from __future__ import annotations

import argparse, json, os, re, subprocess, tempfile, urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw

import siete as S
from guion_siete import VOCES

LUCIA = VOCES["LUCÍA"][0]
# Líneas nuevas: id, cómo se dice, cómo se subtitula.
NUEVAS = [
    ("H1", "¿Cuánto te cobran por mandar dinero a otro país?", None),
    ("H2", "Siete personas. Siete países. Un solo día.", None),
    ("H3", "Siete oficios. Siete países. Y una moneda en común.", None),
    ("H4", "¿Y si el capital del mundo llegara al café de tu pueblo?", None),
    ("H5", "¿Se puede unir Centroamérica sin dejar de ser siete?", None),
    ("C1", "Orden Global. Conocelo en ordenglobal punto org.", "Orden Global · ordenglobal.org"),
]
# Dónde empieza cada sección de la banda original (musica_siete.py, v2).
MUSICA = {"presentaciones": 0.0, "origen": 28.2, "pagos": 51.0, "inversion": 87.8,
          "morazan": 120.3, "crecen": 126.6, "cierre": 140.3}


def voces_nuevas(d: Path) -> dict:
    d.mkdir(parents=True, exist_ok=True)
    out = {}
    for i, dicho, escrito in NUEVAS:
        mp3, wav = d / f"{i}.mp3", d / f"{i}.wav"
        if not wav.exists():
            body = json.dumps({"text": dicho, "model_id": "eleven_v3", "language_code": "es",
                               "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}}).encode()
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{LUCIA}?output_format=mp3_44100_128",
                                       body, {"xi-api-key": os.environ["EL_KEY"], "Content-Type": "application/json"})
            mp3.write_bytes(urllib.request.urlopen(r).read())
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-af",
                            "silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                            "silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                            "-ar", "48000", str(wav)], check=True)
        out[i] = {"wav": wav, "dur": sf.info(str(wav)).duration, "txt": escrito or dicho}
    return out


class Short:
    def __init__(self, nombre, musica, vol=0.55):
        self.nombre, self.musica, self.vol = nombre, musica, vol
        self.segs: list[S.Seg] = []
        self.narr: list[tuple[Path, float]] = []   # (wav, t absoluto)
        self.campanas: list[float] = []

    @property
    def t(self):
        return sum(s.dur for s in self.segs)

    def add(self, s: S.Seg, narr=None, off=0.25, campana=False):
        t0 = self.t
        self.segs.append(s)
        if narr:
            self.narr.append((narr, t0 + off))
        if campana:
            self.campanas.append(t0 + 0.2)
        return s


def main():
    a = argparse.ArgumentParser()
    for k in ("tomas", "voces", "musica", "fuentes", "logo", "morazan", "out"):
        a.add_argument(f"--{k}", type=Path, required=True)
    a.add_argument("--cache", type=Path)
    a.add_argument("--solo")
    a = a.parse_args()
    f = S.F(a.fuentes)
    el = json.loads((a.tomas / "elegidas.json").read_text())
    nv = voces_nuevas(a.out / "voces")
    V = {v["id"]: v for v in json.loads((a.voces / "lineas.json").read_text())}
    wav = lambda i: a.voces / f"{i}.wav"
    clip = lambda pid: a.tomas / "clips" / el[pid]["clip"]
    extra = lambda pid, k: a.tomas / "clips" / f"s7_{pid}_t{k}_00001_.mp4"

    def dialogo(pid, capas_extra=(), recorte=0.35, cola=0.45):
        ini, fin = el[pid]["voz"]
        desde = max(0.0, ini - recorte)
        dur = min(fin + cola, S.duracion(clip(pid))) - desde
        linea = S.TOMA[pid]["linea"]
        txt = S.SUB_EN.get(linea) or S.VOZ[linea]["escrito"]
        if pid == "p5a":
            txt = "Andrés, listo: ya te pagué el viaje."
        capas = S.subtitulos(f, txt, ini - desde - 0.1, fin - desde + 0.4) + list(capas_extra)
        return S.Seg(pid, dur, S.v_clip(clip(pid), desde), capas, audio_clip=(clip(pid), desde, 1.0))

    def gancho(id_, video, dur=None, arriba=False):
        """Primer plano: la pregunta en grande, dicha por Lucía desde el fotograma 0."""
        d = dur or nv[id_]["dur"] + 0.6
        texto = S.capa_centro(f, nv[id_]["txt"], f.frase, y=(300 if arriba else None), banda=True)
        return S.Seg(f"gancho_{id_}", d, video, [(texto, 0.0, d + 0.5)])

    def narrado(id_, video, extra_dur=0.6, capas=(), texto=None, dur=None):
        d = dur or V[id_]["dur"] + extra_dur
        sub = S.subtitulos(f, texto or V[id_]["escrito"], 0.2, d - 0.1)
        return S.Seg(id_, d, video, list(capas) + sub)

    def cierre():
        img = S.lienzo()
        lg = Image.open(a.logo).convert("RGBA"); lg.thumbnail((520, 520))
        img.alpha_composite(lg, ((S.W - lg.width) // 2, 600))
        d = ImageDraw.Draw(img)
        for y, txt, fu, al in ((1250, "ordenglobal.org", f.mono, 255),
                               (1720, "Material informativo; no constituye oferta de valores ni de inversión.", f.chico, 160),
                               (1760, "Imágenes y voces ilustrativas generadas con IA.", f.chico, 160)):
            w = d.textlength(txt, font=fu); d.text(((S.W - w) / 2, y), txt, font=fu, fill=(*S.CREMA, al))
        return S.Seg("cierre", max(2.8, nv["C1"]["dur"] + 0.45), S.v_negro(), [(img, 0.1, 5)])

    def tarjeta_pago():
        return S.capa_tarjeta(f, "Recibido", ["Comisión: US$ 0,01", "Llegó en segundos"], y0=1130)

    shorts = {}

    # 1. UN CENTAVO — el dolor (cuánto cuesta mandar dinero) y la respuesta.
    s = Short("1_un_centavo", MUSICA["pagos"])
    s.add(gancho("H1", S.v_clip(extra("p2a", 2), 0.3)), narr=nv["H1"]["wav"], off=0.05)
    s.add(dialogo("p1a", [(S.capa_ruta(f, "08:10", "GUATEMALA", "BELICE", "el flete de las muestras de café"), 0.1, 9)]))
    s.add(dialogo("p1b", [(tarjeta_pago(), 0.2, 9)]), campana=True)
    s.add(narrado("N4", S.v_clip(clip("p1n"), 0.4), capas=[]), narr=wav("N4"))
    s.add(dialogo("p4a", [(S.capa_ruta(f, "12:20", "EL SALVADOR", "NICARAGUA", "dos cajas de rosquillas"), 0.1, 9)]))
    s.add(dialogo("p4b", [(tarjeta_pago(), 0.2, 9)]), campana=True)
    s.add(dialogo("p6b", [(tarjeta_pago(), 0.2, 9)]), campana=True)
    s.add(S.Seg("frase", 2.4, S.v_negro(), [(S.capa_centro(f, "Un centavo de dólar. En segundos. Entre siete países.", f.frase), 0.1, 3)]))
    s.add(cierre(), narr=nv["C1"]["wav"], off=0.3)
    shorts[s.nombre] = s

    # 2. UN DÍA, SIETE PAÍSES — el recorrido completo, rápido.
    s = Short("2_un_dia_siete_paises", MUSICA["pagos"])
    s.add(gancho("H2", S.v_panoramica(clip("ap_istmo"), 0.3, 1.1)), narr=nv["H2"]["wav"], off=0.05)
    for i, (hora, de, a_, que, la, lb) in enumerate(S.P["pagos"], 1):
        pb = f"p{i}b"
        n_de = {"AURELIO": "GUATEMALA", "MARCUS": "BELICE", "CHEPE": "HONDURAS", "LUCÍA": "EL SALVADOR",
                "MERCEDES": "NICARAGUA", "ANDRÉS": "COSTA RICA", "ROSA": "PANAMÁ"}
        ruta = S.capa_ruta(f, hora, n_de[de], n_de[a_], que)
        tarj = (S.capa_tarjeta(f, "Inversión recibida", ["Una parte de la cooperativa", "Ejemplo ilustrativo"], y0=1130)
                if i == 7 else tarjeta_pago())
        s.add(dialogo(pb, [(ruta, 0.05, 9), (tarj, 0.3, 9)], recorte=0.15, cola=0.3), campana=True)
    img = S.lienzo(); d = ImageDraw.Draw(img); y = 520
    for hh, de, a_, *_ in S.P["pagos"]:
        d.text((150, y), hh, font=f.monog, fill=(*S.ORO, 255))
        d.text((380, y + 12), f"{n_de[de].title()} → {n_de[a_].title()}", font=f.tarj, fill=(*S.CREMA, 255)); y += 110
    s.add(narrado("N5", S.v_panoramica(extra("ap_istmo", 3), 0.2, 1.3), capas=[(img, 0.2, 9)]), narr=wav("N5"))
    s.add(S.Seg("N6", V["N6"]["dur"] + 1.0, S.v_negro(),
                [(S.capa_centro(f, "¿Cuánto tardaría en moverse tu dinero?", f.frase), 0.2, 9)]), narr=wav("N6"))
    s.add(cierre(), narr=nv["C1"]["wav"], off=0.3)
    shorts[s.nombre] = s

    # 3. LOS SIETE — la gente, y ORIGEN como lo que tienen en común.
    s = Short("3_los_siete", MUSICA["presentaciones"])
    vivos = {n: clip(S.PRESENTA[n]) for n, *_ in S.CELDAS}
    s.add(gancho("H3", S.v_reticula(vivos, 0.3)), narr=nv["H3"]["wav"], off=0.05)
    for n in ("aurelio", "marcus", "lucia", "chepe", "mercedes", "andres", "rosa"):
        pid = S.PRESENTA[n]
        pais, ciudad = S.TOMA[pid]["texto"].strip("«»").split(" · ")
        ciudad = " ".join(w if w == "de" else w.capitalize() for w in ciudad.lower().split())
        s.add(dialogo(pid, [(S.capa_lugar(f, pais, ciudad), 0.05, 9)], recorte=0.2, cola=0.3))
    s.add(narrado("N1", S.v_reticula(vivos, 1.5), capas=[(S.capa_costuras(), 0, 9),
          (S.capa_centro(f, "ORIGEN", f.titulo, color=S.ORO), 4.9, 9)]), narr=wav("N1"))
    s.add(cierre(), narr=nv["C1"]["wav"], off=0.3)
    shorts[s.nombre] = s

    # 4. EL CAFÉ DE AURELIO — tokenizar, contado con una historia.
    s = Short("4_el_cafe_de_aurelio", MUSICA["inversion"])
    s.add(gancho("H4", S.v_clip(extra("k01", 1), 1.1)), narr=nv["H4"]["wav"], off=0.05)
    s.add(dialogo("p7a", [(S.capa_ruta(f, "18:10", "PANAMÁ", "GUATEMALA", "una parte de la cooperativa de café de Aurelio"), 0.1, 9)]))
    s.add(dialogo("p7b", [(S.capa_tarjeta(f, "Inversión recibida", ["Una parte de la cooperativa", "Ejemplo ilustrativo"], y0=1130), 0.2, 9)]), campana=True)
    k01 = extra("k01", 1)
    s.add(narrado("N8", S.v_clip(k01, 6.9, lento=1.35), dur=V["N8"]["dur"] + 0.5,
                  capas=[(S.capa_lugar(f, "DÍAS DESPUÉS", "La cooperativa, Huehuetenango"), 0.1, 2.8)]), narr=wav("N8"))
    pasaporte = S.capa_tarjeta(f, "Pasaporte del activo", ["Emisor: cooperativa de café", "Qué hay detrás: una parte de ella",
                                                           "Riesgo: puede perder valor", "Quién la tiene: reglas de Guatemala",
                                                           "Ejemplo ilustrativo"], y0=900, marca="ORIGEN")
    s.add(narrado("N9", S.v_clip(extra("ap_guatemala", 2), 0.5, lento=1.2), capas=[(pasaporte, 0.2, 9)]), narr=wav("N9"))
    # Lo que crece cuando llega capital: un plano por negocio, cortes cortos bajo la voz.
    crece = [(extra("k01", 1), 7.4), (clip("abre_rosa"), 1.8), (clip("p1n"), 1.6), (clip("abre_mercedes"), 2.0),
             (clip("abre_chepe"), 1.8), (clip("abre_andres"), 2.0), (clip("o02"), 2.2)]
    dn = (V["N11"]["dur"] + 0.6) / len(crece)
    sub = S.subtitulos(f, V["N11"]["escrito"], 0.2, V["N11"]["dur"] + 0.4)
    for j, (c, d0) in enumerate(crece):
        capas = [(img, x0 - j * dn, x1 - j * dn) for img, x0, x1 in sub if x1 > j * dn and x0 < (j + 1) * dn]
        s.add(S.Seg(f"crece_{j}", dn, S.v_clip(c, d0), capas), narr=(wav("N11") if j == 0 else None), off=0.2)
    s.add(cierre(), narr=nv["C1"]["wav"], off=0.3)
    shorts[s.nombre] = s

    # 5. EL SUEÑO DE MORAZÁN — unidad sin perder soberanía; cierra Lucía.
    s = Short("5_el_sueno_de_morazan", MUSICA["morazan"])
    s.add(gancho("H5", S.v_panoramica(clip("ap_istmo"), 0.3, 1.1)), narr=nv["H5"]["wav"], off=0.05)
    s.add(S.Seg("m01", 2.9, S.v_imagen(a.morazan), [(S.capa_centro(f, "Francisco Morazán (1792–1842)", f.lugar, y=1640), 0.2, 3.2),
                                                     (S.capa_sub(f, "Morazán soñó con unirnos."), 0.2, 3.2)]),
          narr=wav("N7"), off=0.2)
    s.add(S.Seg("siete", V["N7"]["dur"] - 2.5, S.v_reticula(vivos, 0.8),
                [(S.capa_costuras(), 0, 9), (S.capa_sub(f, "Hoy, sin dejar de ser siete: cada país con sus leyes."), 0.0, 9)]))
    frases = ["El capital, del mundo.", "El trabajo, aquí.", "Las reglas, de casa."]
    cap = [(S.capa_costuras(), 0, 9)] + [(S.capa_centro(f, fr, f.frase, y=640 + 190 * j, banda=True), 0.3 + 1.3 * j, 9)
                                          for j, fr in enumerate(frases)]
    s.add(S.Seg("k04", V["N10"]["dur"] + 0.8, S.v_reticula(vivos, 2.0), cap), narr=wav("N10"))
    s.add(dialogo("f01"))
    s.add(S.Seg("f02", V["F2"]["dur"] + 1.4, S.v_clip(clip("ci_luces"), 0.5, lento=1.2),
                [(S.capa_centro(f, "¿Y mañana… Latinoamérica?", f.frase), 0.3, 9)]), narr=wav("F2"), off=0.4)
    s.add(cierre(), narr=nv["C1"]["wav"], off=0.3)
    shorts[s.nombre] = s

    a.out.mkdir(parents=True, exist_ok=True)
    for nombre, s in shorts.items():
        if a.solo and a.solo not in nombre:
            continue
        render(a, s, a.out / f"{nombre}.mp4")


def render(a, s: Short, out: Path):
    t = 0.0
    for g in s.segs:
        g.t = t; t += g.dur
    total = t
    cache = a.cache or Path(tempfile.mkdtemp())
    cache.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    partes = []
    import hashlib
    for g in s.segs:
        h = hashlib.sha1(repr((g.video, round(g.t * S.FPS), round((g.t + g.dur) * S.FPS))).encode())
        for img, x0, x1 in g.capas:
            h.update(img.tobytes()); h.update(f"{x0:.3f}{x1:.3f}".encode())
        o = cache / f"{s.nombre}_{g.id}_{h.hexdigest()[:12]}.mp4"
        if not o.exists():
            S.render_video(g, o, tmp)
        partes.append(o)
    S.ff(*sum((["-i", str(p)] for p in partes), []), "-filter_complex",
         "".join(f"[{i}:v]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=1:a=0[v]",
         "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", str(S.FPS), str(tmp / "v.mp4"))
    SR = S.SR; N = int((total + 1) * SR)
    voz, fx = np.zeros((N, 2)), np.zeros((N, 2))
    for g in s.segs:
        if g.audio_clip:
            r, d0, _ = g.audio_clip
            sts = a.tomas / "voz_sts" / (Path(r).stem + ".wav")
            x = S.cargar(sts if sts.exists() else r, d0, g.dur); k = int(.04 * SR)
            x[:k] *= np.linspace(0, 1, k)[:, None]; x[-k:] *= np.linspace(1, 0, k)[:, None]
            S.poner(voz, x, g.t)
    for w, t0 in s.narr:
        S.poner(voz, S.cargar(w), t0, 0.95)
    for t0 in s.campanas:
        S.poner(fx, S.campana(), t0)
    golpe = 0.28 * np.sin(2 * np.pi * 38 * np.arange(int(1.2 * SR)) / SR) * np.exp(-np.arange(int(1.2 * SR)) / SR * 3.5)
    S.poner(fx, np.repeat(golpe[:, None], 2, 1), 0.0)
    sf.write(tmp / "voz.wav", voz, SR); sf.write(tmp / "fx.wav", fx, SR)
    S.ff("-i", str(tmp / "voz.wav"), "-i", str(tmp / "fx.wav"), "-ss", f"{s.musica:.2f}", "-i", str(a.musica),
         "-filter_complex",
         f"[2:a]aresample={SR},afade=t=in:d=0.6,volume={s.vol},apad,atrim=0:{total}[m];[0:a]asplit[v][sc];"
         f"[m][sc]sidechaincompress=threshold=0.025:ratio=5:attack=30:release=450[md];"
         f"[md][v][1:a]amix=inputs=3:normalize=0,afade=t=out:st={total - 1.2}:d=1.2,atrim=0:{total},"
         f"loudnorm=I=-14:TP=-1.5:LRA=8[o]", "-map", "[o]", "-ar", str(SR), str(tmp / "a.wav"))
    S.ff("-i", str(tmp / "v.mp4"), "-i", str(tmp / "a.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out))
    print(f"{out.name}: {len(s.segs)} planos · {total:.1f} s")


if __name__ == "__main__":
    main()
