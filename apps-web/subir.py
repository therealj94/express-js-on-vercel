# Sube una carpeta a una app de Amplify.
#
#   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 subir.py <carpeta> <appId> [rama]
#
# Amplify reemplaza el manifiesto entero en cada despliegue: lo que no va en la
# subida desaparece del sitio. Por eso se recorre el arbol completo y se sube
# todo, aunque solo haya cambiado un archivo. En vetawallet.com esto importa el
# doble, porque ahi viven privacidad.html y terminos.html y las tiendas de
# aplicaciones las exigen: dejarlas fuera de una subida es tumbarlas.

import hashlib, os, re, sys, time, boto3, requests

RAIZ, APP = sys.argv[1], sys.argv[2]
RAMA = sys.argv[3] if len(sys.argv) > 3 else 'main'
cl = boto3.client('amplify', region_name='us-east-1')

# LO QUE NO ES EL SITIO, NO SE SUBE.
#
# `pruebas/` son los guiones que abren navegadores contra la app: no los carga
# nadie desde la web y no pintan nada. Se estaban publicando en
# app.vetawallet.com igual que el resto, y ademas volvian como HTML con estado
# 200 —la regla comodin de Amplify no reconoce `.mjs`—, que es el sintoma
# clasico de un archivo que no deberia estar ahi.
#
# No son un secreto, pero cuentan por dentro como funciona el chat, donde estan
# las rutas y que se comprueba de cada una. Eso es un mapa gratis para quien
# quiera buscarle las vueltas, y no tiene ni una razon a favor de estar
# publicado.
FUERA = ('pruebas',)


def se_sube(rel):
    return not any(p in FUERA for p in rel.split(os.sep))


# ── EL SELLO DE LA VERSIÓN ───────────────────────────────────────────────────
#
# «No sé si se actualizó» es una pregunta que no se puede contestar mirando la
# pantalla: un navegador que se quedó con una copia vieja se ve exactamente
# igual que uno al día. Así que cada subida ESTAMPA su huella en app.js, y la
# ficha de Ajustes la enseña. Si lo que dice la pantalla no coincide con lo que
# se acaba de subir, la copia es vieja — y entonces ya se sabe qué hacer.
#
# La huella sale del contenido de los archivos que se suben, no de un reloj:
# subir dos veces lo mismo da el mismo sello, que es lo correcto (no hubo
# cambios) y evita el «actualizá» falso.
#
# Cada casa nombra sus constantes a su manera —VETA_V en la billetera, ONX_V en
# Ordenex— así que el sello se busca por el par que corresponda y no por un
# nombre fijo. La casa que no tenga ninguno sencillamente no se sella, en
# silencio: no todas necesitan ficha de versión, y un aviso en cada subida que
# no significa nada enseña a ignorar los avisos.
SELLOS = (('VETA_V', 'VETA_FECHA'), ('ONX_V', 'ONX_FECHA'), ('OGS_V', 'OGS_FECHA'))

# ── Y EL SELLO PEGADO A CADA ARCHIVO ─────────────────────────────────────────
#
# Esto es lo que hace que una publicación LLEGUE.
#
# Los scripts se pedían por su nombre pelado —app.js, i18n.js, chat.js— y ese
# nombre no cambia nunca. Un navegador que ya bajó uno se lo queda todo el
# tiempo que quiera, y no hay forma de decirle que hay otro: se publica un
# arreglo y del otro lado sigue corriendo el de antes.
#
# Lo peor no es quedarse viejo entero: es quedarse A MEDIAS. Cada archivo tiene
# su propia caducidad, así que un navegador puede acabar con el app.js de ayer
# y el i18n.js de hoy corriendo juntos. Ahí no falla nada de golpe — salen
# rarezas sueltas, cosas que aparecen dos veces, textos que no coinciden con lo
# que hace el botón. Exactamente los fantasmas que costaba explicar.
#
# Con el sello detrás (app.js?v=abc123) cada versión es una dirección distinta:
# la copia guardada se aprovecha mientras el contenido sea el mismo —que es
# para lo que sirve— y se tira sola en cuanto publicamos. Y como el sello sale
# del contenido, todos los archivos de una misma subida llevan el mismo: o se
# actualizan todos, o ninguno. Nunca a medias.
QUITAR_SELLO = re.compile(r'((?:src|href)="[^"?#]+\.(?:js|css))\?v=[^"]*(")')
PONER_SELLO = re.compile(r'((?:src|href)="(?!https?:|//|data:)[^"?#]+\.(?:js|css))(")')


