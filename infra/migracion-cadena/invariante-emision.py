# La suma de los saldos tiene que dar la emision total.
#
# RESULTADO DEL 10-AGO-2026, sobre el estado unido: los CATORCE tokens cuadran
# exactamente. ONDK con 138 tenedores y 555.000.000; AUKA con 39 y 55.000.000.
# Antes del barrido completo de eventos faltaban 25.800 ONDK, que eran doce
# personas que compraron despues del bloque 2,8 M y nunca movieron nada.
#
# Contar tenedores desde mis propias etiquetas seria circular: si a alguien le
# faltara su ranura, tampoco aparecería en mi cuenta. Esta comprobacion no es
# circular — la emision total la dice el CONTRATO, no yo. Si la suma de los
# saldos que creo conocer no da la emision, hay tenedores que se me escaparon,
# y la diferencia dice cuanto.
import json, urllib.request
RPC='https://rpc.ordenglobal-rpc.com/'
def call(to, sel, arg=''):
    b=json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":to,"data":sel+arg},"latest"]}).encode()
    r=json.load(urllib.request.urlopen(urllib.request.Request(RPC,b,{'Content-Type':'application/json'}),timeout=25))
    return r.get('result')
OF={"0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1":"ONDK","0x6facc8df79cedc6c5065442ce27e915aa3a26b9b":"AUKA",
"0x961f798f998c7ff44d47d62c7fa1b572ef187a4b":"AGKA","0x18b6680cff71c11067bec312fc48786be2e54ead":"MNKA",
"0xf1498640b27a66c0dc505093d70911c060e04fb0":"AUBEX","0x7af11d3e94a174f6fc290a5b7791a6dee2718e62":"IBS",
"0x0fa04d11f28b28cbc9b98dd016f02023addb1923":"HARV","0x2a31ba919a5339fcb0f8aeeffce2c807b16007fe":"AGRO",
"0xae14db486872ac07d74ad69cc09590239b21ba2e":"AIT","0x69846ac960d45f9946c613dfce1b761d37faf098":"ASL",
"0x1ac12ebd7739003059d1e9ea2a4863c92d1505dd":"REST","0xaac6ae2e2037fc2e94d0b060792e7eb4e5fbfa66":"SOL",
"0x638f2ba0e3e1083d1ba570b449bd266f3860d164":"LOVE","0x92496e1848e001428a3495409a9a9f616bb6dd3b":"POLITICAL"}
est=json.load(open('estado-union.json'))
print(f"{'token':<11}{'tenedores':>10}{'suma de saldos':>26}{'emision del contrato':>26}  cuadra")
malos=0
for c in est['cuentas']:
    d=c.get('direccion')
    if d not in OF: continue
    claves=c.get('claves') or {}; alm=c.get('almacen') or {}
    duenos={}
    for h,etq in claves.items():
        if etq[0]=='mapa' and len(etq)>=3:
            v=int(alm[h],16) if alm.get(h) else 0
            if v>0: duenos[etq[1].lower()]=v
    suma=sum(duenos.values())
    ts=int(call(d,'0x18160ddd'),16)
    dec=int(call(d,'0x313ce567') or '0x12',16)
    ok = (suma==ts)
    if not ok: malos+=1
    print(f"{OF[d]:<11}{len(duenos):>10}{suma/10**dec:>26,.4f}{ts/10**dec:>26,.4f}  {'SI' if ok else 'NO · falta '+str((ts-suma)/10**dec)}")
print(f"\ntokens cuya suma NO cuadra con la emision: {malos} de 14")
