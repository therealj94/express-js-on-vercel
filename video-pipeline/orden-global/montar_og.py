"""Orden Global: arma codigo/tiempos.json (voces aceleradas, palabras, momentos)."""
import json, subprocess
R = 1.07
P = json.load(open('v/palabras.json'))
TOMA = {k: (f'{k}_b' if k in ('A07', 'A12') else f'{k}_a') for k in ['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10','A11','A12']}
ARR = {'A01': .25, 'A02': .45, 'A03': .8, 'A04': .4, 'A05': .4, 'A06': .3, 'A07': .3, 'A08': .3, 'A09': .4, 'A10': .4, 'A11': .45, 'A12': .5}
for k, f in TOMA.items():   # voz acelerada
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f'v/{f}.mp3', '-af', f'atempo={R}', '-ar', '48000', f'v/r_{k}.wav'])
V, W, f = {}, {}, 0
for k in TOMA:
    t0 = round(f + ARR[k], 2); V[k] = t0
    W[k] = [[p, round(t0 + a / R, 3), round(t0 + b / R, 3)] for p, a, b in P[TOMA[k]]]
    f = W[k][-1][2]
    if k == 'A02': f += .5          # negro y silencio antes de AURA
def pal(k, w, n=1):
    c = 0
    for p, a, b in W[k]:
        if p.lower().strip('.,!?¡¿…') == w.lower():
            c += 1
            if c == n: return a
    raise SystemExit(f'{k} sin {w}')
S = dict(fin_hook=pal('A01', 'cuenta') + .25, cafe=V['A02'], minerales=pal('A02', 'minerales'), salen=pal('A02', 'salen'), vuelve=pal('A02', 'vuelve'),
         negro=W['A02'][-1][2] + .15, aura=V['A03'] - .35, super=pal('A03', 'la'), tres=pal('A04', 'tres'), liga=pal('A04', 'liga'),
         origen=V['A05'], oro=pal('A05', 'oro'), imprime=pal('A05', 'imprime'), cel=V['A06'] - .2, huella=pal('A06', 'huella'), recibo=pal('A06', 'recibo'),
         region=V['A07'] - .2, region_w=pal('A07', 'región'), taller=V['A08'] - .2, abrirse=pal('A08', 'abrirse'), medida=pal('A08', 'medida'),
         yo=V['A09'] - .2, hablo=pal('A09', 'hablo'), recuerdo=pal('A09', 'recuerdo'), firma=pal('A09', 'firma'),
         electrum=V['A10'] - .3, minutos=pal('A10', 'minutos'), clima=V['A11'] - .2, recursos=pal('A11', 'recursos'), empresas=pal('A11', 'empresas'),
         dinero=pal('A11', 'dinero'), vara=pal('A11', 'medidos'), logo=V['A12'] - .3, quieres=W['A12'][[x[0].lower().strip('¿') for x in W['A12']].index('querés')][1] if any(x[0].lower().strip('¿') == 'querés' for x in W['A12']) else pal('A12', 'saber') - .4)
total = round(W['A12'][-1][2] + 1.4, 2)
json.dump({'voces': V, 'palabras': W, 's': S, 'total': total, 'R': R}, open('codigo/tiempos.json', 'w'), ensure_ascii=False, indent=1)
print(V); print({k: round(v, 2) for k, v in S.items()}); print('total', total)
