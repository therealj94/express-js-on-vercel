# La memoria de la voz: lo que ya se dijo una vez no se vuelve a fabricar.
#
# ── POR QUE ESTO CAMBIA LO QUE SE PUEDE HACER ───────────────────────────────
#
# Medido en el nodo, con la voz caliente:
#
#     frase corta   (16 letras) →  1,6 s
#     tipica       (125 letras) →  8,2 s
#     larga        (224 letras) → 22,4 s
#
# Y la MISMA frase dos veces seguidas: 1,63 s y 1,58 s. Se fabricaba de nuevo
# cada vez. No habia memoria de ninguna clase.
#
# Eso no es solo lento: es lo que mato las notas de voz. Estan retiradas —lo
# dice la cabecera de `voz.py`— porque costaban 657 segundos de GPU AL DIA y
# causaban esperas de 21 a 59 segundos. Las dos cosas salen del mismo sitio:
# se pagaba entera cada vez.
#
# Y la mayor parte de lo que AU-RA dice ES SIEMPRE LO MISMO. El guion tiene
# treinta nodos de texto fijo: el saludo, el ahorro, las remesas, la comision,
# la billetera. Cada persona que escribe «hola» recibe exactamente las mismas
# palabras que la anterior. Fabricarlas de nuevo para cada una es pagar mil
# veces por un trabajo hecho.
#
# Con memoria, el guion entero cuesta UNA vez. Lo que sigue costando cada vez
# es lo que el motor improvisa, que es donde tiene sentido gastar.
#
# ── LO QUE SE GUARDA, Y LO QUE NO ───────────────────────────────────────────
#
# Se guarda el AUDIO, con la llave sacada del texto. No se guarda el texto, ni
# quien lo pidio, ni cuando. Un fichero de esta carpeta es una voz diciendo
# algo que ya dijo AU-RA en publico; no dice a quien, y no se puede caminar de
# vuelta hasta una persona.
#
# Aun asi tiene EDAD y TOPE. Lo que AU-RA improvisa lleva a veces el nombre de
# quien pregunto —«Dale, Ana»— y eso no tiene por que quedarse en un disco para
# siempre. Treinta dias, el mismo plazo que los perfiles de la web.

import hashlib
import os
import pathlib
import threading
import time

# Cuanto vive un audio y cuanto puede pesar la carpeta entera.
DIAS = 30
TOPE_MB = 1500
_candado = threading.Lock()


def _carpeta(base):
    d = pathlib.Path(base) / 'memoria'
    d.mkdir(parents=True, exist_ok=True)
    return d


def llave(texto, voz, idioma):
    """La llave de un audio. Cambia con CUALQUIER cosa que cambie el sonido.

    Van los tres: el mismo texto con otra voz o en otro idioma es otro audio, y
    servir el de al lado seria peor que fabricarlo. Con una coma distinta la
    llave cambia y se fabrica de nuevo — igual que en `voz-grabada`.
    """
    crudo = f'{idioma}\x00{voz}\x00{texto}'.encode('utf8')
    return hashlib.sha256(crudo).hexdigest()[:32]


def buscar(base, texto, voz, idioma):
    """El audio si ya estaba, o `None`. Nunca lanza."""
    try:
        f = _carpeta(base) / (llave(texto, voz, idioma) + '.mp3')
        if not f.exists():
            return None
        d = f.read_bytes()
        if not d:
            return None
        # Se le toca la fecha: lo que se usa no caduca por viejo, caduca por no
        # usarse. Sin esto, el saludo —lo mas pedido de todo— se borraria a los
        # treinta dias de haberse fabricado, justo por ser el primero.
        os.utime(f, None)
        return d
    except Exception:
        return None


def guardar(base, texto, voz, idioma, mp3, segundos=0.0):
    """Deja el audio para la proxima. Nunca lanza: es una comodidad.

    Si guardar fallara, lo peor que pasa es que se fabrique otra vez. Que un
    disco lleno deje a AU-RA muda seria cambiar un problema chico por uno
    grande.
    """
    if not mp3:
        return False
    try:
        d = _carpeta(base)
        f = d / (llave(texto, voz, idioma) + '.mp3')
        tmp = f.with_suffix('.parte')
        tmp.write_bytes(mp3)
        os.replace(tmp, f)          # de una pieza: nunca medio audio
        return True
    except Exception:
        return False


def limpiar(base, ahora=None):
    """Saca lo viejo y, si aun asi pesa de mas, lo menos usado. Cuantos saco.

    Se corre de vez en cuando, no en cada peticion: recorrer la carpeta entera
    para servir un audio seria pagar en cada respuesta el precio de la limpieza.
    """
    ahora = ahora if ahora is not None else time.time()
    fuera = 0
    try:
        with _candado:
            d = _carpeta(base)
            files = []
            for f in d.glob('*.mp3'):
                try:
                    st = f.stat()
                except OSError:
                    continue
                if ahora - st.st_mtime > DIAS * 86400:
                    f.unlink(missing_ok=True)
                    fuera += 1
                else:
                    files.append((st.st_mtime, st.st_size, f))
            # Y si todavia pesa de mas, se van los menos usados. El tope existe
            # para que esto no crezca sin fin en una maquina que ademas tiene
            # que sostener el modelo.
            total = sum(s for _t, s, _f in files)
            files.sort()                      # el mas viejo de uso, primero
            i = 0
            while total > TOPE_MB * 1024 * 1024 and i < len(files):
                _t, s, f = files[i]
                f.unlink(missing_ok=True)
                total -= s
                fuera += 1
                i += 1
    except Exception:
        pass
    return fuera


def cuanto(base):
    """`(cuantos, megas)`. Para el parte: una memoria que nadie mira crece."""
    try:
        d = _carpeta(base)
        fs = list(d.glob('*.mp3'))
        return len(fs), sum(f.stat().st_size for f in fs) / 1024 / 1024
    except Exception:
        return 0, 0.0
