#!/usr/bin/env python3
# Los 23 movimientos, uno por uno: quien, a quien, cuanto, y que registros
# solto. Sin esto no se puede reconstruir el estado: cada uno toco cuentas.
import json, urllib.request
R='http://127.0.0.1:8545'
HASHES = ["0xebf2d01717fb629ac6b38c8c009004c2bbd4caf8809fe20feaec5bf6b865191a", "0x551a79ec1efeab19091b7069554d824201494c7b432860275b4cc8d3a588fbf5", "0x4aa0ac4cb86268c4885d57c045c94afe9df1f6e09b82816792ba76821acb2564", "0xf9f995a7d7ab7d65739501a7fca959f6018393a31ac972eff97290668eecfacb", "0x640013cce1869fa5d8d48f8413390655c9c0cd636e94549035722352c3d58613", "0x1a28e37dc9828d9d63a499c470b14df401fa77ea435b5affc0711bcc07b9e17c", "0x4abad5f401da5cf9636b0ac0a65ee6d2462fd12baca40731454cc364de10adab", "0xd1c35a846a301973eb9bb050e29a71d6a194e7b679028645f0e38f454af7886a", "0x03bdf6b940815ef3d25228238dd50a9b5d5dd9cd9ab3909c0db5529ec0d615a7", "0x9525c94c2bd95f59af0859df42abc7f510daa2d0981a7a17545882f256e86d96", "0x694825c5f65698c1a7d912c5dd1ac63ec460d0cd41b0c6d74ee307564e37af61", "0xe302976b27a47230aecd4a04fe761ef264d299ec33fd4cc48b140049421fb138", "0x9f1083de0cb53530e728a9217f2ea90543b3840a541fc22c0f54a0ae84d81979", "0xc60d18df284858d03098fccd7d1601406c6fe86b5922090de08d7ab28ac69ed7", "0x861f4491fdddf52fb207a2f6509ea003e13d4e066beb2185832bfa9d3b010cec", "0xdab0b8e1a2aed7ea42b5621f26d23d078670bc0d67bdf0700c60b3fc8914f75b", "0x03d471ded4fcbf0801c1a3e9f6def0b2d8b7ae2d540ab2ef8d58a40c9e8deb46", "0x9e97db2c1d659f6fdc6e60b57d02409eae645e02e29d747bcdf1e177fcf194ce", "0x249df336d085838db58ee405ba210d38ab0e79184526db2dc551cacf9734e75b", "0x84978a3f7f2a12d58ef3c457706d507ebf6d22abc9d938e195304e5a7ccacee7", "0x1d31dea0c0c05d919ac4925ca530b65fec4fc9f1c46ae60bd0418de4f7e12fb3", "0x5379fc686f81d4cbd1586132f7d86157e43a377547a99b1db94cab37847ef8cb", "0x8b89b860c49eb6bd8d1289823f31a147fac0c727abeac789ed240f88c334ec47"]
def rpc(m,p):
    b=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
    return json.load(urllib.request.urlopen(urllib.request.Request(R,b,{'Content-Type':'application/json'}),timeout=60))['result']
salida=[]
for h in HASHES:
    t=rpc('eth_getTransactionByHash',[h]); r=rpc('eth_getTransactionReceipt',[h])
    salida.append({
        'bloque': int(t['blockNumber'],16), 'hash': h,
        'de': t['from'], 'a': t['to'],
        'valor': str(int(t['value'],16)),
        'gasUsado': int(r['gasUsed'],16),
        'precioGas': str(int(t.get('gasPrice','0x0'),16)),
        'estado': r.get('status'),
        'contratoCreado': r.get('contractAddress'),
        'entrada': t['input'][:74],
        'registros': [{'dir': l['address'], 'topics': l['topics'], 'datos': l['data']} for l in r['logs']],
    })
print(json.dumps(salida, indent=1))
