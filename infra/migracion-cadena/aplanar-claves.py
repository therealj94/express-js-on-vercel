#!/usr/bin/env python3
# Convierte TODAS las claves a ranura cruda, comprobando cada una.
#
# POR QUE
#
# El constructor traduce etiquetas a ranuras, pero no conoce todas las que el
# emparejador emite --revento con 'triple getPool'-- y una etiqueta que no
# sabe leer detiene el corte entero. Aqui se traduce una sola vez, y cada
# ranura se acepta SOLO si su keccak es la huella que el volcado tiene
# apuntada. Asi da igual como se llame la etiqueta: o cuadra o se reporta.
import json, re, sys
from Crypto.Hash import keccak as _K
def kc(b):
    k=_K.new(digest_bits=256); k.update(b); return k.digest()
def pad(x):
    if isinstance(x,str):
        h=x[2:] if x.startswith('0x') else x
        return bytes.fromhex(h.rjust(64,'0'))
    return (int(x)%(1<<256)).to_bytes(32,'big')
def suma(b,n): return ((int.from_bytes(b,'big')+n)%(1<<256)).to_bytes(32,'big')

def formas(cl):
    """Todas las lecturas plausibles de una etiqueta. Se prueban y gana la que
    cuadre con la huella; no hace falta acertar a la primera."""
    t=cl[0]; out=[]
    try:
        if t=='fija': out.append(pad(cl[1]))
        elif t in ('mapa','mapa-num','posicion'):
            out.append(suma(kc(pad(cl[1])+pad(cl[2])), cl[3]))
        elif t=='anidado':
            out.append(kc(pad(cl[2])+kc(pad(cl[1])+pad(cl[3]))))
        elif t=='arreglo':
            out.append(suma(kc(pad(cl[1])), cl[2]))
        elif t=='rol':
            interno=kc(pad(cl[1])+pad(cl[3]))
            out.append(suma(kc(pad(cl[2])+interno), cl[4]))
        elif t=='triple':
            interno=kc(pad(cl[1])+pad(cl[4]))
            out.append(kc(pad(cl[3])+kc(pad(cl[2])+interno)))
        elif t.startswith('triple'):
            # "A/B/FEE -> POOL": la ranura sale de A, B y FEE sobre cl[1].
            m=re.match(r'(0x[0-9a-fA-F]{40})/(0x[0-9a-fA-F]{40})/(\d+)', str(cl[2]))
            if m:
                a,b,fee=m.group(1),m.group(2),int(m.group(3))
                interno=kc(pad(a)+pad(cl[1]))
                medio=kc(pad(b)+interno)
                out.append(suma(kc(pad(fee)+medio), cl[3] if len(cl)>3 else 0))
                # y el orden contrario, por si la factoria guarda B primero
                interno2=kc(pad(b)+pad(cl[1]))
                medio2=kc(pad(a)+interno2)
                out.append(suma(kc(pad(fee)+medio2), cl[3] if len(cl)>3 else 0))
    except Exception:
        pass
    return out

e=json.load(open('estado-con-claves.json'))
tra=json.load(open('ranuras-por-traza.json'))
directas={}; ok=0; malas=[]; sin=[]
for c in e['cuentas']:
    d=c.get('direccion')
    if not d: continue
    alm=c.get('almacen') or {}; cl=c.get('claves') or {}
    for h,etq in cl.items():
        r=None
        for cand in formas(tuple(etq)):
            if '0x'+kc(cand).hex()==h: r=cand; break
        if r is None:
            # La traza puede tenerla aunque la etiqueta no se sepa leer.
            rt=tra.get(h)
            if rt and '0x'+kc(bytes.fromhex(rt[2:])).hex()==h: r=bytes.fromhex(rt[2:])
        if r is None:
            malas.append((d,h,etq)); continue
        directas.setdefault(d,{})['0x'+r.hex()]=alm[h]; ok+=1
    for h in set(alm)-set(cl):
        rt=tra.get(h)
        if rt and '0x'+kc(bytes.fromhex(rt[2:])).hex()==h:
            directas.setdefault(d,{})['0x'+rt[2:]]=alm[h]; ok+=1
        else:
            sin.append((d,h))
tot=sum(len(c.get('almacen') or {}) for c in e['cuentas'])
print(f"ranuras del volcado: {tot}")
print(f"convertidas y comprobadas: {ok}")
print(f"etiquetas ilegibles: {len(malas)}")
for d,h,etq in malas[:10]: print(f"   ILEGIBLE {d} {h} {etq}")
print(f"sin resolver: {len(sin)}")
for d,h in sin: print(f"   SIN RESOLVER {d} {h}")
json.dump(directas, open('ranuras-todas.json','w'), indent=1)
# Estado sin etiquetas: el constructor ya no tiene que interpretarlas.
for c in e['cuentas']: c.pop('claves', None)
json.dump(e, open('estado-listo.json','w'))
print("escritos ranuras-todas.json y estado-listo.json")