def sellar_paginas(raiz, version):
    """Pega ?v=<version> a cada script y hoja de estilo propios de la casa."""
    tocados = 0
    for base, _, nombres in os.walk(raiz):
        for n in nombres:
            if not n.endswith('.html'):
                continue
            r = os.path.join(base, n)
            if not se_sube(os.path.relpath(r, raiz)):
                continue
            with open(r, encoding='utf8') as f:
                html = f.read()
            # primero se limpia el sello anterior, después se pone el de ahora
            nuevo = QUITAR_SELLO.sub(r'\1\2', html)
            nuevo = PONER_SELLO.sub(rf'\1?v={version}\2', nuevo)
            if nuevo != html:
                with open(r, 'w', encoding='utf8') as f:
                    f.write(nuevo)
                tocados += 1
    return tocados


def sellar(raiz):
    import datetime
    # La casa que vive en UN SOLO index.html tambien se sella.
    # Ordenscan es exactamente eso, y por no tener `app.js` se quedaba fuera
    # del sello: fue la que sirvio «Chain 8532» durante meses sin que nada lo
    # dijera. El sello se busca donde este.
    objetivo = os.path.join(raiz, 'app.js')
    if not os.path.exists(objetivo):
        objetivo = os.path.join(raiz, 'index.html')
    if not os.path.exists(objetivo):
        return None
    with open(objetivo, encoding='utf8') as f:
        codigo = f.read()

    marca = next((p for p in SELLOS if re.search(rf"const {p[0]} = '", codigo)), None)
    if not marca:
        return None
    nomV, nomF = marca

    h = hashlib.md5()
    for base, _, nombres in sorted(os.walk(raiz)):
        for n in sorted(nombres):
            r = os.path.join(base, n)
            rel = os.path.relpath(r, raiz)
            if not se_sube(rel) or r == objetivo:
                continue
            if n.endswith('.html'):
                # SIN los sellos de la subida anterior. Con ellos dentro, cada
                # subida cambiaría el hash aunque no se hubiera tocado nada: el
                # sello se mordería la cola y «mismo contenido, mismo sello»
                # dejaría de ser cierto.
                with open(r, encoding='utf8') as f:
                    h.update(rel.encode())
                    h.update(QUITAR_SELLO.sub(r'\1\2', f.read()).encode())
                continue
            with open(r, 'rb') as f:
                h.update(rel.encode()); h.update(f.read())
    # El propio app.js entra en la cuenta, pero SIN su sello anterior — LAS DOS
    # LÍNEAS, versión y fecha. Borrando solo la versión, la fecha estampada en
    # la subida anterior seguía dentro de lo que se hashea y cada subida daba un
    # sello distinto aunque no se hubiera tocado una coma. Justo lo contrario de
    # lo que este número tiene que decir: mismo contenido, mismo sello.
    limpio = re.sub(rf"(const {nomV} = ')[^']*(')", r"\1\2", codigo)
    limpio = re.sub(rf"(const {nomF} = ')[^']*(')", r"\1\2", limpio)
    h.update(limpio.encode())
    version = h.hexdigest()[:10]
    fecha = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    nuevo, n1 = re.subn(rf"(const {nomV} = ')[^']*(')", rf"\g<1>{version}\g<2>", codigo)
    nuevo, n2 = re.subn(rf"(const {nomF} = ')[^']*(')", rf"\g<1>{fecha}\g<2>", nuevo)
    if not n2:
        # Media ficha es peor que ninguna: diría una fecha que no es la de esta
        # subida y nadie sabría que está mintiendo.
        print(f'  aviso: hay `{nomV}` pero falta `{nomF}` — la fecha va a quedar vieja')
    if nuevo != codigo:
        with open(objetivo, 'w', encoding='utf8') as f:
            f.write(nuevo)
    paginas = sellar_paginas(raiz, version)
    print(f'  sello de la casa v={version} ({fecha})'
          + (f' · {paginas} página(s) con el sello pegado a sus archivos' if paginas else ''))
    return version


sellar(RAIZ)

archivos = {}
saltados = 0
for base, _, nombres in os.walk(RAIZ):
    for n in nombres:
        r = os.path.join(base, n)
        rel = os.path.relpath(r, RAIZ)
        if not se_sube(rel):
            saltados += 1
            continue
        with open(r, 'rb') as f:
            archivos['/' + rel] = (r, hashlib.md5(f.read()).hexdigest())
if saltados:
    print(f"  {saltados} archivos que no son del sitio se quedan fuera ({', '.join(FUERA)})")
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
