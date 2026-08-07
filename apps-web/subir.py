# Sube una carpeta a una app de Amplify.
#
#   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 subir.py <carpeta> <appId> [rama]
#
# Amplify reemplaza el manifiesto entero en cada despliegue: lo que no va en la
# subida desaparece del sitio. Por eso se recorre el arbol completo y se sube
# todo, aunque solo haya cambiado un archivo. En vetawallet.com esto importa el
# doble, porque ahi viven privacidad.html y terminos.html y las tiendas de
# aplicaciones las exigen: dejarlas fuera de una subida es tumbarlas.

import hashlib, os, sys, time, boto3, requests

RAIZ, APP = sys.argv[1], sys.argv[2]
RAMA = sys.argv[3] if len(sys.argv) > 3 else 'main'
cl = boto3.client('amplify', region_name='us-east-1')

archivos = {}
for base, _, nombres in os.walk(RAIZ):
    for n in nombres:
        r = os.path.join(base, n)
        with open(r, 'rb') as f:
            archivos['/' + os.path.relpath(r, RAIZ)] = (r, hashlib.md5(f.read()).hexdigest())
print(f"  {len(archivos)} archivos · {sum(os.path.getsize(a) for a, _ in archivos.values())/1e6:.1f} MB")


def crear():
    return cl.create_deployment(appId=APP, branchName=RAMA,
                                fileMap={k: v[1] for k, v in archivos.items()})

# Un despliegue que se corto a media subida se queda vivo y bloquea el
# siguiente: Amplify solo admite uno a la vez, asi que el intento de arreglar el
# corte falla por culpa del corte.
try:
    dep = crear()
except cl.exceptions.BadRequestException as e:
    if 'was not finished' not in str(e):
        raise
    colgado = cl.list_jobs(appId=APP, branchName=RAMA, maxResults=1)['jobSummaries'][0]['jobId']
    print(f"  el despliegue {colgado} quedo a medias; se cancela")
    cl.stop_job(appId=APP, branchName=RAMA, jobId=colgado)
    for _ in range(20):
        time.sleep(3)
        try:
            dep = crear(); break
        except cl.exceptions.BadRequestException:
            pass
    else:
        sys.exit('no se pudo cancelar el despliegue anterior')

# Doscientas subidas seguidas y alguna se corta. No es motivo para rehacer el
# despliegue entero: cada archivo va a su propia URL.
for i, (rel, url) in enumerate(dep['fileUploadUrls'].items(), 1):
    with open(archivos[rel][0], 'rb') as f:
        datos = f.read()
    for intento in range(4):
        try:
            r = requests.put(url, data=datos, timeout=180)
            if r.status_code in (200, 204):
                break
            ultimo = f"{r.status_code} {r.text[:120]}"
        except requests.exceptions.RequestException as e:
            ultimo = str(e)[:120]
        if intento < 3:
            time.sleep(2 ** intento)
    else:
        sys.exit(f"fallo subiendo {rel} tras 4 intentos: {ultimo}")
    if i % 25 == 0 or i == len(dep['fileUploadUrls']):
        print(f"  {i}/{len(dep['fileUploadUrls'])}")

cl.start_deployment(appId=APP, branchName=RAMA, jobId=dep['jobId'])
print("  desplegando…")
while True:
    time.sleep(5)
    s = cl.get_job(appId=APP, branchName=RAMA, jobId=dep['jobId'])['job']['summary']['status']
    if s in ('SUCCEED', 'FAILED', 'CANCELLED'):
        print('  ', s)
        sys.exit(0 if s == 'SUCCEED' else 1)
