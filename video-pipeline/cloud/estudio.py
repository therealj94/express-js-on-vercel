#!/usr/bin/env python3
"""Estudio: la interfaz mínima que José sí puede usar desde el móvil.

ComfyUI es un editor de grafos: en un teléfono es inusable, y esa fue la causa
de que la primera sesión se perdiera montando nodos a mano. Esto sirve una sola
página con un campo de texto, un botón y la lista de lo generado — y por debajo
usa el mismo workflow probado que la cola desatendida.

Corre en el pod detrás de la misma autenticación de nginx.
"""
from __future__ import annotations

import copy, json, os, subprocess, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request

COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:9000")
WF_DIR = Path("/workspace/prompts/workflows")
OUT = Path("/workspace/outputs")
PUERTO = int(os.environ.get("ESTUDIO_PORT", "9100"))

CALIDADES = {
    "rapida": ("h3_t2v_api.json", 4, 720, 1280),
    "buena":  ("h3_calidad_api.json", 20, 768, 1344),
}

# Estado de los encargos, en memoria. La generación tarda minutos y NINGÚN
# navegador móvil mantiene abierta una petición tanto rato: Safari la corta con
# "TypeError: Load failed" aunque nginx espere una hora. Por eso el POST
# responde al instante con un identificador y la página pregunta por el estado.
TRABAJOS: dict[str, dict] = {}
_LOCK = threading.Lock()

