#!/usr/bin/env python3
"""Sube el relevo de mensajes al nodo del cerebro y lo deja corriendo.

Mismo molde que desplegar-voz.py: S3 + SSM, Caddyfile con copia de respaldo
y `caddy validate` antes de recargar --si no valida, se restaura y se avisa--.
Al final se comprueba desde FUERA que /mensajes/salud contesta 200 sin
contraseña y que lo interno sigue en 401.
"""
import json, time, boto3, os, sys

S = '/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad'
AQUI = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────────────────────────────────────
# LAS LLAVES DEL TURN DE CLOUDFLARE
#
# Se leen del ENTORNO de quien despliega y se escriben en la unidad de systemd
# de la maquina. NUNCA se escriben en el repositorio.
#
#   TURN_LLAVE_ID=xxx TURN_LLAVE_TOKEN=yyy python3 desplegar-mensajes.py
#
# ESTADO (25-ago-2026): PUESTAS. La llave se llama `orden-global-relevo` en el
# panel de Cloudflare, y desde entonces /turno devuelve relevos de verdad en
# vez de la lista vacia — o sea que una llamada conecta tambien detras de un
# NAT cerrado, que es casi todo el movil con datos. Comprobarlo no pide entrar
# a ningun panel: se le pregunta al relevo.
#
#   curl -s -X POST https://cerebro.ordenscan.com/mensajes/turno \
#        -H 'Content-Type: application/json' \
#        -d '{"correo":"<uno tuyo>","llave":"<la del alta>"}'
#
# Si sale `{"iceServers": []}`, no hay TURN y las llamadas van solo con STUN.
#
# Desplegar SIN las variables no las apaga: se rescatan las que la maquina ya
# tenia (ver TURN_CONSERVADO mas abajo). Trayendolas, mandan las nuevas.
def lineas_turno():
    fuera = []
    for nombre in ('TURN_LLAVE_ID', 'TURN_LLAVE_TOKEN', 'TURN_VIDA'):
        v = os.environ.get(nombre, '').strip()
        if v:
            fuera.append(f'Environment={nombre}={v}')
    return '\n'.join(fuera)
CUBO = 'og-5550-arranque-548380372606'
NODO = 'i-0aff688efc52ab8c8'

UNIDAD = """[Unit]
Description=Relevo de mensajes de Orden Global
After=network.target

[Service]
ExecStart=/usr/bin/python3 /srv/mensajes/servidor.py
Environment=MENSAJES_DATOS=/srv/mensajes/datos.json
Environment=MENSAJES_PUERTO=8390
Environment=MENSAJES_VAPID_PEM=/srv/mensajes/vapid.pem
{TURNO}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
"""


def espera(ssm, cid):
    for _ in range(40):
        time.sleep(4)
        o = ssm.get_command_invocation(CommandId=cid, InstanceId=NODO)
        if o['Status'] not in ('Pending', 'InProgress', 'Delayed'):
            return o
    return o


