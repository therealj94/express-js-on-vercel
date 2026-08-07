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

# Un despliegue que se cortó a media subida se queda vivo y bloquea el
# siguiente: Amplify solo admite uno a la vez. Se cancela antes de empezar, o
# el intento de arreglar el corte falla por culpa del corte.
def crear():
    return cl.create_deployment(
        appId=APP, branchName=RAMA,
        fileMap={rel: md5 for rel, (_, md5) in archivos.items()},
    )

try:
    dep = crear()
except cl.exceptions.BadRequestException as e:
    if "was not finished" not in str(e):
        raise
    colgado = cl.list_jobs(appId=APP, branchName=RAMA, maxResults=1)["jobSummaries"][0]["jobId"]
    print(f"  el despliegue {colgado} quedó a medias; se cancela")
    cl.stop_job(appId=APP, branchName=RAMA, jobId=colgado)
    for _ in range(20):
        time.sleep(3)
        try:
            dep = crear(); break
        except cl.exceptions.BadRequestException:
            pass
    else:
        sys.exit("no se pudo cancelar el despliegue anterior")
jobId = dep["jobId"]
urls = dep["fileUploadUrls"]
print(f"job {jobId}: {len(urls)} por subir")

# Doscientas y pico subidas seguidas: alguna se corta. No es motivo para
# rehacer el despliegue entero — cada archivo va a su propia URL y reintentarlo
# no molesta a los demás.
def subir(rel, url):
    with open(archivos[rel][0], "rb") as f:
        datos = f.read()
    for intento in range(4):
        try:
            r = requests.put(url, data=datos, timeout=180)
            if r.status_code in (200, 204):
                return
            ultimo = f"{r.status_code} {r.text[:160]}"
        except requests.exceptions.RequestException as e:
            ultimo = str(e)[:160]
        if intento < 3:
            time.sleep(2 ** intento)          # 1 s, 2 s, 4 s
    sys.exit(f"fallo subiendo {rel} tras 4 intentos: {ultimo}")

for i, (rel, url) in enumerate(urls.items(), 1):
    subir(rel, url)
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