PAGINA = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Estudio</title><style>
*{box-sizing:border-box}
body{margin:0;background:#0B0A08;color:#F2EEE6;font:16px/1.5 system-ui,sans-serif;padding:16px}
h1{font-size:20px;margin:0 0 4px}h1 em{color:#D4A24C;font-style:normal}
p.s{color:#9A9086;font-size:13px;margin:0 0 18px}
label{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;
  color:#9A9086;margin:14px 0 5px}
textarea,select{width:100%;background:#1C1917;color:#F2EEE6;border:1px solid #2A2622;
  border-radius:9px;padding:11px;font:inherit}
textarea{min-height:120px;resize:vertical}
button{width:100%;margin-top:14px;background:#D4A24C;color:#0B0A08;border:0;
  border-radius:9px;padding:14px;font-weight:700;font-size:16px}
button:disabled{opacity:.5}
.fila{display:flex;gap:10px}.fila>*{flex:1}
#estado{margin-top:14px;font-size:14px;color:#9A9086;min-height:22px}
.clip{margin-top:14px;border:1px solid #2A2622;border-radius:10px;overflow:hidden}
.clip video{width:100%;display:block;background:#000}
.clip a{display:block;padding:10px 12px;color:#D4A24C;text-decoration:none;font-size:13px}
</style></head><body>
<h1>Estudio <em>Orden Global</em></h1>
<p class="s">Escribe, genera, mira. Nada más.</p>

<label for="p">Qué quieres ver</label>
<textarea id="p" placeholder="Primer plano de un geólogo con casco negro y dorado examinando una muestra de mineral, luz de ventana, gira la muestra en las manos y mira a cámara"></textarea>

<div class="fila">
  <div><label for="c">Calidad</label>
    <select id="c"><option value="buena">Buena · 20 pasos</option>
    <option value="rapida">Rápida · 4 pasos</option></select></div>
  <div><label for="d">Segundos</label>
    <select id="d"><option>3</option><option selected>5</option><option>8</option></select></div>
</div>

<button id="b">Generar</button>
<div id="estado"></div>
<div id="lista"></div>

<script>
const $=s=>document.querySelector(s);
// El encargo vive en el pod, no en esta pestaña: se guarda el id para poder
// cerrar el móvil, volver, y seguir viendo en qué va.
const ID=()=>localStorage.getItem("trabajo");
async function refrescar(){
  const r=await fetch("api/clips").then(r=>r.json()).catch(()=>null);
  if(!r) return;
  $("#lista").innerHTML=r.map(n=>
    `<div class="clip"><video src="ver/${encodeURIComponent(n)}" controls playsinline preload="none"></video>
     <a href="ver/${encodeURIComponent(n)}" download>${n}</a></div>`).join("");
}
async function vigilar(){
  const id=ID(); if(!id){ $("#b").disabled=false; return; }
  let t;
  try{ t=await fetch("api/estado/"+id).then(r=>r.json()); }
  catch(e){ $("#estado").textContent="Sin señal, reintentando…"; return; }
  if(t.estado==="trabajando"){
    $("#b").disabled=true;
    $("#estado").textContent=`Generando… ${t.seg}s. Puedes cerrar esto y volver.`;
    return;
  }
  $("#b").disabled=false; localStorage.removeItem("trabajo");
  $("#estado").textContent = t.estado==="listo" ? "Listo: "+t.archivo
                                                : "Error: "+(t.error||"desconocido");
  refrescar();
}
$("#b").onclick=async()=>{
  const prompt=$("#p").value.trim();
  if(!prompt){$("#estado").textContent="Escribe algo primero.";return;}
  $("#b").disabled=true; $("#estado").textContent="Enviando…";
  try{
    const r=await fetch("api/generar",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt,calidad:$("#c").value,segundos:+$("#d").value})}).then(r=>r.json());
    if(r.id){ localStorage.setItem("trabajo",r.id); vigilar(); }
    else { $("#estado").textContent="Error: "+(r.error||"desconocido"); $("#b").disabled=false; }
  }catch(e){ $("#estado").textContent="Error: "+e; $("#b").disabled=false; }
};
refrescar(); vigilar();
setInterval(vigilar, 5000); setInterval(refrescar, 30000);
</script></body></html>"""


def api(path: str, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = request.Request(f"{COMFY}{path}", data=data,
                        headers={"Content-Type": "application/json"})
    with request.urlopen(r, timeout=120) as resp:
        b = resp.read()
    return json.loads(b) if b else {}


def generar(prompt: str, calidad: str, segundos: int) -> dict:
    nombre, pasos, w, h = CALIDADES.get(calidad, CALIDADES["buena"])
    ruta = WF_DIR / nombre
    if not ruta.exists():
        return {"ok": False, "error": f"falta el workflow {nombre}"}
    wf = json.loads(ruta.read_text())
    frames = round(segundos * 24 / 4) * 4 + 1        # H3 exige 4n+1
    ident = f"estudio_{int(time.time())}"
    for n in wf.values():
        i = n["inputs"]
        if "prompt" in i and not isinstance(i["prompt"], list): i["prompt"] = prompt
        if "length" in i and not isinstance(i["length"], list):
            i["length"] = frames; i["width"] = w; i["height"] = h
        if "steps" in i and not isinstance(i["steps"], list): i["steps"] = pasos
        if "noise_seed" in i: i["noise_seed"] = int(time.time()) % 100000
        if "filename_prefix" in i: i["filename_prefix"] = ident
    try:
        pid = api("/prompt", {"prompt": wf})["prompt_id"]
    except Exception as e:
        detalle = e.read().decode()[:300] if hasattr(e, "read") else str(e)
        return {"ok": False, "error": detalle}
    fin = time.time() + 1800
    while time.time() < fin:
        h_ = api(f"/history/{pid}").get(pid)
        if h_:
            fich = [f["filename"] for o in h_.get("outputs", {}).values()
                    for k in ("videos", "gifs", "images") for f in o.get(k, [])]
            if fich:
                return {"ok": True, "archivo": fich[0]}
            if h_.get("status", {}).get("status_str") == "error":
                return {"ok": False, "error": json.dumps(h_["status"])[:300]}
        time.sleep(3)
    return {"ok": False, "error": "se agotó el tiempo"}


def trabajar(ident: str, prompt: str, calidad: str, segundos: int) -> None:
    """Genera en segundo plano y deja el resultado donde la página lo consulte."""
    try:
        r = generar(prompt, calidad, segundos)
    except Exception as e:                       # noqa: BLE001
        r = {"ok": False, "error": str(e)[:300]}
    with _LOCK:
        t0 = TRABAJOS.get(ident, {}).get("t0", time.time())
        TRABAJOS[ident] = {
            "estado": "listo" if r.get("ok") else "error",
            "archivo": r.get("archivo"), "error": r.get("error"), "t0": t0,
        }


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _envia(self, cuerpo: bytes, tipo="application/json", code=200):
        self.send_response(code)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            return self._envia(PAGINA.encode(), "text/html; charset=utf-8")
        if self.path == "/api/clips":
            v = sorted((p.name for p in OUT.glob("*.mp4")),
                       key=lambda n: (OUT / n).stat().st_mtime, reverse=True)
            return self._envia(json.dumps(v[:20]).encode())
        if self.path.startswith("/api/estado/"):
            with _LOCK:
                t = dict(TRABAJOS.get(self.path[12:], {"estado": "desconocido"}))
            t["seg"] = int(time.time() - t.pop("t0", time.time()))
            return self._envia(json.dumps(t).encode())
        if self.path.startswith("/ver/"):
            from urllib.parse import unquote
            f = OUT / unquote(self.path[5:])
            # Sin salirse de la carpeta de salidas, pase lo que pase en la URL.
            if f.parent.resolve() != OUT.resolve() or not f.exists():
                return self._envia(b"no existe", "text/plain", 404)
            return self._envia(f.read_bytes(), "video/mp4")
        self._envia(b"no existe", "text/plain", 404)

    def do_POST(self):
        if self.path != "/api/generar":
            return self._envia(b"{}", code=404)
        n = int(self.headers.get("Content-Length", 0))
        d = json.loads(self.rfile.read(n) or b"{}")
        if not d.get("prompt", "").strip():
            return self._envia(json.dumps({"error": "prompt vacío"}).encode())
        ident = f"t{int(time.time()*1000)}"
        with _LOCK:
            TRABAJOS[ident] = {"estado": "trabajando", "t0": time.time()}
        threading.Thread(target=trabajar, daemon=True, args=(
            ident, d["prompt"], d.get("calidad", "buena"),
            int(d.get("segundos", 5)))).start()
        self._envia(json.dumps({"id": ident}).encode())


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"estudio escuchando en :{PUERTO}", flush=True)
    # Con hilos: mientras un clip se genera, la lista y el estado siguen
    # respondiendo. Con el servidor de un solo hilo la página se quedaba
    # congelada los minutos que durase la generación.
    ThreadingHTTPServer(("127.0.0.1", PUERTO), H).serve_forever()
