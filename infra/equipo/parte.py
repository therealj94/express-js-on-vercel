#!/usr/bin/env python3
# Con esto cada agente entrega su parte, y el cerebro lo muestra.
#
# COMO SE USA
#
#   python3 parte.py --agente vigia --veredicto bien \
#     --resumen "Las dos cadenas avanzando, suelo de gas puesto" \
#     --hallazgo "5534 en el bloque 20.821, seis lecturas iguales" \
#     --hallazgo "gas 93 gwei en los dos nombres" \
#     --hizo "Nada que reparar" \
#     --escala "Ninguno"
#
# O pasandole el parte entero por la entrada estandar:
#
#   echo '{"agente":"vigia","veredicto":"bien",...}' | python3 parte.py -
#
# QUE HACE
#
# 1. Guarda el parte del agente en S3, en cerebro/partes/<agente>.json
# 2. Vuelve a armar el indice cerebro/partes.json con TODOS los partes, no
#    solo el suyo -- asi cada agente que corre refresca la vista completa y el
#    cerebro no depende de que el Cronista pase por ahi.
# 3. Lo baja al servidor del cerebro por SSM y comprueba que llego.
#
# LO QUE NO SE ESCRIBE AQUI
#
# Un parte termina en S3 y en una pagina web. NUNCA lleva el valor de un
# secreto, una llave privada, una frase semilla ni una cadena de conexion.
# Se dice QUE esta mal, no CUAL es. Esta comprobacion esta puesta abajo y
# rechaza el parte si detecta algo con pinta de credencial.

import argparse, hashlib, json, os, re, sys, time

CUBO = 'og-5550-arranque-548380372606'
NODO = 'i-0aff688efc52ab8c8'          # el nodo RPC de la 5534, donde vive el cerebro
LLAVES = os.environ.get('OG_LLAVES_AWS', os.path.expanduser('~/aws_llaves.json'))

VEREDICTOS = ('bien', 'aviso', 'falla')

# Los nombres tal como los dice la voz del cerebro.
EQUIPO = {
    'vigia':     'VIGÍA',
    'centinela': 'CENTINELA',
    'cirujano':  'CIRUJANO',
    'cerrajero': 'CERRAJERO',
    'escudero':  'ESCUDERO',
    'contador':  'CONTADOR',
    'cronista':  'CRONISTA',
}

# Con pinta de credencial. Si algo de esto aparece en un parte, no se publica.
PELIGRO = [
    (re.compile(r'AKIA[0-9A-Z]{16}'),            'una llave de acceso de AWS'),
    (re.compile(r'\bghp_[A-Za-z0-9]{30,}'),      'un token de GitHub'),
    (re.compile(r'\bHRKU-[A-Za-z0-9_-]{20,}'),   'un token de Heroku'),
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY'), 'una llave privada'),
    (re.compile(r'\b0x[0-9a-fA-F]{64}\b'),       'algo que parece una llave privada de 32 bytes'),
    (re.compile(r'mongodb(\+srv)?://[^\s]*:[^\s]*@'), 'una cadena de conexion con contrasena'),
]

# Palabras de funcion del castellano. Una frase semilla NO las lleva: las
# listas BIP39 no contienen "de", "que" ni "para". Sirven para distinguir una
# semilla de una frase normal de doce palabras, que en un parte escrito en
# castellano aparece constantemente.
CORRIENTES = {
    'de', 'la', 'el', 'que', 'y', 'en', 'los', 'las', 'un', 'una', 'con',
    'por', 'para', 'se', 'del', 'al', 'no', 'es', 'su', 'lo', 'sin', 'ya',
    'mas', 'pero', 'como', 'esta', 'este', 'son', 'hay', 'ni', 'o', 'a',
}


def parece_semilla(texto):
    """Doce o veinticuatro palabras seguidas con forma de BIP39.

    Una expresion regular de "doce palabras en minusculas" marca cualquier
    frase en castellano y volveria inservible la comprobacion. Una semilla se
    reconoce por otra cosa: palabras cortas, sin acentos, y NINGUNA palabra de
    funcion entre ellas.
    """
    palabras = re.findall(r'[a-z]+', texto.lower())
    for n in (12, 24):
        for i in range(len(palabras) - n + 1):
            tramo = palabras[i:i + n]
            if all(3 <= len(p) <= 8 for p in tramo) and \
               not any(p in CORRIENTES for p in tramo):
                return True
    return False


def revisar(parte):
    """Ningun secreto sale de aqui. Ni recortado."""
    texto = json.dumps(parte, ensure_ascii=False)
    for patron, que in PELIGRO:
        if patron.search(texto):
            sys.exit('NO SE PUBLICA: el parte contiene %s. Un parte se guarda '
                     'en S3 y se lee en una pagina web: se dice QUE esta mal, '
                     'nunca CUAL es.' % que)
    if parece_semilla(texto):
        sys.exit('NO SE PUBLICA: hay una secuencia con forma de frase semilla. '
                 'Si es texto normal, reescribelo; si es una semilla, no va '
                 'en un parte de ninguna manera.')


