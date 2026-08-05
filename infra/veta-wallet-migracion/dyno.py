#!/usr/bin/env python3
"""Corre un script Node en un dyno one-off de vetawallet y devuelve su salida.

El dyno se lanza sin adjuntar (attach=False) y la salida se lee por una
log-session filtrada a ese dyno. El script viaja en base64 por una variable de
entorno del dyno para que el shell no lo destroce, y se escribe en /app —
no en /tmp — porque desde /tmp Node no resuelve los node_modules del slug.
"""
import base64, json, os, sys, time, urllib.request

APP = "vetawallet"
TOK = os.environ["HEROKU_API_KEY"]

def api(method, path, body=None):
    req = urllib.request.Request(
        "https://api.heroku.com" + path, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + TOK,
                 "Accept": "application/vnd.heroku+json; version=3",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

script = open(sys.argv[1], "rb").read()
# El script viaja en base64 por una variable de entorno para que el shell del
# dyno no lo destroce, y se escribe en /app — no en /tmp — porque desde /tmp
# Node no resuelve los node_modules del slug. Se ejecuta con babel-node, que es
# como arranca la aplicacion, asi que puede importar `lib/cripto.js` tal cual.
cmd = ("node -e \"require('fs').writeFileSync('/app/v.js',"
       "Buffer.from(process.env.SCRIPT_B64,'base64'))\" "
       "&& npx babel-node /app/v.js")

d = api("POST", f"/apps/{APP}/dynos", {
    "command": cmd, "attach": False, "time_to_live": 900,
    "env": {"SCRIPT_B64": base64.b64encode(script).decode()},
})
name = d["name"]
print(f"[dyno {name}]", file=sys.stderr)

ls = api("POST", f"/apps/{APP}/log-sessions",
         {"dyno": name, "lines": 1500, "tail": True})
url = ls["logplex_url"]

deadline = time.time() + int(os.environ.get("ESPERA", "300"))
seen = set()
with urllib.request.urlopen(url, timeout=deadline - time.time()) as r:
    while time.time() < deadline:
        line = r.readline()
        if not line:
            break
        line = line.decode("utf-8", "replace").rstrip()
        if line in seen:
            continue
        seen.add(line)
        print(line)
        sys.stdout.flush()
        if " Process exited " in line or "State changed from up to complete" in line:
            break