def main():
    k = json.load(open(S + '/aws_llaves.json'))
    ses = boto3.Session(aws_access_key_id=k['AccessKeyId'],
                        aws_secret_access_key=k['SecretAccessKey'],
                        region_name='us-east-1')
    s3, ssm = ses.client('s3'), ses.client('ssm')

    cuerpo = open(AQUI + '/servidor.py', 'rb').read()
    s3.put_object(Bucket=CUBO, Key='cerebro/mensajes-servidor.py', Body=cuerpo)
    url = s3.generate_presigned_url('get_object',
                                    Params={'Bucket': CUBO, 'Key': 'cerebro/mensajes-servidor.py'},
                                    ExpiresIn=1800)
    unidad = UNIDAD.replace('{TURNO}', lineas_turno())
    s3.put_object(Bucket=CUBO, Key='cerebro/mensajes.service', Body=unidad.encode())
    url2 = s3.generate_presigned_url('get_object',
                                     Params={'Bucket': CUBO, 'Key': 'cerebro/mensajes.service'},
                                     ExpiresIn=1800)

    cmds = [
        'set -e',
        'mkdir -p /srv/mensajes',
        # ── LA LLAVE DE LOS AVISOS PUSH ─────────────────────────────────────
        # Se genera EN el nodo, una vez, y no sale de ahi: ni al repositorio,
        # ni a esta maquina, ni al S3. Perderla solo obliga a que los
        # navegadores se resuscriban; filtrarla dejaria a cualquiera mandar
        # avisos en nuestro nombre.
        'if [ ! -f /srv/mensajes/vapid.pem ]; then '
        '  openssl ecparam -name prime256v1 -genkey -noout -out /srv/mensajes/vapid.pem && '
        '  chmod 600 /srv/mensajes/vapid.pem && echo LLAVE_AVISOS_NUEVA; '
        'else echo LLAVE_AVISOS_YA_ESTABA; fi',
        # ── LA RED DEBAJO DEL TRAPECIO ───────────────────────────────────────
        #
        # El 12 de agosto un despliegue dejo el chat en 503 y hubo que volver
        # atras a mano. La leccion no fue «revisar mejor»: fue que un
        # despliegue tiene que comprobar por si mismo que lo que dejo puesto
        # ARRANCA, y deshacerlo solo si no.
        #
        # Aqui son tres pasos: se guarda lo que habia, se comprueba que lo
        # nuevo al menos compila ANTES de parar nada, y si el servicio no
        # levanta se restaura la copia y se dice con todas las letras.
        'cp -f /srv/mensajes/servidor.py /srv/mensajes/servidor.py.previo 2>/dev/null || true',
        "curl -fsS '%s' -o /srv/mensajes/servidor.nuevo.py" % url,
        # Compilar no prueba que funcione, pero un fallo de sintaxis es el
        # unico que garantiza que NO va a arrancar, y se ve sin tocar nada.
        'python3 -m py_compile /srv/mensajes/servidor.nuevo.py || { echo NO_COMPILA; exit 1; }',
        'mv /srv/mensajes/servidor.nuevo.py /srv/mensajes/servidor.py',
        # ── LAS LLAVES DEL TURN NO SE PIERDEN POR DESPLEGAR ─────────────────
        #
        # Esto sobrescribe la unidad entera, y la unidad es donde viven las
        # credenciales del TURN de Cloudflare. Desplegar sin las variables de
        # entorno puestas dejaba una unidad SIN ellas: el relevo pasaba a
        # contestar la lista vacia y las llamadas entre dos redes con NAT
        # cerrado —las de casa, las de un movil con datos— dejaban de conectar.
        # Sin ruido, sin error, sin nada que mirar: llamadas que suenan y no
        # entran. El comentario de arriba prometia que se conservaban; el
        # codigo no lo hacia.
        #
        # Asi que si esta corrida no trae credenciales, se rescatan las que la
        # maquina ya tenia y se pegan en la unidad nueva. Trayendolas, mandan
        # las nuevas: cambiar una credencial tiene que poder hacerse.
        "curl -fsS '%s' -o /tmp/mensajes.service.nuevo" % url2,
        'if ! grep -q "^Environment=TURN_" /tmp/mensajes.service.nuevo; then '
        '  VIEJAS=$(grep "^Environment=TURN_" /etc/systemd/system/mensajes.service 2>/dev/null || true); '
        '  if [ -n "$VIEJAS" ]; then '
        '    awk -v v="$VIEJAS" \'{print} /^Environment=MENSAJES_VAPID_PEM=/{print v}\' '
        '      /tmp/mensajes.service.nuevo > /tmp/mensajes.service.con-turn && '
        '    mv /tmp/mensajes.service.con-turn /tmp/mensajes.service.nuevo; '
        '    echo TURN_CONSERVADO; '
        '  else echo TURN_NO_HABIA; fi; '
        'else echo TURN_NUEVO; fi',
        'mv /tmp/mensajes.service.nuevo /etc/systemd/system/mensajes.service',
        # restart, no enable --now: con el servicio ya activo, enable --now es
        # un no-op y el proceso VIEJO sigue sirviendo el codigo viejo.
        'systemctl daemon-reload && systemctl enable mensajes && systemctl restart mensajes',
        # Se le dan tres segundos y se pregunta al propio relevo, no a systemd:
        # «activo» solo dice que el proceso vive, no que conteste.
        'sleep 3',
        'if [ "$(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:8390/salud)" != "200" ]; then '
        '  echo "EL RELEVO NUEVO NO CONTESTA — volviendo al anterior"; '
        '  journalctl -u mensajes -n 15 --no-pager || true; '
        '  cp -f /srv/mensajes/servidor.py.previo /srv/mensajes/servidor.py && systemctl restart mensajes; '
        '  sleep 2; echo -n "tras volver atras: "; '
        '  curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:8390/salud; '
        '  echo VUELTO_ATRAS; exit 1; '
        'fi',
        'echo RELEVO_NUEVO_OK',
        'systemctl is-active mensajes',
        # ── Caddy: /mensajes/* publico y proxy al puerto local
        'cp -n /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-de-mensajes || true',
        'cp /etc/caddy/Caddyfile /tmp/Caddyfile.previo',
        'if ! grep -q "/mensajes/\\*" /etc/caddy/Caddyfile; then '
        '  sed -i "s|@interno not path |@interno not path /mensajes/* |" /etc/caddy/Caddyfile; '
        '  sed -i "0,/basic_auth @interno/s||handle /mensajes/* {\\n\\t\\treverse_proxy 127.0.0.1:8390\\n\\t}\\n\\tbasic_auth @interno|" /etc/caddy/Caddyfile; '
        'fi',
        'grep -n "mensajes" /etc/caddy/Caddyfile',
        'if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/val.log 2>&1; then '
        '  systemctl reload caddy && echo CADDY_OK; '
        'else '
        '  cp /tmp/Caddyfile.previo /etc/caddy/Caddyfile; echo CADDY_RESTAURADO; cat /tmp/val.log; '
        'fi',
        'sleep 1',
        'echo -n "salud sin clave: "; '
        'curl -s -o /dev/null -w "%{http_code}\\n" https://cerebro.ordenscan.com/mensajes/salud',
        'echo -n "lo interno sigue cerrado: "; '
        'curl -s -o /dev/null -w "%{http_code}\\n" https://cerebro.ordenscan.com/partes.json',
    ]
    r = ssm.send_command(InstanceIds=[NODO], DocumentName='AWS-RunShellScript',
                         Parameters={'commands': cmds})
    o = espera(ssm, r['Command']['CommandId'])
    print('servidor:', o['Status'])
    print(o['StandardOutputContent'])
    if o['StandardErrorContent']:
        print('errores:', o['StandardErrorContent'][:800])
    sal = o['StandardOutputContent']
    if 'VUELTO_ATRAS' in sal or 'NO_COMPILA' in sal:
        print('\nEL DESPLIEGUE SE DESHIZO SOLO. En la máquina sigue el relevo anterior.')
        return 1
    print('el relevo nuevo arrancó:', 'sí' if 'RELEVO_NUEVO_OK' in sal else 'NO — revisar')
    print('relevo público:', 'sí' if 'salud sin clave: 200' in sal else 'NO — revisar')
    print('lo interno sigue cerrado:', 'sí' if 'lo interno sigue cerrado: 401' in sal else 'NO — PARA Y REVISA')
    return 0 if ('RELEVO_NUEVO_OK' in sal and 'salud sin clave: 200' in sal) else 1


if __name__ == '__main__':
    sys.exit(main())