def sesion():
    import boto3
    k = json.load(open(LLAVES))
    return boto3.Session(aws_access_key_id=k['AccessKeyId'],
                         aws_secret_access_key=k['SecretAccessKey'],
                         region_name='us-east-1')


def publicar(parte, callado=False):
    revisar(parte)
    ses = sesion()
    s3 = ses.client('s3')
    ident = parte['agente']

    s3.put_object(Bucket=CUBO, Key='cerebro/partes/%s.json' % ident,
                  Body=json.dumps(parte, ensure_ascii=False, indent=2).encode())

    # El indice: todos los partes, el mas reciente de cada agente, ordenados
    # por gravedad y despues por hora. El cerebro lee solo este archivo.
    todos = []
    hojas = s3.list_objects_v2(Bucket=CUBO, Prefix='cerebro/partes/').get('Contents', [])
    for o in hojas:
        if not o['Key'].endswith('.json'):
            continue
        try:
            todos.append(json.loads(
                s3.get_object(Bucket=CUBO, Key=o['Key'])['Body'].read()))
        except Exception as e:
            print('  aviso: no se pudo leer %s (%s)' % (o['Key'], e))
    peso = {'falla': 0, 'aviso': 1, 'bien': 2}
    todos.sort(key=lambda p: (peso.get(p.get('veredicto'), 3),
                              p.get('cuando', '')), reverse=False)
    indice = json.dumps(todos, ensure_ascii=False, indent=2).encode()
    s3.put_object(Bucket=CUBO, Key='cerebro/partes.json', Body=indice)

    url = s3.generate_presigned_url('get_object',
                                    Params={'Bucket': CUBO, 'Key': 'cerebro/partes.json'},
                                    ExpiresIn=1800)
    ssm = ses.client('ssm')
    r = ssm.send_command(
        InstanceIds=[NODO], DocumentName='AWS-RunShellScript',
        Parameters={'commands': ["curl -fsS '%s' -o /srv/cerebro/partes.json" % url,
                                 'md5sum /srv/cerebro/partes.json']})
    cid = r['Command']['CommandId']
    salida = {}
    for _ in range(30):
        time.sleep(4)
        salida = ssm.get_command_invocation(CommandId=cid, InstanceId=NODO)
        if salida['Status'] not in ('Pending', 'InProgress', 'Delayed'):
            break

    esperado = hashlib.md5(indice).hexdigest()
    llego = esperado in (salida.get('StandardOutputContent') or '')
    if not callado:
        print('parte de %s · %s · %s' % (parte['agente'], parte['veredicto'],
                                         parte['resumen']))
        print('%d partes en el indice · servidor: %s · md5 %s'
              % (len(todos), salida.get('Status'),
                 'coincide' if llego else 'NO COINCIDE'))
    if not llego:
        sys.exit('el parte se subio a S3 pero no se pudo comprobar en el '
                 'servidor del cerebro')
    return todos


def ahora():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def main():
    if len(sys.argv) == 2 and sys.argv[1] == '-':
        parte = json.load(sys.stdin)
        parte.setdefault('cuando', ahora())
        parte.setdefault('nombre', EQUIPO.get(parte.get('agente'), parte.get('agente', '')))
        publicar(parte)
        return

    p = argparse.ArgumentParser(description='Entrega el parte de un agente al cerebro.')
    p.add_argument('--agente', required=True, choices=sorted(EQUIPO))
    p.add_argument('--veredicto', required=True, choices=VEREDICTOS)
    p.add_argument('--resumen', required=True,
                   help='una frase, la que se lee en voz alta')
    p.add_argument('--hallazgo', action='append', default=[],
                   help='lo que se midio; repetir por cada uno. CON NUMEROS.')
    p.add_argument('--hizo', action='append', default=[],
                   help='lo que el agente hizo, si hizo algo')
    p.add_argument('--escala', action='append', default=[],
                   help='lo que necesita a Jose. Repetir por cada uno.')
    p.add_argument('--duracion', type=int, default=0,
                   help='segundos que tardo la revision')
    a = p.parse_args()

    publicar({
        'agente': a.agente,
        'nombre': EQUIPO[a.agente],
        'cuando': ahora(),
        'veredicto': a.veredicto,
        'resumen': a.resumen.strip(),
        'hallazgos': [x.strip() for x in a.hallazgo],
        'hizo': [x.strip() for x in a.hizo],
        'escala': [x.strip() for x in a.escala],
        'duracion': a.duracion,
    })


if __name__ == '__main__':
    main()
