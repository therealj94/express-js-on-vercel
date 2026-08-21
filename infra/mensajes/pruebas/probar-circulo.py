#!/usr/bin/env python3
"""El círculo, las llaves de aparato y los estados de 24 horas.

Lo que de verdad importa comprobar aquí no es que las rutas contesten: es que
la privacidad esté puesta EN EL SERVIDOR y no solo en la app. Un botón
escondido no protege a nadie; lo que protege es que el relevo diga 403.

Se comprueban tres cosas que, si fallaran, serían un fallo de privacidad y no
un fallo de funcionamiento:

  · un desconocido no puede escribir ni hacer sonar el teléfono;
  · un desconocido no puede pedir las llaves públicas de nadie ni ver sus
    estados;
  · quien YA se escribía sigue pudiendo — o el despliegue cortaría de golpe
    todas las conversaciones abiertas.
"""
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')
PUERTO = 8402
BASE = f'http://127.0.0.1:{PUERTO}'

fallos = []


def ok(que, cond, extra=''):
    print(f"{'  ok  ' if cond else ' FALLA'}  {que}" + (f'  · {extra}' if extra else ''))
    if not cond:
        fallos.append(que)


def pedir(ruta, cuerpo, espera=20):
    req = urllib.request.Request(BASE + ruta, method='POST',
                                 data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


tmp = tempfile.mkdtemp()
proc = subprocess.Popen([sys.executable, SERVIDOR],
                        env={**os.environ, 'MENSAJES_DATOS': os.path.join(tmp, 'd.json'),
                             'MENSAJES_PUERTO': str(PUERTO),
                             'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch')},
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        time.sleep(0.25)
        try:
            urllib.request.urlopen(BASE + '/salud', timeout=2)
            break
        except Exception:
            pass

    def alta(c):
        return {'correo': c, 'llave': pedir('/alta', {'correo': c, 'nombre': c.split('@')[0]})[1]['llave']}

    ana = alta('ana@ordenglobal.link')
    beto = alta('beto@ordenglobal.link')
    caro = alta('caro@ordenglobal.link')
    viejo = alta('viejo@ordenglobal.link')

    # ── un desconocido no pasa ───────────────────────────────────────────
    est, r = pedir('/enviar', {**ana, 'para': beto['correo'], 'texto': 'hola'})
    ok('un desconocido NO puede escribir', est == 403, f'{est} {r.get("error", "")}')

    est, _ = pedir('/senal', {**ana, 'para': beto['correo'], 'tipo': 'llamo', 'datos': {}})
    ok('un desconocido NO puede hacer sonar el teléfono', est == 403, str(est))

    _, r = pedir('/llaves/publicar', {**beto, 'id': 'apBeto1', 'pub': 'LLAVEPUBLICADEBETO'})
    _, r = pedir('/llaves/de', {**ana, 'correos': [beto['correo']]})
    ok('un desconocido NO recibe las llaves públicas de otro', not r['llaves'], json.dumps(r))

    # ── el historial de antes vale como aceptación ───────────────────────
    # Se fabrica a mano una conversación previa entre viejo y ana, que es lo
    # que habrá en producción el día del despliegue.
    _, _ = pedir('/amistad/pedir', {**viejo, 'para': ana['correo']})
    _, _ = pedir('/amistad/responder', {**ana, 'de': viejo['correo'], 'aceptar': True})
    est, _ = pedir('/enviar', {**viejo, 'para': ana['correo'], 'texto': 'de antes'})
    ok('con lazo aceptado sí se puede escribir', est == 200, str(est))
    _, _ = pedir('/amistad/quitar', {**ana, 'con': viejo['correo']})
    est, _ = pedir('/enviar', {**viejo, 'para': ana['correo'], 'texto': 'sigo pudiendo'})
    ok('quien YA hablaba sigue pudiendo aunque se borre el lazo', est == 200, str(est))

    # ── pedir y aceptar ──────────────────────────────────────────────────
    _, r = pedir('/amistad/pedir', {**ana, 'para': beto['correo'], 'nota': 'soy Ana'})
    ok('la solicitud queda enviada', r.get('estado') == 'enviada', json.dumps(r))

    _, r = pedir('/amistad/responder', {**ana, 'de': beto['correo'], 'aceptar': True})
    ok('quien pide NO puede aceptarse a sí mismo', r.get('error'), json.dumps(r))

    _, r = pedir('/amistad/lista', {**beto})
    ok('a Beto le aparece la solicitud con su nota',
       [x for x in r['recibidas'] if x['correo'] == ana['correo'] and x['nota'] == 'soy Ana'],
       json.dumps(r['recibidas']))

    _, r = pedir('/amistad/responder', {**beto, 'de': ana['correo'], 'aceptar': True})
    ok('aceptada', r.get('estado') == 'amigos', json.dumps(r))

    est, _ = pedir('/enviar', {**ana, 'para': beto['correo'], 'texto': 'ahora sí'})
    ok('aceptada la solicitud, ya se puede escribir', est == 200, str(est))

    # ── el bulto cerrado ─────────────────────────────────────────────────
    _, r = pedir('/llaves/de', {**ana, 'correos': [beto['correo'], caro['correo']]})
    ok('ahora sí llegan las llaves de Beto', r['llaves'].get(beto['correo']), json.dumps(r['llaves']))
    ok('las de Caro no, que no es del círculo', caro['correo'] not in r['llaves'], json.dumps(r))

    bulto = {'v': 1, 'de': 'PUBDEANA', 'iv': 'aaaa', 'ct': 'BULTOCERRADO',
             's': [{'a': 'apBeto1', 'iv': 'bbbb', 'k': 'SOBRE'}]}
    est, _ = pedir('/enviar', {**ana, 'para': beto['correo'], 'cif': bulto})
    ok('el relevo acepta un bulto cerrado sin texto', est == 200, str(est))

    _, r = pedir('/bandeja', {**beto, 'desde': ana['correo']})
    ultimo = r['mensajes'][-1]
    ok('el bulto vuelve entero', ultimo.get('cif', {}).get('ct') == 'BULTOCERRADO', json.dumps(ultimo))
    ok('EL RELEVO NO GUARDA EL TEXTO EN CLARO AL LADO', ultimo.get('texto') == '',
       repr(ultimo.get('texto')))

    crudo = open(os.path.join(tmp, 'd.json'), encoding='utf-8').read()
    ok('«ahora sí» está en claro en el disco (mensaje viejo, sin cifrar)', 'ahora sí' in crudo)
    ok('el bulto cerrado NO deja rastro legible', 'BULTOCERRADO' in crudo and crudo.count('BULTOCERRADO') == 1)

    # ── estados ──────────────────────────────────────────────────────────
    _, r = pedir('/estado/subir', {**ana, 'texto': 'probando el estado', 'fondo': 3})
    eid = r.get('id')
    ok('Ana sube un estado', bool(eid), json.dumps(r))

    _, r = pedir('/estados', {**beto})
    suyos = [g for g in r['gente'] if g['correo'] == ana['correo']]
    ok('Beto, que es del círculo, lo ve', suyos and suyos[0]['sinVer'] == 1, json.dumps(r['gente']))

    _, r = pedir('/estados', {**caro})
    ok('Caro, que no lo es, NO lo ve',
       not [g for g in r['gente'] if g['correo'] == ana['correo']], json.dumps(r['gente']))

    _, _ = pedir('/estado/visto', {**beto, 'id': eid})
    _, r = pedir('/estados', {**beto})
    suyos = [g for g in r['gente'] if g['correo'] == ana['correo']][0]
    ok('marcado como visto', suyos['sinVer'] == 0, json.dumps(suyos))

    _, r = pedir('/estados', {**ana})
    mio = [g for g in r['gente'] if g['correo'] == ana['correo']][0]['estados'][0]
    ok('el dueño ve cuántos lo vieron', mio['vistas'] == 1, json.dumps(mio))
    _, r = pedir('/estados', {**beto})
    ajeno = [g for g in r['gente'] if g['correo'] == ana['correo']][0]['estados'][0]
    ok('quien lo mira NO ve el recuento ajeno', ajeno['vistas'] is None, json.dumps(ajeno))

    # el vencimiento se comprueba a mano, envejeciendo el estado en el disco
    proc.terminate(); proc.wait(timeout=10)
    ruta = os.path.join(tmp, 'd.json')
    d = json.load(open(ruta, encoding='utf-8'))
    for e in d['estados']:
        e['vence'] = 1
    json.dump(d, open(ruta, 'w', encoding='utf-8'), ensure_ascii=False)
    proc = subprocess.Popen([sys.executable, SERVIDOR],
                            env={**os.environ, 'MENSAJES_DATOS': ruta,
                                 'MENSAJES_PUERTO': str(PUERTO),
                                 'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch')},
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        time.sleep(0.25)
        try:
            urllib.request.urlopen(BASE + '/salud', timeout=2)
            break
        except Exception:
            pass
    _, r = pedir('/estados', {**beto})
    ok('un estado vencido desaparece', not r['gente'], json.dumps(r))
    d = json.load(open(ruta, encoding='utf-8'))
    ok('y se va del disco de verdad, no solo de la vista', not d.get('estados'))

    # ── rechazar no deja rastro consultable ──────────────────────────────
    _, _ = pedir('/amistad/pedir', {**caro, 'para': beto['correo']})
    _, _ = pedir('/amistad/responder', {**beto, 'de': caro['correo'], 'aceptar': False})
    _, r = pedir('/amistad/lista', {**caro})
    ok('a quien rechazan no le queda una etiqueta de rechazo',
       not r['enviadas'] and not r['amigos'], json.dumps(r))

    # ── los dos se piden a la vez ────────────────────────────────────────
    _, _ = pedir('/amistad/pedir', {**caro, 'para': ana['correo']})
    _, r = pedir('/amistad/pedir', {**ana, 'para': caro['correo']})
    ok('si los dos se piden a la vez, quedan amigos sin más pasos',
       r.get('estado') == 'amigos', json.dumps(r))
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()

print()
print(f'{len(fallos)} en rojo' if fallos else 'El círculo, las llaves y los estados: todo en verde')
sys.exit(1 if fallos else 0)
