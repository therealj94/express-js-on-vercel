# Despliegue del sitio de Orden Global en AWS Amplify.
#
# Amplify reemplaza el manifiesto completo en cada despliegue: lo que no va en
# el fileMap desaparece del sitio. Por eso se recorre el arbol entero y se sube
# todo, no solo lo que cambio.

#
#   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 desplegar.py [carpeta]
#
# La carpeta por defecto es la copia de trabajo en /tmp; RECONSTRUIR.md explica
# como rehacerla si se pierde.

import hashlib, os, sys, boto3, requests, time

RAIZ = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ogsite"
APP = "d2rweubccyt73x"
RAMA = "main"

cl = boto3.client("amplify", region_name="us-east-1")

archivos = {}
for base, _, nombres in os.walk(RAIZ):
    for nombre in nombres:
        ruta = os.path.join(base, nombre)
        rel = "/" + os.path.relpath(ruta, RAIZ)
        with open(ruta, "rb") as f:
            archivos[rel] = (ruta, hashlib.md5(f.read()).hexdigest())

print(f"{len(archivos)} archivos, {sum(os.path.getsize(r) for r, _ in archivos.values())/1e6:.1f} MB")

dep = cl.create_deployment(
    appId=APP, branchName=RAMA,
    fileMap={rel: md5 for rel, (_, md5) in archivos.items()},
)
jobId = dep["jobId"]
urls = dep["fileUploadUrls"]
print(f"job {jobId}: {len(urls)} por subir")

for i, (rel, url) in enumerate(urls.items(), 1):
    ruta = archivos[rel][0]
    with open(ruta, "rb") as f:
        r = requests.put(url, data=f.read(), timeout=120)
    if r.status_code not in (200, 204):
        sys.exit(f"fallo subiendo {rel}: {r.status_code} {r.text[:200]}")
    if i % 25 == 0 or i == len(urls):
        print(f"  {i}/{len(urls)}")

cl.start_deployment(appId=APP, branchName=RAMA, jobId=jobId)
print("desplegando...")

while True:
    time.sleep(6)
    j = cl.get_job(appId=APP, branchName=RAMA, jobId=jobId)["job"]["summary"]
    estado = j["status"]
    print(" ", estado)
    if estado in ("SUCCEED", "FAILED", "CANCELLED"):
        sys.exit(0 if estado == "SUCCEED" else 1)
